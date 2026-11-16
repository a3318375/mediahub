package pansoubridge

import (
	"context"
	"github.com/gin-gonic/gin"
	"mediahub/internal/download"
	"net/http"
	"net/url"
	"pansou/model"
	"regexp"
	"strings"
	"time"
)

// CompleteHandler is mounted behind MediaHub authentication by main.
func (b *Bootstrap) CompleteHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
		var body struct {
			Query string `json:"query"`
		}
		if c.ShouldBindJSON(&body) != nil || strings.TrimSpace(body.Query) == "" || len([]rune(body.Query)) > 200 {
			c.JSON(400, gin.H{"error": "请填写搜索关键词（最多 200 字符）"})
			return
		}
		selected, err := b.ReadSearchSettings()
		if err != nil {
			c.JSON(503, gin.H{"error": "无法读取搜索来源"})
			return
		}
		if len(selected.Channels)+len(selected.Plugins) == 0 {
			c.JSON(400, gin.H{"error": "请先启用搜索来源"})
			return
		}
		search, ok := b.adapter.service.(interface {
			SearchCompleteClouds(context.Context, string, []string, []string, []string) (model.SearchResponse, error)
		})
		if !ok {
			c.JSON(503, gin.H{"error": "完整搜索不可用"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 85*time.Second)
		defer cancel()
		b.mu.Lock()
		if b.closed {
			b.mu.Unlock()
			c.JSON(503, gin.H{"error": "服务正在关闭"})
			return
		}
		b.active.Add(1)
		b.mu.Unlock()
		defer b.active.Done()
		select {
		case b.gate <- struct{}{}:
			defer func() { <-b.gate }()
		case <-ctx.Done():
			c.JSON(504, gin.H{"error": "等待搜索超时"})
			return
		}
		resp, err := search.SearchCompleteClouds(ctx, strings.TrimSpace(body.Query), selected.Channels, selected.Plugins, []string{"115", "quark", "magnet"})
		data := mapSearchResponse(resp)
		seen := map[string]bool{}
		for _, item := range resp.Results {
			for _, link := range item.Links {
				key := replacementResourceKey(link.Type, link.URL)
				if key == "" || seen[key] {
					continue
				}
				seen[key] = true
				title := link.WorkTitle
				if title == "" {
					title = item.Title
				}
				data.LinksByCloud[link.Type] = append(data.LinksByCloud[link.Type], resourceLink{Title: title, Note: title, Cloud: link.Type, URL: link.URL, Password: link.Password, Source: item.Channel})
			}
		}
		warning := ""
		if err != nil {
			warning = strings.ReplaceAll(err.Error(), "等待补查", "可稍后重新搜索")
		}
		c.JSON(200, gin.H{"data": data, "warning": warning, "complete": err == nil})
	}
}

var quarkSharePath = regexp.MustCompile(`^/s/[a-zA-Z0-9]+/?$`)

func replacementResourceKey(cloud, raw string) string {
	switch cloud {
	case "115":
		_, code, _, err := download.ParseShare(raw, "")
		if err == nil {
			return "115:" + code
		}
	case "magnet":
		_, hash, err := download.NormalizeMagnet(raw)
		if err == nil {
			return "magnet:" + hash
		}
	case "quark":
		u, err := url.Parse(raw)
		if err == nil && (u.Scheme == "https" || u.Scheme == "http") && strings.EqualFold(u.Host, "pan.quark.cn") && quarkSharePath.MatchString(u.Path) {
			return "quark:" + strings.TrimRight(u.Path, "/")
		}
	}
	return ""
}
