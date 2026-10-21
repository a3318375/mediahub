package mediaoutput

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Output paths must stay inside the configured root, including existing parents.
func SafePath(root string, parts ...string) (string, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	for _, p := range parts {
		if p == "" || p == "." || p == ".." || strings.ContainsAny(p, "/\\:\x00\r\n<>\"|?*") || strings.TrimRight(p, " .") != p {
			return "", fmt.Errorf("来源文件名不适用于本地输出")
		}
		base := strings.ToUpper(strings.SplitN(p, ".", 2)[0])
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || (len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '0' && base[3] <= '9') {
			return "", fmt.Errorf("来源文件名是系统保留名称")
		}
	}
	target := filepath.Join(append([]string{root}, parts...)...)
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("输出路径超出配置目录")
	}
	for p := target; ; p = filepath.Dir(p) {
		info, e := os.Lstat(p)
		if e == nil && info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("输出路径包含符号链接，请选择真实目录")
		}
		if e != nil && !os.IsNotExist(e) {
			return "", e
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	return target, nil
}

// Exclusive creation avoids overwriting any existing file, including user metadata.
func WriteNew(path string, body []byte) (bool, error) {
	info, err := os.Lstat(path)
	if err == nil {
		if !info.Mode().IsRegular() || info.Size() != int64(len(body)) {
			return false, fmt.Errorf("目标文件已存在且内容不同，已保留原文件")
		}
		old, readErr := os.ReadFile(path)
		if readErr != nil {
			return false, readErr
		}
		if bytes.Equal(old, body) {
			return false, nil
		}
		return false, fmt.Errorf("目标文件已存在且内容不同，已保留原文件")
	}
	if !os.IsNotExist(err) {
		return false, err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return false, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return false, err
	}
	_, err = f.Write(body)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	return err == nil, err
}

type uniqueID struct {
	Type    string `xml:"type,attr"`
	Default bool   `xml:"default,attr"`
	ID      string `xml:",chardata"`
}
type nfo struct {
	XMLName       xml.Name
	Title         string     `xml:"title"`
	OriginalTitle string     `xml:"originaltitle,omitempty"`
	ShowTitle     string     `xml:"showtitle,omitempty"`
	Year          int        `xml:"year,omitempty"`
	Plot          string     `xml:"plot,omitempty"`
	Season        *int       `xml:"season,omitempty"`
	Episode       *int       `xml:"episode,omitempty"`
	Aired         string     `xml:"aired,omitempty"`
	Premiered     string     `xml:"premiered,omitempty"`
	Genres        []string   `xml:"genre,omitempty"`
	IDs           []uniqueID `xml:"uniqueid"`
}

func NFO(m Metadata, show bool) ([]byte, error) {
	root := "movie"
	title := m.Detail.Title
	if m.Media.Type != "movie" {
		root = "tvshow"
		if !show {
			root = "episodedetails"
			title = m.EpisodeTitle
		}
	}
	if title == "" {
		return nil, fmt.Errorf("元数据缺少标题")
	}
	x := nfo{XMLName: xml.Name{Local: root}, Title: title, OriginalTitle: m.Detail.OriginalTitle, Plot: m.Detail.Overview, Genres: m.Detail.Genres, Premiered: m.Detail.ReleaseDate}
	if m.Detail.Year != nil {
		x.Year = *m.Detail.Year
	}
	provider := string(m.Detail.Source)
	id := m.Detail.SourceID
	if provider == "" {
		provider = m.Media.Provider
		id = m.Media.ProviderID
	}
	if provider == "" || id == "" {
		return nil, fmt.Errorf("元数据缺少来源标识")
	}
	x.IDs = []uniqueID{{Type: provider, Default: true, ID: id}}
	if root == "episodedetails" {
		if len(m.Media.Episodes) != 1 {
			return nil, fmt.Errorf("无法确定对应集数")
		}
		x.Season = &m.Media.Season
		x.Episode = &m.Media.Episodes[0]
		x.ShowTitle = m.Detail.Title
		x.Plot = m.EpisodePlot
		x.Aired = m.EpisodeDate
		x.OriginalTitle = ""
		x.Premiered = ""
	}
	b, err := xml.MarshalIndent(x, "", "  ")
	return append([]byte(xml.Header), append(b, '\n')...), err
}

func ImageURL(raw string) (string, error) {
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		raw = "https://image.tmdb.org/t/p/original" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return "", fmt.Errorf("图片地址无效")
	}
	host := strings.ToLower(u.Hostname())
	if host != "image.tmdb.org" && host != "lain.bgm.tv" && host != "lain.bangumi.tv" {
		return "", fmt.Errorf("图片来源暂不支持")
	}
	return u.String(), nil
}
func imageBytes(ctx context.Context, raw string) ([]byte, error) {
	address, err := ImageURL(raw)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, "GET", address, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 {
			return fmt.Errorf("图片跳转过多")
		}
		_, err := ImageURL(req.URL.String())
		return err
	}}
	r, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("图片下载失败")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return nil, fmt.Errorf("图片服务返回 HTTP %d", r.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, 15<<20+1))
	if err != nil || len(b) > 15<<20 {
		return nil, fmt.Errorf("图片读取失败或超过 15MB")
	}
	if t := http.DetectContentType(b); t != "image/jpeg" && t != "image/png" && t != "image/webp" {
		return nil, fmt.Errorf("上游未返回有效图片")
	}
	return b, nil
}
