package store

import (
	"context"
	"database/sql"
	"time"
)

type ReadingItem struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Path       string `json:"path"`
	Title      string `json:"title"`
	Format     string `json:"format"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modifiedAt"`
	ImportedAt string `json:"importedAt"`
	Available  bool   `json:"available"`
}

type ReadingQuery struct {
	Kind, Query, Format, Sort string
	Page                      int
}
type ReadingPage struct {
	Items    []ReadingItem `json:"items"`
	Total    int           `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"pageSize"`
}
type ReadingScan struct {
	CompletedAt string `json:"completedAt"`
	Found       int    `json:"found"`
}

// Lists use SQLite exclusively, including when source volumes are offline.
func (s *Store) ListReading(ctx context.Context, q ReadingQuery) (ReadingPage, error) {
	result := ReadingPage{Items: []ReadingItem{}, Page: q.Page, PageSize: 36}
	where := `kind=? AND (?='' OR instr(lower(title),lower(?))>0 OR instr(lower(path),lower(?))>0) AND (?='' OR format=?)`
	args := []any{q.Kind, q.Query, q.Query, q.Query, q.Format, q.Format}
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM reading_items WHERE `+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	order := `title COLLATE NOCASE, id`
	if q.Sort == "recent" {
		order = `imported_at DESC, id`
	}
	if q.Sort == "modified" {
		order = `modified_at DESC, id`
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,kind,path,title,format,size,modified_at,imported_at,available FROM reading_items WHERE `+where+` ORDER BY `+order+` LIMIT ? OFFSET ?`, append(args, result.PageSize, (q.Page-1)*result.PageSize)...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item ReadingItem
		if err = rows.Scan(&item.ID, &item.Kind, &item.Path, &item.Title, &item.Format, &item.Size, &item.ModifiedAt, &item.ImportedAt, &item.Available); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (s *Store) ReadingScan(ctx context.Context, kind string) (ReadingScan, error) {
	var scan ReadingScan
	err := s.db.QueryRowContext(ctx, `SELECT completed_at,found FROM reading_scans WHERE kind=?`, kind).Scan(&scan.CompletedAt, &scan.Found)
	if err == sql.ErrNoRows {
		err = nil
	}
	return scan, err
}

// Commit only complete scans. Missing files retain their catalog records.
func (s *Store) SaveReadingScan(ctx context.Context, kind, root string, items []ReadingItem) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE reading_items SET available=0 WHERE kind=? AND root=?`, kind, root); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	stmt, err := tx.PrepareContext(ctx, `INSERT INTO reading_items(id,kind,root,path,title,format,size,modified_at,imported_at,available) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(kind,root,path) DO UPDATE SET title=excluded.title,format=excluded.format,size=excluded.size,modified_at=excluded.modified_at,available=1`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, item := range items {
		if _, err = stmt.ExecContext(ctx, item.ID, kind, root, item.Path, item.Title, item.Format, item.Size, item.ModifiedAt, now); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO reading_scans(kind,completed_at,found) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET completed_at=excluded.completed_at,found=excluded.found`, kind, now, len(items)); err != nil {
		return err
	}
	return tx.Commit()
}
