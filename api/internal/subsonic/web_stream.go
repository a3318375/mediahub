package subsonic

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type streamTicket struct {
	songID, sessionHash string
	expires             time.Time
}

// WebStreams issues short-lived, song-scoped URLs for HTML audio, which cannot
// attach the application's Bearer header. Raw session tokens never enter URLs.
type WebStreams struct {
	library      *Library
	validSession func(string) bool
	mu           sync.Mutex
	tickets      map[string]streamTicket
	now          func() time.Time
}

func NewWebStreams(library *Library, validSession func(string) bool) *WebStreams {
	return &WebStreams{library: library, validSession: validSession, tickets: map[string]streamTicket{}, now: time.Now}
}
func (s *WebStreams) Issue(songID, sessionHash string) (string, error) {
	if !s.validSession(sessionHash) {
		return "", fmt.Errorf("session expired")
	}
	f, _, err := s.library.Open(songID)
	if err != nil {
		return "", err
	}
	f.Close()
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(random[:])
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for key, ticket := range s.tickets {
		if !now.Before(ticket.expires) {
			delete(s.tickets, key)
		}
	}
	if len(s.tickets) >= 1024 {
		return "", fmt.Errorf("too many active playback requests")
	}
	s.tickets[token] = streamTicket{songID: songID, sessionHash: sessionHash, expires: now.Add(time.Hour)}
	return "/api/stream/music/" + songID + "?ticket=" + token, nil
}
func (s *WebStreams) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/stream/music/")
	s.mu.Lock()
	ticket, ok := s.tickets[r.URL.Query().Get("ticket")]
	now := s.now()
	s.mu.Unlock()
	if !ok || id != ticket.songID || !now.Before(ticket.expires) || !s.validSession(ticket.sessionHash) {
		http.Error(w, "Playback authorization expired; select the song again", http.StatusUnauthorized)
		return
	}
	f, song, err := s.library.Open(id)
	if err != nil {
		http.Error(w, "Audio file unavailable", http.StatusNotFound)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		http.Error(w, "Audio file unavailable", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", song.ContentType)
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
