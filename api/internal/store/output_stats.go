package store

import (
	"mediahub/internal/mediaoutput"
	"mediahub/internal/organize"
	"os"
)

func mergeOutputStats(items []organize.MediaItem, outputs []mediaoutput.Output, targetID string) []organize.MediaItem {
	for _, o := range outputs {
		if o.Media.Title == "" {
			continue
		}
		found := false
		for _, item := range items {
			if organize.SameMedia(item.Media, o.Media) {
				found = true
				break
			}
		}
		if !found {
			seed := organize.BuildOverview([]organize.MediaItem{{Media: o.Media, CreatedAt: o.UpdatedAt}}, nil, nil)
			items = append(items, seed...)
		}
	}
	for i := range items {
		item := &items[i]
		files := map[string]bool{}
		done := map[string]bool{}
		strm := map[string]bool{}
		scraped := map[string]bool{}
		for _, id := range item.FileIDs {
			files[id] = true
		}
		for _, id := range item.OrganizedFileIDs {
			done[id] = true
		}
		for _, o := range outputs {
			if !organize.SameMedia(item.Media, o.Media) {
				continue
			}
			st, err := os.Lstat(o.Path)
			if err != nil || !st.Mode().IsRegular() || st.Size() == 0 {
				continue
			}
			files[o.File.ID] = true
			if o.SourceID != "" && o.SourceID == targetID {
				done[o.File.ID] = true
			}
			if o.STRMReady {
				strm[o.File.ID] = true
			}
			if o.Scraped {
				scraped[o.File.ID] = true
			}
			if o.UpdatedAt > item.LastActivityAt {
				item.LastActivityAt = o.UpdatedAt
			}
		}
		item.Downloaded = len(files)
		item.Organized = len(done)
		item.Pending = max(0, len(files)-len(done))
		a, b, c := len(strm), len(scraped), max(0, len(files)-len(scraped))
		item.STRMCount = &a
		item.ScrapedCount = &b
		item.IncompleteScrapeCount = &c
	}
	return items
}
