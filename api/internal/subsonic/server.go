package subsonic

import (
	"context"
	"crypto/md5" // Required by the Subsonic wire protocol, never used for stored credentials.
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"math/rand/v2"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dhowden/tag"
	"golang.org/x/time/rate"
)

// Credentials returns the current dedicated music username/password. Empty values disable access.
type Credentials func() (string, string, error)
type attempt struct {
	limiter *rate.Limiter
	seen    time.Time
}
type Server struct {
	Library     *Library
	Credentials Credentials
	Root        func() string
	APIKeyAuth  func(string) bool
	Playlists   func(string, url.Values) (map[string]any, error)
	mu          sync.Mutex
	attempts    map[string]attempt
	scanMu      sync.Mutex
}

func NewServer(l *Library, credentials Credentials, root func() string) *Server {
	return &Server{Library: l, Credentials: credentials, Root: root, attempts: map[string]attempt{}}
}
func (s *Server) allow(ip string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for key, a := range s.attempts {
		if now.Sub(a.seen) > 10*time.Minute {
			delete(s.attempts, key)
		}
	}
	a, ok := s.attempts[ip]
	if !ok {
		if len(s.attempts) >= 4096 {
			return false
		}
		a = attempt{limiter: rate.NewLimiter(rate.Every(time.Second), 10)}
	}
	a.seen = now
	s.attempts[ip] = a
	return a.limiter.Allow()
}
func (s *Server) blocked(ip string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.attempts[ip]
	return ok && a.limiter.Tokens() < 1
}
func (s *Server) authorized(p url.Values) bool {
	if key := p.Get("apiKey"); key != "" {
		return s.APIKeyAuth != nil && s.APIKeyAuth(key)
	}
	user, password, err := s.Credentials()
	if err != nil || user == "" || password == "" {
		return false
	}
	if subtle.ConstantTimeCompare([]byte(p.Get("u")), []byte(user)) != 1 {
		return false
	}
	if p.Get("t") != "" || p.Get("s") != "" {
		token, err := hex.DecodeString(p.Get("t"))
		if err != nil || len(token) != md5.Size || p.Get("s") == "" {
			return false
		}
		hash := md5.Sum([]byte(password + p.Get("s")))
		return subtle.ConstantTimeCompare(token, hash[:]) == 1
	}
	candidate := p.Get("p")
	if strings.HasPrefix(candidate, "enc:") {
		decoded, err := hex.DecodeString(strings.TrimPrefix(candidate, "enc:"))
		if err != nil {
			return false
		}
		candidate = string(decoded)
	}
	return subtle.ConstantTimeCompare([]byte(candidate), []byte(password)) == 1
}

type object = map[string]any

