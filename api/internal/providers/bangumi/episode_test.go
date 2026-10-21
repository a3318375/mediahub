package bangumi

import "testing"

func TestOutputEpisodeSupportsPartLocalAndAbsoluteNumbers(t *testing.T) {
	episodes := []EpisodeMetadata{{Sort: 41, Number: 1, Name: "One"}, {Sort: 48, Number: 8, Name: "Eight"}}
	for _, number := range []int{8, 48} {
		m, err := selectEpisode(episodes, number)
		if err != nil || m.Name != "Eight" {
			t.Fatalf("episode %d mapping failed: %+v %v", number, m, err)
		}
	}
	if _, err := selectEpisode(append(episodes, EpisodeMetadata{Sort: 8, Number: 2, Name: "Other"}), 8); err == nil {
		t.Fatal("ambiguous numbering was accepted")
	}
}
