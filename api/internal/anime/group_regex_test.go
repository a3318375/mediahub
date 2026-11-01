package anime

import "testing"

func TestSourceOptionsOnlyAcceptTheirOwnReleases(t *testing.T) {
	sources := []string{"CR", "ABEMA", "Baha", "B-Global"}
	titles := []string{}
	for _, source := range sources {
		titles = append(titles, "[组] Hanaori - 12 ("+source+" 1920x1080 AVC AAC MKV)")
	}
	g := BuildGroupRegex(titles)
	if len(g.RegexList) != len(sources) {
		t.Fatalf("sources merged: %+v", g)
	}
	for i, option := range g.RegexList {
		d := validDraft()
		for _, item := range option {
			d.Match = append(d.Match, item.Regex)
		}
		entries := []Entry{}
		for _, title := range append(append([]string{}, titles...), "Hanaori - 12 (SACRA 1920x1080 AVC AAC MKV)", "Hanaori - 12 (1920x1080 AVC AAC MKV)", "Hanaori - 12 (cr 1920x1080 AVC AAC MKV)") {
			entries = append(entries, Entry{Title: title, URL: "https://example.com/a.torrent"})
		}
		// Check each release independently; episode deduplication must not hide a bad match.
		for j, entry := range entries {
			got := Apply(d, []Entry{entry}, 0, map[float64]bool{})[0]
			want := j == i || (i == 0 && j == len(entries)-1)
			if got.Accepted != want {
				t.Fatalf("source %s, title %q: accepted=%v, want %v", sources[i], entry.Title, got.Accepted, want)
			}
		}
	}
}

func TestGroupOptionsAreDerivedAndDeduplicated(t *testing.T) {
	g := BuildGroupRegex([]string{"番剧 01 [1080p 简 HEVC]", "番剧 02 [1080p 简 HEVC]", "番剧 01 [1080p 繁 HEVC]"})
	if len(g.RegexList) != 2 {
		t.Fatalf("%+v", g)
	}
	for _, option := range g.RegexList {
		d := validDraft()
		for _, item := range option {
			d.Match = append(d.Match, item.Regex)
		}
		if e := Validate(&d); e != nil {
			t.Fatal(e)
		}
	}
	plain := BuildGroupRegex([]string{"番剧 第1集"})
	if len(plain.RegexList) != 0 || len(plain.Tags) != 0 {
		t.Fatalf("invented options: %+v", plain)
	}
}
func TestCombinedLanguageTitleStaysOneCombination(t *testing.T) {
	g := BuildGroupRegex([]string{"番剧 [1080p 简繁字幕]"})
	if len(g.RegexList) != 1 || len(g.RegexList[0]) != 3 {
		t.Fatalf("%+v", g)
	}
}
