// Package ehentai implements a native gallery source. The source protocol was
// researched against HyperionHXH/E-extensions (Apache-2.0); no APK runtime is used.
package ehentai

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/sync/singleflight"
	"golang.org/x/time/rate"
)

type Gallery struct {
	ID            string              `json:"id"`
	Token         string              `json:"token"`
	Site          string              `json:"site"`
	Title         string              `json:"title"`
	JapaneseTitle string              `json:"japaneseTitle"`
	Cover         string              `json:"cover"`
	Category      string              `json:"category"`
	Uploader      string              `json:"uploader"`
	Posted        string              `json:"posted"`
	Language      string              `json:"language"`
	Rating        string              `json:"rating"`
	Pages         int                 `json:"pages"`
	Tags          map[string][]string `json:"tags"`
}
type Results struct {
	Items []Gallery `json:"items"`
	Next  string    `json:"next"`
}
type entry struct {
	body  []byte
	until time.Time
}
type Client struct {
	HTTP    *http.Client
	limiter *rate.Limiter
	mu      sync.Mutex
	cache   map[string]entry
	flights singleflight.Group
	images  chan struct{}
}

var galleryPath = regexp.MustCompile(`^/g/([0-9]+)/([a-zA-Z0-9]+)/?$`)
var identity = regexp.MustCompile(`^[0-9]+/[a-zA-Z0-9]+$`)
var number = regexp.MustCompile(`[0-9]+`)
var backgroundURL = regexp.MustCompile(`url\(['"]?(https?://[^)'" ]+)`)
var nextURL = regexp.MustCompile(`(?:var\s+)?nexturl\s*=\s*["']([^"']+)`)
var reloadKey = regexp.MustCompile(`nl\(['"]([^'"]+)['"]\)`)

