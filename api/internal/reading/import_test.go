package reading

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func testCBZ(t *testing.T, name string, files map[string]string) {
	t.Helper()
	f, err := os.Create(name)
	if err != nil {
		t.Fatal(err)
	}
	z := zip.NewWriter(f)
	for name, data := range files {
		w, err := z.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(data)); err != nil {
			t.Fatal(err)
		}
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestImportCBZPublishesReadableDirectoryThenRemovesSource(t *testing.T) {
	inbox, library := t.TempDir(), t.TempDir()
	archive := filepath.Join(inbox, "第一卷.cbz")
	testCBZ(t, archive, map[string]string{"pages/10.jpg": "ten", "pages/2.jpg": "two", "ComicInfo.xml": "metadata"})
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) != 0 {
		t.Fatal(problems)
	}
	if _, err := os.Stat(archive); !os.IsNotExist(err) {
		t.Fatal("verified source not removed", err)
	}
	items, err := Scan(context.Background(), "comics", library)
	if err != nil || len(items) != 1 || items[0].Format != folderFormat {
		t.Fatalf("scan: %+v %v", items, err)
	}
	r := &Reader{}
	book, err := r.Book(library, items[0].Path, items[0].Format)
	if err != nil || book.Count != 2 {
		t.Fatalf("book: %+v %v", book, err)
	}
	data, mime, err := r.Image(context.Background(), library, items[0].Path, book, 0, true)
	if err != nil || string(data) != "two" || mime != "image/jpeg" {
		t.Fatalf("image: %s %s %v", data, mime, err)
	}
	if data, err := os.ReadFile(filepath.Join(library, "第一卷", "ComicInfo.xml")); err != nil || string(data) != "metadata" {
		t.Fatal("metadata lost", err)
	}
}

func TestImportCBZPreservesSourceOnUnsafeArchive(t *testing.T) {
	for _, name := range []string{"../escape.jpg", "pages/../../escape.jpg", "C:/escape.jpg", `pages\escape.jpg`} {
		t.Run(name, func(t *testing.T) {
			inbox, library := t.TempDir(), t.TempDir()
			archive := filepath.Join(inbox, "book.cbz")
			testCBZ(t, archive, map[string]string{name: "data"})
			if problems := ImportCBZ(context.Background(), inbox, library); len(problems) == 0 {
				t.Fatal("unsafe/conflicting import accepted")
			}
			if _, err := os.Stat(archive); err != nil {
				t.Fatal("source lost", err)
			}
		})
	}
}

func TestImportExistingFolderNeverOverwritesOrMerges(t *testing.T) {
	inbox, library := t.TempDir(), t.TempDir()
	archive := filepath.Join(inbox, "book.cbz")
	testCBZ(t, archive, map[string]string{"1.jpg": "one"})
	original, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) > 0 {
		t.Fatal(problems)
	}
	if err := os.WriteFile(filepath.Join(library, "book", "1.jpg"), []byte("user edit"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(archive, original, 0644); err != nil {
		t.Fatal(err)
	}
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) > 0 {
		t.Fatal(problems)
	}
	for name, want := range map[string]string{"book": "user edit", "book (2)": "one"} {
		data, err := os.ReadFile(filepath.Join(library, name, "1.jpg"))
		if err != nil || string(data) != want {
			t.Fatalf("folder overwritten or merged: %s %s %v", name, data, err)
		}
	}
}

func TestImportDuplicateContentCreatesIndependentBooks(t *testing.T) {
	inbox, library := t.TempDir(), t.TempDir()
	first := filepath.Join(inbox, "first.cbz")
	testCBZ(t, first, map[string]string{"1.jpg": "one"})
	data, err := os.ReadFile(first)
	if err != nil {
		t.Fatal(err)
	}
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) > 0 {
		t.Fatal(problems)
	}
	second := filepath.Join(inbox, "renamed.cbz")
	if err := os.WriteFile(second, data, 0644); err != nil {
		t.Fatal(err)
	}
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) > 0 {
		t.Fatal(problems)
	}
	if _, err := os.Stat(second); !os.IsNotExist(err) {
		t.Fatal("duplicate inbox archive retained", err)
	}
	if _, err := os.Stat(filepath.Join(library, "renamed")); err != nil {
		t.Fatal("independent output missing")
	}
	if err := os.WriteFile(filepath.Join(library, "legacy.cbz"), data, 0644); err != nil {
		t.Fatal(err)
	}
	items, err := Scan(context.Background(), "comics", library)
	if err != nil || len(items) != 3 {
		t.Fatalf("independent catalog: %+v %v", items, err)
	}
	if _, err := os.Stat(filepath.Join(library, "legacy.cbz")); err != nil {
		t.Fatal("existing library archive changed", err)
	}
}

func TestImportCBZPreservesDamagedAndCancelledSources(t *testing.T) {
	inbox, library := t.TempDir(), t.TempDir()
	archive := filepath.Join(inbox, "broken.cbz")
	if err := os.WriteFile(archive, []byte("broken zip"), 0644); err != nil {
		t.Fatal(err)
	}
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) == 0 {
		t.Fatal("broken archive accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if problems := ImportCBZ(ctx, inbox, library); len(problems) == 0 {
		t.Fatal("cancelled import accepted")
	}
	if _, err := os.Stat(archive); err != nil {
		t.Fatal("source lost", err)
	}
}

func TestImportCBZPreservesSourceWhenZIPChecksumFails(t *testing.T) {
	inbox, library := t.TempDir(), t.TempDir()
	archive := filepath.Join(inbox, "checksum.cbz")
	testCBZ(t, archive, map[string]string{"1.jpg": "checksum validation data"})
	z, err := zip.OpenReader(archive)
	if err != nil {
		t.Fatal(err)
	}
	offset, err := z.File[0].DataOffset()
	z.Close()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	data[offset] ^= 0xff
	if err := os.WriteFile(archive, data, 0644); err != nil {
		t.Fatal(err)
	}
	if problems := ImportCBZ(context.Background(), inbox, library); len(problems) == 0 {
		t.Fatal("corrupted page accepted")
	}
	if _, err := os.Stat(archive); err != nil {
		t.Fatal("source deleted after checksum failure", err)
	}
	entries, err := os.ReadDir(library)
	if err != nil || len(entries) != 0 {
		t.Fatalf("partial directory published: %v %v", entries, err)
	}
}

func TestExistingImageDirectoryIsReadableWithoutGeneratedIndex(t *testing.T) {
	root := t.TempDir()
	folder := filepath.Join(root, "Existing comic")
	if err := os.Mkdir(folder, 0755); err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]string{"10.jpg": "ten", "2.jpg": "two"} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte(value), 0644); err != nil {
			t.Fatal(err)
		}
	}
	items, err := Scan(context.Background(), "comics", root)
	if err != nil || len(items) != 1 {
		t.Fatalf("folder scan: %+v %v", items, err)
	}
	r := &Reader{}
	book, err := r.Book(root, items[0].Path, items[0].Format)
	if err != nil {
		t.Fatal(err)
	}
	data, _, err := r.Image(context.Background(), root, items[0].Path, book, 0, false)
	if err != nil || string(data) != "two" {
		t.Fatalf("page: %s %v", data, err)
	}
	if _, err := os.Stat(filepath.Join(folder, comicManifest)); !os.IsNotExist(err) {
		t.Fatal("existing folder modified")
	}
}
