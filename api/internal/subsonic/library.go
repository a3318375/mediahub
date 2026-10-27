// Package subsonic implements the read-only music catalogue used by the REST API.
package subsonic

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dhowden/tag"
)

type Song struct {
	Duration    int    `json:"duration,omitempty" xml:"duration,attr,omitempty"`
	BitRate     int    `json:"bitRate,omitempty" xml:"bitRate,attr,omitempty"`
	ID          string `json:"id" xml:"id,attr"`
	Parent      string `json:"parent" xml:"parent,attr"`
	IsDir       bool   `json:"isDir" xml:"isDir,attr"`
	Title       string `json:"title" xml:"title,attr"`
	Album       string `json:"album" xml:"album,attr"`
	Artist      string `json:"artist" xml:"artist,attr"`
	AlbumID     string `json:"albumId" xml:"albumId,attr"`
	ArtistID    string `json:"artistId" xml:"artistId,attr"`
	Track       int    `json:"track,omitempty" xml:"track,attr,omitempty"`
	Disc        int    `json:"discNumber,omitempty" xml:"discNumber,attr,omitempty"`
	Year        int    `json:"year,omitempty" xml:"year,attr,omitempty"`
	Genre       string `json:"genre,omitempty" xml:"genre,attr,omitempty"`
	Size        int64  `json:"size" xml:"size,attr"`
	ContentType string `json:"contentType" xml:"contentType,attr"`
	Suffix      string `json:"suffix" xml:"suffix,attr"`
	CoverArt    string `json:"coverArt,omitempty" xml:"coverArt,attr,omitempty"`
	Type        string `json:"type" xml:"type,attr"`
	Path        string `json:"path" xml:"path,attr"`
	Created     string `json:"created" xml:"created,attr"`
	file        string
}
type Album struct {
	ID        string `json:"id" xml:"id,attr"`
	Name      string `json:"name" xml:"name,attr"`
	Artist    string `json:"artist" xml:"artist,attr"`
	ArtistID  string `json:"artistId" xml:"artistId,attr"`
	CoverArt  string `json:"coverArt,omitempty" xml:"coverArt,attr,omitempty"`
	SongCount int    `json:"songCount" xml:"songCount,attr"`
	Duration  int    `json:"duration" xml:"duration,attr"`
	Created   string `json:"created" xml:"created,attr"`
	Year      int    `json:"year,omitempty" xml:"year,attr,omitempty"`
	Songs     []Song `json:"song,omitempty" xml:"song"`
}
type Artist struct {
	ID         string  `json:"id" xml:"id,attr"`
	Name       string  `json:"name" xml:"name,attr"`
	AlbumCount int     `json:"albumCount" xml:"albumCount,attr"`
	Albums     []Album `json:"album,omitempty" xml:"album"`
}
type Catalogue struct {
	Songs   []Song
	Albums  []Album
	Artists []Artist
}
type Library struct {
	mu          sync.RWMutex
	root        string
	catalogue   Catalogue
	scanning    bool
	count       int
	lastError   string
	completedAt string
}

func NewLibrary() *Library {
	return &Library{catalogue: Catalogue{Songs: []Song{}, Albums: []Album{}, Artists: []Artist{}}}
}
func ID(kind, value string) string { return fmt.Sprintf("%s-%x", kind, sha256.Sum256([]byte(value))) }

var formats = map[string]string{"mp3": "audio/mpeg", "flac": "audio/flac", "m4a": "audio/mp4", "ogg": "audio/ogg", "opus": "audio/ogg", "wav": "audio/wav", "aac": "audio/aac"}

// Scan publishes a complete snapshot only after success. Source files are never changed.
func (l *Library) Scan(root string) error {
	return l.ScanContext(context.Background(), root)
}

