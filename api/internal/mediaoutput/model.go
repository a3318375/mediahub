// Package mediaoutput owns STRM generation and manual local metadata scraping.
package mediaoutput

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"

	"mediahub/internal/download"
	"mediahub/internal/media"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

type Config struct {
	SourceID  string `json:"sourceId"`
	OutputDir string `json:"outputDir"`
	BaseURL   string `json:"baseUrl"`
	Cron      string `json:"cron"`
}

func (c Config) Validate(kind string) error {
	if c.OutputDir == "" || !filepath.IsAbs(c.OutputDir) {
		return fmt.Errorf("请设置后端可访问的绝对输出目录")
	}
	if kind == "scraping" {
		if c.Cron != "" {
			return fmt.Errorf("刮削暂不支持定时任务")
		}
		return nil
	}
	if kind != "strm" {
		return fmt.Errorf("任务类型无效")
	}
	if !pan115.ValidDirectory(c.SourceID) || c.SourceID == "0" {
		return fmt.Errorf("请选择具体的 115 来源目录")
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || strings.ContainsAny(c.BaseURL, "\r\n") {
		return fmt.Errorf("播放服务地址需为可访问的 HTTP/HTTPS 地址")
	}
	if c.Cron != "" {
		_, err = organize.ParseCron(c.Cron)
		return err
	}
	return nil
}

type Status struct {
	State      string   `json:"state"`
	StartedAt  string   `json:"startedAt"`
	FinishedAt string   `json:"finishedAt"`
	LastSlot   string   `json:"lastSlot"`
	Scanned    int      `json:"scanned"`
	Completed  int      `json:"completed"`
	Skipped    int      `json:"skipped"`
	Failed     int      `json:"failed"`
	Error      string   `json:"error,omitempty"`
	Issues     []string `json:"issues"`
}
type Output struct {
	AccountID       string                `json:"accountId"`
	File            pan115.File           `json:"file"`
	Media           download.MediaContext `json:"media"`
	Root            string                `json:"root"`
	Path            string                `json:"path"`
	SourceID        string                `json:"sourceId"`
	STRMReady       bool                  `json:"strmReady"`
	Scraped         bool                  `json:"scraped"`
	ScrapeAttempted bool                  `json:"scrapeAttempted"`
	Error           string                `json:"error,omitempty"`
	UpdatedAt       string                `json:"updatedAt"`
}
type Metadata struct {
	Media        download.MediaContext
	Detail       media.Detail
	EpisodeTitle string
	EpisodePlot  string
	EpisodeDate  string
}
type Repository interface {
	ReadSecret(string, string) (string, error)
	OutputJob(string) (Config, Status, error)
	SaveOutputStatus(string, Status) error
	Outputs(string) ([]Output, error)
	SaveOutput(Output) error
	OutputToken(Output) string
	OrganizeLookup(string) organize.Lookup
	NotifyProcessing()
}
type MetadataResolver func(context.Context, download.MediaContext, pan115.File) (Metadata, error)
