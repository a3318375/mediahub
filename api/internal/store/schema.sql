PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS settings (
    section TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    value TEXT NOT NULL,
    is_secret INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(section, setting_key)
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    source TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON activity_logs(id DESC);


CREATE TABLE IF NOT EXISTS anime_subscriptions (
 id TEXT PRIMARY KEY,
 bangumi_id TEXT NOT NULL,
 season INTEGER NOT NULL,
 data TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(bangumi_id, season)
);

CREATE TABLE IF NOT EXISTS anime_schedule_runs (
 run_date TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS download_tasks (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 state TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 data TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(account_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_download_tasks_state ON download_tasks(state, created_at);
CREATE TABLE IF NOT EXISTS download_references (
 task_id TEXT NOT NULL REFERENCES download_tasks(id) ON DELETE CASCADE,
 reference_key TEXT NOT NULL,
 data TEXT NOT NULL,
 PRIMARY KEY(task_id, reference_key)
);
CREATE TABLE IF NOT EXISTS download_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_id TEXT NOT NULL REFERENCES download_tasks(id) ON DELETE CASCADE,
 state TEXT NOT NULL,
 error_code TEXT NOT NULL,
 occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_task_secrets (
 task_id TEXT PRIMARY KEY REFERENCES download_tasks(id) ON DELETE CASCADE,
 value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anime_download_rules (
 subscription_id TEXT PRIMARY KEY REFERENCES anime_subscriptions(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0,
 directory_id TEXT NOT NULL,
 from_episode INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS anime_download_candidates (
 id TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL REFERENCES anime_subscriptions(id) ON DELETE CASCADE,
 resource_id TEXT NOT NULL,
 episode INTEGER NOT NULL,
 state TEXT NOT NULL,
 task_id TEXT NOT NULL DEFAULT '',
 data TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(subscription_id,resource_id)
);
CREATE INDEX IF NOT EXISTS idx_anime_candidates_pending ON anime_download_candidates(state, subscription_id, episode);

CREATE TABLE IF NOT EXISTS anime_download_rule_accounts (
 subscription_id TEXT PRIMARY KEY REFERENCES anime_download_rules(subscription_id) ON DELETE CASCADE,
 account_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organize_rules (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS organize_plans (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, run_date TEXT, state TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, UNIQUE(rule_id,run_date));
CREATE TABLE IF NOT EXISTS organize_bindings (account_id TEXT NOT NULL, file_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(account_id,file_id));

CREATE TABLE IF NOT EXISTS tv_subscriptions (id TEXT PRIMARY KEY, data BLOB NOT NULL);

CREATE TABLE IF NOT EXISTS media_processing_records (
 account_id TEXT NOT NULL,
 media_id TEXT NOT NULL,
 media_type TEXT NOT NULL,
 title TEXT NOT NULL,
 resource_count INTEGER NOT NULL DEFAULT 0,
 organized_count INTEGER NOT NULL DEFAULT 0,
 pending_count INTEGER NOT NULL DEFAULT 0,
 strm_count INTEGER,
 scraped_count INTEGER,
 incomplete_scrape_count INTEGER,
 active INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 last_activity_at TEXT NOT NULL,
 data TEXT NOT NULL,
 PRIMARY KEY(account_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_processing_recent ON media_processing_records(account_id, last_activity_at DESC, media_id);

CREATE TABLE IF NOT EXISTS media_output_jobs (
 kind TEXT PRIMARY KEY,
 config TEXT NOT NULL,
 status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_output_files (
 account_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 root TEXT NOT NULL,
 data TEXT NOT NULL,
 PRIMARY KEY(account_id,file_id,root)
);

CREATE TABLE IF NOT EXISTS reading_items (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 root TEXT NOT NULL,
 path TEXT NOT NULL,
 title TEXT NOT NULL,
 format TEXT NOT NULL,
 size INTEGER NOT NULL,
 modified_at TEXT NOT NULL,
 imported_at TEXT NOT NULL,
 available INTEGER NOT NULL DEFAULT 1,
 UNIQUE(kind, root, path)
);
CREATE INDEX IF NOT EXISTS idx_reading_kind ON reading_items(kind, title);
CREATE TABLE IF NOT EXISTS reading_comic_duplicates (
 alias_id TEXT PRIMARY KEY,
 canonical_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_covers (
 item_id TEXT PRIMARY KEY REFERENCES reading_items(id),
 size INTEGER NOT NULL,
 modified_at TEXT NOT NULL,
 content_type TEXT NOT NULL,
 image BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_scans (
 kind TEXT PRIMARY KEY,
 completed_at TEXT NOT NULL,
 found INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comic_metadata (
 item_id TEXT PRIMARY KEY REFERENCES reading_items(id),
 gallery_id TEXT NOT NULL, token TEXT NOT NULL, site TEXT NOT NULL,
 title TEXT NOT NULL, japanese_title TEXT NOT NULL, cover TEXT NOT NULL,
 category TEXT NOT NULL, uploader TEXT NOT NULL, posted TEXT NOT NULL,
 language TEXT NOT NULL, rating TEXT NOT NULL, pages INTEGER NOT NULL,
 fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comic_gallery ON comic_metadata(site,gallery_id,token);
CREATE TABLE IF NOT EXISTS comic_metadata_tags (
 item_id TEXT NOT NULL REFERENCES comic_metadata(item_id),
 revision TEXT NOT NULL,
 namespace TEXT NOT NULL, tag TEXT NOT NULL,
 PRIMARY KEY(item_id,revision,namespace,tag)
);