func (l *Library) ScanContext(ctx context.Context, root string) error {
	l.mu.Lock()
	if l.scanning {
		l.mu.Unlock()
		return fmt.Errorf("a scan is already running")
	}
	l.scanning = true
	l.mu.Unlock()
	var scanErr error
	defer func() {
		l.mu.Lock()
		l.scanning = false
		if scanErr != nil {
			l.lastError = scanErr.Error()
		} else {
			l.lastError = ""
		}
		l.mu.Unlock()
	}()
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		scanErr = err
		return err
	}
	resolved, err = filepath.Abs(resolved)
	if err != nil {
		scanErr = err
		return err
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		scanErr = fmt.Errorf("music root is not an accessible directory")
		return scanErr
	}
	songs := []Song{}
	probe, _ := exec.LookPath("ffprobe")
	scanErr = filepath.WalkDir(resolved, func(path string, d fs.DirEntry, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			return err
		}
		if d.IsDir() || d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		suffix := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
		contentType, ok := formats[suffix]
		if !ok {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		relative, err := filepath.Rel(resolved, path)
		if err != nil {
			return err
		}
		title := strings.TrimSuffix(d.Name(), filepath.Ext(path))
		album := filepath.Base(filepath.Dir(path))
		artist := "Unknown Artist"
		albumArtist := ""
		genre := ""
		year, track, disc := 0, 0, 0
		cover := ""
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		m, tagErr := tag.ReadFrom(f)
		if tagErr == nil {
			if m.Title() != "" {
				title = m.Title()
			}
			if m.Album() != "" {
				album = m.Album()
			}
			if m.Artist() != "" {
				artist = m.Artist()
			}
			albumArtist = m.AlbumArtist()
			genre = m.Genre()
			year = m.Year()
			track, _ = m.Track()
			disc, _ = m.Disc()
			if p := m.Picture(); p != nil && len(p.Data) > 0 {
				cover = ID("song", filepath.ToSlash(relative))
			}
		}
		f.Close()
		if albumArtist == "" {
			albumArtist = artist
		}
		artistID := ID("artist", albumArtist)
		albumID := ID("album", albumArtist+"\x00"+album)
		songs = append(songs, Song{ID: ID("song", filepath.ToSlash(relative)), Parent: albumID, Title: title, Album: album, Artist: artist, AlbumID: albumID, ArtistID: artistID, Track: track, Disc: disc, Year: year, Genre: genre, Size: info.Size(), ContentType: contentType, Suffix: suffix, CoverArt: cover, Type: "music", Path: filepath.ToSlash(relative), Created: info.ModTime().UTC().Format(time.RFC3339), file: path})
		if probe != "" {
			duration, bitRate := probeAudio(ctx, probe, path)
			songs[len(songs)-1].Duration = duration
			songs[len(songs)-1].BitRate = bitRate
		}
		return nil
	})
	if scanErr != nil {
		return scanErr
	}
	sort.Slice(songs, func(i, j int) bool {
		a, b := songs[i], songs[j]
		if a.AlbumID != b.AlbumID {
			return a.AlbumID < b.AlbumID
		}
		if a.Disc != b.Disc {
			return a.Disc < b.Disc
		}
		if a.Track != b.Track {
			return a.Track < b.Track
		}
		return a.Path < b.Path
	})
	albums := map[string]*Album{}
	artists := map[string]*Artist{}
	for _, s := range songs {
		if albums[s.AlbumID] == nil {
			albums[s.AlbumID] = &Album{ID: s.AlbumID, Name: s.Album, ArtistID: s.ArtistID, Created: s.Created, Year: s.Year}
			artists[s.ArtistID] = &Artist{ID: s.ArtistID}
		}
		a := albums[s.AlbumID]
		a.SongCount++
		a.Duration += s.Duration
		if a.CoverArt == "" {
			a.CoverArt = s.CoverArt
		}
		a.Songs = append(a.Songs, s)
	}
	// Album artist is recovered from the tag rather than assuming the track artist.
	for _, a := range albums {
		f, e := os.Open(a.Songs[0].file)
		name := a.Songs[0].Artist
		if e == nil {
			if m, e := tag.ReadFrom(f); e == nil && m.AlbumArtist() != "" {
				name = m.AlbumArtist()
			}
			f.Close()
		}
		a.Artist = name
		artists[a.ArtistID].Name = name
		artists[a.ArtistID].AlbumCount++
	}
	result := Catalogue{Songs: songs, Albums: []Album{}, Artists: []Artist{}}
	for _, a := range albums {
		result.Albums = append(result.Albums, *a)
	}
	sort.Slice(result.Albums, func(i, j int) bool { return result.Albums[i].Name < result.Albums[j].Name })
	for _, a := range artists {
		result.Artists = append(result.Artists, *a)
	}
	sort.Slice(result.Artists, func(i, j int) bool { return result.Artists[i].Name < result.Artists[j].Name })
	l.mu.Lock()
	l.root = resolved
	l.catalogue = result
	l.count = len(songs)
	l.completedAt = time.Now().UTC().Format(time.RFC3339Nano)
	l.mu.Unlock()
	return nil
}
func (l *Library) Snapshot() Catalogue { l.mu.RLock(); defer l.mu.RUnlock(); return l.catalogue }
func (l *Library) Status() (bool, int, string) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.scanning, l.count, l.lastError
}

func (l *Library) CompletedAt() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.completedAt
}

// Open validates symlinks again at playback time, including replaced parent directories.
func (l *Library) Open(id string) (*os.File, Song, error) {
	l.mu.RLock()
	root := l.root
	songs := l.catalogue.Songs
	l.mu.RUnlock()
	for _, s := range songs {
		if s.ID == id {
			resolved, err := filepath.EvalSymlinks(s.file)
			if err != nil {
				return nil, Song{}, err
			}
			rel, err := filepath.Rel(root, resolved)
			if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
				return nil, Song{}, fmt.Errorf("file outside music root")
			}
			// Root.Open also protects against a parent being swapped for a symlink
			// between path validation and opening the file.
			directory, err := os.OpenRoot(root)
			if err != nil {
				return nil, Song{}, err
			}
			f, err := directory.Open(rel)
			directory.Close()
			if err != nil {
				return nil, Song{}, err
			}
			info, err := f.Stat()
			if err != nil || !info.Mode().IsRegular() {
				f.Close()
				return nil, Song{}, fmt.Errorf("not a regular file")
			}
			return f, s, nil
		}
	}
	return nil, Song{}, os.ErrNotExist
}

func probeAudio(parent context.Context, probe, path string) (int, int) {
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, probe, "-v", "error", "-show_entries", "format=duration,bit_rate", "-of", "json", path).Output()
	if err != nil {
		return 0, 0
	}
	var data struct {
		Format struct {
			Duration string `json:"duration"`
			BitRate  string `json:"bit_rate"`
		} `json:"format"`
	}
	if json.Unmarshal(out, &data) != nil {
		return 0, 0
	}
	duration, _ := strconv.ParseFloat(data.Format.Duration, 64)
	bitRate, _ := strconv.Atoi(data.Format.BitRate)
	return int(duration), bitRate / 1000
}
