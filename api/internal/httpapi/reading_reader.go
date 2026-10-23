package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"mediahub/internal/reading"
	"mediahub/internal/store"
)

func (library *readingLibrary) mountReader(group *gin.RouterGroup) {
	reader := &reading.Reader{}
	open := func(c *gin.Context) (store.ReadingItem, *reading.Book, bool) {
		item, err := library.db.GetReading(c.Request.Context(), c.Param("kind"), c.Param("id"))
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				fail(c, 404, "作品不存在，请刷新书库")
			} else {
				fail(c, 500, "读取作品信息失败")
			}
			return item, nil, false
		}
		if !item.Available || item.Root != library.roots[item.Kind] {
			fail(c, 404, "源文件当前不可用，请刷新书库")
			return item, nil, false
		}
		book, err := reader.Book(item.Root, item.Path, item.Format)
		if err != nil {
			fail(c, 422, err.Error())
			return item, nil, false
		}
		return item, book, true
	}
	group.GET("/:id/book", func(c *gin.Context) {
		_, book, ok := open(c)
		if ok {
			c.JSON(200, book)
		}
	})
	group.GET("/:id/chapters/:chapter", func(c *gin.Context) {
		_, book, ok := open(c)
		if !ok {
			return
		}
		index, err := strconv.Atoi(c.Param("chapter"))
		if err != nil {
			fail(c, 400, "章节序号无效")
			return
		}
		paragraphs, err := book.Chapter(index)
		if err != nil {
			fail(c, 404, err.Error())
			return
		}
		c.JSON(200, gin.H{"title": book.Chapters[index].Title, "paragraphs": paragraphs})
	})
	serveImage := func(c *gin.Context, cover bool) {
		if cover && c.Param("kind") == "comics" {
			item, err := library.db.GetReading(c.Request.Context(), "comics", c.Param("id"))
			if err == nil && item.Available && item.Root == library.roots[item.Kind] {
				if data, contentType, err := library.db.ReadingCover(c.Request.Context(), item); err == nil {
					c.Header("Cache-Control", "private, max-age=300")
					c.Header("X-Content-Type-Options", "nosniff")
					c.Data(200, contentType, data)
					return
				}
			}
		}
		item, book, ok := open(c)
		if !ok {
			return
		}
		index := 0
		if !cover {
			var err error
			index, err = strconv.Atoi(c.Param("page"))
			if err != nil || index < 0 || index >= book.Count || book.Format != "CBZ" {
				fail(c, 404, "漫画页码无效")
				return
			}
		}
		data, contentType, err := reader.Image(c.Request.Context(), item.Root, item.Path, book, index, cover)
		if err != nil {
			fail(c, 404, err.Error())
			return
		}
		if contentType == "" {
			contentType = http.DetectContentType(data)
		}
		c.Header("Cache-Control", "private, max-age=300")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(200, contentType, data)
	}
	group.GET("/:id/cover", func(c *gin.Context) { serveImage(c, true) })
	group.GET("/:id/pages/:page", func(c *gin.Context) { serveImage(c, false) })
}
