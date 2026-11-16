package tv

import (
	"mediahub/internal/download"
	"mediahub/internal/organize"
	"sort"
)

// EpisodeFiles uses recorded identities, never a title-only match across shows.
func EpisodeFiles(sub Subscription, tasks []download.Task, plans []organize.Plan) []EpisodeFile {
	byID := map[string]EpisodeFile{}
	accept := func(m download.MediaContext) bool {
		return m.Type == "tv" && m.Provider == "tmdb" && m.ProviderID == sub.TMDBID && (sub.Season == 0 || sub.Season == m.Season) && len(m.Episodes) == 1
	}
	for _, task := range tasks {
		if task.State != "completed" {
			continue
		}
		for _, f := range task.Artifacts {
			if f.Directory || !organize.IsVideo(f.Name) {
				continue
			}
			b, err := organize.MetadataForArtifact(task, f)
			if err != nil || !b.Ready {
				continue
			}
			m, err := organize.FileMedia(b.Media, f.Name)
			if err != nil || !accept(m) {
				continue
			}
			byID[f.ID] = EpisodeFile{File: f, Season: m.Season, Episode: m.Episodes[0]}
		}
	}
	for _, p := range plans {
		for _, a := range p.Actions {
			if a.State != "completed" || a.Source.Directory || !organize.IsVideo(a.Source.Name) || !accept(a.Media) {
				continue
			}
			f := a.Source
			f.ParentID = a.TargetParentID
			f.Name = a.TargetName
			byID[f.ID] = EpisodeFile{File: f, Season: a.Media.Season, Episode: a.Media.Episodes[0], Organized: true}
		}
	}
	for _, j := range sub.Replacements {
		if j.State != "completed" {
			continue
		}
		for _, old := range j.OldFiles {
			delete(byID, old.File.ID)
		}
		if j.NewFile != nil {
			// A later normal organize plan can move a previously unorganized replacement.
			if current, ok := byID[j.NewFile.ID]; !ok || !current.Organized {
				byID[j.NewFile.ID] = EpisodeFile{File: *j.NewFile, Season: j.Season, Episode: j.Episode, Organized: j.Organized}
			}
		}
	}
	out := []EpisodeFile{}
	for _, f := range byID {
		out = append(out, f)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := EpisodeKey(out[i].Season, out[i].Episode), EpisodeKey(out[j].Season, out[j].Episode)
		if a != b {
			return a < b
		}
		return out[i].File.ID < out[j].File.ID
	})
	return out
}
