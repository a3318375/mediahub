package store

import (
	"encoding/json"
	"fmt"
	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/tv"
)

func (s *Store) TVFileHistory(account string) ([]download.Task, []organize.Plan, error) {
	rows, err := s.db.Query(`SELECT data,revision FROM download_tasks WHERE account_id=? ORDER BY created_at`, account)
	if err != nil {
		return nil, nil, err
	}
	tasks := []download.Task{}
	for rows.Next() {
		t, e := scanDownload(rows)
		if e != nil {
			rows.Close()
			return nil, nil, e
		}
		tasks = append(tasks, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	for i := range tasks {
		if err = s.references(&tasks[i]); err != nil {
			return nil, nil, err
		}
	}
	rows, err = s.db.Query(`SELECT data FROM organize_plans WHERE json_extract(data,'$.rule.accountId')=? ORDER BY json_extract(data,'$.createdAt')`, account)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	plans := []organize.Plan{}
	for rows.Next() {
		var raw []byte
		var p organize.Plan
		if err = rows.Scan(&raw); err != nil {
			return nil, nil, err
		}
		if err = json.Unmarshal(raw, &p); err != nil {
			return nil, nil, err
		}
		plans = append(plans, p)
	}
	return tasks, plans, rows.Err()
}

func (s *Store) SaveTVReplacement(id string, job tv.Replacement) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var raw []byte
	if err = tx.QueryRow(`SELECT data FROM tv_subscriptions WHERE id=?`, id).Scan(&raw); err != nil {
		return err
	}
	var sub tv.Subscription
	if err = json.Unmarshal(raw, &sub); err != nil {
		return err
	}
	found := false
	for i, old := range sub.Replacements {
		if old.ID == job.ID {
			sub.Replacements[i] = job
			found = true
			break
		}
		if old.Season == job.Season && old.Episode == job.Episode && old.State != "completed" {
			return fmt.Errorf("这一集已有替换任务，请先处理现有任务")
		}
	}
	if !found {
		sub.Replacements = append(sub.Replacements, job)
	}
	raw, err = json.Marshal(sub)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(`UPDATE tv_subscriptions SET data=? WHERE id=?`, raw, id); err != nil {
		return err
	}
	return tx.Commit()
}
