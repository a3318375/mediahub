package mediaoutput

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

func (s *Service) scrape(ctx context.Context, c Config, status *Status) error {
	info, err := os.Stat(c.OutputDir)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("刮削目录不存在或不可读")
	}
	if _, err = SafePath(c.OutputDir); err != nil {
		return err
	}
	account := ""
	if cookie, e := s.Store.ReadSecret("115", "115.cookie"); e == nil {
		account, _ = pan115.AccountID(cookie)
	}
	outputs, err := s.Store.Outputs(account)
	if err != nil {
		return err
	}
	byPath := map[string]Output{}
	ambiguous := map[string]bool{}
	for _, o := range outputs {
		if !o.STRMReady && !strings.HasPrefix(o.File.ID, "local-") {
			continue
		}
		key := filepath.Clean(o.Path)
		if old, ok := byPath[key]; ok && old.File.ID != o.File.ID {
			ambiguous[key] = true
		}
		byPath[key] = o
	}
	seen := 0
	return filepath.WalkDir(c.OutputDir, func(local string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if !organize.IsVideo(entry.Name()) && strings.ToLower(filepath.Ext(entry.Name())) != ".strm" {
			return nil
		}
		seen++
		if seen > 10000 {
			return fmt.Errorf("单次刮削超过 10000 个媒体文件，请缩小目录")
		}
		status.Scanned++
		if ambiguous[filepath.Clean(local)] {
			s.progress("scraping", status, entry.Name(), fmt.Errorf("本地文件存在多个来源映射，请先核对"), false)
			return nil
		}
		o, ok := byPath[filepath.Clean(local)]
		if !ok {
			sum := sha256.Sum256([]byte(filepath.Clean(local)))
			o = Output{AccountID: account, File: pan115.File{ID: fmt.Sprintf("local-%x", sum[:16]), Name: entry.Name()}, Path: local, Root: filepath.Clean(c.OutputDir)}
			o.Media.Title, o.Media.Type, o.Media.Year = organize.Guess(entry.Name(), "auto")
		}
		o.ScrapeAttempted = true
		o.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if s.Resolve == nil {
			return fmt.Errorf("元数据服务不可用")
		}
		metadata, e := s.Resolve(ctx, o.Media, o.File)
		created := false
		if e == nil {
			o.Media = metadata.Media
			created, e = writeMetadata(ctx, c.OutputDir, local, metadata)
		}
		o.Scraped = e == nil
		o.Error = ""
		if e != nil {
			o.Error = e.Error()
		}
		if err = s.Store.SaveOutput(o); err != nil {
			return err
		}
		s.progress("scraping", status, entry.Name(), e, created)
		return nil
	})
}

func writeMetadata(ctx context.Context, root, local string, m Metadata) (bool, error) {
	rel, err := filepath.Rel(root, local)
	if err != nil {
		return false, err
	}
	parts := strings.Split(rel, string(filepath.Separator))
	parts[len(parts)-1] = strings.TrimSuffix(parts[len(parts)-1], filepath.Ext(local)) + ".nfo"
	target, err := SafePath(root, parts...)
	if err != nil {
		return false, err
	}
	body, err := NFO(m, false)
	if err != nil {
		return false, err
	}
	created, err := WriteNew(target, body)
	if err != nil {
		return false, err
	}
	folder := filepath.Dir(target)
	if m.Media.Type != "movie" {
		// A Season directory uses a shared tvshow.nfo one directory above it.
		if strings.HasPrefix(strings.ToLower(filepath.Base(folder)), "season ") {
			folder = filepath.Dir(folder)
		}
		rel, e := filepath.Rel(root, folder)
		if e != nil {
			return false, e
		}
		p := []string{}
		if rel != "." {
			p = strings.Split(rel, string(filepath.Separator))
		}
		showPath, e := SafePath(root, append(p, "tvshow.nfo")...)
		if e != nil {
			return false, e
		}
		show, e := NFO(m, true)
		if e != nil {
			return false, e
		}
		if added, e := WriteNew(showPath, show); e != nil {
			return false, e
		} else {
			created = created || added
		}
	}
	// Per-title artwork for movies prevents unrelated files in a flat folder sharing images.
	prefix := ""
	if m.Media.Type == "movie" {
		prefix = strings.TrimSuffix(filepath.Base(local), filepath.Ext(local)) + "-"
	}
	images := []struct {
		name string
		url  *string
	}{{prefix + "poster.jpg", m.Detail.PosterPath}, {prefix + "fanart.jpg", m.Detail.BackdropPath}}
	for i, image := range images {
		if image.url == nil || *image.url == "" {
			if i == 0 {
				return false, fmt.Errorf("元数据缺少海报，NFO 已保存")
			}
			continue
		}
		rel, e := filepath.Rel(root, folder)
		if e != nil {
			return false, e
		}
		p := []string{}
		if rel != "." {
			p = strings.Split(rel, string(filepath.Separator))
		}
		dest, e := SafePath(root, append(p, image.name)...)
		if e != nil {
			return false, e
		}
		if st, e := os.Lstat(dest); e == nil {
			if !st.Mode().IsRegular() || st.Size() == 0 {
				return false, fmt.Errorf("已有图片无效，已保留原文件")
			}
			continue
		} else if !os.IsNotExist(e) {
			return false, e
		}
		b, e := imageBytes(ctx, *image.url)
		if e != nil {
			return false, e
		}
		if added, e := WriteNew(dest, b); e != nil {
			return false, e
		} else {
			created = created || added
		}
	}
	return created, nil
}
