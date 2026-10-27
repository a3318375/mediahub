package reading

import (
	"context"
	"fmt"
	"mediahub/internal/ehentai"
	"testing"
)

type metadataSource struct {
	calls   []string
	success string
}

func (s *metadataSource) Search(ctx context.Context, site, cookie, query, category, language, cursor string) (ehentai.Results, error) {
	key := site + "/" + language
	s.calls = append(s.calls, key)
	if key == s.success {
		return ehentai.Results{Items: []ehentai.Gallery{{ID: "42", Token: "abc", Title: query}}}, nil
	}
	return ehentai.Results{Items: []ehentai.Gallery{{ID: "7", Token: "wrong", Title: "unrelated gallery"}}}, nil
}
func (s *metadataSource) Details(ctx context.Context, site, cookie, id, token string) (ehentai.Gallery, error) {
	if id != "42" {
		return ehentai.Gallery{}, fmt.Errorf("wrong gallery")
	}
	return ehentai.Gallery{ID: id, Token: token, Site: site, Title: "Matched title", Tags: map[string][]string{"artist": {"author"}}}, nil
}
func TestComicMetadataFallbackOrderAndNoUnrelatedMatch(t *testing.T) {
	s := &metadataSource{success: "e-hentai.org/"}
	g, err := FindComicMetadata(context.Background(), s, "configured", "A specific title")
	if err != nil || g == nil || g.ID != "42" {
		t.Fatalf("match: %+v %v", g, err)
	}
	want := []string{"exhentai.org/chinese", "e-hentai.org/chinese", "exhentai.org/", "e-hentai.org/"}
	if fmt.Sprint(s.calls) != fmt.Sprint(want) {
		t.Fatalf("calls: %v", s.calls)
	}
	s = &metadataSource{}
	g, err = FindComicMetadata(context.Background(), s, "", "A specific title")
	if err != nil || g != nil || len(s.calls) != 2 {
		t.Fatalf("unrelated result accepted: %+v %v %v", g, err, s.calls)
	}
	for _, call := range s.calls {
		if call == "exhentai.org/chinese" || call == "exhentai.org/" {
			t.Fatal("ExHentai used without cookie")
		}
	}
}
func TestComicMetadataMissingPreservesExistingValues(t *testing.T) {
	old := ehentai.Gallery{ID: "1", Title: "existing", Tags: map[string][]string{"artist": {"original"}}}
	next := ehentai.Gallery{ID: "2", Title: "new", JapaneseTitle: "日本語", Pages: 20, Tags: map[string][]string{"artist": {"replacement"}, "language": {"chinese"}}}
	got := FillComicMetadata(old, next)
	if got.Title != "existing" || got.ID != "1" || got.Pages != 20 || got.JapaneseTitle != "日本語" || got.Tags["artist"][0] != "original" || got.Tags["language"][0] != "chinese" {
		t.Fatalf("wrong fill: %+v", got)
	}
}
