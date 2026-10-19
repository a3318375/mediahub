package reading

import (
	"context"
	"errors"
	"io/fs"
	"testing"
	"testing/fstest"
)

func TestScanSeparatesLibrariesAndKeepsStableIdentity(t *testing.T) {
	source := fstest.MapFS{
		"漫画/第一卷.CBZ": {Data: []byte("archive")},
		"漫画/第二卷.cbr": {Data: []byte("archive")},
		"小说/故事.txt":  {Data: []byte("text")},
		"小说/故事.epub": {Data: []byte("archive")},
		"other.pdf":  {Data: []byte("ignored")},
		"link.cbz":   {Mode: fs.ModeSymlink, Data: []byte("outside")},
	}
	comics, err := scanFS(context.Background(), "comics", "library", source)
	if err != nil || len(comics) != 2 {
		t.Fatalf("comics: %v %v", comics, err)
	}
	novels, err := scanFS(context.Background(), "novels", "library", source)
	if err != nil || len(novels) != 2 {
		t.Fatalf("novels: %v %v", novels, err)
	}
	if comics[0].Title != "第一卷" || comics[0].Format != "CBZ" || comics[0].Path != "漫画/第一卷.CBZ" {
		t.Fatalf("metadata: %+v", comics[0])
	}
	again, err := scanFS(context.Background(), "comics", "library", source)
	if err != nil || again[0].ID != comics[0].ID {
		t.Fatal("repeat scan changed identity")
	}
}

type unreadableFS struct{}

func (unreadableFS) Open(string) (fs.File, error) { return nil, fs.ErrPermission }
func TestFailedOrCancelledScanReturnsNoPartialCatalog(t *testing.T) {
	items, err := scanFS(context.Background(), "comics", "library", unreadableFS{})
	if err == nil || items != nil {
		t.Fatal("unreadable directory accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	items, err = scanFS(ctx, "comics", "library", fstest.MapFS{"book.cbz": {}})
	if !errors.Is(err, context.Canceled) || items != nil {
		t.Fatal("cancelled scan accepted")
	}
}

// A scanner must not open book contents, including unsupported CBR archives.
type metadataOnlyFS struct{ fs.FS }

func (m metadataOnlyFS) Open(name string) (fs.File, error) {
	if name != "." {
		return nil, errors.New("book content must not be opened")
	}
	return m.FS.Open(name)
}
func TestScanDoesNotReadBookContents(t *testing.T) {
	items, err := scanFS(context.Background(), "comics", "library", metadataOnlyFS{fstest.MapFS{"book.cbr": {Data: []byte("not decompressed")}}})
	if err != nil || len(items) != 1 {
		t.Fatalf("metadata scan: %v %v", items, err)
	}
}
