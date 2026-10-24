package organize

import (
	"fmt"
	"mediahub/internal/pan115"
	"time"
)

// Never log credentials, request URLs or raw upstream responses.
type tracedFiles struct {
	pan115.FileGateway
	service        *Service
	sequence       int
	accountChecked bool
}

func (g *tracedFiles) begin(operation, id string) func(error, int) {
	g.sequence++
	sequence, start := g.sequence, time.Now()
	g.service.trace("115开始 connection=%p request=%d op=%s id=%s", g, sequence, operation, id)
	return func(err error, count int) {
		reason := ""
		if err != nil {
			reason = pan115.SafeError(err).Error()
		}
		g.service.trace("115结束 connection=%p request=%d op=%s id=%s count=%d elapsed=%s reason=%q", g, sequence, operation, id, count, time.Since(start).Round(time.Millisecond), reason)
	}
}
func (g *tracedFiles) CheckAccount() error {
	if g.accountChecked {
		return nil
	}
	done := g.begin("校验账号", "")
	err := g.FileGateway.CheckAccount()
	g.accountChecked = err == nil
	done(err, 0)
	return err
}
func (g *tracedFiles) GetFile(id string) (pan115.File, error) {
	done := g.begin("读取文件", id)
	f, err := g.FileGateway.GetFile(id)
	done(err, 1)
	return f, err
}
func (g *tracedFiles) ListFiles(id string) ([]pan115.File, error) {
	done := g.begin("读取目录", id)
	files, err := g.FileGateway.ListFiles(id)
	done(err, len(files))
	return files, err
}
func (g *tracedFiles) CreateDirectory(parent, name string) (pan115.File, error) {
	done := g.begin("创建目录", parent)
	f, err := g.FileGateway.CreateDirectory(parent, name)
	done(err, 1)
	return f, err
}
func (g *tracedFiles) RenameFile(id, name string) error {
	done := g.begin("重命名", id)
	err := g.FileGateway.RenameFile(id, name)
	done(err, 0)
	return err
}
func (g *tracedFiles) MoveFile(id, parent string) error {
	done := g.begin("移动文件", id)
	err := g.FileGateway.MoveFile(id, parent)
	done(err, 0)
	return err
}
func (g *tracedFiles) DeleteEmptyDirectory(id string) error {
	remover, ok := g.FileGateway.(emptyDirectoryGateway)
	if !ok {
		return fmt.Errorf("115 空目录清理不可用")
	}
	done := g.begin("清理空目录", id)
	err := remover.DeleteEmptyDirectory(id)
	done(err, 0)
	return err
}
