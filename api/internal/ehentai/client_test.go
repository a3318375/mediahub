package ehentai

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestCookieAndURLBoundaries(t *testing.T) {
	for _, raw := range []string{"", "ipb_member_id=1", "ipb_member_id=1; ipb_pass_hash=x\r\nInjected: yes"} {
		if _, e := NormalizeCookie(raw); e == nil {
			t.Fatal("accepted malformed cookie")
		}
	}
	normalized, e := NormalizeCookie("unrelated=ignored; ipb_member_id=1; ipb_pass_hash=abc; igneous=def")
	if e != nil || normalized != "ipb_member_id=1; ipb_pass_hash=abc; igneous=def" {
		t.Fatal("cookie normalization failed")
	}
	for _, raw := range []string{"http://127.0.0.1/a", "https://e-hentai.org.evil.test/a", "https://s.exhentai.org.evil.test/a", "https://s.exhentai.org:8440/a", "https://user:pass@e-hentai.org/a", "https://e-hentai.org:8080/a", "https://ehgt.org:8440/a", "https://node.hath.network:65536/a", "https://node.hath.network:0/a", "file:///a", "https://hath.network.evil.test:8440/a"} {
		if AllowedURL(raw) {
			t.Fatalf("unsafe URL accepted: %s", raw)
		}
	}
	for _, raw := range []string{"https://e-hentai.org/g/1/abc/", "https://s.exhentai.org/w/cover.webp", "https://abc.hath.network/a", "https://abc.hath.network:8440/a", "https://node.example.hath.network:42831/a", "https://ehgt.org/a.jpg"} {
		if !AllowedURL(raw) {
			t.Fatalf("valid URL rejected: %s", raw)
		}
	}
}

func TestGalleryMetadataKeepsNamespaces(t *testing.T) {
	doc, e := goquery.NewDocumentFromReader(strings.NewReader(`<h1 id="gn">Example</h1><h1 id="gj">別名</h1><div id="gdn"><a>Uploader</a></div><div id="gd1"><div style="background:url(https://ehgt.org/cover.jpg)"></div></div><div id="gdd"><table><tr><td class="gdt1">Length:</td><td class="gdt2">42 pages</td></tr></table></div><div id="taglist"><table><tr><td class="tc">artist:</td><td><a>Artist</a></td></tr></table></div>`))
	if e != nil {
		t.Fatal(e)
	}
	g, e := parseGallery(doc, "e-hentai.org", "1", "abc", "https://e-hentai.org/")
	if e != nil {
		t.Fatal(e)
	}
	if g.Pages != 42 || g.JapaneseTitle != "別名" || g.Uploader != "Uploader" || len(g.Tags["artist"]) != 1 || g.Cover != "https://ehgt.org/cover.jpg" {
		t.Fatalf("metadata lost: %+v", g)
	}
}

func TestExhentaiCoverIgnoresIconsAndUsesOfficialThumbnailHost(t *testing.T) {
	for _, markup := range []string{
		`<img src="https://exhentai.org/img/t.png"><img data-src="https://s.exhentai.org/w/cover.webp">`,
		`<img src="https://exhentai.org/img/td.png"><div style="background-image:url(https://s.exhentai.org/w/cover.webp)"></div>`,
	} {
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(`<div id="row">` + markup + `</div>`))
		if err != nil {
			t.Fatal(err)
		}
		if got := cover(doc.Find("#row"), "https://exhentai.org/"); got != "https://s.exhentai.org/w/cover.webp" {
			t.Fatalf("selected icon instead of gallery cover: %s", got)
		}
	}
}

func TestExhentaiThumbnailUsesSiteCookieWithoutLeakingToCDNs(t *testing.T) {
	c := New()
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		expectCookie := r.URL.Hostname() == "s.exhentai.org"
		if (r.Header.Get("Cookie") != "") != expectCookie {
			t.Errorf("incorrect cookie scope for %s", r.URL.Hostname())
		}
		if expectCookie && r.Header.Get("Referer") != "https://exhentai.org/" {
			t.Error("thumbnail referer must match ExHentai")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"image/png"}}, Body: io.NopCloser(strings.NewReader("\x89PNG\r\n\x1a\n" + strings.Repeat("x", 20))), Request: r}, nil
	})}
	for _, host := range []string{"s.exhentai.org", "ehgt.org", "node.hath.network"} {
		if _, _, err := c.Cover(context.Background(), "https://"+host+"/w/cover.png", "ipb_member_id=1; ipb_pass_hash=test"); err != nil {
			t.Fatal(err)
		}
	}
}

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSearchCategoryIsExclusionMaskAndPreservesCursor(t *testing.T) {
	c := New()
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		q := r.URL.Query()
		if q.Get("f_cats") != "767" || q.Get("next") != "123" || !strings.Contains(q.Get("f_search"), `language:"chinese$"`) {
			t.Errorf("invalid source query: %s", r.URL.RawQuery)
		}
		html := `<div id="searchbox"></div><table class="itg"><tr><td><img data-src="https://ehgt.org/a.jpg"></td><td><a href="https://e-hentai.org/g/42/abc/"><div class="glink">Example</div></a></td></tr></table><a id="dnext" href="https://e-hentai.org/?next=41">Next</a>`
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: io.NopCloser(strings.NewReader(html)), Request: r}, nil
	})}
	r, e := c.Search(context.Background(), "e-hentai.org", "", "example", "256", "chinese", "next=123")
	if e != nil {
		t.Fatal(e)
	}
	if len(r.Items) != 1 || r.Next != "next=41" || r.Items[0].ID != "42" {
		t.Fatalf("unexpected result: %+v", r)
	}
	if _, e = c.Search(context.Background(), "e-hentai.org", "", "", "", "", "url=http://127.0.0.1"); e == nil {
		t.Fatal("accepted arbitrary cursor")
	}
}

func TestImageUsesActualThumbnailPageSize(t *testing.T) {
	c := New()
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		body := ""
		typ := "text/html"
		switch {
		case strings.HasPrefix(r.URL.Path, "/g/"):
			body = `<h1 id="gn">Example</h1><div id="gdd"><table><tr><td class="gdt1">Length:</td><td class="gdt2">4 pages</td></tr></table></div><div id="gdt">`
			start := 0
			if r.URL.Query().Get("p") == "1" {
				start = 2
			}
			for i := start; i < start+2; i++ {
				body += fmt.Sprintf(`<a href="https://e-hentai.org/s/key/1-%d">page</a>`, i+1)
			}
			body += "</div>"
		case r.URL.Path == "/s/key/1-4":
			body = `<img id="img" src="https://ehgt.org/page.png">`
		case r.URL.Path == "/page.png":
			typ = "image/png"
			body = "\x89PNG\r\n\x1a\n" + strings.Repeat("x", 20)
			if r.Header.Get("Cookie") != "" {
				t.Error("cookie leaked to image host")
			}
		default:
			t.Fatalf("incorrect page URL: %s", r.URL)
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{typ}}, Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})}
	b, typ, e := c.Image(context.Background(), "e-hentai.org", "ipb_member_id=1; ipb_pass_hash=secret", "1", "abc", 3)
	if e != nil || len(b) == 0 || typ != "image/png" {
		t.Fatalf("image failed: %v %s", e, typ)
	}
}
