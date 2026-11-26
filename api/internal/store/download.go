package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"mediahub/internal/download"
	"mediahub/internal/pan115"
	"mediahub/internal/tv"
)

func scanDownload(row interface{ Scan(...any) error }) (download.Task, error) {
	var t download.Task
	var data string
	if err := row.Scan(&data, &t.Revision); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return t, download.ErrNotFound
		}
		return t, err
	}
	revision := t.Revision
	err := json.Unmarshal([]byte(data), &t)
	t.Revision = revision
	if t.Artifacts == nil {
		t.Artifacts = []pan115.File{}
	}
	t.References = []download.Reference{}
	return t, err
}
func (s *Store) CreateDownload(account, hash string, r download.Request) (download.Task, bool, error) {
	defer s.NotifyProcessing()
	tx, err := s.db.Begin()
	if err != nil {
		return download.Task{}, false, err
	}
	defer tx.Rollback()
	// Recheck inside the enqueue transaction: deletion can happen after a
	// candidate was read or its torrent was fetched.
	if r.Reference.Source == "anime_subscription" {
		var exists int
		if err = tx.QueryRow(`SELECT 1 FROM anime_subscriptions WHERE id=?`, r.Reference.SourceID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
			return download.Task{}, false, ErrNotFound
		} else if err != nil {
			return download.Task{}, false, err
		}
	}
	manualShare := r.Kind == "share_transfer" && (r.Reference.Source == "media_search" || r.Reference.Source == "manual" || r.Reference.Source == "tv_subscription")
	query := `SELECT data,revision FROM download_tasks WHERE account_id=? AND resource_id=?`
	args := []any{account, hash}
	if r.Kind == "share_transfer" {
		// Older transfers use the bare share hash. Each new manual attempt also
		// includes its task ID in the storage key, so history remains intact.
		query = `SELECT data,revision FROM download_tasks WHERE account_id=? AND (resource_id=? OR resource_id GLOB ?)`
		args = append(args, hash+"/*", r.DirectoryID)
		if manualShare {
			query += ` AND json_extract(data,'$.directoryId')=? AND state NOT IN ('completed','failed','cancelled')`
		} else {
			// Keep automatic retries attached to the original task at that destination.
			query += ` ORDER BY (json_extract(data,'$.directoryId')=?) DESC, created_at, id`
		}
		query += ` LIMIT 1`
	}
	t, err := scanDownload(tx.QueryRow(query, args...))
	created := false
	if errors.Is(err, download.ErrNotFound) {
		var count int
		if err = tx.QueryRow(`SELECT COUNT(*) FROM download_tasks WHERE state NOT IN ('completed','failed','cancelled')`).Scan(&count); err != nil {
			return t, false, err
		}
		if count >= 200 {
			return t, false, download.ErrQueueFull
		}
		id := make([]byte, 16)
		if _, err = rand.Read(id); err != nil {
			return t, false, err
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		t = download.Task{ID: hex.EncodeToString(id), AccountID: account, Kind: r.Kind, URL: r.URL, ResourceID: hash, DirectoryID: r.DirectoryID, State: "queued", CreatedAt: now, UpdatedAt: now, Revision: 1, Artifacts: []pan115.File{}}
		t.SourceDirectoryID = r.SourceDirectoryID
		t.WholeShare = r.WholeShare
		t.FileIDs = r.FileIDs
		data, e := json.Marshal(t)
		if e != nil {
			return t, false, e
		}
		storageKey := hash
		if manualShare {
			storageKey += "/" + t.ID
		}
		if _, err = tx.Exec(`INSERT INTO download_tasks(id,account_id,resource_id,state,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, t.ID, account, storageKey, t.State, string(data), now, now); err != nil {
			return t, false, err
		}
		if _, err = tx.Exec(`INSERT INTO download_events(task_id,state,error_code,occurred_at) VALUES(?,'queued','',?)`, t.ID, now); err != nil {
			return t, false, err
		}
		created = true
	} else if err != nil {
		return t, false, err
	}
	if t.DirectoryID != r.DirectoryID {
		return t, false, download.ErrConflict
	}
	if r.Kind == "share_transfer" {
		encrypted, e := s.encrypt([]byte(r.ReceiveCode))
		if e != nil {
			return t, false, e
		}
		if _, err = tx.Exec(`INSERT INTO download_task_secrets(task_id,value) VALUES(?,?) ON CONFLICT(task_id) DO UPDATE SET value=excluded.value`, t.ID, encrypted); err != nil {
			return t, false, err
		}
	}
	data, err := json.Marshal(r.Reference)
	if err != nil {
		return t, false, err
	}
	if _, err = tx.Exec(`INSERT INTO download_references(task_id,reference_key,data) VALUES(?,?,?) ON CONFLICT DO NOTHING`, t.ID, download.ReferenceKey(r.Reference), string(data)); err != nil {
		return t, false, err
	}
	if created {
		if err = logDownloadState(tx, t, r.Reference.Media.Title); err != nil {
			return t, false, err
		}
	}
	if err = tx.Commit(); err != nil {
		return t, false, err
	}
	t, err = s.GetDownload(t.ID)
	return t, created, err
}

func (s *Store) DownloadReceiveCode(id string) (string, error) {
	var encrypted sql.NullString
	err := s.db.QueryRow(`SELECT s.value FROM download_tasks t LEFT JOIN download_task_secrets s ON s.task_id=t.id WHERE t.id=?`, id).Scan(&encrypted)
	if errors.Is(err, sql.ErrNoRows) {
		return "", download.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if !encrypted.Valid {
		return "", sql.ErrNoRows
	}
	raw, err := s.decrypt(encrypted.String)
	return string(raw), err
}
func (s *Store) references(t *download.Task) error {
	rows, err := s.db.Query(`SELECT data FROM download_references WHERE task_id=? ORDER BY reference_key`, t.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		var r download.Reference
		if err = rows.Scan(&raw); err != nil {
			return err
		}
		if err = json.Unmarshal([]byte(raw), &r); err != nil {
			return err
		}
		t.References = append(t.References, r)
	}
	return rows.Err()
}
func (s *Store) GetDownload(id string) (download.Task, error) {
	t, err := scanDownload(s.db.QueryRow(`SELECT data,revision FROM download_tasks WHERE id=?`, id))
	if err == nil {
		err = s.references(&t)
	}
	return t, err
}

func (s *Store) DeleteDownload(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var task download.Task
	err = tx.QueryRowContext(ctx, `SELECT state FROM download_tasks WHERE id=?`, id).Scan(&task.State)
	if errors.Is(err, sql.ErrNoRows) {
		return download.ErrNotFound
	}
	if err != nil {
		return err
	}
	if task.Active() {
		return download.ErrTaskActive
	}
	// A replacement needs its transfer through verification and file moves.
	// Its download reference is saved before the job is attached to the subscription.
	var pending bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM download_references r JOIN tv_subscriptions s ON s.id=json_extract(r.data,'$.sourceId')
		WHERE r.task_id=? AND json_extract(r.data,'$.source')='tv_replacement'
		AND NOT EXISTS (SELECT 1 FROM json_each(s.data,'$.replacements') j
			WHERE json_extract(j.value,'$.taskId')=r.task_id AND json_extract(j.value,'$.state')='completed')
	)`, id).Scan(&pending)
	if err != nil {
		return err
	}
	if pending {
		return tv.ErrPendingReplacement
	}
	// Linked task events, references and secrets cascade. Subscription history
	// keeps its episode deduplication marker even after the task is forgotten.
	if _, err = tx.ExecContext(ctx, `DELETE FROM download_tasks WHERE id=?`, id); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	s.NotifyProcessing()
	return nil
}

func (s *Store) ListDownloads(active bool) ([]download.Task, error) {
	query := `SELECT data,revision FROM download_tasks ORDER BY created_at DESC LIMIT 200`
	if active {
		query = `SELECT data,revision FROM download_tasks WHERE state NOT IN ('completed','failed','cancelled') ORDER BY created_at LIMIT 200`
	}
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	out := []download.Task{}
	for rows.Next() {
		t, e := scanDownload(rows)
		if e != nil {
			rows.Close()
			return nil, e
		}
		out = append(out, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for i := range out {
		if err = s.references(&out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}
func (s *Store) SaveDownload(t download.Task) error {
	defer s.NotifyProcessing()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var state, code string
	if err = tx.QueryRow(`SELECT state,COALESCE(json_extract(data,'$.errorCode'),'') FROM download_tasks WHERE id=? AND revision=?`, t.ID, t.Revision).Scan(&state, &code); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return download.ErrConflict
		}
		return err
	}
	t.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	t.References = nil
	data, err := json.Marshal(t)
	if err != nil {
		return err
	}
	result, err := tx.Exec(`UPDATE download_tasks SET state=?,revision=revision+1,data=?,updated_at=? WHERE id=? AND revision=?`, t.State, string(data), t.UpdatedAt, t.ID, t.Revision)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return download.ErrConflict
	}
	if state != t.State || code != t.ErrorCode {
		if _, err = tx.Exec(`INSERT INTO download_events(task_id,state,error_code,occurred_at) VALUES(?,?,?,?)`, t.ID, t.State, t.ErrorCode, t.UpdatedAt); err != nil {
			return err
		}
		var title string
		if err = tx.QueryRow(`SELECT COALESCE(json_extract(data,'$.media.title'),'') FROM download_references WHERE task_id=? ORDER BY reference_key LIMIT 1`, t.ID).Scan(&title); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err = logDownloadState(tx, t, title); err != nil {
			return err
		}
	}
	return tx.Commit()
}
