package store

import "context"

// Cover versions follow the source metadata recorded by a successful scan.
func (s *Store) ReadingCover(ctx context.Context, item ReadingItem) ([]byte, string, error) {
	var data []byte
	var contentType string
	err := s.db.QueryRowContext(ctx, `SELECT image,content_type FROM reading_covers WHERE item_id=? AND size=? AND modified_at=?`, item.ID, item.Size, item.ModifiedAt).Scan(&data, &contentType)
	return data, contentType, err
}

func (s *Store) SaveReadingCover(ctx context.Context, item ReadingItem, data []byte, contentType string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO reading_covers(item_id,size,modified_at,content_type,image) VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET size=excluded.size,modified_at=excluded.modified_at,content_type=excluded.content_type,image=excluded.image`, item.ID, item.Size, item.ModifiedAt, contentType, data)
	return err
}