func New() *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 30 * time.Second
	transport.MaxConnsPerHost = 4
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		// Explicit environment proxies may be local. Direct destination hosts still
		// pass URL validation below; reject private DNS answers for those hosts.
		if imageHost(host) || siteHost(host) {
			addresses, e := net.DefaultResolver.LookupIPAddr(ctx, host)
			if e != nil {
				return nil, e
			}
			for _, a := range addresses {
				if !a.IP.IsGlobalUnicast() || a.IP.IsPrivate() || a.IP.IsLoopback() || a.IP.IsLinkLocalUnicast() {
					continue
				}
				conn, e := (&net.Dialer{Timeout: 20 * time.Second}).DialContext(ctx, network, net.JoinHostPort(a.IP.String(), port))
				if e == nil {
					return conn, nil
				}
			}
			return nil, fmt.Errorf("图片或站点网络不可达")
		}
		return (&net.Dialer{Timeout: 20 * time.Second}).DialContext(ctx, network, address)
	}
	httpClient := &http.Client{Transport: transport, Timeout: 60 * time.Second}
	httpClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !AllowedURL(req.URL.String()) {
			return fmt.Errorf("站点重定向不可用，请检查登录状态")
		}
		if !cookieHost(req.URL.Hostname()) || req.URL.Scheme != "https" {
			req.Header.Del("Cookie")
		}
		return nil
	}
	return &Client{HTTP: httpClient, limiter: rate.NewLimiter(rate.Every(800*time.Millisecond), 1), cache: map[string]entry{}, images: make(chan struct{}, 3)}
}
func siteHost(host string) bool { return host == "e-hentai.org" || host == "exhentai.org" }
func cookieHost(host string) bool {
	// The official ExHentai thumbnail host requires the same login cookies.
	// Third-party H@H nodes and the public ehgt.org CDN never receive them.
	return siteHost(host) || host == "s.exhentai.org"
}
func imageHost(host string) bool {
	// ExHentai serves its gallery thumbnails from this exact official host.
	return host == "s.exhentai.org" || host == "ehgt.org" || strings.HasSuffix(host, ".ehgt.org") || host == "hath.network" || strings.HasSuffix(host, ".hath.network")
}
func Base(site string) (string, error) {
	if !siteHost(site) {
		return "", fmt.Errorf("漫画来源无效")
	}
	return "https://" + site, nil
}
func AllowedURL(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.User != nil || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	h := u.Hostname()
	// H@H image nodes returned by the source use non-standard ports (for
	// example 8440). The user explicitly authorized these official nodes;
	// all other allowed hosts retain the original 80/443 restriction.
	if port := u.Port(); port != "" {
		value, err := strconv.Atoi(port)
		if err != nil || value < 1 || value > 65535 {
			return false
		}
		if port != "443" && port != "80" && !strings.HasSuffix(h, ".hath.network") {
			return false
		}
	}
	return siteHost(h) || imageHost(h)
}
func NormalizeCookie(raw string) (string, error) {
	if len(raw) > 8192 || strings.ContainsAny(raw, "\r\n") {
		return "", fmt.Errorf("Cookie 格式无效，请粘贴单行 Cookie")
	}
	req := &http.Request{Header: http.Header{"Cookie": []string{raw}}}
	values := map[string]string{}
	for _, c := range req.Cookies() {
		switch c.Name {
		case "ipb_member_id", "ipb_pass_hash", "igneous":
			values[c.Name] = c.Value
		}
	}
	if values["ipb_member_id"] == "" || values["ipb_pass_hash"] == "" {
		return "", fmt.Errorf("Cookie 需要包含 ipb_member_id 和 ipb_pass_hash；ExHentai 还需要 igneous")
	}
	var parts []string
	for _, k := range []string{"ipb_member_id", "ipb_pass_hash", "igneous"} {
		if values[k] != "" {
			c := &http.Cookie{Name: k, Value: values[k]}
			if e := c.Valid(); e != nil {
				return "", fmt.Errorf("Cookie 字段无效")
			}
			parts = append(parts, k+"="+values[k])
		}
	}
	return strings.Join(parts, "; "), nil
}
func (c *Client) fetch(ctx context.Context, raw, cookie, referer string, limit int64) ([]byte, string, error) {
	if !AllowedURL(raw) {
		return nil, "", fmt.Errorf("站点图片地址无效")
	}
	req, e := http.NewRequestWithContext(ctx, "GET", raw, nil)
	if e != nil {
		return nil, "", e
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
	req.Header.Set("Referer", referer)
	if cookieHost(req.URL.Hostname()) && req.URL.Scheme == "https" && cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, e := c.HTTP.Do(req)
	if e != nil {
		if ctx.Err() != nil {
			return nil, "", ctx.Err()
		}
		return nil, "", fmt.Errorf("漫画站点连接失败，请检查服务端网络")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, "", fmt.Errorf("漫画站点返回 HTTP %d，请稍后重试或检查 Cookie", resp.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if e != nil {
		return nil, "", fmt.Errorf("漫画响应读取失败")
	}
	if int64(len(b)) > limit {
		return nil, "", fmt.Errorf("漫画响应超过大小限制")
	}
	return b, resp.Header.Get("Content-Type"), nil
}
func (c *Client) document(ctx context.Context, raw, cookie string, force bool) (*goquery.Document, error) {
	key := fmt.Sprintf("%x:%s", sha256.Sum256([]byte(cookie)), raw)
	c.mu.Lock()
	hit, ok := c.cache[key]
	c.mu.Unlock()
	if ok && !force && time.Now().Before(hit.until) {
		return goquery.NewDocumentFromReader(bytes.NewReader(hit.body))
	}
	flight := c.flights.DoChan(key, func() (any, error) {
		// A cancelled browser render must not cancel another reader sharing this fetch.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 60*time.Second)
		defer cancel()
		if e := c.limiter.Wait(ctx); e != nil {
			return nil, e
		}
		b, typ, e := c.fetch(ctx, raw, cookie, raw, 4<<20)
		if e != nil {
			return nil, e
		}
		lower := strings.ToLower(string(b))
		if strings.Contains(lower, "temporarily banned") || strings.Contains(lower, "excessive request") || strings.Contains(lower, "image viewing limits") {
			return nil, fmt.Errorf("站点限流或图片额度已用完，请稍后重试")
		}
		if !strings.Contains(typ, "html") {
			return nil, fmt.Errorf("站点未返回网页，可能需要有效 Cookie 或 ExHentai 权限")
		}
		doc, e := goquery.NewDocumentFromReader(bytes.NewReader(b))
		if e != nil {
			return nil, e
		}
		if doc.Find("form[name=ipb_login_form], #challenge-running, #cf-challenge-running").Length() > 0 || strings.Contains(strings.ToLower(doc.Find("title").Text()), "login") {
			return nil, fmt.Errorf("站点要求登录或验证，请检查 Cookie 和账号权限")
		}
		c.mu.Lock()
		if len(c.cache) >= 96 {
			for k := range c.cache {
				delete(c.cache, k)
				break
			}
		}
		c.cache[key] = entry{b, time.Now().Add(3 * time.Minute)}
		c.mu.Unlock()
		return b, nil
	})
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("漫画请求已取消或超时")
	case result := <-flight:
		if result.Err != nil {
			return nil, result.Err
		}
		return goquery.NewDocumentFromReader(bytes.NewReader(result.Val.([]byte)))
	}
}
func absolute(base, ref string) string {
	u, e := url.Parse(base)
	if e != nil {
		return ""
	}
	v, e := u.Parse(ref)
	if e != nil || !AllowedURL(v.String()) {
		return ""
	}
	return v.String()
}
func parseLink(raw, base string) (Gallery, bool) {
	u, e := url.Parse(absolute(base, raw))
	if e != nil {
		return Gallery{}, false
	}
	m := galleryPath.FindStringSubmatch(u.Path)
	if m == nil {
		return Gallery{}, false
	}
	return Gallery{ID: m[1], Token: m[2], Site: u.Hostname(), Tags: map[string][]string{}}, true
}
func cover(s *goquery.Selection, base string) string {
	var found string
	s.Find("img").EachWithBreak(func(_ int, i *goquery.Selection) bool {
		v, _ := i.Attr("data-src")
		if v == "" {
			v, _ = i.Attr("src")
		}
		imageURL, _ := url.Parse(v)
		icon := imageURL != nil && (imageURL.Path == "/g/t.png" || imageURL.Path == "/g/td.png" || imageURL.Path == "/img/t.png" || imageURL.Path == "/img/td.png")
		if !icon {
			found = absolute(base, v)
		}
		return found == ""
	})
	if found == "" {
		s.Find("[style*='url']").EachWithBreak(func(_ int, i *goquery.Selection) bool {
			m := backgroundURL.FindStringSubmatch(i.AttrOr("style", ""))
			if len(m) > 1 {
				found = absolute(base, m[1])
			}
			return found == ""
		})
	}
	return found
}
func (c *Client) Search(ctx context.Context, site, cookie, query, category, language, cursor string) (Results, error) {
	result := Results{Items: []Gallery{}}
	base, e := Base(site)
	if e != nil {
		return result, e
	}
	if len(query) > 512 || len(cursor) > 2048 {
		return result, fmt.Errorf("搜索条件过长")
	}
	params := url.Values{"inline_set": {"dm_e"}} // expanded rows expose useful cover and tags
	if language != "" {
		switch language {
		case "chinese", "japanese", "english":
			query = strings.TrimSpace(query + ` language:"` + language + `$"`)
		default:
			return result, fmt.Errorf("语言筛选无效")
		}
	}
	params.Set("f_search", query)
	if category != "" {
		bit, e := strconv.Atoi(category)
		if e != nil || bit < 1 || bit > 512 || bit&(bit-1) != 0 {
			return result, fmt.Errorf("分类筛选无效")
		}
		params.Set("f_cats", strconv.Itoa(1023^bit))
	}
	if cursor != "" {
		v, e := url.ParseQuery(cursor)
		if e != nil {
			return result, fmt.Errorf("分页游标无效")
		}
		for k, vs := range v {
			if k != "next" && k != "prev" && k != "seek" {
				return result, fmt.Errorf("分页游标无效")
			}
			if len(vs) != 1 || len(vs[0]) > 128 {
				return result, fmt.Errorf("分页游标无效")
			}
			params.Set(k, vs[0])
		}
	}
	raw := base + "/?" + params.Encode()
	doc, e := c.document(ctx, raw, cookie, false)
	if e != nil {
		return result, e
	}
	seen := map[string]bool{}
	doc.Find("a[href*='/g/']").Each(func(_ int, a *goquery.Selection) {
		title := strings.TrimSpace(a.Find(".glink").Text())
		if title == "" {
			return
		}
		g, ok := parseLink(a.AttrOr("href", ""), base)
		if !ok || seen[g.ID] {
			return
		}
		seen[g.ID] = true
		g.Site = site
		g.Title = title
		row := a.Closest("tr")
		if row.Length() == 0 {
			row = a.Parent()
		}
		g.Cover = cover(row, base)
		g.Category = strings.TrimSpace(row.Find(".cn,.cs").First().Text())
		g.Posted = strings.TrimSpace(row.Find("[id^=posted_]").First().Text())
		result.Items = append(result.Items, g)
	})
	next := doc.Find("#dnext").AttrOr("href", "")
	if next == "" {
		html, _ := doc.Html()
		if m := nextURL.FindStringSubmatch(html); len(m) > 1 {
			next = strings.ReplaceAll(m[1], "&amp;", "&")
		}
	}
	if u, e := url.Parse(absolute(base, next)); e == nil && next != "" {
		v := url.Values{}
		for _, k := range []string{"next", "prev", "seek"} {
			if x := u.Query().Get(k); x != "" {
				v.Set(k, x)
			}
		}
		result.Next = v.Encode()
	}
	if len(result.Items) == 0 && doc.Find(".itg,#searchbox").Length() == 0 && !strings.Contains(strings.ToLower(doc.Text()), "no hits found") {
		return result, fmt.Errorf("无法识别站点搜索页，请检查 Cookie、账号权限或站点验证")
	}
	return result, nil
}
func galleryURL(site, id, token string) (string, error) {
	base, e := Base(site)
	if e != nil {
		return "", e
	}
	if !identity.MatchString(id + "/" + token) {
		return "", fmt.Errorf("画廊标识无效")
	}
	return base + "/g/" + id + "/" + token + "/", nil
}
func parseGallery(doc *goquery.Document, site, id, token, base string) (Gallery, error) {
	g := Gallery{ID: id, Token: token, Site: site, Title: strings.TrimSpace(doc.Find("#gn").Text()), JapaneseTitle: strings.TrimSpace(doc.Find("#gj").Text()), Tags: map[string][]string{}}
	if g.Title == "" {
		g.Title = g.JapaneseTitle
	}
	if g.Title == "" {
		return g, fmt.Errorf("画廊不可用，可能已下架、需要登录或账号权限不足")
	}
	g.Cover = cover(doc.Find("#gd1"), base)
	g.Category = strings.TrimSpace(doc.Find("#gdc").Text())
	g.Uploader = strings.TrimSpace(doc.Find("#gdn").Text())
	g.Rating = strings.TrimSpace(doc.Find("#rating_label").Text())
	doc.Find("#gdd tr").Each(func(_ int, r *goquery.Selection) {
		k := strings.TrimSuffix(strings.TrimSpace(r.Find(".gdt1").Text()), ":")
		v := strings.TrimSpace(r.Find(".gdt2").Text())
		switch k {
		case "Posted":
			g.Posted = v
		case "Language":
			g.Language = v
		case "Length":
			g.Pages, _ = strconv.Atoi(number.FindString(v))
		}
	})
	doc.Find("#taglist tr").Each(func(_ int, r *goquery.Selection) {
		ns := strings.TrimSuffix(strings.TrimSpace(r.Find("td.tc").Text()), ":")
		if ns == "" {
			return
		}
		r.Find("td").Eq(1).Find("a").Each(func(_ int, a *goquery.Selection) {
			if t := strings.TrimSpace(a.Text()); t != "" {
				g.Tags[ns] = append(g.Tags[ns], t)
			}
		})
	})
	return g, nil
}
func (c *Client) Details(ctx context.Context, site, cookie, id, token string) (Gallery, error) {
	raw, e := galleryURL(site, id, token)
	if e != nil {
		return Gallery{}, e
	}
	doc, e := c.document(ctx, raw+"?nw=always", cookie, false)
	if e != nil {
		return Gallery{}, e
	}
	return parseGallery(doc, site, id, token, raw)
}
func viewerLinks(doc *goquery.Document, base string) []string {
	links := []string{}
	seen := map[string]bool{}
	doc.Find("#gdt a[href*='/s/']").Each(func(_ int, a *goquery.Selection) {
		v := absolute(base, a.AttrOr("href", ""))
		if v != "" && !seen[v] {
			links = append(links, v)
			seen[v] = true
		}
	})
	return links
}
func (c *Client) Image(ctx context.Context, site, cookie, id, token string, index int) ([]byte, string, error) {
	select {
	case c.images <- struct{}{}:
		defer func() { <-c.images }()
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}
	raw, e := galleryURL(site, id, token)
	if e != nil {
		return nil, "", e
	}
	doc, e := c.document(ctx, raw+"?nw=always", cookie, false)
	if e != nil {
		return nil, "", e
	}
	g, e := parseGallery(doc, site, id, token, raw)
	if e != nil {
		return nil, "", e
	}
	if index < 0 || index >= g.Pages {
		return nil, "", fmt.Errorf("漫画页码超出范围")
	}
	links := viewerLinks(doc, raw)
	per := len(links)
	if per == 0 {
		return nil, "", fmt.Errorf("画廊没有可读取的图片")
	}
	offset := index % per
	if index >= per {
		doc, e = c.document(ctx, raw+"?p="+strconv.Itoa(index/per), cookie, false)
		if e != nil {
			return nil, "", e
		}
		links = viewerLinks(doc, raw)
	}
	if offset >= len(links) {
		return nil, "", fmt.Errorf("站点页列表不完整，请稍后重试")
	}
	viewer := links[offset]
	for attempt := 0; attempt < 2; attempt++ {
		doc, e = c.document(ctx, viewer, cookie, attempt > 0)
		if e != nil {
			return nil, "", e
		}
		imageURL := absolute(viewer, doc.Find("img#img").AttrOr("src", ""))
		if imageURL == "" {
			return nil, "", fmt.Errorf("无法读取图片，可能已达到站点额度或需要登录")
		}
		b, typ, err := c.fetch(ctx, imageURL, cookie, viewer, 40<<20)
		if err == nil {
			detected := http.DetectContentType(b)
			if strings.HasPrefix(detected, "image/") && !strings.Contains(imageURL, "509.gif") {
				return b, detected, nil
			}
			if strings.HasPrefix(typ, "image/") && strings.Contains(detected, "avif") {
				return b, typ, nil
			}
			err = fmt.Errorf("站点返回的不是漫画图片，可能额度已用完")
		}
		e = err
		html, _ := doc.Html()
		m := reloadKey.FindStringSubmatch(html)
		if len(m) > 1 {
			u, _ := url.Parse(viewer)
			q := u.Query()
			q.Set("nl", m[1])
			u.RawQuery = q.Encode()
			viewer = u.String()
		}
	}
	return nil, "", e
}
func (c *Client) Cover(ctx context.Context, raw, cookie string) ([]byte, string, error) {
	select {
	case c.images <- struct{}{}:
		defer func() { <-c.images }()
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}
	referer := "https://e-hentai.org/"
	if parsed, err := url.Parse(raw); err == nil && parsed.Hostname() == "s.exhentai.org" {
		referer = "https://exhentai.org/"
	}
	b, _, e := c.fetch(ctx, raw, cookie, referer, 8<<20)
	if e != nil {
		return nil, "", e
	}
	typ := http.DetectContentType(b)
	if !strings.HasPrefix(typ, "image/") {
		return nil, "", fmt.Errorf("封面暂不可用")
	}
	return b, typ, nil
}
