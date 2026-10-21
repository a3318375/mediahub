package mediaoutput

import (
	"encoding/xml"
	"mediahub/internal/download"
	"mediahub/internal/media"
	"path/filepath"
	"strings"
	"testing"
)

func TestOutputConfigurationRequiresExplicitValues(t *testing.T) {
	if (Config{}).Validate("strm") == nil {
		t.Fatal("empty STRM config enabled")
	}
	root, err := filepath.Abs("uncreated-output")
	if err != nil {
		t.Fatal(err)
	}
	c := Config{SourceID: "123", OutputDir: root, BaseURL: "http://nas.example:18080"}
	if err = c.Validate("strm"); err != nil {
		t.Fatal(err)
	}
	c.Cron = "0 3 * * *"
	if err = c.Validate("strm"); err != nil {
		t.Fatal(err)
	}
	if c.Validate("scraping") == nil {
		t.Fatal("scraping accepted a schedule")
	}
	c.Cron = "invalid"
	if c.Validate("strm") == nil {
		t.Fatal("invalid schedule accepted")
	}
	c.Cron = ""
	for _, address := range []string{"file:///tmp/video", "https://user:pass@example.com", "http://nas.example/?token=x", "http://nas.example/#fragment"} {
		c.BaseURL = address
		if c.Validate("strm") == nil {
			t.Fatalf("invalid base URL accepted: %s", address)
		}
	}
}

func TestOutputPathsRejectTraversalAndDeviceNames(t *testing.T) {
	root, _ := filepath.Abs("uncreated-output")
	for _, part := range []string{"..", "../outside.strm", "x/y", "x\\y", "CON.strm", "a:b", "movie. ", "a?b.strm"} {
		if _, err := SafePath(root, part); err == nil {
			t.Fatalf("unsafe component accepted: %s", part)
		}
	}
	valid, err := SafePath(root, "电影", "影片.strm")
	if err != nil || !strings.HasPrefix(valid, root+string(filepath.Separator)) {
		t.Fatalf("valid mirror path failed: %s %v", valid, err)
	}
}

func TestOutputNFOEscapesTitlesAndKeepsEpisodeIdentity(t *testing.T) {
	year := 2026
	m := Metadata{Media: download.MediaContext{Type: "tv", Title: "剧集", Season: 2, Episodes: []int{3}}, Detail: media.Detail{Summary: media.Summary{Identity: media.Identity{Source: media.SourceTMDB, SourceID: "123"}, Title: "A & B <show>", Year: &year}}, EpisodeTitle: "第3集 & 后续", EpisodePlot: "内容 <tag>", EpisodeDate: "2026-10-21"}
	body, err := NFO(m, false)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		XMLName xml.Name
		Title   string `xml:"title"`
		Season  int    `xml:"season"`
		Episode int    `xml:"episode"`
		Plot    string `xml:"plot"`
	}
	if err = xml.Unmarshal(body, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.XMLName.Local != "episodedetails" || parsed.Title != m.EpisodeTitle || parsed.Season != 2 || parsed.Episode != 3 || parsed.Plot != m.EpisodePlot {
		t.Fatalf("incorrect episode NFO: %s", body)
	}
	m.EpisodeTitle = ""
	if _, err = NFO(m, false); err == nil {
		t.Fatal("missing episode metadata reported complete")
	}
}

func TestOutputImagesOnlyUseSupportedHTTPSHosts(t *testing.T) {
	for _, raw := range []string{"http://image.tmdb.org/x.jpg", "https://127.0.0.1/x.jpg", "https://image.tmdb.org.evil.test/x.jpg", "https://user:pass@image.tmdb.org/x.jpg"} {
		if _, err := ImageURL(raw); err == nil {
			t.Fatalf("unsafe image URL accepted: %s", raw)
		}
	}
	if u, err := ImageURL("/poster.jpg"); err != nil || u != "https://image.tmdb.org/t/p/original/poster.jpg" {
		t.Fatalf("TMDB path was not normalized: %s %v", u, err)
	}
}
