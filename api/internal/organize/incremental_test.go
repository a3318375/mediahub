package organize

import (
	"context"
	"fmt"
	"testing"

	"mediahub/internal/download"
	"mediahub/internal/pan115"
)

type memoryOrganize struct {
	rule    Rule
	plans   map[string]Plan
	pending []pan115.File
}

func (*memoryOrganize) ReadSecret(string, string) (string, error) {
	return "UID=123_A1; CID=fixture; SEID=fixture", nil
}
func (m *memoryOrganize) OrganizeRules() ([]Rule, error)    { return []Rule{m.rule}, nil }
func (m *memoryOrganize) OrganizeRule(string) (Rule, error) { return m.rule, nil }
func (m *memoryOrganize) OrganizePlans(active bool) ([]Plan, error) {
	out := []Plan{}
	for _, p := range m.plans {
		if !active || p.State == "running" {
			out = append(out, p)
		}
	}
	return out, nil
}
func (m *memoryOrganize) OrganizePlan(id string) (Plan, error) { return m.plans[id], nil }
func (m *memoryOrganize) CreateOrganizePlan(p Plan) (Plan, error) {
	p.ID = "plan"
	m.plans[p.ID] = p
	return p, nil
}
func (m *memoryOrganize) SaveOrganizePlan(p Plan) error          { m.plans[p.ID] = p; return nil }
func (*memoryOrganize) OrganizeRan(string, string) (bool, error) { return false, nil }
func (*memoryOrganize) OrganizeLookup(string) Lookup {
	return func(context.Context, pan115.File) (Binding, error) {
		return Binding{Ready: true, Media: download.MediaContext{Type: "anime", Title: "死神", Season: 1, Offset: -40}}, nil
	}
}
func (*memoryOrganize) OrganizeUnfinished(string) ([]download.Task, error) { return nil, nil }
func (m *memoryOrganize) OrganizePending(string) ([]pan115.File, error)    { return m.pending, nil }

type countedFiles struct {
	data                 map[string]pan115.File
	lists                map[string]int
	reads                map[string]int
	renames, moves       int
	loseRename, loseMove bool
}

func (*countedFiles) CheckAccount() error                        { return nil }
func (*countedFiles) OfflineTasks() ([]pan115.RemoteTask, error) { panic("unexpected download") }
func (*countedFiles) Submit(string, string) (string, error)      { panic("unexpected download") }
func (g *countedFiles) GetFile(id string) (pan115.File, error) {
	g.reads[id]++
	f, ok := g.data[id]
	if !ok {
		return f, fmt.Errorf("missing %s", id)
	}
	return f, nil
}
func (g *countedFiles) ListFiles(id string) ([]pan115.File, error) {
	g.lists[id]++
	out := []pan115.File{}
	for _, f := range g.data {
		if f.ParentID == id {
			out = append(out, f)
		}
	}
	return out, nil
}
func (*countedFiles) CreateDirectory(string, string) (pan115.File, error) { panic("unexpected mkdir") }
func (g *countedFiles) RenameFile(id, name string) error {
	g.renames++
	f := g.data[id]
	f.Name = name
	g.data[id] = f
	if g.loseRename {
		g.loseRename = false
		return &pan115.Error{Code: "timeout", Message: "response lost"}
	}
	return nil
}
func (g *countedFiles) MoveFile(id, parent string) error {
	g.moves++
	f := g.data[id]
	f.ParentID = parent
	g.data[id] = f
	if g.loseMove {
		g.loseMove = false
		return &pan115.Error{Code: "timeout", Message: "response lost"}
	}
	return nil
}

func incrementalFixture() (*memoryOrganize, *countedFiles, *Service) {
	m := &memoryOrganize{rule: Rule{ID: "rule", Name: "整理", AccountID: "123", SourceID: "10", AnimeTargetID: "20", DailyAt: "03:00", TypeHint: "anime", Recursive: true}, plans: map[string]Plan{}}
	g := &countedFiles{data: map[string]pan115.File{"10": {ID: "10", Directory: true, ParentID: "0"}, "20": {ID: "20", Directory: true, ParentID: "0"}, "30": {ID: "30", Directory: true, ParentID: "10"}}, lists: map[string]int{}, reads: map[string]int{}}
	s := &Service{Store: m, Factory: func(context.Context, string) (pan115.Gateway, error) { return g, nil }}
	return m, g, s
}

