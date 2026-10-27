package reading

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDeleteComicRejectsRootAndEscapes(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"", ".", "..", "../outside", "/absolute"} {
		if err := DeleteComic(root, name, folderFormat); err == nil {
			t.Fatalf("unsafe deletion accepted: %q", name)
		}
	}
	if _, err := os.Stat(root); err != nil {
		t.Fatal("root removed", err)
	}
}
func TestDeleteComicOnlyRemovesSelectedSource(t *testing.T) {
	root := t.TempDir()
	selected := filepath.Join(root, "selected")
	other := filepath.Join(root, "other")
	for _, folder := range []string{selected, other} {
		if err := os.Mkdir(folder, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(folder, "1.jpg"), []byte("page"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := DeleteComic(root, "selected", folderFormat); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(selected); !os.IsNotExist(err) {
		t.Fatal("selected directory retained")
	}
	if _, err := os.Stat(filepath.Join(other, "1.jpg")); err != nil {
		t.Fatal("other comic lost", err)
	}
	if err := DeleteComic(root, "selected", folderFormat); err != nil {
		t.Fatal("missing source should allow database cleanup", err)
	}
}
