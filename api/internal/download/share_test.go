package download_test

import (
	"context"
	"strings"
	"testing"

	"mediahub/internal/download"
	"mediahub/internal/pan115"
)

type shareGateway struct {
	*gateway
	source   map[string][]pan115.File
	receives int
	partial  bool
}

func (g *shareGateway) ListShare(code, password, directory string) ([]pan115.File, error) {
	return g.source[directory], nil
}
func (g *shareGateway) CreateDirectory(parent, name string) (pan115.File, error) {
	f := pan115.File{ID: "500", ParentID: parent, Name: name, Directory: true}
	g.files[f.ID] = f
	g.children[parent] = append(g.children[parent], f)
	return f, nil
}
func (g *shareGateway) ReceiveShare(code, password string, ids []string, directory string) error {
	g.receives++
	if password != "fixture" {
		return &pan115.Error{Code: "share_password", Message: "提取码不正确", Certain: true}
	}
	g.children[directory] = []pan115.File{{ID: "701", ParentID: directory, Name: "movie.mkv", Size: 4, SHA1: "abc"}}
	if g.partial {
		return context.DeadlineExceeded
	}
	g.children[directory] = append(g.children[directory], pan115.File{ID: "702", ParentID: directory, Name: "movie.ass", Size: 1})
	return nil
}
func shareRequest() download.Request {
	return download.Request{Kind: "share_transfer", URL: "https://115.com/s/fixture123?password=fixture", FileIDs: []string{"7", "8"}, DirectoryID: "100", Reference: download.Reference{Source: "media_search", Media: download.MediaContext{Type: "movie", Provider: "tmdb", ProviderID: "99"}}}
}
func TestShareTransferConfirmsNewIDsAndDoesNotExposePassword(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &shareGateway{gateway: base, source: map[string][]pan115.File{"0": {{ID: "7", Name: "movie.mkv", Size: 4, SHA1: "abc"}, {ID: "8", Name: "movie.ass", Size: 1}}}}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	task, created, err := s.Enqueue(shareRequest())
	if err != nil || !created {
		t.Fatal(task, created, err)
	}
	if strings.Contains(task.URL, "password") {
		t.Fatal("password leaked", task.URL)
	}
	password, err := db.DownloadReceiveCode(task.ID)
	if err != nil || password != "fixture" {
		t.Fatal("missing encrypted secret", err)
	}
	if again, created, err := s.Enqueue(shareRequest()); err != nil || created || again.ID != task.ID {
		t.Fatal("concurrent clicks should share one queued transfer", again.ID, err)
	}
	tick(t, s)
	v := read(t, db, task.ID)
	if v.State != "completed" || len(v.Artifacts) != 2 || v.Artifacts[0].ID == "7" || base.submits != 0 || base.queries != 0 || g.receives != 1 {
		t.Fatal(v, g.receives, base.submits, base.queries)
	}
	next, created, err := s.Enqueue(shareRequest())
	if err != nil || !created || next.ID == task.ID || next.ResourceID != task.ResourceID {
		t.Fatal("new transfer after completion", next, err)
	}
	tick(t, s)
	if g.receives != 2 || read(t, db, next.ID).State != "completed" || read(t, db, task.ID).State != "completed" {
		t.Fatal("both transfers should be recorded", g.receives)
	}
}
func TestShareUncertainPartialTransferOnlyReconciles(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &shareGateway{gateway: base, partial: true, source: map[string][]pan115.File{"0": {{ID: "7", Name: "movie.mkv", Size: 4, SHA1: "abc"}, {ID: "8", Name: "movie.ass", Size: 1}}}}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	task, _, err := s.Enqueue(shareRequest())
	if err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	if v := read(t, db, task.ID); v.State == "completed" {
		t.Fatal("partial transfer completed", v)
	}
	tick(t, s)
	if g.receives != 1 {
		t.Fatal("uncertain transfer resubmitted")
	}
	g.children["500"] = append(g.children["500"], pan115.File{ID: "702", ParentID: "500", Name: "movie.ass", Size: 1})
	tick(t, s)
	if v := read(t, db, task.ID); v.State != "completed" || g.receives != 1 {
		t.Fatal(v, g.receives)
	}
}
func TestShareSelectionIdentityAndURLValidation(t *testing.T) {
	for _, raw := range []string{"https://evil.test/s/fixture", "https://115.com/s/fixture/extra", "https://user@115.com/s/fixture", "javascript:alert(1)"} {
		if _, _, _, e := download.ParseShare(raw, ""); e == nil {
			t.Fatal("accepted", raw)
		}
	}
	r := shareRequest()
	hash, err := download.Validate(&r)
	if err != nil || !strings.HasPrefix(hash, "share:") {
		t.Fatal(hash, err)
	}
	r.FileIDs = []string{"8", "7"}
	again, err := download.Validate(&r)
	if err != nil || again != hash {
		t.Fatal(again, hash, err)
	}
}

func TestWholeShareDiscoversAndPersistsSelectionInBackground(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &shareGateway{gateway: base, source: map[string][]pan115.File{"0": {{ID: "7", Name: "movie.mkv", Size: 4, SHA1: "abc"}, {ID: "8", Name: "movie.ass", Size: 1}}}}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	r := shareRequest()
	r.WholeShare = true
	r.FileIDs = nil
	// The bare storage key is also the format of existing NAS records.
	r.Reference.Source = "tv_replacement"
	task, created, e := s.Enqueue(r)
	if e != nil || !created || len(task.FileIDs) != 0 || !task.WholeShare {
		t.Fatalf("%+v %v", task, e)
	}
	tick(t, s)
	v := read(t, db, task.ID)
	if v.State != "completed" || len(v.FileIDs) != 2 || len(v.Manifest) != 2 || g.receives != 1 {
		t.Fatalf("%+v receives=%d", v, g.receives)
	}
	if again, created, err := s.Enqueue(r); err != nil || created || again.ID != task.ID {
		t.Fatal("background retry should reuse its transfer", again, err)
	}
	r.Reference = download.Reference{Source: "media_search", Media: download.MediaContext{Type: "tv", Title: "剧集"}}
	r.DirectoryID = "200"
	next, created, err := s.Enqueue(r)
	if err != nil || !created || next.ID == task.ID || next.DirectoryID != "200" {
		t.Fatal("manual transfer to a new directory", next, err)
	}
	r.DirectoryID = "100"
	other, created, err := s.Enqueue(r)
	if err != nil || !created || other.ID == next.ID || other.ID == task.ID {
		t.Fatal("manual transfer to the original directory", other, err)
	}
	r.DirectoryID = "200"
	if again, created, err := s.Enqueue(r); err != nil || created || again.ID != next.ID {
		t.Fatal("repeat click should find the active task for this directory", again, err)
	}
	if old := read(t, db, task.ID); old.State != "completed" || old.DirectoryID != "100" || len(old.Artifacts) != 2 {
		t.Fatal("original transfer history changed", old)
	}
	r.DirectoryID = "100"
	r.Reference = shareRequest().Reference
	r.Reference.Source = "tv_replacement"
	if again, created, err := s.Enqueue(r); err != nil || created || again.ID != task.ID {
		t.Fatal("background retry switched to a later manual transfer", again, err)
	}
}
