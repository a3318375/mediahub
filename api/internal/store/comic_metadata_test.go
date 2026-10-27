package store

import (
	"context"
	"mediahub/internal/ehentai"
	"testing"
)

func TestComicMetadataFieldsTagsAndRescanPreservation(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	items := []ReadingItem{{ID: "book", Path: "book.cbz", Title: "filename", Format: "CBZ", Size: 3}, {ID: "missing", Path: "missing.cbz", Title: "missing", Format: "CBZ", Size: 2}}
	if err := s.SaveReadingScan(ctx, "comics", "library", items); err != nil {
		t.Fatal(err)
	}
	g := ehentai.Gallery{ID: "42", Token: "abc", Site: "e-hentai.org", Title: "Title", JapaneseTitle: "日本語", Category: "Manga", Pages: 21, Language: "chinese", Uploader: "uploader", Posted: "2026-10-27", Rating: "4.43", Tags: map[string][]string{"artist": {"moonlight"}, "parody": {"love live"}}}
	if err := s.SaveComicMetadata(ctx, "book", g); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveReadingScan(ctx, "comics", "library", items); err != nil {
		t.Fatal(err)
	}
	item, err := s.GetReading(ctx, "comics", "book")
	if err != nil || item.Metadata == nil || item.Metadata.JapaneseTitle != "日本語" || item.Metadata.Tags["artist"][0] != "moonlight" {
		t.Fatalf("metadata: %+v %v", item, err)
	}
	targets, err := s.ComicMetadataTargets(ctx, "missing")
	if err != nil || len(targets) != 1 || targets[0].ID != "missing" {
		t.Fatalf("missing: %+v %v", targets, err)
	}
	g.Tags = map[string][]string{"artist": {"updated"}}
	if err := s.SaveComicMetadata(ctx, "book", g); err != nil {
		t.Fatal(err)
	}
	m, err := s.ComicMetadata(ctx, "book")
	if err != nil || len(m.Tags) != 1 || m.Tags["artist"][0] != "updated" {
		t.Fatalf("stale tag revision: %+v %v", m, err)
	}
	page, err := s.ListReading(ctx, ReadingQuery{Kind: "comics", Page: 1})
	if err != nil || len(page.Items) != 2 {
		t.Fatalf("list: %+v %v", page, err)
	}
}

func TestComicsSyncRemovesMissingBookAndAllItsMetadata(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	old := ReadingItem{ID: "archive", Path: "book.cbz", Title: "book", Format: "CBZ", Size: 10}
	keep := ReadingItem{ID: "keep", Path: "keep", Title: "keep", Format: "DIRECTORY", Size: 20}
	if err := s.SaveReadingScan(ctx, "comics", "library", []ReadingItem{old, keep}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveComicMetadata(ctx, old.ID, ehentai.Gallery{ID: "42", Title: "metadata", Tags: map[string][]string{"artist": {"author"}}}); err != nil {
		t.Fatal(err)
	}
	if err := s.PruneMissingComics(ctx, "library", []ReadingItem{keep}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetReading(ctx, "comics", old.ID); err != ErrNotFound {
		t.Fatalf("missing book retained: %v", err)
	}
	for _, table := range []string{"comic_metadata", "comic_metadata_tags", "reading_covers"} {
		var n int
		if err := s.db.QueryRow("SELECT count(*) FROM "+table+" WHERE item_id=?", old.ID).Scan(&n); err != nil || n != 0 {
			t.Fatalf("orphan metadata: %s %d %v", table, n, err)
		}
	}
	page, err := s.ListReading(ctx, ReadingQuery{Kind: "comics", Page: 1})
	if err != nil || page.Total != 1 || page.Items[0].ID != "keep" {
		t.Fatalf("present book lost: %+v %v", page, err)
	}
	if err := s.DeleteReading(ctx, "comics", keep.ID); err != nil {
		t.Fatal(err)
	}
	page, err = s.ListReading(ctx, ReadingQuery{Kind: "comics", Page: 1})
	if err != nil || page.Total != 0 {
		t.Fatalf("delete failed: %+v %v", page, err)
	}
}
