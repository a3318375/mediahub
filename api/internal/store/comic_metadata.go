package store

import (
	"context"
	"database/sql"
	"mediahub/internal/ehentai"
	"time"
)

type ComicMetadata struct {
	ehentai.Gallery
	FetchedAt string `json:"fetchedAt"`
}

func (s *Store) ComicMetadata(ctx context.Context, id string) (*ComicMetadata, error) {
	m := &ComicMetadata{}
	err := s.db.QueryRowContext(ctx, `SELECT gallery_id,token,site,title,japanese_title,cover,category,uploader,posted,language,rating,pages,fetched_at FROM comic_metadata WHERE item_id=?`, id).Scan(&m.ID, &m.Token, &m.Site, &m.Title, &m.JapaneseTitle, &m.Cover, &m.Category, &m.Uploader, &m.Posted, &m.Language, &m.Rating, &m.Pages, &m.FetchedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	m.Tags = map[string][]string{}
	rows, err := s.db.QueryContext(ctx, `SELECT namespace,tag FROM comic_metadata_tags WHERE item_id=? AND revision=? ORDER BY namespace,tag`, id, m.FetchedAt)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var ns, tag string
		if err := rows.Scan(&ns, &tag); err != nil {
			return nil, err
		}
		m.Tags[ns] = append(m.Tags[ns], tag)
	}
	return m, rows.Err()
}

func (s *Store) SaveComicMetadata(ctx context.Context, id string, g ehentai.Gallery) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	revision := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = tx.ExecContext(ctx, `INSERT INTO comic_metadata(item_id,gallery_id,token,site,title,japanese_title,cover,category,uploader,posted,language,rating,pages,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET gallery_id=excluded.gallery_id,token=excluded.token,site=excluded.site,title=excluded.title,japanese_title=excluded.japanese_title,cover=excluded.cover,category=excluded.category,uploader=excluded.uploader,posted=excluded.posted,language=excluded.language,rating=excluded.rating,pages=excluded.pages,fetched_at=excluded.fetched_at`, id, g.ID, g.Token, g.Site, g.Title, g.JapaneseTitle, g.Cover, g.Category, g.Uploader, g.Posted, g.Language, g.Rating, g.Pages, revision)
	if err != nil {
		return err
	}
	// Keep historical tag revisions; only the current snapshot is displayed.
	for ns, tags := range g.Tags {
		for _, tag := range tags {
			if _, err := tx.ExecContext(ctx, `INSERT INTO comic_metadata_tags(item_id,revision,namespace,tag) VALUES(?,?,?,?) ON CONFLICT DO NOTHING`, id, revision, ns, tag); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *Store) ComicMetadataTargets(ctx context.Context, mode string) ([]ReadingItem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,path,title FROM reading_items WHERE kind='comics' AND available=1 ORDER BY title,id`)
	if err != nil {
		return nil, err
	}
	items := []ReadingItem{}
	for rows.Next() {
		var item ReadingItem
		if err := rows.Scan(&item.ID, &item.Path, &item.Title); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	result := []ReadingItem{}
	for _, item := range items {
		m, err := s.ComicMetadata(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		item.Metadata = m
		if mode == "all" || m == nil || m.Title == "" || m.JapaneseTitle == "" || m.Category == "" || m.Pages == 0 || m.Language == "" || m.Uploader == "" || m.Posted == "" || m.Rating == "" || len(m.Tags) == 0 {
			result = append(result, item)
		}
	}
	return result, nil
}
