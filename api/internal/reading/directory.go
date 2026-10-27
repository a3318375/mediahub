package reading

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Existing image folders need no generated files; imported folders use their manifest.
func comicDirectoryIndex(root, name string) (*comicDirectory, error) {
	m, err := readComicDirectory(root, name)
	if err == nil {
		return m, nil
	}
	r, openErr := os.OpenRoot(root)
	if openErr != nil {
		return nil, openErr
	}
	defer r.Close()
	if _, statErr := r.Stat(filepath.Join(name, comicManifest)); !os.IsNotExist(statErr) {
		return nil, err
	}
	m = &comicDirectory{Version: 1}
	err = fs.WalkDir(r.FS(), filepath.ToSlash(name), func(full string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".mediahub-import-") {
				return fs.SkipDir
			}
			return nil
		}
		if imageType(full) == "" {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		relative, err := filepath.Rel(name, filepath.FromSlash(full))
		if err != nil {
			return err
		}
		m.Files = append(m.Files, comicFile{Name: filepath.ToSlash(relative), Size: info.Size()})
		return nil
	})
	return m, err
}
