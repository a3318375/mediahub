package reading

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const comicManifest = ".mediahub-comic.json"
const folderFormat = "DIRECTORY"

type comicFile struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type comicDirectory struct {
	Version       int         `json:"version"`
	ArchiveSHA256 string      `json:"archiveSha256"`
	Files         []comicFile `json:"files"`
}

// ImportCBZ is only called by an explicit comics refresh. Existing library
// archives are left in place; only CBZ files in the download inbox are consumed.
func ImportCBZ(ctx context.Context, inbox, library string) []string {
	var problems []string
	for _, root := range []string{inbox, library} {
		info, err := os.Lstat(root)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return []string{fmt.Sprintf("导入目录不可用：%s", root)}
		}
	}
	if filepath.Clean(inbox) == filepath.Clean(library) {
		return []string{"下载目录不能与漫画书库相同"}
	}
	err := filepath.WalkDir(inbox, func(full string, d fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if walkErr != nil {
			problems = append(problems, fmt.Sprintf("无法读取下载目录：%s", full))
			return nil
		}
		if d.IsDir() || d.Type()&os.ModeSymlink != 0 || !strings.EqualFold(filepath.Ext(d.Name()), ".cbz") {
			return nil
		}
		name, err := filepath.Rel(inbox, full)
		if err == nil {
			err = importCBZ(ctx, inbox, library, name)
		}
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s：%v", name, err))
		}
		return nil
	})
	if err != nil {
		problems = append(problems, err.Error())
	}
	return problems
}

