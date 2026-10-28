package subsonic

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixture(t *testing.T) (*Server, string) {
	t.Helper()
	root := t.TempDir()
	data := make([]byte, 128)
	copy(data, "TAG")
	copy(data[3:33], "Real title")
	copy(data[33:63], "Real artist")
	copy(data[63:93], "Real album")
	copy(data[93:97], "2024")
	data[125] = 0
	data[126] = 1
	audio := append([]byte("audio bytes used for range checks"), data...)
	path := filepath.Join(root, "song.mp3")
	if err := os.WriteFile(path, audio, 0600); err != nil {
		t.Fatal(err)
	}
	library := NewLibrary()
	if err := library.Scan(root); err != nil {
		t.Fatal(err)
	}
	service := NewServer(library, func() (string, string, error) { return "listener", "sesame", nil }, func() string { return root })
	return service, path
}
func call(t *testing.T, s *Server, method string, values url.Values) *httptest.ResponseRecorder {
	t.Helper()
	if values == nil {
		values = url.Values{}
	}
	values.Set("u", "listener")
	values.Set("v", "1.16.1")
	values.Set("c", "test")
	if !values.Has("p") && !values.Has("t") {
		values.Set("p", "sesame")
	}
	req := httptest.NewRequest(http.MethodGet, "/rest/"+method+".view?"+values.Encode(), nil)
	out := httptest.NewRecorder()
	s.ServeHTTP(out, req)
	return out
}
func envelope(t *testing.T, r *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var data map[string]map[string]any
	if err := json.Unmarshal(r.Body.Bytes(), &data); err != nil {
		t.Fatalf("decode %s: %v", r.Body.String(), err)
	}
	return data["subsonic-response"]
}
func TestAuthenticationFormatsAndErrors(t *testing.T) {
	s, _ := fixture(t)
	token := fmt.Sprintf("%x", md5.Sum([]byte("sesamec19b2d")))
	for _, params := range []url.Values{{"t": {token}, "s": {"c19b2d"}}, {"p": {"enc:736573616d65"}}} {
		params.Set("f", "json")
		if got := envelope(t, call(t, s, "ping", params))["status"]; got != "ok" {
			t.Fatalf("auth: %v", got)
		}
	}
	for _, params := range []url.Values{{"p": {"bad"}}, {"t": {token}, "s": {"bad"}}, {"t": {token}, "p": {"sesame"}}} {
		params.Set("f", "json")
		data := envelope(t, call(t, s, "ping", params))
		if data["status"] != "failed" || data["error"].(map[string]any)["code"] != float64(40) {
			t.Fatalf("auth failure: %v", data)
		}
	}
	xmlResult := call(t, s, "getArtists", nil)
	var response struct {
		XMLName xml.Name
		Status  string `xml:"status,attr"`
		Artist  struct {
			Index struct {
				Artist []struct {
					Name string `xml:"name,attr"`
				} `xml:"artist"`
			} `xml:"index"`
		} `xml:"artists"`
	}
	if err := xml.Unmarshal(xmlResult.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.XMLName.Space != "http://subsonic.org/restapi" || response.Status != "ok" || response.Artist.Index.Artist[0].Name != "Real artist" {
		t.Fatalf("bad xml: %s", xmlResult.Body.String())
	}
	req := httptest.NewRequest("GET", "/rest/ping", nil)
	out := httptest.NewRecorder()
	s.ServeHTTP(out, req)
	if !strings.Contains(out.Body.String(), `code="10"`) {
		t.Fatal(out.Body.String())
	}
}
func TestTaggedCatalogueSearchAndPagination(t *testing.T) {
	s, _ := fixture(t)
	cat := s.Library.Snapshot()
	if len(cat.Songs) != 1 || cat.Songs[0].Title != "Real title" || cat.Songs[0].Artist != "Real artist" || cat.Albums[0].Name != "Real album" {
		t.Fatalf("bad metadata: %+v", cat)
	}
	data := envelope(t, call(t, s, "search3", url.Values{"f": {"json"}, "query": {"Real title"}, "songCount": {"1"}}))
	if len(data["searchResult3"].(map[string]any)["song"].([]any)) != 1 {
		t.Fatal(data)
	}
	data = envelope(t, call(t, s, "search3", url.Values{"f": {"json"}, "songOffset": {"999"}}))
	if len(data["searchResult3"].(map[string]any)["song"].([]any)) != 0 {
		t.Fatal(data)
	}
	data = envelope(t, call(t, s, "getAlbumList2", url.Values{"f": {"json"}, "type": {"alphabeticalByName"}, "size": {"-1"}}))
	if data["status"] != "failed" {
		t.Fatal(data)
	}
	result := call(t, s, "getAlbum", url.Values{"id": {cat.Albums[0].ID}})
	if !strings.Contains(result.Body.String(), "Real title") {
		t.Fatal(result.Body.String())
	}
	result = call(t, s, "stream", url.Values{"id": {"../../secret"}})
	if !strings.Contains(result.Body.String(), `code="70"`) {
		t.Fatal(result.Body.String())
	}
	if err := s.Library.Scan(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("expected error")
	}
	if len(s.Library.Snapshot().Songs) != 1 {
		t.Fatal("failed scan discarded catalogue")
	}
}
func TestStreamingRangeAndPost(t *testing.T) {
	s, path := fixture(t)
	id := s.Library.Snapshot().Songs[0].ID
	params := url.Values{"u": {"listener"}, "p": {"sesame"}, "v": {"1.16.1"}, "c": {"test"}, "id": {id}}
	req := httptest.NewRequest("GET", "/rest/stream?"+params.Encode(), nil)
	req.Header.Set("Range", "bytes=0-4")
	out := httptest.NewRecorder()
	s.ServeHTTP(out, req)
	if out.Code != 206 || out.Body.String() != "audio" || out.Header().Get("Content-Range") == "" {
		t.Fatalf("range: %d %s", out.Code, out.Body.String())
	}
	req = httptest.NewRequest("POST", "/rest/ping.view", strings.NewReader(params.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	out = httptest.NewRecorder()
	s.ServeHTTP(out, req)
	if !strings.Contains(out.Body.String(), `status="ok"`) {
		t.Fatal(out.Body.String())
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	_ = call(t, s, "download", url.Values{"id": {id}})
	after, err := os.ReadFile(path)
	if err != nil || string(before) != string(after) {
		t.Fatal("source changed")
	}
	// A caller cannot ask this read-only implementation to silently transcode.
	out = call(t, s, "stream", url.Values{"id": {id}, "format": {"mp3"}})
	if !strings.Contains(out.Body.String(), `status="failed"`) {
		t.Fatal(out.Body.String())
	}
}
func TestDisabledCredentialsAndUnsupportedMethods(t *testing.T) {
	s, _ := fixture(t)
	data := envelope(t, call(t, s, "createPlaylist", url.Values{"f": {"json"}}))
	if data["status"] != "failed" {
		t.Fatal(data)
	}
	s.Credentials = func() (string, string, error) { return "", "", nil }
	data = envelope(t, call(t, s, "ping", url.Values{"f": {"json"}}))
	if data["status"] != "failed" {
		t.Fatal(data)
	}
}

func TestLegacyAlbumShapeAndFolderValidation(t *testing.T) {
	s, _ := fixture(t)
	data := envelope(t, call(t, s, "search2", url.Values{"f": {"json"}, "query": {"Real"}}))
	album := data["searchResult2"].(map[string]any)["album"].([]any)[0].(map[string]any)
	if album["title"] != "Real album" || album["isDir"] != true {
		t.Fatal(album)
	}
	data = envelope(t, call(t, s, "getRandomSongs", url.Values{"f": {"json"}, "genre": {"No match"}}))
	if len(data["randomSongs"].(map[string]any)["song"].([]any)) != 0 {
		t.Fatal(data)
	}
	data = envelope(t, call(t, s, "search3", url.Values{"f": {"json"}, "musicFolderId": {"unknown"}}))
	if data["status"] != "failed" {
		t.Fatal(data)
	}
}

func TestFailedLoginBudgetStopsCredentialChecks(t *testing.T) {
	s, _ := fixture(t)
	checks := 0
	s.Credentials = func() (string, string, error) { checks++; return "listener", "sesame", nil }
	for i := 0; i < 12; i++ {
		call(t, s, "ping", url.Values{"p": {"wrong"}})
	}
	if checks != 10 {
		t.Fatalf("expected 10 credential checks before throttle, got %d", checks)
	}
}

func TestRefreshUpdatesTagsAndRetainsSnapshotOnCancellation(t *testing.T) {
	s, path := fixture(t)
	before := s.Library.Snapshot().Songs[0]
	completed := s.Library.CompletedAt()
	if completed == "" {
		t.Fatal("successful scan must report completion time")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	copy(data[len(data)-128+3:len(data)-128+33], []byte("Updated title                 "))
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.Scan(); err != nil {
		t.Fatal(err)
	}
	after := s.Library.Snapshot().Songs[0]
	if after.ID != before.ID || after.Title != "Updated title" {
		t.Fatalf("refresh did not update existing song: %+v", after)
	}
	completed = s.Library.CompletedAt()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.ScanContext(ctx); err == nil {
		t.Fatal("cancelled scan must fail")
	}
	if s.Library.CompletedAt() != completed || s.Library.Snapshot().Songs[0].Title != "Updated title" {
		t.Fatal("cancelled scan replaced the previous successful snapshot")
	}
}

func TestPlaylistProtocolDispatch(t *testing.T) {
	s := NewServer(NewLibrary(), func() (string, string, error) { return "", "", nil }, func() string { return "" })
	s.APIKeyAuth = func(key string) bool { return key == "valid" }
	called := false
	s.Playlists = func(method string, p url.Values) (map[string]any, error) {
		called = true
		if method != "createPlaylist" || len(p["songId"]) != 2 {
			t.Fatalf("lost playlist parameters: %s %v", method, p)
		}
		return map[string]any{"playlist": map[string]any{"id": "p1", "name": p.Get("name")}}, nil
	}
	for _, key := range []string{"invalid", "valid"} {
		called = false
		p := url.Values{"apiKey": {key}, "v": {"1.16.1"}, "c": {"test"}, "f": {"json"}, "name": {"我的歌单"}, "songId": {"one", "two"}}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, httptest.NewRequest("POST", "/rest/createPlaylist.view", strings.NewReader(p.Encode())))
		// Query parameters are supported by both GET and POST clients.
		w = httptest.NewRecorder()
		s.ServeHTTP(w, httptest.NewRequest("GET", "/rest/createPlaylist?"+p.Encode(), nil))
		if called != (key == "valid") {
			t.Fatalf("authentication bypass or missing dispatch: %s", w.Body.String())
		}
		if key == "valid" && !strings.Contains(w.Body.String(), "p1") {
			t.Fatal(w.Body.String())
		}
	}
}
