package store

import (
	"encoding/json"
	"mediahub/internal/anime"
	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/tv"
)

// Read full histories, without the display limits on task and plan endpoints.
func (s *Store) OrganizeOverview(account string) ([]organize.MediaItem, error) {
	read := func(query string, args []any, accept func([]byte) error) error {
		rows, err := s.db.Query(query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var raw []byte
			if err = rows.Scan(&raw); err != nil {
				return err
			}
			if err = accept(raw); err != nil {
				return err
			}
		}
		return rows.Err()
	}
	seeds := []organize.MediaItem{}
	err := read(`SELECT data FROM anime_subscriptions`, nil, func(raw []byte) error {
		var v anime.Subscription
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		seeds = append(seeds, organize.MediaItem{Media: download.MediaContext{Type: "anime", Title: v.Title, BangumiID: v.BangumiID, MikanID: v.MikanID, Season: v.Season}, Poster: v.Poster, CreatedAt: v.CreatedAt, Subscribed: true})
		return nil
	})
	if err != nil {
		return nil, err
	}
	err = read(`SELECT data FROM tv_subscriptions`, nil, func(raw []byte) error {
		var v tv.Subscription
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		seeds = append(seeds, organize.MediaItem{Media: download.MediaContext{Type: "tv", Title: v.Title, Provider: "tmdb", ProviderID: v.TMDBID, Season: v.Season}, Poster: v.Poster, CreatedAt: v.CreatedAt, Subscribed: true})
		return nil
	})
	if err != nil {
		return nil, err
	}
	tasks := []download.Task{}
	err = read(`SELECT data FROM download_tasks WHERE account_id=? ORDER BY created_at DESC`, []any{account}, func(raw []byte) error {
		var t download.Task
		if err := json.Unmarshal(raw, &t); err != nil {
			return err
		}
		tasks = append(tasks, t)
		return nil
	})
	if err != nil {
		return nil, err
	}
	for i := range tasks {
		tasks[i].References = []download.Reference{}
		if err = s.references(&tasks[i]); err != nil {
			return nil, err
		}
	}
	plans := []organize.Plan{}
	err = read(`SELECT data FROM organize_plans WHERE json_extract(data,'$.rule.accountId')=?`, []any{account}, func(raw []byte) error {
		var p organize.Plan
		if err := json.Unmarshal(raw, &p); err != nil {
			return err
		}
		plans = append(plans, p)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return organize.BuildOverview(seeds, tasks, plans), nil
}
