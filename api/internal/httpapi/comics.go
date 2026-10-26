package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"mediahub/internal/ehentai"
	"mediahub/internal/store"
)

func (a *API) mountComics(v1 *gin.RouterGroup) {
	source := ehentai.New()
	group := v1.Group("/comics/ehentai")
	group.Use(func(c *gin.Context) { c.Header("Cache-Control", "no-store") })
	cookie := func() (string, error) {
		value, e := a.store.ReadSecret("ehentai", "ehentai.cookie")
		if errors.Is(e, store.ErrNotFound) {
			return "", nil
		}
		return value, e
	}
	group.GET("/settings", func(c *gin.Context) {
		value, e := cookie()
		if e != nil {
			fail(c, 500, "读取漫画 Cookie 失败")
			return
		}
		c.JSON(200, gin.H{"configured": value != ""})
	})
	group.PUT("/settings", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 12<<10)
		var body struct {
			Cookie string `json:"cookie"`
		}
		if c.ShouldBindJSON(&body) != nil {
			fail(c, 400, "Cookie 格式无效")
			return
		}
		value, e := ehentai.NormalizeCookie(body.Cookie)
		if e != nil {
			fail(c, 400, e.Error())
			return
		}
		raw, _ := json.Marshal(value)
		if e = a.store.SaveSettings("ehentai", map[string]json.RawMessage{"ehentai.cookie": raw}, nil); e != nil {
			fail(c, 500, "漫画 Cookie 保存失败")
			return
		}
		c.JSON(200, gin.H{"configured": true})
	})
	credentials := func(c *gin.Context) (string, string, bool) {
		site := c.DefaultQuery("site", "e-hentai.org")
		if _, e := ehentai.Base(site); e != nil {
			fail(c, 400, e.Error())
			return "", "", false
		}
		value, e := cookie()
		if e != nil {
			fail(c, 500, "读取漫画 Cookie 失败")
			return "", "", false
		}
		if site == "exhentai.org" && value == "" {
			fail(c, 400, "ExHentai 需要先设置 Cookie，且账号拥有访问权限")
			return "", "", false
		}
		return site, value, true
	}
	group.GET("/search", func(c *gin.Context) {
		site, value, ok := credentials(c)
		if !ok {
			return
		}
		result, e := source.Search(c.Request.Context(), site, value, c.Query("query"), c.Query("category"), c.Query("language"), c.Query("cursor"))
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.JSON(200, result)
	})
	group.GET("/gallery/:id/:token", func(c *gin.Context) {
		site, value, ok := credentials(c)
		if !ok {
			return
		}
		g, e := source.Details(c.Request.Context(), site, value, c.Param("id"), c.Param("token"))
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.JSON(200, g)
	})
	group.GET("/gallery/:id/:token/pages/:page", func(c *gin.Context) {
		site, value, ok := credentials(c)
		if !ok {
			return
		}
		index, e := strconv.Atoi(c.Param("page"))
		if e != nil || index < 0 || index > 20000 {
			fail(c, 400, "漫画页码无效")
			return
		}
		b, typ, e := source.Image(c.Request.Context(), site, value, c.Param("id"), c.Param("token"), index)
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(200, typ, b)
	})
	// Only the official ExHentai thumbnail host receives site cookies; H@H
	// nodes and the public image CDN never receive them.
	group.GET("/cover", func(c *gin.Context) {
		raw := c.Query("url")
		if !ehentai.AllowedURL(raw) {
			fail(c, 400, "封面地址无效")
			return
		}
		value, e := cookie()
		if e != nil {
			fail(c, 500, "读取漫画 Cookie 失败")
			return
		}
		b, typ, e := source.Cover(c.Request.Context(), raw, value)
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(200, typ, b)
	})
	group.GET("/favorites", func(c *gin.Context) {
		values, _, e := a.store.ReadSettings("comicFavorites")
		if e != nil {
			fail(c, 500, "读取收藏失败")
			return
		}
		items := []any{}
		for _, v := range values {
			items = append(items, v)
		}
		c.JSON(200, gin.H{"items": items})
	})
	group.POST("/gallery/:id/:token/favorite", func(c *gin.Context) {
		site, value, ok := credentials(c)
		if !ok {
			return
		}
		g, e := source.Details(c.Request.Context(), site, value, c.Param("id"), c.Param("token"))
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		raw, _ := json.Marshal(g)
		if e = a.store.SaveSettings("comicFavorites", map[string]json.RawMessage{"comicFavorites." + g.ID + "." + g.Token: raw}, nil); e != nil {
			fail(c, 500, "保存收藏失败")
			return
		}
		c.JSON(200, gin.H{"saved": true})
	})
}
