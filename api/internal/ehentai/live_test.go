package ehentai

import (
	"bytes"
	"context"
	"github.com/PuerkitoBio/goquery"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
)

// Opt-in, read-only upstream check. Does not open a database or start a server.
func TestLiveGalleryRead(t *testing.T) {
	if os.Getenv("MEDIAHUB_EH_LIVE") != "1" {
		t.Skip("explicit live upstream check")
	}
	c := New()
	original := c.HTTP.Transport
	c.HTTP.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		resp, e := original.RoundTrip(r)
		if e == nil && strings.HasPrefix(r.URL.Path, "/s/") {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			resp.Body = io.NopCloser(bytes.NewReader(b))
			t.Logf("Viewer: status=%d bytes=%d hasImage=%v", resp.StatusCode, len(b), bytes.Contains(b, []byte(`id="img"`)))
			doc, _ := goquery.NewDocumentFromReader(bytes.NewReader(b))
			if doc != nil {
				raw := doc.Find("img#img").AttrOr("src", "")
				t.Logf("Image URL allowed=%v", AllowedURL(raw))
				if raw != "" {
					u, _ := url.Parse(raw)
					t.Logf("Image host=%s port=%s", u.Hostname(), u.Port())
				} else {
					t.Logf("Viewer diagnostic: %.500s", doc.Text())
				}
			}
		}
		return resp, e
	})
	b, typ, e := c.Image(context.Background(), "e-hentai.org", "", "3316027", "8c4fbe8822", 0)
	if e != nil {
		t.Fatal(e)
	}
	t.Logf("Image bytes=%d type=%s", len(b), typ)
}
