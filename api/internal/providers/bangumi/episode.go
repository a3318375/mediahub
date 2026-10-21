package bangumi

import (
	"context"
	"fmt"
	"mediahub/internal/providers/normalization"
	"net/url"
	"strconv"
)

type EpisodeMetadata struct {
	Name        string  `json:"name"`
	Chinese     string  `json:"name_cn"`
	Description string  `json:"desc"`
	AirDate     string  `json:"airdate"`
	Sort        float64 `json:"sort"`
	Number      float64 `json:"ep"`
	Type        int     `json:"type"`
}

func (p *Provider) Episode(ctx context.Context, id string, number int) (EpisodeMetadata, error) {
	if _, err := strconv.Atoi(id); err != nil || number < 1 {
		return EpisodeMetadata{}, fmt.Errorf("Bangumi 集数标识无效")
	}
	entries := []EpisodeMetadata{}
	for offset := 0; offset < 1000; offset += 100 {
		var result struct {
			Total int               `json:"total"`
			Data  []EpisodeMetadata `json:"data"`
		}
		err := p.request(ctx, "GET", "/v0/episodes", url.Values{"subject_id": {id}, "type": {"0"}, "limit": {"100"}, "offset": {strconv.Itoa(offset)}}, nil, &result)
		if err != nil {
			return EpisodeMetadata{}, err
		}
		entries = append(entries, result.Data...)
		if offset+len(result.Data) >= result.Total || len(result.Data) == 0 {
			return selectEpisode(entries, number)
		}
	}
	return EpisodeMetadata{}, fmt.Errorf("Bangumi 集数超过单次查询上限")
}

// Some split seasons use an absolute sort (41) and a part-local ep (1).
// Accept either numbering only when it resolves to exactly one episode.
func selectEpisode(entries []EpisodeMetadata, number int) (EpisodeMetadata, error) {
	matches := []EpisodeMetadata{}
	for _, entry := range entries {
		if entry.Type == 0 && (entry.Sort == float64(number) || entry.Number == float64(number)) {
			matches = append(matches, entry)
		}
	}
	if len(matches) == 0 {
		return EpisodeMetadata{}, fmt.Errorf("Bangumi 未找到该集元数据")
	}
	if len(matches) > 1 {
		return EpisodeMetadata{}, fmt.Errorf("Bangumi 集号存在歧义，请确认分部与绝对集号")
	}
	entry := matches[0]
	if entry.Chinese != "" {
		entry.Name = entry.Chinese
	}
	if entry.Name == "" {
		return EpisodeMetadata{}, fmt.Errorf("Bangumi 集标题缺失")
	}
	entry.Description = normalization.PlainText(entry.Description)
	return entry, nil
}
