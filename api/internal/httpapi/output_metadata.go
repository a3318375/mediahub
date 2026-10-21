package httpapi

import (
	"context"
	"fmt"
	"mediahub/internal/download"
	"mediahub/internal/mediaoutput"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
	"mediahub/internal/providers/bangumi"
)

func (a *API) outputMetadata(ctx context.Context, m download.MediaContext, file pan115.File) (mediaoutput.Metadata, error) {
	out := mediaoutput.Metadata{}
	parsed, err := organize.FileMedia(m, file.Name)
	if err != nil {
		return out, err
	}
	m = parsed
	source, id, kind := m.Provider, m.ProviderID, m.Type
	if m.BangumiID != "" {
		source, id, kind = "bangumi", m.BangumiID, "anime"
	}
	if id == "" || source == "" || source == "manual" {
		m.Provider = ""
		m.ProviderID = ""
		m, err = a.resolveOrganizeMedia(ctx, m, file)
		if err != nil {
			return out, err
		}
		source, id = m.Provider, m.ProviderID
	}
	if source == "tmdb" && kind != "movie" {
		kind = "tv"
	}
	detail, err := a.discoveryService().Detail(ctx, source, kind, id, "zh-CN")
	if err != nil {
		return out, fmt.Errorf("读取作品元数据失败，请检查来源与配置")
	}
	m.Title = detail.Title
	if detail.Year != nil {
		m.Year = *detail.Year
	}
	m.Provider = source
	m.ProviderID = id
	out.Media, out.Detail = m, detail
	if m.Type == "movie" {
		return out, nil
	}
	if len(m.Episodes) != 1 {
		return out, fmt.Errorf("请先明确文件对应的季集")
	}
	if source == "tmdb" {
		key, err := a.readTMDBKey()
		if err != nil || key == "" {
			return out, fmt.Errorf("请先配置 TMDB API Key")
		}
		episode, err := a.tmdb.Episode(ctx, key, id, m.Season, m.Episodes[0])
		if err != nil {
			return out, err
		}
		out.EpisodeTitle, out.EpisodePlot, out.EpisodeDate = episode.Name, episode.Overview, episode.AirDate
	} else if source == "bangumi" {
		episodeNumber := m.Episodes[0] - m.Offset
		if len(m.OriginalEpisodes) == 1 {
			episodeNumber = m.OriginalEpisodes[0]
		}
		provider, e := a.discoveryService().Registry.Get("bangumi")
		if e != nil {
			return out, e
		}
		bgm, ok := provider.(*bangumi.Provider)
		if !ok {
			return out, fmt.Errorf("Bangumi 元数据服务不可用")
		}
		episode, err := bgm.Episode(ctx, id, episodeNumber)
		if err != nil {
			return out, err
		}
		out.EpisodeTitle, out.EpisodePlot, out.EpisodeDate = episode.Name, episode.Description, episode.AirDate
	} else {
		return out, fmt.Errorf("当前集元数据支持 TMDB 与 Bangumi")
	}
	return out, nil
}
