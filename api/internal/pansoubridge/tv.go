package pansoubridge

import (
	"context"
	"fmt"
	"strings"

	"pansou/model"

	"mediahub/internal/tv"
)

func (b *Bootstrap) SearchTV(ctx context.Context, d tv.Draft) ([]tv.Candidate, error) {
	if tv.SourceOf(d) != "pansou" {
		return nil, fmt.Errorf("TG 订阅不能调用 PanSou")
	}
	selected, err := b.ReadSearchSettings()
	if err != nil {
		return nil, err
	}
	channels := selected.Channels
	plugins := selected.Plugins
	if len(d.Sources) > 0 {
		for _, entry := range d.Sources {
			if strings.HasPrefix(entry, "plugin:") {
				plugins = append(plugins, strings.TrimPrefix(entry, "plugin:"))
			}
			if strings.HasPrefix(entry, "tg:") {
				channels = append(channels, strings.TrimPrefix(entry, "tg:"))
			}
		}
	}
	if len(channels) == 0 && len(plugins) == 0 {
		return nil, fmt.Errorf("请在全局设置中启用 PanSou 搜索来源")
	}
	search, ok := b.adapter.service.(interface {
		SearchComplete(context.Context, string, []string, []string) (model.SearchResponse, error)
	})
	if !ok {
		return nil, fmt.Errorf("PanSou 不支持完整订阅搜索")
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, ErrShuttingDown
	}
	b.active.Add(1)
	b.mu.Unlock()
	defer b.active.Done()
	select {
	case b.gate <- struct{}{}:
		defer func() { <-b.gate }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	unique := func(items []string) []string {
		out := []string{}
		seen := map[string]bool{}
		for _, item := range items {
			if !seen[item] {
				seen[item] = true
				out = append(out, item)
			}
		}
		return out
	}
	result, err := search.SearchComplete(ctx, d.Title, unique(channels), unique(plugins))
	return tvCandidates(mapSearchResponse(result)), err
}

func tvCandidates(data searchData) []tv.Candidate {
	out := []tv.Candidate{}
	seen := map[string]bool{}
	for _, item := range data.Items {
		for _, link := range item.Links {
			if len(item.Links) > 1 && strings.TrimSpace(link.Title) == "" {
				continue
			}
			title := strings.TrimSpace(link.Title)
			if title == "" {
				title = item.Title
			}
			// A message can contain different shows and sizes. Do not attach the
			// full body to every link; only a single-link message is unambiguous.
			if len(item.Links) == 1 {
				title = strings.TrimSpace(title + " " + item.Description)
			}
			key := link.URL + "\n" + title + "\n" + item.Channel
			if seen[key] {
				continue
			}
			seen[key] = true
			origin := link.Source
			if origin == "" {
				origin = item.Channel
			}
			out = append(out, tv.Candidate{Source: origin, Title: title, URL: link.URL, Password: link.Password, Cloud: link.Cloud, Channel: item.Channel, Size: tv.ParseSize(title)})
		}
	}
	return out
}
