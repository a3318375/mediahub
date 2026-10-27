package reading

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
)

// CheckReadableDirectory checks the service's current access without creating
// files or caching a failed permission probe. A later retry checks again.
func CheckReadableDirectory(root string) error {
	info, err := os.Lstat(root)
	if err != nil {
		return fmt.Errorf("无法访问书库目录 %s：%w", root, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("书库路径不是普通目录：%s", root)
	}
	if err := checkReadableDirectoryFS(os.DirFS(root)); err != nil {
		return fmt.Errorf("无法读取书库目录 %s：%w", root, err)
	}
	return nil
}
func checkReadableDirectoryFS(source fs.FS) error {
	directory, err := source.Open(".")
	if err != nil {
		return err
	}
	defer directory.Close()
	reader, ok := directory.(fs.ReadDirFile)
	if !ok {
		return fmt.Errorf("路径不是可读取的目录")
	}
	_, err = reader.ReadDir(1)
	if errors.Is(err, io.EOF) {
		return nil
	}
	return err
}
