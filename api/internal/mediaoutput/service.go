package mediaoutput

import (
	"context"

	"fmt"

	"sync"
	"time"

	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

type Service struct {
	Store   Repository
	Factory download.Factory
	Resolve MetadataResolver
	Report  func(string)
	mu      sync.Mutex
	queue   chan string
}

func New(store Repository, factory download.Factory) *Service {
	return &Service{Store: store, Factory: factory, queue: make(chan string, 2)}
}
func (s *Service) Trigger(kind string) error { return s.trigger(kind, "") }
func (s *Service) trigger(kind, slot string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, status, err := s.Store.OutputJob(kind)
	if err != nil {
		return err
	}
	if err = c.Validate(kind); err != nil {
		return err
	}
	if status.State == "running" || status.State == "queued" {
		return nil
	}
	if kind == "strm" {
		cookie, e := s.Store.ReadSecret("115", "115.cookie")
		if e != nil {
			return fmt.Errorf("请先配置 115 Cookie")
		}
		if _, e = pan115.AccountID(cookie); e != nil {
			return e
		}
	}
	status.State = "queued"
	status.Error = ""
	status.FinishedAt = ""
	status.Issues = []string{}
	if slot != "" {
		status.LastSlot = slot
	}
	if err = s.Store.SaveOutputStatus(kind, status); err != nil {
		return err
	}
	select {
	case s.queue <- kind:
		return nil
	default:
		status.State = "failed"
		status.Error = "任务队列已满"
		_ = s.Store.SaveOutputStatus(kind, status)
		return fmt.Errorf("任务队列已满，请稍后重试")
	}
}
func (s *Service) Run(ctx context.Context) {
	for _, kind := range []string{"strm", "scraping"} {
		_, status, err := s.Store.OutputJob(kind)
		if err == nil && (status.State == "running" || status.State == "queued") {
			status.State = "interrupted"
			status.Error = "服务已重启，请手动重新执行"
			_ = s.Store.SaveOutputStatus(kind, status)
		}
	}
	timer := time.NewTicker(time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case kind := <-s.queue:
			s.execute(ctx, kind)
		case <-timer.C:
			now := time.Now()
			c, status, err := s.Store.OutputJob("strm")
			if err != nil || c.Validate("strm") != nil || c.Cron == "" {
				continue
			}
			slot := organize.DueSlot(organize.Rule{Enabled: true, Cron: c.Cron}, now)
			if slot != "" && slot != status.LastSlot {
				if err = s.trigger("strm", slot); err != nil && s.Report != nil {
					s.Report(err.Error())
				}
			}
		}
	}
}
func (s *Service) execute(parent context.Context, kind string) {
	c, old, err := s.Store.OutputJob(kind)
	if err != nil {
		return
	}
	status := Status{State: "running", StartedAt: time.Now().UTC().Format(time.RFC3339Nano), LastSlot: old.LastSlot, Issues: []string{}}
	if err = s.Store.SaveOutputStatus(kind, status); err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(parent, 30*time.Minute)
	defer cancel()
	if err = c.Validate(kind); err == nil {
		if kind == "strm" {
			err = s.generate(ctx, c, &status)
		} else {
			err = s.scrape(ctx, c, &status)
		}
	}
	status.State = "completed"
	if err != nil {
		status.State = "failed"
		status.Error = err.Error()
	} else if status.Failed > 0 {
		status.State = "completed_with_issues"
	}
	status.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	_ = s.Store.SaveOutputStatus(kind, status)
	s.Store.NotifyProcessing()
	if s.Report != nil {
		s.Report(fmt.Sprintf("%s：完成 %d，跳过 %d，失败 %d%s", map[string]string{"strm": "STRM 生成", "scraping": "刮削"}[kind], status.Completed, status.Skipped, status.Failed, func() string {
			if err != nil {
				return "；" + err.Error()
			}
			return ""
		}()))
	}
}
func (s *Service) progress(kind string, status *Status, name string, err error, created bool) {
	if err != nil {
		status.Failed++
		if len(status.Issues) < 20 {
			status.Issues = append(status.Issues, name+"："+err.Error())
		}
	} else if created {
		status.Completed++
	} else {
		status.Skipped++
	}
	_ = s.Store.SaveOutputStatus(kind, *status)
}
