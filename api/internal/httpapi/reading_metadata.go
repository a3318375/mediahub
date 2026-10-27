package httpapi

import (
	"context"
	"errors"
	"github.com/gin-gonic/gin"
	"log"
	"mediahub/internal/ehentai"
	"mediahub/internal/reading"
	"mediahub/internal/store"
	"net/http"
	"time"
)

type comicMetadataJob struct {
	Running     bool   `json:"running"`
	Total       int    `json:"total"`
	Done        int    `json:"done"`
	Updated     int    `json:"updated"`
	Skipped     int    `json:"skipped"`
	Failed      int    `json:"failed"`
	CompletedAt string `json:"completedAt"`
	Error       string `json:"error"`
}

func (library *readingLibrary) mountMetadata(a *API, group *gin.RouterGroup) {
	source := ehentai.New()
	group.GET("/metadata/status", func(c *gin.Context) {
		library.mu.Lock()
		job := library.metadata
		library.mu.Unlock()
		c.JSON(200, job)
	})
	group.POST("/metadata/refresh", func(c *gin.Context) {
		if c.Param("kind") != "comics" {
			fail(c, 400, "仅漫画支持此元数据刷新")
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		var body struct {
			Mode string `json:"mode"`
		}
		if c.ShouldBindJSON(&body) != nil || (body.Mode != "all" && body.Mode != "missing") {
			fail(c, 400, "请选择刷新全部或仅补缺失")
			return
		}
		library.mu.Lock()
		if library.metadata.Running || library.jobs["comics"].Running {
			library.mu.Unlock()
			fail(c, 409, "漫画书库或元数据正在刷新")
			return
		}
		library.metadata = comicMetadataJob{Running: true}
		library.mu.Unlock()
		if !a.background.Go(func(parent context.Context) {
			ctx, cancel := context.WithTimeout(parent, 2*time.Hour)
			defer cancel()
			job := comicMetadataJob{Running: true}
			publish := func() { library.mu.Lock(); library.metadata = job; library.mu.Unlock() }
			defer func() { job.Running = false; job.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano); publish() }()
			cookie, err := library.db.ReadSecret("ehentai", "ehentai.cookie")
			if errors.Is(err, store.ErrNotFound) {
				err = nil
			}
			if err != nil {
				job.Error = "读取漫画 Cookie 失败"
				return
			}
			items, err := library.db.ComicMetadataTargets(ctx, body.Mode)
			if err != nil {
				job.Error = "读取漫画列表失败"
				return
			}
			job.Total = len(items)
			publish()
			for _, item := range items {
				if err := ctx.Err(); err != nil {
					job.Error = "元数据刷新已中断，已完成结果保留"
					return
				}
				gallery, err := reading.FindComicMetadata(ctx, source, cookie, item.Title)
				if err != nil {
					job.Failed++
					log.Printf("comic metadata %s: %v", item.ID, err)
				} else if gallery == nil {
					job.Skipped++
				} else {
					if body.Mode == "missing" && item.Metadata != nil {
						if item.Metadata.ID != "" && item.Metadata.ID != gallery.ID {
							job.Skipped++
							job.Done++
							publish()
							continue
						}
						merged := reading.FillComicMetadata(item.Metadata.Gallery, *gallery)
						gallery = &merged
					}
					if err := library.db.SaveComicMetadata(ctx, item.ID, *gallery); err != nil {
						job.Failed++
						log.Printf("save comic metadata %s: %v", item.ID, err)
					} else {
						job.Updated++
					}
				}
				job.Done++
				publish()
			}
			if job.Failed > 0 {
				job.Error = "部分漫画刷新失败，原有元数据已保留，可稍后重试。"
			}
		}) {
			library.mu.Lock()
			library.metadata = comicMetadataJob{}
			library.mu.Unlock()
			fail(c, 503, "服务正在停止")
			return
		}
		c.JSON(202, gin.H{"running": true})
	})
}
