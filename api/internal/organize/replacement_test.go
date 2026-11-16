package organize_test

import (
	"context"
	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
	"testing"
)

type replacementRepo struct {
	organize.Repository
	rule organize.Rule
	plan organize.Plan
}

func (r *replacementRepo) ReadSecret(string, string) (string, error) {
	return "UID=123_A1; CID=test; SEID=test", nil
}
func (r *replacementRepo) OrganizeRule(string) (organize.Rule, error)         { return r.rule, nil }
func (r *replacementRepo) OrganizePlan(string) (organize.Plan, error)         { return r.plan, nil }
func (r *replacementRepo) OrganizeUnfinished(string) ([]download.Task, error) { return nil, nil }
func (r *replacementRepo) CreateOrganizePlan(p organize.Plan) (organize.Plan, error) {
	p.ID = "replacement"
	r.plan = p
	return p, nil
}
func (r *replacementRepo) SaveOrganizePlan(p organize.Plan) error { r.plan = p; return nil }

func TestReplacementReusesOrganizingAndResumes(t *testing.T) {
	r := &replacementRepo{rule: organize.Rule{ID: "rule", Name: "existing", AccountID: "123", SourceID: "10", TVTargetID: "20", DailyAt: "03:00", TypeHint: "auto", Version: 1}}
	g := &files{data: map[string]pan115.File{
		"10": {ID: "10", ParentID: "0", Directory: true}, "20": {ID: "20", ParentID: "0", Directory: true},
		"11": {ID: "11", ParentID: "10", Name: "tmp", Directory: true}, "12": {ID: "12", ParentID: "11", Name: "new", Directory: true},
		"1": {ID: "1", ParentID: "12", Name: "show.S01E01.mkv", Size: 100, SHA1: "hash"},
	}}
	s := &organize.Service{Store: r, Factory: func(context.Context, string) (pan115.Gateway, error) { return g, nil }}
	p, err := s.PreviewReplacement(context.Background(), r.rule, "12", g.data["1"], download.MediaContext{Type: "tv", Title: "Show", Provider: "tmdb", ProviderID: "1", Season: 1, Episodes: []int{1}})
	if err != nil {
		t.Fatal(err)
	}
	if p.State != "replacement" || p.Mode != "tv_replacement" || g.moves != 0 || g.renames != 0 {
		t.Fatalf("preview mutated: %+v", p)
	}
	g.loseMove = true
	if _, err = s.ExecuteReplacement(context.Background(), p.ID); err == nil {
		t.Fatal("lost move acknowledgement ignored")
	}
	p, err = s.ExecuteReplacement(context.Background(), p.ID)
	if err != nil || p.State != "completed" || g.moves != 1 || g.renames != 1 {
		t.Fatalf("resume: %+v %v moves=%d renames=%d", p, err, g.moves, g.renames)
	}
	if g.data["1"].ParentID != p.Actions[0].TargetParentID || g.data["1"].Name != p.Actions[0].TargetName {
		t.Fatal("naming or location not applied")
	}
	for _, id := range []string{"10", "11", "12", "20"} {
		if _, ok := g.data[id]; !ok {
			t.Fatalf("directory deleted: %s", id)
		}
	}
}
