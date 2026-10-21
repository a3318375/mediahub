package tmdb

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"time"
)

type EpisodeMetadata struct {
	Name     string `json:"name"`
	Overview string `json:"overview"`
	AirDate  string `json:"air_date"`
	Season   int    `json:"season_number"`
	Episode  int    `json:"episode_number"`
}

func (c *Client) Episode(ctx context.Context, key, id string, season, episode int) (EpisodeMetadata, error) {
	var data EpisodeMetadata
	n, err := strconv.Atoi(id)
	if err != nil || n <= 0 || season < 0 || episode < 1 {
		return data, fmt.Errorf("TMDB 季集标识无效")
	}
	err = c.get(ctx, key, fmt.Sprintf("/tv/%s/season/%d/episode/%d", id, season, episode), url.Values{}, 24*time.Hour, &data, nil, func() error {
		if data.Name == "" || data.Season != season || data.Episode != episode {
			return problem(502, "TMDB 集元数据不完整")
		}
		return nil
	})
	return data, err
}
