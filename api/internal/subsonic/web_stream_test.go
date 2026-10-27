package subsonic

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWebPlaybackRangeHeadAndSessionRevocation(t *testing.T) {
	service, _ := fixture(t)
	valid := true
	streams := NewWebStreams(service.Library, func(hash string) bool { return valid && hash == "session-hash" })
	id := service.Library.Snapshot().Songs[0].ID
	url, err := streams.Issue(id, "session-hash")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(url, "session-hash") {
		t.Fatal("session hash entered playback URL")
	}
	req := httptest.NewRequest("GET", url, nil)
	req.Header.Set("Range", "bytes=0-4")
	out := httptest.NewRecorder()
	streams.ServeHTTP(out, req)
	if out.Code != 206 || out.Body.String() != "audio" || out.Header().Get("Content-Type") != "audio/mpeg" {
		t.Fatalf("range %d %s", out.Code, out.Body.String())
	}
	out = httptest.NewRecorder()
	streams.ServeHTTP(out, httptest.NewRequest("HEAD", url, nil))
	if out.Code != 200 || out.Body.Len() != 0 || out.Header().Get("Content-Length") == "" {
		t.Fatalf("head: %d", out.Code)
	}
	valid = false
	out = httptest.NewRecorder()
	streams.ServeHTTP(out, httptest.NewRequest("GET", url, nil))
	if out.Code != 401 {
		t.Fatal("revoked session can still stream")
	}
	if _, err := streams.Issue(id, "session-hash"); err == nil {
		t.Fatal("revoked session received a new ticket")
	}
}
func TestWebPlaybackRejectsExpiredMissingAndWrongSongTickets(t *testing.T) {
	service, _ := fixture(t)
	streams := NewWebStreams(service.Library, func(string) bool { return true })
	now := time.Now()
	streams.now = func() time.Time { return now }
	id := service.Library.Snapshot().Songs[0].ID
	url, err := streams.Issue(id, "session-hash")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/stream/music/" + id, strings.Replace(url, id, "another-song", 1)} {
		out := httptest.NewRecorder()
		streams.ServeHTTP(out, httptest.NewRequest("GET", path, nil))
		if out.Code != 401 {
			t.Fatalf("unauthorized stream returned %d", out.Code)
		}
	}
	now = now.Add(2 * time.Hour)
	out := httptest.NewRecorder()
	streams.ServeHTTP(out, httptest.NewRequest("GET", url, nil))
	if out.Code != 401 {
		t.Fatal("expired ticket accepted")
	}
	if _, err := streams.Issue("unknown-song", "session-hash"); err == nil {
		t.Fatal("ticket issued for nonexistent song")
	}
}
