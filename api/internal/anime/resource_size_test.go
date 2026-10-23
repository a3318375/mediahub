package anime

import (
	"context"
	"testing"
)

func TestMikanGroupsResourceSize(t *testing.T) {
	s := New()
	s.Fetch = func(context.Context, string) ([]byte, error) {
		return []byte(`<div class="leftbar-item"><a class="subgroup-name" data-anchor="#group">字幕组</a></div><div id="group"><a class="mikan-rss" href="/RSS/Bangumi?bangumiId=123">RSS</a></div><table><tbody><tr><td></td><td><a href="/Home/Episode/hash">动画 01</a></td><td>416.7 MB</td><td>2026/10/21 02:24</td></tr></tbody></table>`), nil
	}
	groups, err := s.Groups(context.Background(), "123", true)
	if err != nil || len(groups) != 1 || len(groups[0].Items) != 1 {
		t.Fatalf("groups: %+v %v", groups, err)
	}
	entry := groups[0].Items[0]
	if entry.ContentLength != int64(436941619) || entry.PublishedAt != "2026/10/21 02:24" {
		t.Fatalf("entry: %+v", entry)
	}
}

func TestParseResourceSize(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want int64
	}{
		{"359.4MB", 376858214}, {"1.5 GiB", 1610612736}, {" 512 KB ", 524288}, {"unknown", 0}, {"", 0}, {"-2 MB", 0},
	} {
		if got := parseResourceSize(tc.raw); got != tc.want {
			t.Errorf("%q: got %d want %d", tc.raw, got, tc.want)
		}
	}
}
