package httpapi

import (
	"context"
	"log"
	"os"
	"path/filepath"
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
	mu    sync.Mutex
	jobs  map[string]readingJob
	roots map[string]string
	db    *store.Store
}

func (a *API) mountReading(v1 *gin.RouterGroup) {
	library := &readingLibrary{db: a.store, jobs: map[string]readingJob{}, roots: map[string]string{"comics": strings.TrimSpace(os.Getenv("MEDIAHUB_COMICS_DIR")), "novels": strings.TrimSpace(os.Getenv("MEDIAHUB_NOVELS_DIR"))}}
	for kind, root := range library.roots {
		if root != "" {
			if absolute, err := filepath.Abs(root); err == nil {
				library.roots[kind] = filepath.Clean(absolute)
			}
		}
	}
	group := v1.Group("/reading/:kind")
	group.Use(func(c *gin.Context) {
		if !reading.ValidKind(c.Param("kind")) {
			fail(c, 400, "书库类型无效")
			c.Abort()
		}
	})
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
		c.JSON(200, gin.H{"configured": library.roots[kind] != "", "running": job.Running, "error": job.Error, "completedAt": scan.CompletedAt, "found": scan.Found})
	})
	group.POST("/refresh", func(c *gin.Context) {
		kind := c.Param("kind")
		root := library.roots[kind]
		if root == "" {
			fail(c, 400, "尚未配置书库目录，请配置对应的目录挂载和环境变量")
			return
		}
		library.mu.Lock()
		if library.jobs[kind].Running {
			library.mu.Unlock()
			fail(c, 409, "该书库正在刷新")
			return
		}
		library.jobs[kind] = readingJob{Running: true}
		library.mu.Unlock()
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			defer cancel()
			items, err := reading.Scan(ctx, kind, root)
			if err == nil {
				err = library.db.SaveReadingScan(ctx, kind, root, items)
			}
			job := readingJob{}
			if err != nil {
				log.Printf("reading library %s scan failed: %v", kind, err)
				job.Error = "刷新失败，已有书库记录已保留。请检查目录权限、挂载及服务日志。"
			}
			library.mu.Lock()
			library.jobs[kind] = job
			library.mu.Unlock()
		}()
		c.JSON(202, gin.H{"running": true})
	})
}
