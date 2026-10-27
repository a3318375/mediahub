package httpapi

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"mediahub/internal/reading"
	"mediahub/internal/store"
)

type readingJob struct {
	Running bool   `json:"running"`
	Error   string `json:"error"`
}
type readingLibrary struct {
	mu       sync.Mutex
	jobs     map[string]readingJob
	roots    map[string]string
	db       *store.Store
	metadata comicMetadataJob
}

func (a *API) mountReading(v1 *gin.RouterGroup) {
	library := &readingLibrary{db: a.store, jobs: map[string]readingJob{}, roots: reading.Roots()}
	log.Printf("reading libraries: comics=%s novels=%s download=%s", library.roots["comics"], library.roots["novels"], reading.DownloadRoot())
	group := v1.Group("/reading/:kind")
	group.Use(func(c *gin.Context) {
		if !reading.ValidKind(c.Param("kind")) {
			fail(c, 400, "书库类型无效")
			c.Abort()
		}
	})
	library.mountReader(group)
	library.mountMetadata(a, group)
	library.mountDelete(group)
	group.GET("", func(c *gin.Context) {
		page := 1
		if raw := c.Query("page"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n < 1 || n > 1000000 {
				fail(c, 400, "页码无效")
				return
			}
			page = n
		}
		format := strings.ToUpper(c.Query("format"))
		if format != "" && !reading.Allowed(c.Param("kind"), format) {
			fail(c, 400, "文件格式无效")
			return
		}
		sort := c.DefaultQuery("sort", "title")
		if sort != "title" && sort != "recent" && sort != "modified" {
			fail(c, 400, "排序方式无效")
			return
		}
		query := strings.TrimSpace(c.Query("query"))
		if len(query) > 512 {
			fail(c, 400, "搜索词过长")
			return
		}
		result, err := library.db.ListReading(c.Request.Context(), store.ReadingQuery{Kind: c.Param("kind"), Query: query, Format: format, Sort: sort, Page: page})
		if err != nil {
			fail(c, 500, "读取书库失败")
			return
		}
		c.JSON(200, result)
	})
	group.GET("/status", func(c *gin.Context) {
		kind := c.Param("kind")
		library.mu.Lock()
		job := library.jobs[kind]
		library.mu.Unlock()
		scan, err := library.db.ReadingScan(c.Request.Context(), kind)
		if err != nil {
			fail(c, 500, "读取刷新状态失败")
			return
		}
		info, pathErr := os.Stat(library.roots[kind])
		available := pathErr == nil && info.IsDir()
		c.JSON(200, gin.H{"configured": available, "running": job.Running, "error": job.Error, "completedAt": scan.CompletedAt, "found": scan.Found})
	})
	group.POST("/refresh", func(c *gin.Context) {
		kind := c.Param("kind")
		root := library.roots[kind]
		if root == "" {
			fail(c, 400, "书库目录不可用，请检查目录挂载")
			return
		}
		library.mu.Lock()
		if library.jobs[kind].Running || (kind == "comics" && library.metadata.Running) {
			library.mu.Unlock()
			fail(c, 409, "该书库正在刷新")
			return
		}
		library.jobs[kind] = readingJob{Running: true}
		library.mu.Unlock()
		if !a.background.Go(func(parent context.Context) {
			ctx, cancel := context.WithTimeout(parent, 30*time.Minute)
			defer cancel()
			var importProblems []string
			var err error
			if kind == "comics" {
				var existing []store.ReadingItem
				existing, err = reading.Scan(ctx, kind, root)
				if err == nil {
					err = library.db.PruneMissingComics(ctx, root, existing)
				}
				if err == nil {
					importProblems = reading.ImportCBZ(ctx, reading.DownloadRoot(), root)
				}
			}
			var items []store.ReadingItem
			if err == nil {
				items, err = reading.Scan(ctx, kind, root)
			}
			if err == nil {
				err = library.db.SaveReadingScan(ctx, kind, root, items)
			}
			if err == nil && kind == "comics" {
				reader := &reading.Reader{}
				for _, item := range items {
					if ctx.Err() != nil {
						err = ctx.Err()
						break
					}
					if item.Format != "CBZ" && item.Format != "DIRECTORY" {
						continue
					}
					if _, _, cached := library.db.ReadingCover(ctx, item); cached == nil {
						continue
					}
					book, coverErr := reader.Book(root, item.Path, item.Format)
					if coverErr == nil {
						var data []byte
						var contentType string
						data, contentType, coverErr = reader.Image(ctx, root, item.Path, book, 0, true)
						if coverErr == nil {
							coverErr = library.db.SaveReadingCover(ctx, item, data, contentType)
						}
					}
					if coverErr != nil {
						log.Printf("reading cover %s: %v", item.ID, coverErr)
					}
				}
			}
			job := readingJob{}
			if len(importProblems) > 0 {
				job.Error = "书库已刷新，部分 CBZ 未完成导入或源文件删除：" + strings.Join(importProblems, "；")
				log.Printf("comics import: %s", job.Error)
			}
			if err != nil {
				log.Printf("reading library %s scan failed: %v", kind, err)
				job.Error = "刷新未完成，请检查目录权限、挂载及服务日志。已完成的目录同步结果保留。"
			}
			library.mu.Lock()
			library.jobs[kind] = job
			library.mu.Unlock()
		}) {
			library.mu.Lock()
			library.jobs[kind] = readingJob{}
			library.mu.Unlock()
			fail(c, 503, "服务正在停止，请稍后重试")
			return
		}
		c.JSON(202, gin.H{"running": true})
	})
}
