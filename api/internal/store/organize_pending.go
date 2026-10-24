package store

import (
	"encoding/json"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
	"path"
	"strings"
)

// Select by file identity from durable history, not the retained UI counters.
// Completed files and files reserved by another running plan never reach 115.
func (s *Store) OrganizePending(account string) ([]pan115.File, error) {
	rows, err := s.db.Query(`WITH candidates AS (
		SELECT f.value AS data, json_extract(f.value,'$.id') AS id
		FROM download_tasks t, json_each(t.data,'$.artifacts') f
		WHERE t.account_id=? AND t.state='completed'
		UNION ALL
		SELECT json_object('id',b.file_id), b.file_id FROM organize_bindings b
		WHERE b.account_id=? AND json_extract(b.data,'$.ready')=1
	), excluded AS (
		SELECT DISTINCT json_extract(a.value,'$.id') AS id
		FROM organize_plans p, json_each(p.data,'$.actions') a
		WHERE json_extract(p.data,'$.rule.accountId')=?
		AND (json_extract(a.value,'$.state')='completed' OR
		(p.state='running' AND json_extract(a.value,'$.state')!='conflict'))
	)
	SELECT data FROM candidates c WHERE NOT EXISTS (SELECT 1 FROM excluded e WHERE e.id=c.id)
	GROUP BY id ORDER BY id`, account, account, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	files := []pan115.File{}
	for rows.Next() {
		var raw string
		var file pan115.File
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &file); err != nil {
			return nil, err
		}
		if file.Directory {
			continue
		}
		if file.Name != "" && !organize.IsVideo(file.Name) {
			switch strings.ToLower(path.Ext(file.Name)) {
			case ".srt", ".ass", ".ssa", ".vtt", ".sub", ".idx":
			default:
				continue
			}
		}
		files = append(files, file)
		if len(files) >= 2000 {
			break
		}
	}
	return files, rows.Err()
}
