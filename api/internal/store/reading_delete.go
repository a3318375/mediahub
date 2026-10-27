package store

import (
	"context"
	"database/sql"
)

func deleteReadingTx(ctx context.Context, tx *sql.Tx, id string) error {
	for _, query := range []string{
		`DELETE FROM comic_metadata_tags WHERE item_id=?`,
		`DELETE FROM comic_metadata WHERE item_id=?`,
		`DELETE FROM reading_covers WHERE item_id=?`,
		`DELETE FROM reading_comic_duplicates WHERE alias_id=? OR canonical_id=?`,
		`DELETE FROM reading_items WHERE id=?`,
	} {
		args := []any{id}
		if query == `DELETE FROM reading_comic_duplicates WHERE alias_id=? OR canonical_id=?` {
			args = append(args, id)
		}
		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return err
		}
	}
	return nil
}

func pruneComicsTx(ctx context.Context, tx *sql.Tx, root string, items []ReadingItem) error {
	present := map[string]bool{}
	for _, item := range items {
		present[item.Path] = true
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,path FROM reading_items WHERE kind='comics' AND root=?`, root)
	if err != nil {
		return err
	}
	missing := []string{}
	for rows.Next() {
		var id, path string
		if err := rows.Scan(&id, &path); err != nil {
			rows.Close()
			return err
		}
		if !present[path] {
			missing = append(missing, id)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range missing {
		if err := deleteReadingTx(ctx, tx, id); err != nil {
			return err
		}
	}
	return nil
}

// The caller supplies a complete successful scan of the actual comics root.
func (s *Store) PruneMissingComics(ctx context.Context, root string, items []ReadingItem) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := pruneComicsTx(ctx, tx, root, items); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) DeleteReading(ctx context.Context, kind, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var found string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM reading_items WHERE kind=? AND id=?`, kind, id).Scan(&found); err != nil {
		if err == sql.ErrNoRows {
			return ErrNotFound
		}
		return err
	}
	if err := deleteReadingTx(ctx, tx, id); err != nil {
		return err
	}
	return tx.Commit()
}
