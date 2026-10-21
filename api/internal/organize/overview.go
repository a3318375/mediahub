package organize

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strings"

	"mediahub/internal/download"
)

type MediaItem struct {
	ID                    string                `json:"id"`
	Media                 download.MediaContext `json:"media"`
	Poster                string                `json:"poster"`
	CreatedAt             string                `json:"createdAt"`
	Subscribed            bool                  `json:"subscribed"`
	Downloaded            int                   `json:"downloaded"`
	Organized             int                   `json:"organized"`
	Pending               int                   `json:"pending"`
	Processing            int                   `json:"processing"`
	LastActivityAt        string                `json:"lastActivityAt"`
	Active                bool                  `json:"active"`
	STRMCount             *int                  `json:"strmCount"`
	ScrapedCount          *int                  `json:"scrapedCount"`
	IncompleteScrapeCount *int                  `json:"incompleteScrapeCount"`
	FileIDs               []string              `json:"-"`
	OrganizedFileIDs      []string              `json:"-"`
}

func SameMedia(a, b download.MediaContext) bool {
	if a.Type != b.Type || a.Season != b.Season {
		return false
	}
	if a.BangumiID != "" && b.BangumiID != "" {
		return a.BangumiID == b.BangumiID
	}
	if a.MikanID != "" && b.MikanID != "" {
		return a.MikanID == b.MikanID
	}
	if a.Provider != "" && a.Provider == b.Provider && a.ProviderID != "" && b.ProviderID != "" {
		return a.ProviderID == b.ProviderID
	}
	return NormalTitle(a.Title) != "" && NormalTitle(a.Title) == NormalTitle(b.Title) && (a.Year == 0 || b.Year == 0 || a.Year == b.Year)
}

// BuildOverview counts verified video artifacts once, across the complete history.
func BuildOverview(seeds []MediaItem, tasks []download.Task, plans []Plan) []MediaItem {
	rows := []MediaItem{}
	find := func(m download.MediaContext, date string) int {
		for i := range rows {
			if SameMedia(rows[i].Media, m) {
				return i
			}
		}
		rows = append(rows, MediaItem{Media: m, CreatedAt: date})
		return len(rows) - 1
	}
	for _, seed := range seeds {
		i := find(seed.Media, seed.CreatedAt)
		if !rows[i].Subscribed || seed.CreatedAt > rows[i].CreatedAt {
			rows[i] = seed
		}
	}
	for _, t := range tasks {
		for _, ref := range t.References {
			if ref.Media.Title != "" && (ref.Media.Type == "movie" || ref.Media.Type == "tv" || ref.Media.Type == "anime") {
				find(ref.Media, t.CreatedAt)
			}
		}
	}
	done := map[string]bool{}
	active := map[string]bool{}
	for _, p := range plans {
		for _, a := range p.Actions {
			if a.State == "completed" {
				done[a.Source.ID] = true
			}
			if p.State == "running" && a.State != "completed" && a.State != "conflict" {
				active[a.Source.ID] = true
			}
		}
	}
	for i := range rows {
		row := &rows[i]
		row.LastActivityAt = row.CreatedAt
		files := map[string]bool{}
		organized := map[string]bool{}
		for _, t := range tasks {
			for _, ref := range t.References {
				if SameMedia(row.Media, ref.Media) {
					if t.UpdatedAt > row.LastActivityAt {
						row.LastActivityAt = t.UpdatedAt
					}
					if t.Active() {
						row.Active = true
					}
				}
			}
			if t.State != "completed" {
				continue
			}
			for _, f := range t.Artifacts {
				if f.Directory || !IsVideo(f.Name) {
					continue
				}
				b, err := MetadataForArtifact(t, f)
				if err == nil && SameMedia(row.Media, b.Media) {
					files[f.ID] = true
				}
			}
		}
		for _, p := range plans {
			for _, a := range p.Actions {
				if SameMedia(row.Media, a.Media) {
					if p.UpdatedAt > row.LastActivityAt {
						row.LastActivityAt = p.UpdatedAt
					}
					if p.State == "running" {
						row.Active = true
					}
				}
				if a.State == "completed" && IsVideo(a.Source.Name) && (files[a.Source.ID] || SameMedia(row.Media, a.Media)) {
					organized[a.Source.ID] = true
					files[a.Source.ID] = true
				}
			}
		}
		for id := range files {
			row.FileIDs = append(row.FileIDs, id)
			if done[id] || organized[id] {
				row.OrganizedFileIDs = append(row.OrganizedFileIDs, id)
				row.Organized++
			} else {
				row.Pending++
				if active[id] {
					row.Processing++
				}
			}
		}
		row.Downloaded = len(files)
		identity := fmt.Sprintf("%s:%s:%s:%s:%s:%d:%s", row.Media.Type, row.Media.Provider, row.Media.ProviderID, row.Media.BangumiID, row.Media.MikanID, row.Media.Season, strings.TrimSpace(row.Media.Title))
		row.ID = fmt.Sprintf("%x", sha256.Sum256([]byte(identity)))[:24]
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CreatedAt > rows[j].CreatedAt })
	return rows
}
