package mediaoutput

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mediahub/internal/anime"
	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

// Model persistence boundaries without submitting downloads or modifying user data.
func TestBleachOffsetFromRSSViaDownloadAndOrganizeToOutput(t *testing.T) {
	for _, original := range []int{41, 49, 50} {
		t.Run(fmt.Sprint(original), func(t *testing.T) {
			name := fmt.Sprintf("[UHA-WINGS][Bleach Sennen Kessen-hen][%d][x264 1080p][CHS].mp4", original)
			draft := anime.Draft{Title: "死神 千年血战篇-祸进谭-", Season: 1, Offset: -40, TotalEpisodes: 13}
			entries := []anime.Entry{{Title: name, URL: "https://example.org/episode.torrent"}}
			for refresh := 0; refresh < 2; refresh++ {
				entries = anime.Apply(draft, entries, draft.Offset, map[float64]bool{})
				if !entries[0].Accepted || *entries[0].Episode != float64(original-40) || *entries[0].OriginalEpisode != float64(original) {
					t.Fatalf("RSS refresh changed mapping: %+v", entries[0])
				}
			}
			m := download.MediaContext{Type: "anime", Title: draft.Title, BangumiID: "530725", Season: 1, Offset: -40, Episodes: []int{original - 40}, OriginalEpisodes: []int{original}}
			file := pan115.File{ID: "1", ParentID: "10", Name: name, Size: 100}
			for _, batch := range []bool{false, true} {
				task := download.Task{State: "completed", References: []download.Reference{{Source: "anime_subscription", Media: m}}, Artifacts: []pan115.File{file}}
				if batch {
					task.Artifacts = append(task.Artifacts, pan115.File{ID: "2", Name: "other.mp4", Size: 100})
				}
				body, _ := json.Marshal(task)
				var saved download.Task
				if err := json.Unmarshal(body, &saved); err != nil {
					t.Fatal(err)
				}
				binding, err := organize.MetadataForArtifact(saved, file)
				if err != nil {
					t.Fatal(err)
				}
				parsed, err := organize.FileMedia(binding.Media, name)
				if err != nil || len(parsed.Episodes) != 1 || parsed.Episodes[0] != original-40 || len(parsed.OriginalEpisodes) != 1 || parsed.OriginalEpisodes[0] != original {
					t.Fatalf("batch=%v: %+v %v", batch, parsed, err)
				}
				// The actual organizer creates the mapped destination name.
				g := offsetFiles{file: file}
				plan, err := organize.Preview(context.Background(), g, organize.Rule{Name: "offset", SourceID: "10", AnimeTargetID: "20", DailyAt: "03:00", TypeHint: "anime", KeepQuality: true}, func(context.Context, pan115.File) (organize.Binding, error) { return binding, nil })
				if err != nil || len(plan.Actions) != 1 {
					t.Fatalf("%+v %v", plan, err)
				}
				a := plan.Actions[0]
				want := fmt.Sprintf("%s - S01E%02d - 1080P.mp4", draft.Title, original-40)
				if a.TargetName != want {
					t.Fatal(a.TargetName, want)
				}
				// STRM uses this name; repeated parsing of persisted media is idempotent.
				for repeat := 0; repeat < 3; repeat++ {
					parsed, err = organize.FileMedia(a.Media, a.TargetName)
					if err != nil || parsed.Episodes[0] != original-40 || parsed.OriginalEpisodes[0] != original {
						t.Fatal(parsed, err)
					}
					a.Media = parsed
				}
				parsed.Provider, parsed.ProviderID = "bangumi", parsed.BangumiID
				body, err = NFO(Metadata{Media: parsed, EpisodeTitle: "分集标题"}, false)
				if err != nil {
					t.Fatal(err)
				}
				var nfo struct {
					Episode int `xml:"episode"`
				}
				if err = xml.Unmarshal(body, &nfo); err != nil || nfo.Episode != original-40 {
					t.Fatalf("%s %v", body, err)
				}
				// Run real STRM generation twice against simulated cloud metadata.
				organized := file
				organized.Name = a.TargetName
				repo := &offsetOutputStore{binding: organize.Binding{Media: parsed, Ready: true, Size: file.Size}}
				service := New(repo, func(context.Context, string) (pan115.Gateway, error) { return offsetFiles{file: organized}, nil })
				config := Config{SourceID: "10", OutputDir: t.TempDir(), BaseURL: "http://example.org"}
				for run := 0; run < 2; run++ {
					status := Status{}
					if err = service.generate(context.Background(), config, &status); err != nil || status.Failed != 0 || len(repo.outputs) != 1 {
						t.Fatalf("STRM: %+v %v", status, err)
					}
					if run == 0 && status.Completed != 1 || run == 1 && status.Skipped != 1 {
						t.Fatal(status)
					}
					o := repo.outputs[0]
					if o.Media.Episodes[0] != original-40 || o.Media.OriginalEpisodes[0] != original {
						t.Fatal(o.Media)
					}
					wantPath := filepath.Join(config.OutputDir, strings.TrimSuffix(a.TargetName, ".mp4")+".strm")
					body, err = os.ReadFile(wantPath)
					if err != nil || string(body) != "http://example.org/api/stream/115/1?token=fixture\n" {
						t.Fatalf("%s %v", body, err)
					}
				}
			}
		})
	}
}

type offsetOutputStore struct {
	binding organize.Binding
	outputs []Output
}

func (*offsetOutputStore) ReadSecret(string, string) (string, error) {
	return "UID=123_A1; CID=fixture; SEID=fixture", nil
}
func (*offsetOutputStore) OutputJob(string) (Config, Status, error) { return Config{}, Status{}, nil }
func (*offsetOutputStore) SaveOutputStatus(string, Status) error    { return nil }
func (s *offsetOutputStore) Outputs(string) ([]Output, error)       { return s.outputs, nil }
func (s *offsetOutputStore) SaveOutput(o Output) error              { s.outputs = []Output{o}; return nil }
func (*offsetOutputStore) OutputToken(Output) string                { return "fixture" }
func (s *offsetOutputStore) OrganizeLookup(string) organize.Lookup {
	return func(context.Context, pan115.File) (organize.Binding, error) { return s.binding, nil }
}
func (*offsetOutputStore) NotifyProcessing() {}

type offsetFiles struct{ file pan115.File }

func (g offsetFiles) CheckAccount() error                        { return nil }
func (g offsetFiles) OfflineTasks() ([]pan115.RemoteTask, error) { panic("unexpected download") }
func (g offsetFiles) Submit(string, string) (string, error)      { panic("unexpected download") }
func (g offsetFiles) GetFile(id string) (pan115.File, error) {
	return pan115.File{ID: id, Directory: true}, nil
}
func (g offsetFiles) ListFiles(id string) ([]pan115.File, error) {
	if id == "10" {
		return []pan115.File{g.file}, nil
	}
	return nil, nil
}
