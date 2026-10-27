package httpapi

import (
	"errors"
	"github.com/gin-gonic/gin"
	"mediahub/internal/reading"
	"mediahub/internal/store"
)

func (library *readingLibrary) mountDelete(group *gin.RouterGroup) {
	group.DELETE("/:id", func(c *gin.Context) {
		if c.Param("kind") != "comics" {
			fail(c, 400, "此操作仅支持漫画")
			return
		}
		library.mu.Lock()
		if library.jobs["comics"].Running || library.metadata.Running {
			library.mu.Unlock()
			fail(c, 409, "漫画正在刷新，请完成后再删除")
			return
		}
		library.jobs["comics"] = readingJob{Running: true}
		library.mu.Unlock()
		defer func() { library.mu.Lock(); library.jobs["comics"] = readingJob{}; library.mu.Unlock() }()
		item, err := library.db.GetReading(c.Request.Context(), "comics", c.Param("id"))
		if errors.Is(err, store.ErrNotFound) {
			fail(c, 404, "漫画不存在")
			return
		}
		if err != nil {
			fail(c, 500, "读取漫画失败")
			return
		}
		if item.Root != library.roots["comics"] {
			fail(c, 400, "漫画不在当前书库中，未删除")
			return
		}
		if err := reading.DeleteComic(item.Root, item.Path, item.Format); err != nil {
			fail(c, 500, "删除本地漫画失败，数据库记录保留："+err.Error())
			return
		}
		if err := library.db.DeleteReading(c.Request.Context(), "comics", item.ID); err != nil {
			fail(c, 500, "本地文件已删除，数据库同步失败，请刷新库重试")
			return
		}
		c.JSON(200, gin.H{"deleted": true})
	})
}
