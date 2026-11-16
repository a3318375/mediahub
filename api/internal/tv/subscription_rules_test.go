package tv

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestRequiredMatchAndFallback(t *testing.T) {
	d := Draft{Source: "pansou", TMDBID: "1", Title: "剧集", Season: 1, Rules: Rules{Sources: []string{"plugin:preferred"}}}
	items := []Candidate{
		{Title: "别的剧 S01E01 4K", Source: "plugin:preferred", URL: "https://115.com/s/preferred"},
		{Title: "剧集 S01E01 1080P", Source: "plugin:preferred", URL: "https://115.com/s/low"},
		{Title: "剧集 S01E01 4K", Source: "plugin:other", URL: "https://115.com/s/fallback"},
		{Title: "剧集 S01E01 4K", Source: "plugin:other", URL: "magnet:?xt=urn:btih:" + strings.Repeat("a", 40)},
	}
	if Validate(&d) == nil || len(Select(d, items)) != 0 {
		t.Fatal("empty regex accepted")
	}
	d.Match = `(?i)^(?=.*剧集)(?=.*4K).*$`
	got := Select(d, items)
	if len(got) != 1 || got[0].URL != "https://115.com/s/fallback" {
		t.Fatalf("fallback: %+v", got)
	}
	items = append(items, Candidate{Title: "剧集 S01E01 4K", Source: "plugin:preferred", URL: "https://115.com/s/preferred"})
	if got = Select(d, items); len(got) != 1 || got[0].Source != "plugin:preferred" {
		t.Fatalf("priority: %+v", got)
	}
	d.Sources = nil
	first := Select(d, items)[0].URL
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
	if Select(d, items)[0].URL != first {
		t.Fatal("ranking depends on arrival order")
	}
	d.Source = "tg"
	d.Channels = []string{"chosen"}
	if len(Select(d, items)) != 0 {
		t.Fatal("TG escaped explicit channels")
	}
}

func TestPartialSearchRetriesEvenAfterCoverage(t *testing.T) {
	r := &wholeShowRepo{sub: Subscription{ID: "show", Draft: Draft{Source: "pansou", TMDBID: "1", Title: "剧集", Season: 1, Rules: Rules{Match: "剧集"}}}}
	s := New(r)
	now := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	s.Now = func() time.Time { return now }
	s.Metadata = func(context.Context, string, int) (Metadata, error) {
		return Metadata{Episodes: []Episode{{Season: 1, Number: 1}}}, nil
	}
	calls := 0
	s.Search = func(context.Context, Draft) ([]Candidate, error) {
		calls++
		return []Candidate{{Title: "剧集 S01E01", URL: "https://115.com/s/partial"}}, errors.New("来源超时")
	}
	got, err := s.Refresh(context.Background(), "show")
	if err != nil || len(got.Resources) != 1 || got.LastError == "" || got.NextCheckAt != now.Add(time.Hour).Format(time.RFC3339) {
		t.Fatalf("partial: %+v %v", got, err)
	}
	_, _ = s.Refresh(context.Background(), "show")
	if calls != 2 {
		t.Fatal("covered episode suppressed incomplete-search retry")
	}
}