func importCBZ(ctx context.Context, inbox, library, name string) error {
	source, err := openSource(inbox, name)
	if err != nil {
		return err
	}
	defer source.Close()
	before, err := source.Stat()
	if err != nil {
		return err
	}
	digest, err := hashFile(ctx, source)
	if err != nil {
		return err
	}
	archive, err := zip.NewReader(source, before.Size())
	if err != nil {
		return fmt.Errorf("CBZ 无效，源文件已保留：%w", err)
	}
	manifest := comicDirectory{Version: 1, ArchiveSHA256: digest}
	seen := map[string]bool{}
	var total uint64
	images := 0
	for _, entry := range archive.File {
		clean := path.Clean(entry.Name)
		if strings.Contains(entry.Name, "\\") || !fs.ValidPath(clean) || clean != strings.TrimSuffix(entry.Name, "/") || strings.Contains(clean, ":") || strings.EqualFold(clean, comicManifest) || entry.Mode()&os.ModeSymlink != 0 || (!entry.FileInfo().IsDir() && !entry.Mode().IsRegular()) {
			return fmt.Errorf("压缩包包含不安全路径或特殊文件，源文件已保留")
		}
		if entry.FileInfo().IsDir() {
			continue
		}
		key := strings.ToLower(clean)
		if seen[key] {
			return fmt.Errorf("压缩包包含重复文件名，源文件已保留")
		}
		seen[key] = true
		if entry.UncompressedSize64 > 40<<20 {
			return fmt.Errorf("包内文件超过 40 MB，源文件已保留")
		}
		total += entry.UncompressedSize64
		if total > 4<<30 || len(seen) > 20000 {
			return fmt.Errorf("解压大小或文件数超过限制，源文件已保留")
		}
		if imageType(clean) != "" && !strings.HasPrefix(clean, "__MACOSX/") {
			images++
		}
	}
	if images == 0 || images > 10000 {
		return fmt.Errorf("漫画没有可读图片或页数超过限制，源文件已保留")
	}
	// Keep source subdirectories in the destination, with one folder per archive.
	relative := strings.TrimSuffix(name, filepath.Ext(name))
	base := relative
	for n := 2; ; n++ {
		_, err := os.Lstat(filepath.Join(library, relative))
		if os.IsNotExist(err) {
			break
		}
		if err != nil {
			return err
		}
		relative = fmt.Sprintf("%s (%d)", base, n)
	}
	destination := filepath.Join(library, relative)
	parent := filepath.Dir(destination)
	root, err := os.OpenRoot(library)
	if err != nil {
		return err
	}
	defer root.Close()
	if err := root.MkdirAll(filepath.Dir(relative), 0755); err != nil {
		return err
	}
	{
		stage, err := os.MkdirTemp(parent, ".mediahub-import-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(stage) // Only this operation's unpublished staging files.
		for _, entry := range archive.File {
			if entry.FileInfo().IsDir() {
				continue
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			target := filepath.Join(stage, filepath.FromSlash(entry.Name))
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			in, err := entry.Open()
			if err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
			if err != nil {
				in.Close()
				return err
			}
			h := sha256.New()
			n, copyErr := io.Copy(io.MultiWriter(out, h), io.LimitReader(&contextReader{ctx, in}, 40<<20+1))
			in.Close()
			syncErr := out.Sync()
			closeErr := out.Close()
			if copyErr != nil {
				return fmt.Errorf("解压校验失败，源文件已保留：%w", copyErr)
			}
			if n != int64(entry.UncompressedSize64) || n > 40<<20 {
				return fmt.Errorf("解压文件大小不符，源文件已保留")
			}
			if syncErr != nil {
				return syncErr
			}
			if closeErr != nil {
				return closeErr
			}
			manifest.Files = append(manifest.Files, comicFile{entry.Name, n, fmt.Sprintf("%x", h.Sum(nil))})
		}
		data, _ := json.Marshal(manifest)
		index, err := os.OpenFile(filepath.Join(stage, comicManifest), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
		if err != nil {
			return err
		}
		_, writeErr := index.Write(data)
		syncErr := index.Sync()
		closeErr := index.Close()
		if writeErr != nil {
			return writeErr
		}
		if syncErr != nil {
			return syncErr
		}
		if closeErr != nil {
			return closeErr
		}
		stored, err := readComicDirectory(parent, filepath.Base(stage))
		if err != nil {
			return err
		}
		if err := verifyComicDirectory(ctx, parent, filepath.Base(stage), stored); err != nil {
			return err
		}
		if _, err := root.Lstat(relative); !os.IsNotExist(err) {
			return fmt.Errorf("目标目录已存在，源文件已保留")
		}
		if err := os.Rename(stage, destination); err != nil {
			return err
		}
	}
	// Recheck the archive after publication, including its full content hash.
	afterDigest, err := hashFile(ctx, source)
	if err != nil || afterDigest != digest {
		return fmt.Errorf("导入期间源文件发生变化，未删除")
	}
	current, err := openSource(inbox, name)
	if err != nil {
		return err
	}
	after, err := current.Stat()
	current.Close()
	if err != nil || !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return fmt.Errorf("导入期间源文件发生变化，未删除")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	// Windows cannot remove a file while our reader is open.
	if err := source.Close(); err != nil {
		return err
	}
	inboxRoot, err := os.OpenRoot(inbox)
	if err != nil {
		return err
	}
	defer inboxRoot.Close()
	if err := inboxRoot.Remove(name); err != nil {
		return fmt.Errorf("已解压，但无法删除源 CBZ：%w", err)
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
func hashFile(ctx context.Context, file *os.File) (string, error) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	h := sha256.New()
	_, err := io.Copy(h, &contextReader{ctx, file})
	return fmt.Sprintf("%x", h.Sum(nil)), err
}
func readComicDirectory(root, name string) (*comicDirectory, error) {
	f, err := openSource(root, filepath.Join(name, comicManifest))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var manifest comicDirectory
	if err := json.NewDecoder(io.LimitReader(f, 8<<20)).Decode(&manifest); err != nil {
		return nil, err
	}
	if manifest.Version != 1 || len(manifest.ArchiveSHA256) != 64 || len(manifest.Files) == 0 || len(manifest.Files) > 20000 {
		return nil, fmt.Errorf("漫画索引无效")
	}
	seen := map[string]bool{}
	for _, entry := range manifest.Files {
		if !fs.ValidPath(entry.Name) || strings.ContainsAny(entry.Name, "\\:") || entry.Size < 0 || entry.Size > 40<<20 || len(entry.SHA256) != 64 {
			return nil, fmt.Errorf("漫画索引文件路径无效")
		}
		key := strings.ToLower(entry.Name)
		if seen[key] {
			return nil, fmt.Errorf("漫画索引包含重复文件")
		}
		seen[key] = true
	}
	return &manifest, nil
}
func verifyComicDirectory(ctx context.Context, root, name string, manifest *comicDirectory) error {
	for _, entry := range manifest.Files {
		file, err := openSource(root, filepath.Join(name, filepath.FromSlash(entry.Name)))
		if err != nil {
			return err
		}
		info, statErr := file.Stat()
		digest, hashErr := hashFile(ctx, file)
		file.Close()
		if statErr != nil || hashErr != nil || info.Size() != entry.Size || digest != entry.SHA256 {
			return fmt.Errorf("文件完整性校验失败：%s", entry.Name)
		}
	}
	return nil
}
