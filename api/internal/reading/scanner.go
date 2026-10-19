package reading

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"mediahub/internal/store"
)

func ValidKind(kind string) bool { return kind == "comics" || kind == "novels" }
func Allowed(kind, format string) bool {
	return kind == "comics" && (format == "CBZ" || format == "CBR") || kind == "novels" && (format == "TXT" || format == "EPUB")
}

func Scan(ctx context.Context, kind, root string) ([]store.ReadingItem, error) {
	if !ValidKind(kind) {
		return nil, fmt.Errorf("书库类型无效")
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("书库目录不存在、不可读或不是普通目录，请检查目录挂载")
	}
	return scanFS(ctx, kind, root, os.DirFS(root))
}

// Walk metadata only; archive/text contents are never opened or extracted.
func scanFS(ctx context.Context, kind, root string, source fs.FS) ([]store.ReadingItem, error) {
	items := []store.ReadingItem{}
	err := fs.WalkDir(source, ".", func(name string, d fs.DirEntry, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if walkErr != nil {
			return fmt.Errorf("无法完整读取书库目录，本次刷新未入库")
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		format := strings.ToUpper(strings.TrimPrefix(path.Ext(name), "."))
		if !Allowed(kind, format) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return fmt.Errorf("无法读取文件信息，本次刷新未入库")
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		id := fmt.Sprintf("%x", sha256.Sum256([]byte(kind+"\x00"+root+"\x00"+name)))
		items = append(items, store.ReadingItem{ID: id, Kind: kind, Path: filepath.ToSlash(name), Title: strings.TrimSuffix(path.Base(name), path.Ext(name)), Format: format, Size: info.Size(), ModifiedAt: info.ModTime().UTC().Format(time.RFC3339Nano), Available: true})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return items, nil
}
