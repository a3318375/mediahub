package organize

import (
	"mediahub/internal/download"
	"mediahub/internal/pan115"
	"testing"
)

func TestOverviewCountsUniqueVideosAndCompleteHistory(t *testing.T) {
	media := download.MediaContext{Type: "anime", Title: "番剧", BangumiID: "1", Season: 1}
	video := pan115.File{ID: "v", Name: "show.mkv", Size: 123}
	other := pan115.File{ID: "w", Name: "next.mkv", Size: 123}
	subtitle := pan115.File{ID: "s", Name: "show.ass", Size: 10}
	task := download.Task{State: "completed", References: []download.Reference{{Media: media}}, Artifacts: []pan115.File{video, subtitle}}
	pending := download.Task{State: "completed", References: task.References, Artifacts: []pan115.File{other}}
	plans := []Plan{{Actions: []Action{{Source: video, Media: media, State: "completed"}, {Source: subtitle, Media: media, State: "completed"}}}}
	for i := 0; i < 120; i++ {
		plans = append(plans, Plan{Actions: []Action{}})
	}
	rows := BuildOverview([]MediaItem{{Media: media, Subscribed: true, CreatedAt: "2026-10-20"}}, []download.Task{task, task, pending}, plans)
	if len(rows) != 1 || rows[0].Downloaded != 2 || rows[0].Organized != 1 || rows[0].Pending != 1 {
		t.Fatalf("unexpected overview: %+v", rows)
	}
}

func TestOverviewExcludesUnfinishedAndSeparatesSeasonsAndIdentity(t *testing.T) {
	media := download.MediaContext{Type: "tv", Title: "同名作品", Provider: "tmdb", ProviderID: "1", Season: 1}
	other := media
	other.ProviderID = "2"
	season := media
	season.Season = 2
	if SameMedia(media, other) || SameMedia(media, season) {
		t.Fatal("different work or season matched")
	}
	rows := BuildOverview([]MediaItem{{Media: media}, {Media: media}}, []download.Task{{State: "downloading", References: []download.Reference{{Media: media}}, Artifacts: []pan115.File{{ID: "v", Name: "show.mkv"}}}}, nil)
	if len(rows) != 1 || rows[0].Downloaded != 0 {
		t.Fatalf("unfinished files counted: %+v", rows)
	}
}

func TestOverviewProcessingFilesRemainPending(t *testing.T) {
	media := download.MediaContext{Type: "movie", Title: "电影"}
	f := pan115.File{ID: "v", Name: "movie.mkv", Size: 10}
	rows := BuildOverview(nil, []download.Task{{State: "completed", References: []download.Reference{{Media: media}}, Artifacts: []pan115.File{f}}}, []Plan{{State: "running", Actions: []Action{{Source: f, Media: media, State: "planned"}}}})
	if len(rows) != 1 || rows[0].Pending != 1 || rows[0].Processing != 1 || !rows[0].Active {
		t.Fatalf("running file queued: %+v", rows)
	}
}