func TestIncrementalPreviewOnlyListsPendingParentOnce(t *testing.T) {
	m, g, s := incrementalFixture()
	for _, n := range []int{41, 49} {
		f := pan115.File{ID: fmt.Sprint(n), ParentID: "30", Name: fmt.Sprintf("[UHA-WINGS][Bleach Sennen Kessen-hen][%d][x264 1080p][CHS].mp4", n), Size: 100}
		g.data[f.ID] = f
		m.pending = append(m.pending, f)
	}
	// An unrelated complete library must never be listed.
	g.data["90"] = pan115.File{ID: "90", ParentID: "10", Directory: true, Name: "无待整理文件"}
	p, err := s.Preview(context.Background(), "rule")
	if err != nil || len(p.Actions) != 2 || len(p.Issues) != 0 {
		t.Fatalf("%+v %v", p, err)
	}
	if g.lists["30"] != 1 || g.lists["10"] != 0 || g.lists["20"] != 0 || g.lists["90"] != 0 {
		t.Fatal(g.lists)
	}
	if g.reads["41"] != 0 || g.reads["49"] != 0 {
		t.Fatal("re-read individual files despite directory snapshot", g.reads)
	}
	if g.moves != 0 || g.renames != 0 {
		t.Fatal("preview mutated files")
	}
}

func TestNoPendingFilesMakesNo115Requests(t *testing.T) {
	_, g, s := incrementalFixture()
	s.Factory = func(context.Context, string) (pan115.Gateway, error) {
		t.Fatal("contacted 115 with zero pending files")
		return nil, nil
	}
	if _, err := s.Preview(context.Background(), "rule"); err != nil {
		t.Fatal(err)
	}
	if len(g.lists) != 0 || len(g.reads) != 0 {
		t.Fatal("unexpected scan")
	}
}

func TestTickDrainsMoreThanThreeFiles(t *testing.T) {
	m, g, s := incrementalFixture()
	p := Plan{ID: "running", Rule: m.rule, State: "running"}
	for n := 1; n <= 7; n++ {
		f := pan115.File{ID: fmt.Sprint(n), ParentID: "30", Name: fmt.Sprintf("source-%d.mp4", n), Size: 100}
		g.data[f.ID] = f
		p.Actions = append(p.Actions, Action{ID: f.ID, Source: f, TargetRootID: "20", TargetParentID: "20", TargetName: fmt.Sprintf("死神 - S01E%02d.mp4", n), State: "planned"})
	}
	m.plans[p.ID] = p
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if m.plans[p.ID].State != "completed" || g.moves != 7 || g.renames != 7 {
		t.Fatalf("state=%s moves=%d renames=%d", m.plans[p.ID].State, g.moves, g.renames)
	}
	for _, a := range m.plans[p.ID].Actions {
		if a.State != "completed" {
			t.Fatal(a)
		}
	}
	// Incremental completion does not recursively scan the source for cleanup.
	if g.lists["10"] != 0 {
		t.Fatal("full source scan after completing pending files")
	}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if g.moves != 7 || g.renames != 7 {
		t.Fatal("repeated completed mutations")
	}
}

func TestIncrementalResumeChecksRemoteStateAfterLostResponse(t *testing.T) {
	m, g, s := incrementalFixture()
	f := pan115.File{ID: "1", ParentID: "30", Name: "original.mp4", Size: 100}
	g.data[f.ID] = f
	m.plans["running"] = Plan{ID: "running", Rule: m.rule, State: "running", Actions: []Action{{ID: f.ID, Source: f, TargetRootID: "20", TargetParentID: "20", TargetName: "死神 - S01E01.mp4", State: "planned"}}}
	g.loseRename = true
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if m.plans["running"].State != "paused" || g.renames != 1 {
		t.Fatal("failed rename was not paused")
	}
	if _, err := s.Start("running"); err != nil {
		t.Fatal(err)
	}
	g.loseMove = true
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if m.plans["running"].State != "paused" || g.renames != 1 || g.moves != 1 {
		t.Fatal("duplicate rename or lost move state")
	}
	if _, err := s.Start("running"); err != nil {
		t.Fatal(err)
	}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if m.plans["running"].State != "completed" || g.renames != 1 || g.moves != 1 {
		t.Fatal("resume repeated a mutation")
	}
}

func TestIncrementalPreviewRejectsFilesOutsideSource(t *testing.T) {
	m, g, s := incrementalFixture()
	f := pan115.File{ID: "41", ParentID: "20", Name: "[Bleach][41].mp4", Size: 100}
	g.data[f.ID] = f
	m.pending = []pan115.File{f}
	p, err := s.Preview(context.Background(), "rule")
	if err != nil || len(p.Actions) != 0 || len(p.Issues) != 1 || p.Issues[0].Code != "scope" {
		t.Fatalf("%+v %v", p, err)
	}
	if g.moves != 0 || g.renames != 0 {
		t.Fatal("preview mutated an organized file")
	}
}
