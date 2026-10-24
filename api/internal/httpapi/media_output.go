package httpapi

import (
	"context"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"mediahub/internal/mediaoutput"
	"mediahub/internal/pan115"
)

func (a *API) mountMediaOutput(router *gin.Engine, v1 *gin.RouterGroup) {
	jobs := mediaoutput.New(a.store, a.downloads.Factory)
	jobs.Resolve = a.outputMetadata
	jobs.Report = func(message string) { _ = a.store.RecordLog("媒体处理", "INFO", message) }
	a.background.Go(func(ctx context.Context) { jobs.Run(ctx) })
	v1.GET("/processing/:kind/config", func(c *gin.Context) {
		kind := c.Param("kind")
		if kind != "strm" && kind != "scraping" {
			fail(c, 404, "任务类型不存在")
			return
		}
		config, status, err := a.store.OutputJob(kind)
		if err != nil {
			fail(c, 500, "读取媒体处理配置失败")
			return
		}
		c.JSON(200, gin.H{"config": config, "status": status, "configured": config.Validate(kind) == nil})
	})
	v1.PUT("/processing/:kind/config", a.requireUser(), func(c *gin.Context) {
		kind := c.Param("kind")
		if kind != "strm" && kind != "scraping" {
			fail(c, 404, "任务类型不存在")
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		var config mediaoutput.Config
		if c.ShouldBindJSON(&config) != nil {
			fail(c, 400, "媒体处理设置格式无效")
			return
		}
		config.OutputDir = strings.TrimSpace(config.OutputDir)
		config = config.RuntimeDefaults(kind)
		config.Cron = strings.TrimSpace(config.Cron)
		if err := config.Validate(kind); err != nil {
			fail(c, 400, err.Error())
			return
		}
		if _, err := mediaoutput.SafePath(config.OutputDir); err != nil {
			fail(c, 400, err.Error())
			return
		}
		if err := a.store.SaveOutputConfig(kind, config); err != nil {
			fail(c, 409, err.Error())
			return
		}
		c.JSON(200, gin.H{"config": config, "configured": true})
	})
	v1.POST("/processing/:kind/run", func(c *gin.Context) {
		kind := c.Param("kind")
		if kind != "strm" && kind != "scraping" {
			fail(c, 404, "任务类型不存在")
			return
		}
		if kind == "strm" && c.Request.ContentLength != 0 {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
			var body struct {
				BaseURL string `json:"baseUrl"`
			}
			if c.ShouldBindJSON(&body) != nil || strings.TrimSpace(body.BaseURL) == "" {
				fail(c, 400, "需要当前页面的播放服务地址")
				return
			}
			origin, err := mediaoutput.PlaybackOrigin(body.BaseURL)
			if err != nil {
				fail(c, 400, err.Error())
				return
			}
			if err = a.store.RememberPlaybackURL(origin); err != nil {
				fail(c, 500, "保存播放服务地址失败")
				return
			}
		}
		if err := jobs.Trigger(kind); err != nil {
			fail(c, 422, err.Error())
			return
		}
		c.JSON(202, gin.H{"message": map[string]string{"strm": "已触发 STRM 生成任务。", "scraping": "已触发手动刮削任务。"}[kind]})
	})

	// Signed file links grant access only to successfully generated files, never arbitrary IDs.
	streamSlots := make(chan struct{}, 4)
	stream := func(c *gin.Context) {
		c.Header("Cache-Control", "private, no-store")
		c.Header("Referrer-Policy", "no-referrer")
		id, token := c.Param("id"), c.Query("token")
		if !pan115.ValidDirectory(id) || len(token) != 64 {
			fail(c, 403, "播放链接无效")
			return
		}
		cookie, err := a.store.ReadSecret("115", "115.cookie")
		if err != nil {
			fail(c, 503, "115 服务未配置")
			return
		}
		account, err := pan115.AccountID(cookie)
		if err != nil {
			fail(c, 503, "115 账号不可用")
			return
		}
		output, err := a.store.StreamOutput(account, id, token)
		if err != nil {
			fail(c, 403, "播放链接无效")
			return
		}
		if _, err = os.Stat(output.Path); err != nil {
			fail(c, 404, "STRM 文件不可用")
			return
		}
		select {
		case streamSlots <- struct{}{}:
			defer func() { <-streamSlots }()
		default:
			fail(c, 429, "播放连接已满，请稍后重试")
			return
		}
		ctx, cancel := context.WithCancel(c.Request.Context())
		defer cancel()
		gateway, err := a.downloads.Factory(ctx, cookie)
		if err != nil {
			fail(c, 502, "连接 115 失败")
			return
		}
		if err = gateway.CheckAccount(); err != nil {
			fail(c, 503, "115 账号校验失败")
			return
		}
		source, err := gateway.GetFile(id)
		if err != nil || source.Directory || source.Size != output.File.Size || !strings.EqualFold(source.SHA1, output.File.SHA1) {
			fail(c, 409, "来源文件已变化，请重新生成 STRM")
			return
		}
		g, ok := gateway.(interface {
			Stream(string, string) (pan115.StreamLocation, error)
		})
		if !ok {
			fail(c, 503, "115 播放服务不可用")
			return
		}
		location, err := g.Stream(id, c.Request.UserAgent())
		if err != nil {
			fail(c, 502, "获取 115 播放地址失败")
			return
		}
		if !pan115.ValidStreamURL(location.URL) {
			fail(c, 502, "播放地址不可用")
			return
		}
		req, err := http.NewRequestWithContext(ctx, c.Request.Method, location.URL, nil)
		if err != nil {
			fail(c, 502, "播放请求失败")
			return
		}
		for _, key := range []string{"User-Agent", "Cookie", "Referer"} {
			if value := location.Header.Get(key); value != "" {
				req.Header.Set(key, value)
			}
		}
		for _, key := range []string{"Range", "If-Range", "If-None-Match", "If-Modified-Since"} {
			if value := c.GetHeader(key); value != "" {
				req.Header.Set(key, value)
			}
		}
		req.Header.Set("Accept-Encoding", "identity")
		client := &http.Client{Transport: http.DefaultTransport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		resp, err := client.Do(req)
		if err != nil {
			fail(c, 502, "读取视频失败")
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 && resp.StatusCode != 206 && resp.StatusCode != 304 && resp.StatusCode != 416 {
			fail(c, 502, "视频服务暂不可用")
			return
		}
		for _, key := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
			if value := resp.Header.Get(key); value != "" {
				c.Header(key, value)
			}
		}
		c.Status(resp.StatusCode)
		if c.Request.Method != "HEAD" {
			_, _ = io.Copy(c.Writer, resp.Body)
		}
	}
	router.GET("/api/stream/115/:id", stream)
	router.HEAD("/api/stream/115/:id", stream)
}
