package reading

import (
	"errors"
	"io/fs"
	"path/filepath"
	"testing"
	"testing/fstest"
)

type permissionGateFS struct {
	fs.FS
	denied bool
}

func (f *permissionGateFS) Open(name string) (fs.File, error) {
	if f.denied {
		return nil, fs.ErrPermission
	}
	return f.FS.Open(name)
}
func TestPermissionProbeCanRecoverWithoutRestart(t *testing.T) {
	source := &permissionGateFS{FS: fstest.MapFS{"book.cbz": {Data: []byte("untouched")}}, denied: true}
	if err := checkReadableDirectoryFS(source); !errors.Is(err, fs.ErrPermission) {
		t.Fatalf("permission failure lost: %v", err)
	}
	source.denied = false
	if err := checkReadableDirectoryFS(source); err != nil {
		t.Fatalf("repaired permissions still blocked: %v", err)
	}
}
func TestPermissionProbeEmptyAndMissingDirectories(t *testing.T) {
	directory := t.TempDir()
	if err := CheckReadableDirectory(directory); err != nil {
		t.Fatal(err)
	}
	if err := CheckReadableDirectory(filepath.Join(directory, "missing")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("missing directory error lost: %v", err)
	}
	if err := checkReadableDirectoryFS(fstest.MapFS{}); err != nil {
		t.Fatalf("empty directory must be refreshable: %v", err)
	}
}
