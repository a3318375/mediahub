package tv

import (
	"context"
	"fmt"
	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
	"testing"
)

type replacementMemory struct {
	ReplacementRepository
	download.Repository
	task download.Task
	job  Replacement
}

func (r *replacementMemory) ReadSecret(string, string) (string, error) {
	return "UID=123_A1; CID=test; SEID=test", nil
}
func (r *replacementMemory) GetDownload(string) (download.Task, error)       { return r.task, nil }
func (r *replacementMemory) SaveTVReplacement(_ string, j Replacement) error { r.job = j; return nil }

type replacementDrive struct {
	pan115.Gateway
	files      map[string]pan115.File
	events     []string
	loseDelete bool
}

func (g *replacementDrive) CheckAccount() error { return nil }
func (g *replacementDrive) GetFile(id string) (pan115.File, error) {
	f, ok := g.files[id]
	if !ok {
		return f, &pan115.Error{Code: "not_found", Message: "missing"}
	}
	return f, nil
}
func (g *replacementDrive) ListFiles(id string) ([]pan115.File, error) {
	out := []pan115.File{}
	for _, f := range g.files {
		if f.ParentID == id {
			out = append(out, f)
		}
	}
	return out, nil
}
func (g *replacementDrive) CreateDirectory(string, string) (pan115.File, error) {
	return pan115.File{}, fmt.Errorf("unexpected create")
}
func (g *replacementDrive) RenameFile(string, string) error { return fmt.Errorf("unexpected rename") }
func (g *replacementDrive) MoveFile(id, parent string) error {
	f := g.files[id]
	f.ParentID = parent
	g.files[id] = f
	g.events = append(g.events, "move:"+id+":"+parent)
	return nil
}
func (g *replacementDrive) DeleteFile(id string) error {
	if g.files["new"].ParentID != "destination" {
		return fmt.Errorf("new file not in destination")
	}
	g.events = append(g.events, "delete:"+id)
	delete(g.files, id)
	if g.loseDelete {
		g.loseDelete = false
		return fmt.Errorf("lost delete acknowledgement")
	}
	return nil
}
func replacementFixture() (*ReplacementService, *replacementMemory, *replacementDrive, Subscription, Replacement) {
	old := pan115.File{ID: "old", ParentID: "destination", Name: "show.S01E01.mkv", Size: 10, SHA1: "old-hash"}
	newFile := pan115.File{ID: "new", ParentID: "temp", Name: "show.S01E01.mkv", Size: 20, SHA1: "new-hash"}
	r := &replacementMemory{task: download.Task{ID: "task", AccountID: "123", DirectoryID: "temp", State: "completed", Artifacts: []pan115.File{newFile}}}
	g := &replacementDrive{files: map[string]pan115.File{"old": old, "new": newFile}}
	d := download.New(r)
	d.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	s := &ReplacementService{Store: r, Downloads: d}
	sub := Subscription{ID: "sub", Draft: Draft{TMDBID: "1", Title: "show", Season: 1}}
	j := Replacement{ID: "job", Season: 1, Episode: 1, AccountID: "123", TaskID: "task", TempID: "temp", OldTempID: "old-temp", DestinationID: "destination", OldFiles: []EpisodeFile{{File: old, Season: 1, Episode: 1}}, State: "downloading"}
	return s, r, g, sub, j
}
func TestReplacementMovesNewBeforeDeletingOldAndResumes(t *testing.T) {
	s, r, g, sub, j := replacementFixture()
	g.loseDelete = true
	if err := s.advance(context.Background(), sub, &j); err == nil {
		t.Fatal("lost acknowledgement not reported")
	}
	if len(g.events) != 3 || g.events[0] != "move:old:old-temp" || g.events[1] != "move:new:destination" || g.events[2] != "delete:old" {
		t.Fatalf("unsafe order: %v", g.events)
	}
	j = r.job
	if err := s.advance(context.Background(), sub, &j); err != nil || j.State != "completed" {
		t.Fatalf("resume failed: %+v %v", j, err)
	}
}
func TestReplacementRejectsAmbiguousEpisodeAndChangedOld(t *testing.T) {
	for _, kind := range []string{"wrong-episode", "changed-old", "same-file"} {
		t.Run(kind, func(t *testing.T) {
			s, r, g, sub, j := replacementFixture()
			switch kind {
			case "wrong-episode":
				r.task.Artifacts[0].Name = "show.S02E01.mkv"
			case "changed-old":
				f := g.files["old"]
				f.Size++
				g.files["old"] = f
			case "same-file":
				j.NewFile = &j.OldFiles[0].File
			}
			if err := s.advance(context.Background(), sub, &j); err == nil {
				t.Fatal("unsafe replacement accepted")
			}
			if len(g.events) != 0 {
				t.Fatalf("mutated files before validation: %v", g.events)
			}
		})
	}
}
func TestEpisodeFilesUsesIdentityAndCompletedReplacement(t *testing.T) {
	_, r, _, sub, j := replacementFixture()
	m := download.MediaContext{Type: "tv", Title: "show", Provider: "tmdb", ProviderID: "1", Season: 1, Episodes: []int{1}}
	r.task.References = []download.Reference{{Media: m}}
	old := j.OldFiles[0].File
	plans := []organize.Plan{{Actions: []organize.Action{{State: "completed", Source: old, Media: m, TargetName: old.Name, TargetParentID: "organized"}}}}
	files := EpisodeFiles(sub, []download.Task{r.task}, plans)
	if len(files) != 2 || !files[1].Organized {
		t.Fatalf("missing organize association: %+v", files)
	}
	j.State = "completed"
	j.NewFile = &r.task.Artifacts[0]
	sub.Replacements = []Replacement{j}
	if files = EpisodeFiles(sub, []download.Task{r.task}, plans); len(files) != 1 || files[0].File.ID != "new" {
		t.Fatalf("old replacement still counted: %+v", files)
	}
	plans = append(plans, organize.Plan{Actions: []organize.Action{{State: "completed", Source: *j.NewFile, Media: m, TargetName: "organized.mkv", TargetParentID: "organized"}}})
	if files = EpisodeFiles(sub, []download.Task{r.task}, plans); len(files) != 1 || !files[0].Organized || files[0].File.ParentID != "organized" {
		t.Fatalf("later organize record lost: %+v", files)
	}
	sub.TMDBID = "other"
	sub.Replacements = nil
	if len(EpisodeFiles(sub, []download.Task{r.task}, plans)) != 0 {
		t.Fatal("matched another work by title")
	}
}
