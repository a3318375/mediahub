package reading

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Remove only the selected file/folder, never the library root or an escaped path.
func DeleteComic(root, name, format string) error {
	if name == "" || filepath.IsAbs(name) || !filepath.IsLocal(filepath.FromSlash(name)) {
		return fmt.Errorf("漫画路径无效")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	rootInfo, err := os.Lstat(absRoot)
	if err != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("书库目录无效，未删除")
	}
	target, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(name)))
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(absRoot, target)
	if err != nil || relative == "." || !filepath.IsLocal(relative) || strings.HasPrefix(filepath.Base(relative), ".mediahub-import-") {
		return fmt.Errorf("禁止删除书库根目录或外部路径")
	}
	directory, err := os.OpenRoot(absRoot)
	if err != nil {
		return fmt.Errorf("书库目录不可用，未删除")
	}
	defer directory.Close()
	info, err := directory.Lstat(relative)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("不允许删除符号链接漫画")
	}
	if format == folderFormat {
		if !info.IsDir() {
			return fmt.Errorf("漫画目录类型不符，未删除")
		}
		return directory.RemoveAll(relative)
	}
	if format != "CBZ" && format != "CBR" {
		return fmt.Errorf("不支持删除此格式")
	}
	if !strings.EqualFold(filepath.Ext(relative), "."+format) {
		return fmt.Errorf("漫画文件扩展名不符，未删除")
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("源文件类型无效")
	}
	return directory.Remove(relative)
}