func protocolError(code int, message string) object {
	return object{"error": object{"code": code, "message": message}}
}
func writeResponse(w http.ResponseWriter, p url.Values, payload object) {
	body := object{"status": "ok", "version": "1.16.1", "type": "MediaHub", "serverVersion": "0.0.6", "openSubsonic": true}
	if _, ok := payload["error"]; ok {
		body["status"] = "failed"
	}
	for k, v := range payload {
		body[k] = v
	}
	w.Header().Set("Cache-Control", "no-store")
	if p.Get("f") == "json" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(object{"subsonic-response": body})
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	// Normalise typed payload structs once, preserving scalar XML attributes and repeated elements.
	data, _ := json.Marshal(body)
	var normal object
	_ = json.Unmarshal(data, &normal)
	_, _ = io.WriteString(w, xml.Header)
	enc := xml.NewEncoder(w)
	_ = encodeNode(enc, "subsonic-response", normal, true)
	_ = enc.Flush()
}
func encodeNode(enc *xml.Encoder, name string, value any, root bool) error {
	if list, ok := value.([]any); ok {
		for _, item := range list {
			if err := encodeNode(enc, name, item, false); err != nil {
				return err
			}
		}
		return nil
	}
	start := xml.StartElement{Name: xml.Name{Local: name}}
	if root {
		start.Attr = append(start.Attr, xml.Attr{Name: xml.Name{Local: "xmlns"}, Value: "http://subsonic.org/restapi"})
	}
	fields, ok := value.(map[string]any)
	if !ok {
		return enc.EncodeElement(value, start)
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		switch v := fields[key].(type) {
		case string, bool, float64:
			start.Attr = append(start.Attr, xml.Attr{Name: xml.Name{Local: key}, Value: fmt.Sprint(v)})
		}
	}
	if err := enc.EncodeToken(start); err != nil {
		return err
	}
	for _, key := range keys {
		switch fields[key].(type) {
		case map[string]any, []any:
			if err := encodeNode(enc, key, fields[key], false); err != nil {
				return err
			}
		}
	}
	return enc.EncodeToken(start.End())
}
func number(p url.Values, key string, def, max int) (int, error) {
	if p.Get(key) == "" {
		return def, nil
	}
	n, e := strconv.Atoi(p.Get(key))
	if e != nil || n < 0 || n > max {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return n, nil
}
func page[T any](items []T, offset, count int) []T {
	if offset > len(items) {
		offset = len(items)
	}
	end := offset + count
	if end > len(items) {
		end = len(items)
	}
	return items[offset:end]
}
func (s *Server) Scan() error {
	return s.ScanContext(context.Background())
}
func (s *Server) ScanContext(ctx context.Context) error {
	if !s.scanMu.TryLock() {
		return fmt.Errorf("a scan is already running")
	}
	defer s.scanMu.Unlock()
	return s.Library.ScanContext(ctx, s.Root())
}
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := r.ParseForm(); err != nil {
		writeResponse(w, r.URL.Query(), protocolError(10, "Invalid request parameters"))
		return
	}
	p := r.Form
	fail := func(code int, message string) { writeResponse(w, p, protocolError(code, message)) }
	if p.Get("v") == "" || p.Get("c") == "" || (p.Get("u") == "" && p.Get("apiKey") == "") {
		fail(10, "Parameters u, v and c are required")
		return
	}
	var major, minor, patch int
	if _, err := fmt.Sscanf(p.Get("v"), "%d.%d.%d", &major, &minor, &patch); err != nil || major < 1 || minor < 0 || patch < 0 {
		fail(10, "Invalid protocol version")
		return
	}
	if major > 1 || minor > 16 || minor == 16 && patch > 1 {
		fail(30, "Server supports Subsonic protocol up to 1.16.1")
		return
	}
	if p.Get("f") != "" && p.Get("f") != "xml" && p.Get("f") != "json" {
		fail(0, "Supported response formats: xml, json")
		return
	}
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if s.blocked(ip) {
		fail(40, "Too many failed authentication attempts")
		return
	}
	// Charge failed logins only: successful players can load artwork and tracks concurrently.
	if !s.authorized(p) {
		if !s.allow(ip) {
			fail(40, "Too many failed authentication attempts")
			return
		}
		fail(40, "Wrong username or password")
		return
	}
	method := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/rest/"), ".view")
	if s.Playlists != nil && (method == "getPlaylists" || method == "getPlaylist" || method == "createPlaylist") {
		payload, err := s.Playlists(method, p)
		if err != nil {
			fail(70, err.Error())
			return
		}
		writeResponse(w, p, payload)
		return
	}
	switch method {
	case "getArtist", "getAlbum", "getSong", "getMusicDirectory", "stream", "download", "getCoverArt":
		if p.Get("id") == "" {
			fail(10, "id is required")
			return
		}
	}
	catalogue := s.Library.Snapshot()
	if id := p.Get("musicFolderId"); id != "" && id != "1" {
		fail(70, "Music folder not found")
		return
	}
	result := object{}
	switch method {
	case "ping":
	case "getOpenSubsonicExtensions":
		result["openSubsonicExtensions"] = []object{{"name": "apiKeyAuthentication", "versions": []int{1}}}
	case "getLicense":
		result["license"] = object{"valid": true}
	case "getMusicFolders":
		result["musicFolders"] = object{"musicFolder": []object{{"id": "1", "name": "Music"}}}
	case "getUser":
		if p.Get("username") == "" {
			fail(10, "username is required")
			return
		}
		if p.Get("username") != p.Get("u") {
			fail(50, "Access denied")
			return
		}
		result["user"] = object{"username": p.Get("u"), "email": "", "scrobblingEnabled": false, "adminRole": false, "settingsRole": false, "downloadRole": true, "uploadRole": false, "playlistRole": true, "coverArtRole": false, "commentRole": false, "podcastRole": false, "streamRole": true, "jukeboxRole": false, "shareRole": false, "videoConversionRole": false, "folder": []int{1}}
	case "getArtists", "getIndexes":
		if id := p.Get("musicFolderId"); id != "" && id != "1" {
			fail(70, "Music folder not found")
			return
		}
		name := "artists"
		if method == "getIndexes" {
			name = "indexes"
		}
		result[name] = object{"ignoredArticles": "The El La Los Las Le Les", "index": []object{{"name": "Music", "artist": catalogue.Artists}}, "lastModified": 0}
	case "getArtist":
		found := false
		for _, artist := range catalogue.Artists {
			if artist.ID == p.Get("id") {
				artist.Albums = []Album{}
				for _, album := range catalogue.Albums {
					if album.ArtistID == artist.ID {
						album.Songs = nil
						artist.Albums = append(artist.Albums, album)
					}
				}
				result["artist"] = artist
				found = true
				break
			}
		}
		if !found {
			fail(70, "Artist not found")
			return
		}
	case "getAlbum":
		found := false
		for _, album := range catalogue.Albums {
			if album.ID == p.Get("id") {
				result["album"] = album
				found = true
				break
			}
		}
		if !found {
			fail(70, "Album not found")
			return
		}
	case "getSong":
		found := false
		for _, song := range catalogue.Songs {
			if song.ID == p.Get("id") {
				result["song"] = song
				found = true
				break
			}
		}
		if !found {
			fail(70, "Song not found")
			return
		}
	case "getMusicDirectory":
		found := false
		for _, artist := range catalogue.Artists {
			if artist.ID == p.Get("id") {
				children := []object{}
				for _, album := range catalogue.Albums {
					if album.ArtistID == artist.ID {
						children = append(children, object{"id": album.ID, "parent": artist.ID, "title": album.Name, "album": album.Name, "artist": album.Artist, "isDir": true, "coverArt": album.CoverArt})
					}
				}
				result["directory"] = object{"id": artist.ID, "name": artist.Name, "child": children}
				found = true
			}
		}
		for _, album := range catalogue.Albums {
			if album.ID == p.Get("id") {
				result["directory"] = object{"id": album.ID, "parent": album.ArtistID, "name": album.Name, "child": album.Songs}
				found = true
			}
		}
		if !found {
			fail(70, "Directory not found")
			return
		}
	case "getAlbumList", "getAlbumList2":
		count, e := number(p, "size", 10, 500)
		if e != nil {
			fail(0, e.Error())
			return
		}
		offset, e := number(p, "offset", 0, 100000000)
		if e != nil {
			fail(0, e.Error())
			return
		}
		albums := append([]Album{}, catalogue.Albums...)
		switch p.Get("type") {
		case "alphabeticalByName":
		case "alphabeticalByArtist":
			sort.SliceStable(albums, func(i, j int) bool { return albums[i].Artist < albums[j].Artist })
		case "newest":
			sort.SliceStable(albums, func(i, j int) bool { return albums[i].Created > albums[j].Created })
		case "random":
			rand.Shuffle(len(albums), func(i, j int) { albums[i], albums[j] = albums[j], albums[i] })
		default:
			fail(0, "Unsupported album list type")
			return
		}
		albums = page(albums, offset, count)
		for i := range albums {
			albums[i].Songs = nil
		}
		name := "albumList2"
		if method == "getAlbumList" {
			name = "albumList"
			children := []object{}
			for _, a := range albums {
				children = append(children, object{"id": a.ID, "parent": a.ArtistID, "title": a.Name, "album": a.Name, "artist": a.Artist, "isDir": true, "coverArt": a.CoverArt, "songCount": a.SongCount})
			}
			result[name] = object{"album": children}
		} else {
			result[name] = object{"album": albums}
		}
	case "search2", "search3":
		query := strings.ToLower(strings.TrimSpace(p.Get("query")))
		songs := []Song{}
		albums := []Album{}
		artists := []Artist{}
		for _, song := range catalogue.Songs {
			if strings.Contains(strings.ToLower(song.Title+" "+song.Artist+" "+song.Album), query) {
				songs = append(songs, song)
			}
		}
		for _, album := range catalogue.Albums {
			if strings.Contains(strings.ToLower(album.Name+" "+album.Artist), query) {
				album.Songs = nil
				albums = append(albums, album)
			}
		}
		for _, artist := range catalogue.Artists {
			if strings.Contains(strings.ToLower(artist.Name), query) {
				artists = append(artists, artist)
			}
		}
		counts := map[string]int{}
		offsets := map[string]int{}
		for _, kind := range []string{"song", "album", "artist"} {
			n, e := number(p, kind+"Count", 20, 500)
			if e != nil {
				fail(0, e.Error())
				return
			}
			counts[kind] = n
			n, e = number(p, kind+"Offset", 0, 100000000)
			if e != nil {
				fail(0, e.Error())
				return
			}
			offsets[kind] = n
		}
		name := "searchResult3"
		if method == "search2" {
			name = "searchResult2"
		}
		result[name] = object{"song": page(songs, offsets["song"], counts["song"]), "album": page(albums, offsets["album"], counts["album"]), "artist": page(artists, offsets["artist"], counts["artist"])}
		if method == "search2" {
			children := []object{}
			for _, a := range page(albums, offsets["album"], counts["album"]) {
				children = append(children, object{"id": a.ID, "parent": a.ArtistID, "title": a.Name, "album": a.Name, "artist": a.Artist, "isDir": true, "coverArt": a.CoverArt})
			}
			result[name].(object)["album"] = children
		}
	case "getRandomSongs":
		count, e := number(p, "size", 10, 500)
		if e != nil {
			fail(0, e.Error())
			return
		}
		fromYear, e := number(p, "fromYear", 0, 9999)
		if e != nil {
			fail(0, e.Error())
			return
		}
		toYear, e := number(p, "toYear", 9999, 9999)
		if e != nil {
			fail(0, e.Error())
			return
		}
		songs := []Song{}
		for _, song := range catalogue.Songs {
			if (p.Get("genre") == "" || song.Genre == p.Get("genre")) && song.Year >= fromYear && song.Year <= toYear {
				songs = append(songs, song)
			}
		}
		rand.Shuffle(len(songs), func(i, j int) { songs[i], songs[j] = songs[j], songs[i] })
		result["randomSongs"] = object{"song": page(songs, 0, count)}
	case "getScanStatus":
		running, count, _ := s.Library.Status()
		result["scanStatus"] = object{"scanning": running, "count": count}
	case "startScan":
		// Synchronous completion makes scan errors observable and avoids orphaned workers.
		if err := s.ScanContext(r.Context()); err != nil {
			fail(0, "Music scan failed; check the music directory and server logs")
			return
		}
		_, count, _ := s.Library.Status()
		result["scanStatus"] = object{"scanning": false, "count": count}
	case "stream", "download", "getCoverArt":
		if p.Get("id") == "" {
			fail(10, "id is required")
			return
		}
		if method == "stream" && (p.Get("format") != "" && p.Get("format") != "raw" || p.Get("timeOffset") != "" && p.Get("timeOffset") != "0") {
			fail(0, "Transcoding and timeOffset are not supported; use original format and HTTP Range")
			return
		}
		f, song, err := s.Library.Open(p.Get("id"))
		if err != nil {
			fail(70, "Media not found")
			return
		}
		defer f.Close()
		if method == "getCoverArt" {
			m, e := tag.ReadFrom(f)
			if e != nil || m.Picture() == nil {
				fail(70, "Cover art not found")
				return
			}
			picture := m.Picture()
			w.Header().Set("Content-Type", picture.MIMEType)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			_, _ = w.Write(picture.Data)
			return
		}
		info, e := f.Stat()
		if e != nil {
			fail(70, "Media unavailable")
			return
		}
		w.Header().Set("Content-Type", song.ContentType)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeContent(w, r, info.Name(), info.ModTime(), f)
		return
	default:
		fail(0, "Unsupported Subsonic method")
		return
	}
	writeResponse(w, p, result)
}
