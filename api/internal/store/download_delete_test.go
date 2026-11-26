package store

import (
	"database/sql"
	"errors"
	"testing"

	"mediahub/internal/download"
	"mediahub/internal/pan115"
	"mediahub/internal/tv"
)

func TestDeleteTransferRecord(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	db.SetMaxOpenConns(1)
	sqlSchema, err := schema.ReadFile("schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(sqlSchema)); err != nil {
		t.Fatal(err)
	}
	s := &Store{db: db, secretKey: make([]byte, 32)}
	ctx := t.Context()
	request := download.Request{Kind: "share_transfer", WholeShare: true, DirectoryID: "1",
		Reference: download.Reference{Source: "media_search", Media: download.MediaContext{Type: "movie", Title: "剧集"}}}
	task, _, err := s.CreateDownload("account", "share:example", request)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteDownload(ctx, task.ID); !errors.Is(err, download.ErrTaskActive) {
		t.Fatalf("delete queued transfer: %v", err)
	}
	task.State = "completed"
	task.Artifacts = []pan115.File{{ID: "100", Name: "S01E01.mkv"}}
	if err = s.SaveDownload(task); err != nil {
		t.Fatal(err)
	}
	if files, err := s.OrganizePending("account"); err != nil || len(files) != 1 {
		t.Fatalf("pending before deletion: %v, %v", files, err)
	}
	if err = s.DeleteDownload(ctx, task.ID); err != nil {
		t.Fatal(err)
	}
	if files, err := s.OrganizePending("account"); err != nil || len(files) != 0 {
		t.Fatalf("deleted transfer still supplied files to organizer: %v, %v", files, err)
	}
	for _, table := range []string{"download_events", "download_references", "download_task_secrets"} {
		var count int
		if err := db.QueryRow("SELECT COUNT(*) FROM "+table+" WHERE task_id=?", task.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("orphaned %s: %d, %v", table, count, err)
		}
	}
	if err = s.SaveDownload(task); !errors.Is(err, download.ErrConflict) {
		t.Fatalf("stale worker write after deletion: %v", err)
	}
	request.DirectoryID = "2"
	request.Reference.Media = download.MediaContext{Type: "tv", Provider: "tmdb", ProviderID: "10", Title: "剧集"}
	next, created, err := s.CreateDownload("account", "share:example", request)
	if err != nil || !created || next.ID == task.ID || next.DirectoryID != "2" {
		t.Fatalf("subsequent transfer in TV directory: %+v, %v", next, err)
	}

	sub, err := s.CreateTV(tv.Draft{Source: "pansou", TMDBID: "10", Title: "剧集", Rules: tv.Rules{Match: "剧集"}})
	if err != nil {
		t.Fatal(err)
	}
	request.Reference = download.Reference{Source: "tv_replacement", SourceID: sub.ID}
	replacement, _, err := s.CreateDownload("account", "share:replacement", request)
	if err != nil {
		t.Fatal(err)
	}
	replacement.State = "failed"
	if err = s.SaveDownload(replacement); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteDownload(ctx, replacement.ID); !errors.Is(err, tv.ErrPendingReplacement) {
		t.Fatalf("lost transfer before its replacement job was saved: %v", err)
	}
	job := tv.Replacement{ID: "job", TaskID: replacement.ID, State: "failed"}
	if err = s.SaveTVReplacement(sub.ID, job); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteDownload(ctx, replacement.ID); !errors.Is(err, tv.ErrPendingReplacement) {
		t.Fatalf("lost retryable replacement: %v", err)
	}
	if err = s.DeleteTV(sub.ID); !errors.Is(err, tv.ErrPendingReplacement) {
		t.Fatalf("lost subscription with unfinished replacement: %v", err)
	}
	job.State = "completed"
	if err = s.SaveTVReplacement(sub.ID, job); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteDownload(ctx, replacement.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteTV(sub.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetDownload(next.ID); err != nil {
		t.Fatalf("unrelated download was affected: %v", err)
	}
}
