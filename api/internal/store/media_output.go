package store

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"mediahub/internal/mediaoutput"
	"mediahub/internal/organize"
)

func (s *Store) outputDefaults(kind string, c mediaoutput.Config) (mediaoutput.Config, error) {
	c = c.RuntimeDefaults(kind)
	if kind == "strm" && c.SourceID == "" {
		rule, err := s.SimpleOrganizeRule()
		if err != nil && !errors.Is(err, organize.ErrNotFound) {
			return c, err
		}
		c.SourceID = rule.TargetID
	}
	return c, nil
}

func (s *Store) OutputJob(kind string) (mediaoutput.Config, mediaoutput.Status, error) {
	var c mediaoutput.Config
	status := mediaoutput.Status{State: "idle", Issues: []string{}}
	var raw, state string
	err := s.db.QueryRow(`SELECT config,status FROM media_output_jobs WHERE kind=?`, kind).Scan(&raw, &state)
	if errors.Is(err, sql.ErrNoRows) {
		c, err = s.outputDefaults(kind, c)
		return c, status, err
	}
	if err != nil {
		return c, status, err
	}
	if err = json.Unmarshal([]byte(raw), &c); err != nil {
		return c, status, err
	}
	err = json.Unmarshal([]byte(state), &status)
	if err == nil {
		c, err = s.outputDefaults(kind, c)
	}
	return c, status, err
}
func (s *Store) SaveOutputConfig(kind string, c mediaoutput.Config) error {
	var err error
	c, err = s.outputDefaults(kind, c)
	if err != nil {
		return err
	}
	if err := c.Validate(kind); err != nil {
		return err
	}
	_, status, err := s.OutputJob(kind)
	if err != nil {
		return err
	}
	if status.State == "running" || status.State == "queued" {
		return fmt.Errorf("任务正在执行，请结束后修改设置")
	}
	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}
	state, _ := json.Marshal(status)
	_, err = s.db.Exec(`INSERT INTO media_output_jobs(kind,config,status) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET config=excluded.config`, kind, string(raw), string(state))
	return err
}
func (s *Store) SaveOutputStatus(kind string, status mediaoutput.Status) error {
	raw, err := json.Marshal(status)
	if err != nil {
		return err
	}
	// Default-backed jobs can run before the user has saved any configuration.
	// Persist their status too, without replacing an existing configuration.
	_, err = s.db.Exec(`INSERT INTO media_output_jobs(kind,config,status) VALUES(?,'{}',?) ON CONFLICT(kind) DO UPDATE SET status=excluded.status`, kind, string(raw))
	return err
}
func (s *Store) Outputs(account string) ([]mediaoutput.Output, error) {
	rows, err := s.db.Query(`SELECT data FROM media_output_files WHERE account_id=?`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []mediaoutput.Output{}
	for rows.Next() {
		var raw []byte
		var o mediaoutput.Output
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &o); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
func (s *Store) SaveOutput(o mediaoutput.Output) error {
	raw, err := json.Marshal(o)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO media_output_files(account_id,file_id,root,data) VALUES(?,?,?,?) ON CONFLICT(account_id,file_id,root) DO UPDATE SET data=excluded.data`, o.AccountID, o.File.ID, o.Root, string(raw))
	if err == nil {
		s.NotifyProcessing()
	}
	return err
}
func (s *Store) OutputToken(o mediaoutput.Output) string {
	hash := hmac.New(sha256.New, s.secretKey)
	fmt.Fprintf(hash, "mediahub-strm-v1\x00%s\x00%s\x00%d\x00%s", o.AccountID, o.File.ID, o.File.Size, o.File.SHA1)
	return hex.EncodeToString(hash.Sum(nil))
}
func (s *Store) StreamOutput(account, id, token string) (mediaoutput.Output, error) {
	rows, err := s.db.Query(`SELECT data FROM media_output_files WHERE account_id=? AND file_id=?`, account, id)
	if err != nil {
		return mediaoutput.Output{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var raw []byte
		var o mediaoutput.Output
		if err = rows.Scan(&raw); err != nil {
			return o, err
		}
		if err = json.Unmarshal(raw, &o); err != nil {
			return o, err
		}
		if o.File.ID == id && o.STRMReady && hmac.Equal([]byte(token), []byte(s.OutputToken(o))) {
			return o, nil
		}
	}
	if err = rows.Err(); err != nil {
		return mediaoutput.Output{}, err
	}
	return mediaoutput.Output{}, ErrNotFound
}
