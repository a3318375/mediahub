package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"github.com/dhowden/tag"
	"github.com/gin-gonic/gin"
	"mediahub/internal/subsonic"
)

func (a *API) validateSubsonicSettings(values map[string]json.RawMessage) error {
	for key, raw := range values {
		switch key {
		case "subsonic.enabled":
			var enabled bool
			if json.Unmarshal(raw, &enabled) != nil {
				return fmt.Errorf("音乐服务开关必须为布尔值")
			}
		case "subsonic.username":
			var name string
			if json.Unmarshal(raw, &name) != nil {
				return fmt.Errorf("用户名格式无效")
			}
			if name != "" {
				if _, err := a.store.UserByAccount(name); err != nil {
					return fmt.Errorf("请填写现有 MediaHub 账号")
				}
			}
		case "subsonic.password":
			var password string
			if json.Unmarshal(raw, &password) != nil || len(password) > 1024 {
				return fmt.Errorf("专用密码格式无效或过长")
			}
		default:
			return fmt.Errorf("未知音乐服务设置")
		}
	}
	current, _, err := a.store.ReadSettings("subsonic")
	if err != nil {
		return err
	}
	for key, raw := range values {
		var value any
		if json.Unmarshal(raw, &value) == nil {
			current[key] = value
		}
	}
	if enabled, _ := current["subsonic.enabled"].(bool); enabled {
		name, _ := current["subsonic.username"].(string)
		if name == "" {
			return fmt.Errorf("启用前请填写用户名")
		}
		password, _ := current["subsonic.password"].(string)
		if password == "" {
			password, _ = a.store.ReadSecret("subsonic", "subsonic.password")
		}
		if password == "" {
			return fmt.Errorf("启用前请设置专用密码")
		}
	}
	return nil
}

func musicRoot() string {
	if value := os.Getenv("MEDIAHUB_MUSIC_DIR"); value != "" {
		return value
	}
	if runtime.GOOS == "windows" {
		return `E:\workspace\res\music`
	}
	return "/music"
}

func (a *API) mountSubsonic(router *gin.Engine, v1 *gin.RouterGroup) {
	library := subsonic.NewLibrary()
	service := subsonic.NewServer(library, func() (string, string, error) {
		values, _, err := a.store.ReadSettings("subsonic")
		if err != nil {
			return "", "", err
		}
		enabled, _ := values["subsonic.enabled"].(bool)
		if !enabled {
			return "", "", nil
		}
		account, _ := values["subsonic.username"].(string)
		// Keep the dedicated credential tied to an existing MediaHub account.
		if _, err := a.store.UserByAccount(account); err != nil {
			return "", "", err
		}
		password, err := a.store.ReadSecret("subsonic", "subsonic.password")
		return account, password, err
	}, musicRoot)
	streams := subsonic.NewWebStreams(library, func(hash string) bool { _, err := a.store.SessionUser(hash); return err == nil })
	v1.POST("/music/songs/:id/play", a.requireUser(), func(c *gin.Context) {
		url, err := streams.Issue(c.Param("id"), c.GetString("authTokenHash"))
		if err != nil {
			fail(c, 404, "音频暂不可用，请刷新曲库后重试")
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(200, gin.H{"url": url})
	})
	webStream := func(c *gin.Context) { streams.ServeHTTP(c.Writer, c.Request) }
	router.GET("/api/stream/music/:id", webStream)
	router.HEAD("/api/stream/music/:id", webStream)
	handler := func(c *gin.Context) { service.ServeHTTP(c.Writer, c.Request) }
	router.GET("/rest/:method", handler)
	router.POST("/rest/:method", handler)
	v1.GET("/music/status", func(c *gin.Context) {
		running, count, lastError := library.Status()
		c.JSON(200, gin.H{"root": musicRoot(), "scanning": running, "count": count, "error": lastError, "completedAt": library.CompletedAt()})
	})
	v1.GET("/music/catalogue", func(c *gin.Context) {
		catalogue := library.Snapshot()
		albums := append([]subsonic.Album{}, catalogue.Albums...)
		for i := range albums {
			albums[i].Songs = nil
		}
		c.JSON(200, gin.H{"albums": albums, "artists": catalogue.Artists, "songCount": len(catalogue.Songs)})
	})
	v1.GET("/music/songs/:id/cover", func(c *gin.Context) {
		f, _, err := library.Open(c.Param("id"))
		if err != nil {
			c.Status(404)
			return
		}
		defer f.Close()
		metadata, err := tag.ReadFrom(f)
		if err != nil {
			c.Status(404)
			return
		}
		picture := metadata.Picture()
		if picture == nil || len(picture.Data) == 0 || len(picture.Data) > 16<<20 {
			c.Status(404)
			return
		}
		contentType := http.DetectContentType(picture.Data)
		if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/gif" && contentType != "image/webp" {
			c.Status(404)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(200, contentType, picture.Data)
	})
	v1.GET("/music/songs", func(c *gin.Context) {
		query := strings.ToLower(strings.TrimSpace(c.Query("query")))
		if len(query) > 512 {
			fail(c, 400, "搜索词过长")
			return
		}
		page := 1
		if value := c.Query("page"); value != "" {
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 || n > 1000000 {
				fail(c, 400, "页码无效")
				return
			}
			page = n
		}
		const pageSize = 50
		songs := append([]subsonic.Song{}, library.Snapshot().Songs...)
		filtered := songs[:0]
		for _, song := range songs {
			if c.Query("artistId") != "" && song.ArtistID != c.Query("artistId") {
				continue
			}
			if c.Query("albumId") != "" && song.AlbumID != c.Query("albumId") {
				continue
			}
			if query != "" && !strings.Contains(strings.ToLower(song.Title+" "+song.Artist+" "+song.Album), query) {
				continue
			}
			filtered = append(filtered, song)
		}
		songs = filtered
		sort.SliceStable(songs, func(i, j int) bool {
			if songs[i].Title == songs[j].Title {
				return songs[i].ID < songs[j].ID
			}
			return songs[i].Title < songs[j].Title
		})
		total := len(songs)
		start := (page - 1) * pageSize
		if start > total {
			start = total
		}
		end := start + pageSize
		if end > total {
			end = total
		}
		c.JSON(200, gin.H{"items": songs[start:end], "total": total, "page": page, "pageSize": pageSize})
	})
	v1.POST("/music/scan", func(c *gin.Context) {
		if err := service.ScanContext(c.Request.Context()); err != nil {
			log.Printf("music scan: %v", err)
			fail(c, 400, "音乐扫描失败，请检查目录及服务日志")
			return
		}
		_, count, _ := library.Status()
		c.JSON(200, gin.H{"count": count, "completedAt": library.CompletedAt()})
	})
	// Missing source directories never create data or prevent unrelated features from starting.
	if info, err := os.Stat(musicRoot()); err == nil && info.IsDir() {
		a.background.Go(func(ctx context.Context) {
			if err := service.ScanContext(ctx); err != nil {
				log.Printf("music scan: %v", err)
			}
		})
	}
	log.Printf("Subsonic music directory: %s", musicRoot())
}
