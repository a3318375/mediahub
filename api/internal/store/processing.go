package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"time"

	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

// A coalesced notification keeps progress writes out of the request's transaction.
func (s *Store) NotifyProcessing() {
	select {
	case s.processingDirty <- struct{}{}:
	default:
	}
}

func (s *Store) RunProcessing(ctx context.Context, report func(error)) {
	timer := time.NewTicker(time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		case <-s.processingDirty:
		}
		// Merge bursts of per-file progress into one statistics update.
		delay := time.NewTimer(250 * time.Millisecond)
		select {
		case <-ctx.Done():
			delay.Stop()
			return
		case <-delay.C:
		}
		for len(s.processingDirty) > 0 {
			<-s.processingDirty
		}
		if err := s.SyncProcessing(); err != nil && report != nil {
			report(err)
		}
	}
}

// Keep ten rows for a useful recent view, up to 100 within fourteen days.
// Active work survives retention until it finishes.
func retainedProcessing(items []organize.MediaItem, now time.Time) []organize.MediaItem {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].LastActivityAt == items[j].LastActivityAt {
			return items[i].ID < items[j].ID
		}
		return items[i].LastActivityAt > items[j].LastActivityAt
	})
	out := []organize.MediaItem{}
	cutoff := now.AddDate(0, 0, -14)
	for i, item := range items {
		at, err := time.Parse(time.RFC3339Nano, item.LastActivityAt)
		if item.Active || i < 10 || i < 100 && err == nil && !at.Before(cutoff) {
			out = append(out, item)
		}
	}
	return out
}

func (s *Store) processingAccount() (string, error) {
	cookie, err := s.ReadSecret("115", "115.cookie")
	if err != nil {
		if err == ErrNotFound {
			return "", nil
		}
		return "", err
	}
	account, _ := pan115.AccountID(cookie)
	return account, nil
}

// Scheduled workers and manual triggers publish through this single writer.
// Source records remain intact; only the recent-view table is pruned.
func (s *Store) SyncProcessing() error {
	account, err := s.processingAccount()
	if err != nil {
		return err
	}
	items, err := s.OrganizeOverview(account)
	if err != nil {
		return err
	}
	outputs, err := s.Outputs(account)
	if err != nil {
		return err
	}
	targetID := ""
	if rule, e := s.SimpleOrganizeRule(); e == nil {
		targetID = rule.TargetID
	}
	items = mergeOutputStats(items, outputs, targetID)
	items = retainedProcessing(items, time.Now())
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	keep := map[string]bool{}
	for _, item := range items {
		keep[item.ID] = true
		raw, err := json.Marshal(item)
		if err != nil {
			return err
		}
		_, err = tx.Exec(`INSERT INTO media_processing_records(account_id,media_id,media_type,title,resource_count,organized_count,pending_count,active,created_at,last_activity_at,data,strm_count,scraped_count,incomplete_scrape_count)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,media_id) DO UPDATE SET
   media_type=excluded.media_type,title=excluded.title,resource_count=excluded.resource_count,
   organized_count=excluded.organized_count,pending_count=excluded.pending_count,active=excluded.active,
   last_activity_at=excluded.last_activity_at,data=excluded.data,strm_count=excluded.strm_count,scraped_count=excluded.scraped_count,incomplete_scrape_count=excluded.incomplete_scrape_count`, account, item.ID, item.Media.Type, item.Media.Title, item.Downloaded, item.Organized, item.Pending, item.Active, item.CreatedAt, item.LastActivityAt, string(raw), item.STRMCount, item.ScrapedCount, item.IncompleteScrapeCount)
		if err != nil {
			return err
		}
	}
	rows, err := tx.Query(`SELECT media_id FROM media_processing_records WHERE account_id=?`, account)
	if err != nil {
		return err
	}
	expired := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		if !keep[id] {
			expired = append(expired, id)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range expired {
		if _, err = tx.Exec(`DELETE FROM media_processing_records WHERE account_id=? AND media_id=? AND active=0`, account, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ProcessingRecords() ([]organize.MediaItem, error) {
	account, err := s.processingAccount()
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT data,strm_count,scraped_count,incomplete_scrape_count FROM media_processing_records WHERE account_id=? ORDER BY last_activity_at DESC,media_id`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []organize.MediaItem{}
	for rows.Next() {
		var raw []byte
		var item organize.MediaItem
		var strm, scraped, incomplete sql.NullInt64
		if err = rows.Scan(&raw, &strm, &scraped, &incomplete); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		if strm.Valid {
			n := int(strm.Int64)
			item.STRMCount = &n
		}
		if scraped.Valid {
			n := int(scraped.Int64)
			item.ScrapedCount = &n
		}
		if incomplete.Valid {
			n := int(incomplete.Int64)
			item.IncompleteScrapeCount = &n
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
