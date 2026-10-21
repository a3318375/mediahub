package mediaoutput

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

func (s *Service) generate(ctx context.Context, c Config, status *Status) error {
	cookie, err := s.Store.ReadSecret("115", "115.cookie")
	if err != nil {
		return fmt.Errorf("读取 115 凭据失败")
	}
	account, err := pan115.AccountID(cookie)
	if err != nil {
		return err
	}
	gateway, err := s.Factory(ctx, cookie)
	if err != nil {
		return pan115.SafeError(err)
	}
	if err = gateway.CheckAccount(); err != nil {
		return pan115.SafeError(err)
	}
	root, err := gateway.GetFile(c.SourceID)
	if err != nil {
		return pan115.SafeError(err)
	}
	if !root.Directory {
		return fmt.Errorf("STRM 来源必须是文件夹")
	}
	previous, err := s.Store.Outputs(account)
	if err != nil {
		return err
	}
	byPath := map[string]Output{}
	for _, o := range previous {
		if old, ok := byPath[o.Path]; !ok || o.STRMReady && !old.STRMReady {
			byPath[o.Path] = o
		}
	}
	lookup := s.Store.OrganizeLookup(account)
	visited := map[string]bool{}
	total := 0
	var walk func(string, []string, int) error
	walk = func(id string, parts []string, depth int) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if depth > 16 || visited[id] {
			return fmt.Errorf("来源目录过深或重复")
		}
		visited[id] = true
		files, e := gateway.ListFiles(id)
		if e != nil {
			return pan115.SafeError(e)
		}
		for _, file := range files {
			total++
			if total > 10000 {
				return fmt.Errorf("单次扫描超过 10000 个文件，请缩小来源目录")
			}
			if file.ParentID != id {
				return fmt.Errorf("来源文件父目录不匹配")
			}
			if file.Directory {
				if _, e = SafePath(c.OutputDir, append(parts, file.Name)...); e != nil {
					return e
				}
				if e = walk(file.ID, append(append([]string{}, parts...), file.Name), depth+1); e != nil {
					return e
				}
				continue
			}
			if !organize.IsVideo(file.Name) {
				continue
			}
			status.Scanned++
			filename := strings.TrimSuffix(file.Name, filepath.Ext(file.Name)) + ".strm"
			local, e := SafePath(c.OutputDir, append(parts, filename)...)
			if e != nil {
				s.progress("strm", status, file.Name, e, false)
				continue
			}
			m := download.MediaContext{}
			binding, lookupErr := lookup(ctx, file)
			if lookupErr != nil {
				s.progress("strm", status, file.Name, lookupErr, false)
				continue
			}
			if file.Size <= 0 || !pan115.ValidDirectory(file.ID) || file.ID == "0" {
				s.progress("strm", status, file.Name, fmt.Errorf("视频文件尚未就绪"), false)
				continue
			}
			if binding.Ready && binding.Size > 0 && (binding.Size != file.Size || binding.SHA1 != "" && !strings.EqualFold(binding.SHA1, file.SHA1)) {
				s.progress("strm", status, file.Name, fmt.Errorf("文件与下载记录不一致，请先核对来源"), false)
				continue
			}
			if lookupErr == nil {
				m = binding.Media
			}
			if m.Title == "" {
				m.Title, m.Type, m.Year = organize.Guess(file.Name, "auto")
			}
			if m.Title == "" {
				m.Title = strings.TrimSuffix(file.Name, filepath.Ext(file.Name))
			}
			if m.Type == "" {
				m.Type = "movie"
			}
			if parsed, e := organize.FileMedia(m, file.Name); e == nil {
				m = parsed
			}
			o := Output{AccountID: account, File: file, Media: m, Root: filepath.Clean(c.OutputDir), Path: local, SourceID: c.SourceID, UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
			if old, ok := byPath[local]; ok && old.File.ID == file.ID && old.File.Size == file.Size && old.File.SHA1 == file.SHA1 {
				o.Scraped = old.Scraped
				o.ScrapeAttempted = old.ScrapeAttempted
			}
			body := strings.TrimRight(c.BaseURL, "/") + "/api/stream/115/" + file.ID + "?token=" + s.Store.OutputToken(o) + "\n"
			created, e := WriteNew(local, []byte(body))
			o.STRMReady = e == nil
			if e != nil {
				o.Error = e.Error()
			}
			if saveErr := s.Store.SaveOutput(o); saveErr != nil {
				return saveErr
			}
			s.progress("strm", status, file.Name, e, created)
		}
		return nil
	}
	return walk(c.SourceID, nil, 0)
}
