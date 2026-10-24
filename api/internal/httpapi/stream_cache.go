package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/url"
	"strconv"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

type streamLinkEntry struct {
	url     string
	expires time.Time
}

// Links are credential-, file-version- and UA-specific. Never persist signed URLs.
type streamLinkCache struct {
	mu      sync.Mutex
	entries map[[32]byte]streamLinkEntry
	pending singleflight.Group
}

func (s *streamLinkCache) resolve(ctx context.Context, identity any, load func() (string, error)) (string, error) {
	raw, err := json.Marshal(identity)
	if err != nil {
		return "", err
	}
	key := sha256.Sum256(raw)
	get := func() (string, bool) {
		s.mu.Lock()
		defer s.mu.Unlock()
		e, ok := s.entries[key]
		return e.url, ok && time.Now().Before(e.expires)
	}
	if link, ok := get(); ok {
		return link, nil
	}
	result := s.pending.DoChan(string(key[:]), func() (any, error) {
		if link, ok := get(); ok {
			return link, nil
		}
		link, err := load()
		if err != nil {
			return "", err
		}
		now := time.Now()
		expires := now.Add(time.Minute)
		// 115 links can expire earlier than our conservative cache lifetime.
		if u, err := url.Parse(link); err == nil {
			if timestamp, err := strconv.ParseInt(u.Query().Get("t"), 10, 64); err == nil {
				if deadline := time.Unix(timestamp, 0).Add(-30 * time.Second); deadline.Before(expires) {
					expires = deadline
				}
			}
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.entries == nil {
			s.entries = make(map[[32]byte]streamLinkEntry)
		}
		for k, entry := range s.entries {
			if !now.Before(entry.expires) {
				delete(s.entries, k)
			}
		}
		if len(s.entries) >= 256 {
			for k := range s.entries {
				delete(s.entries, k)
				break
			}
		}
		if expires.After(now) {
			s.entries[key] = streamLinkEntry{link, expires}
		}
		return link, nil
	})
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case result := <-result:
		if result.Err != nil {
			return "", result.Err
		}
		return result.Val.(string), nil
	}
}

type streamResolveError struct {
	status  int
	message string
}

func (e *streamResolveError) Error() string { return e.message }
