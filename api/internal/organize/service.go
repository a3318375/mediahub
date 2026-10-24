package organize

import (
	"context"
	"fmt"
	"log"
	"mediahub/internal/download"
	"mediahub/internal/pan115"
	"strings"
	"sync"
	"time"
)

type Repository interface {
	ReadSecret(string, string) (string, error)
	OrganizeRules() ([]Rule, error)
	OrganizeRule(string) (Rule, error)
	OrganizePlans(bool) ([]Plan, error)
	OrganizePlan(string) (Plan, error)
	CreateOrganizePlan(Plan) (Plan, error)
	SaveOrganizePlan(Plan) error
	OrganizeRan(string, string) (bool, error)
	OrganizeLookup(string) Lookup
	OrganizeUnfinished(string) ([]download.Task, error)
}
type Service struct {
	Resolve func(context.Context, download.MediaContext, pan115.File) (download.MediaContext, error)
	Store   Repository
	Factory download.Factory
	mu      sync.Mutex
	wakeMu  sync.Mutex
	wake    chan struct{}
}

func (s *Service) gateway(ctx context.Context, account string) (pan115.FileGateway, error) {
	cookie, e := s.Store.ReadSecret("115", "115.cookie")
	if e != nil {
		return nil, e
	}
	current, e := pan115.AccountID(cookie)
	if e != nil {
		return nil, e
	}
	if current != account {
		return nil, fmt.Errorf("115 账号已变更，请重新保存整理规则")
	}
	g, e := s.Factory(ctx, cookie)
	if e != nil {
		return nil, e
	}
	files, ok := g.(pan115.FileGateway)
	if !ok {
		return nil, fmt.Errorf("115 文件操作不可用")
	}
	traced := &tracedFiles{FileGateway: files, service: s}
	if e = traced.CheckAccount(); e != nil {
		return nil, pan115.SafeError(e)
	}
	return traced, nil
}
func (s *Service) Preview(ctx context.Context, id string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.preview(ctx, id, "", false)
}
func (s *Service) preview(ctx context.Context, id, date string, execute bool) (Plan, error) {
	started := time.Now()
	r, e := s.Store.OrganizeRule(id)
	if e != nil {
		return Plan{}, e
	}
	s.trace("开始整理 rule=%s name=%q source=%s mode=%s", r.ID, r.Name, r.SourceID, map[bool]string{true: "执行", false: "预览"}[execute])
	var candidates []pan115.File
	targeted := false
	if repo, ok := s.Store.(interface {
		OrganizePending(string) ([]pan115.File, error)
	}); ok && !r.AllowExisting && r.Binding == nil {
		candidates, e = repo.OrganizePending(r.AccountID)
		if e != nil {
			return Plan{}, e
		}
		targeted = true
		s.trace("待整理检测 rule=%s pending_files=%d scan=仅待整理文件", r.ID, len(candidates))
		if len(candidates) == 0 {
			s.trace("整理计划结束 rule=%s state=无待整理文件 requests=0", r.ID)
			if !execute {
				return s.Store.CreateOrganizePlan(Plan{Rule: r, State: "preview", Actions: []Action{}, Issues: []Issue{}})
			}
			return Plan{}, nil
		}
	}
	g, e := s.gateway(ctx, r.AccountID)
	if e != nil {
		return Plan{}, e
	}
	lookup := s.Store.OrganizeLookup(r.AccountID)
	active, e := s.Store.OrganizeUnfinished(r.AccountID)
	if e != nil {
		return Plan{}, e
	}
	blocked := map[string]bool{}
	for _, t := range active {
		if t.AccountID == r.AccountID {
			blocked[t.DirectoryID] = true
		}
	}
	ancestorBlocked := map[string]bool{}
	lookupFile := func(ctx context.Context, f pan115.File) (Binding, error) {
		id := f.ParentID
		if value, ok := ancestorBlocked[id]; ok {
			if value {
				return Binding{}, fmt.Errorf("此目录仍有未完成下载任务")
			}
			b, e := lookup(ctx, f)
			if e == nil && s.Resolve != nil && (b.Ready || r.AllowExisting) {
				b.Media, e = s.Resolve(ctx, b.Media, f)
			}
			return b, e
		}
		seen := map[string]bool{}
		for depth := 0; id != "" && id != "0"; depth++ {
			if blocked[id] {
				ancestorBlocked[f.ParentID] = true
				return Binding{}, fmt.Errorf("此目录仍有未完成下载任务")
			}
			if depth >= 32 || seen[id] {
				return Binding{}, fmt.Errorf("目录层级异常")
			}
			seen[id] = true
			parent, e := g.GetFile(id)
			if e != nil {
				return Binding{}, pan115.SafeError(e)
			}
			id = parent.ParentID
		}
		ancestorBlocked[f.ParentID] = false
		b, e := lookup(ctx, f)
		if e == nil && s.Resolve != nil && (b.Ready || r.AllowExisting) {
			b.Media, e = s.Resolve(ctx, b.Media, f)
		}
		return b, e
	}
	var p Plan
	if targeted {
		p, e = PreviewFiles(ctx, g, r, lookupFile, candidates)
	} else {
		s.trace("扫描目录 rule=%s scan=递归扫描历史文件", r.ID)
		p, e = Preview(ctx, g, r, lookupFile)
	}
	if e != nil {
		s.trace("整理检测失败 rule=%s elapsed=%s reason=%q", r.ID, time.Since(started).Round(time.Millisecond), e.Error())
		return p, e
	}
	p.Mode = "manual"
	if date != "" {
		p.Mode = "scheduled"
		p.RunDate = date
	}
	if execute {
		p.State = "running"
	}
	p, e = s.Store.CreateOrganizePlan(p)
	if e == nil {
		s.trace("整理检测完成 plan=%s actions=%d issues=%d elapsed=%s", p.ID, len(p.Actions), len(p.Issues), time.Since(started).Round(time.Millisecond))
		for _, issue := range p.Issues {
			s.trace("跳过文件 plan=%s file=%q id=%s code=%s reason=%q", p.ID, issue.File.Name, issue.File.ID, issue.Code, issue.Message)
		}
	}
	return p, e
}
func (s *Service) Start(id string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, e := s.Store.OrganizePlan(id)
	if e != nil {
		return p, e
	}
	r, e := s.Store.OrganizeRule(p.Rule.ID)
	if e != nil {
		return p, e
	}
	if r.Version != p.Rule.Version || r.AccountID != p.Rule.AccountID {
		return p, ErrConflict
	}
	if p.State != "preview" && p.State != "paused" {
		return p, ErrConflict
	}
	running, err := s.Store.OrganizePlans(true)
	if err != nil {
		return p, err
	}
	for _, other := range running {
		if other.ID == p.ID || other.Rule.AccountID != p.Rule.AccountID {
			continue
		}
		for _, existing := range other.Actions {
			for _, action := range p.Actions {
				if existing.Source.ID == action.Source.ID && existing.State != "completed" && existing.State != "conflict" {
					return p, fmt.Errorf("该文件正在其他整理任务中处理，请稍后刷新")
				}
			}
		}
	}
	p.State = "running"
	p.Error = ""
	e = s.Store.SaveOrganizePlan(p)
	if e == nil {
		p, e = s.Store.OrganizePlan(id)
	}
	return p, e
}
func (s *Service) wakeChannel() chan struct{} {
	s.wakeMu.Lock()
	defer s.wakeMu.Unlock()
	if s.wake == nil {
		s.wake = make(chan struct{}, 1)
	}
	return s.wake
}

func (s *Service) Trigger() {
	s.trace("收到手动整理请求，唤醒整理队列")
	select {
	case s.wakeChannel() <- struct{}{}:
	default:
	}
}

func (s *Service) Run(ctx context.Context, report func(string)) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	wake := s.wakeChannel()
	manual := false
	for {
		child, cancel := context.WithTimeout(ctx, 2*time.Minute)
		e := s.tick(child, manual)
		cancel()
		if e != nil && ctx.Err() == nil && report != nil {
			report("公共整理任务处理失败，请查看整理计划")
		}
		if e != nil {
			s.trace("整理执行异常 reason=%q", e.Error())
		}
		// Continue persisted work immediately; the minute ticker only schedules new runs.
		active, activeErr := s.Store.OrganizePlans(true)
		if activeErr == nil && len(active) > 0 && ctx.Err() == nil {
			s.trace("整理计划尚未完成 active_plans=%d，立即继续，不等待分钟调度", len(active))
			if e != nil {
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Second):
				}
			}
			manual = false
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			manual = false
		case <-wake:
			manual = true
		}
	}
}
func (s *Service) Tick(ctx context.Context) error {
	return s.tick(ctx, false)
}

func (s *Service) tick(ctx context.Context, manual bool) error {
	if notifier, ok := s.Store.(interface{ NotifyProcessing() }); ok {
		defer notifier.NotifyProcessing()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	rules, e := s.Store.OrganizeRules()
	if e != nil {
		return e
	}
	now := time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600))
	running, e := s.Store.OrganizePlans(true)
	if e != nil {
		return e
	}
	activeRules := map[string]bool{}
	for _, plan := range running {
		activeRules[plan.Rule.ID] = true
	}
	for _, r := range rules {
		date := DueSlot(r, now)
		force := manual && r.Simple
		if date == "" && !force || activeRules[r.ID] {
			continue
		}
		if force {
			date = ""
		}
		ran, e := s.Store.OrganizeRan(r.ID, date)
		if e != nil {
			return e
		}
		if ran && !force {
			continue
		}
		if _, e = s.preview(ctx, r.ID, date, true); e != nil {
			return e
		}
	}
	plans, e := s.Store.OrganizePlans(true)
	if e != nil {
		return e
	}
	for _, p := range plans {
		if e = ctx.Err(); e != nil {
			return e
		}
		r, e := s.Store.OrganizeRule(p.Rule.ID)
		if e != nil {
			return e
		}
		if r.Version != p.Rule.Version {
			p.State = "paused"
			p.Error = "整理规则已变更，请重新预览"
			if e = s.Store.SaveOrganizePlan(p); e != nil {
				return e
			}
			continue
		}
		g, e := s.gateway(ctx, p.Rule.AccountID)
		if e != nil {
			p.State = "paused"
			p.Error = "115 账号或连接异常，请核对后恢复"
			if e = s.Store.SaveOrganizePlan(p); e != nil {
				return e
			}
			continue
		}
		for i := range p.Actions {
			a := &p.Actions[i]
			if a.State == "completed" || a.State == "conflict" {
				continue
			}
			started := time.Now()
			s.trace("开始整理文件 plan=%s file=%q id=%s original=%v offset=%d episode=%v target=%q", p.ID, a.Source.Name, a.ID, a.Media.OriginalEpisodes, a.Media.Offset, a.Media.Episodes, a.TargetName)
			if e = s.execute(ctx, g, &p, i); e != nil {
				s.trace("整理文件失败 plan=%s file=%q stage=%s elapsed=%s reason=%q", p.ID, a.Source.Name, a.State, time.Since(started).Round(time.Millisecond), e.Error())
				if ctx.Err() != nil {
					return ctx.Err()
				}
				p.State = "paused"
				a.Error = e.Error()
				p.Error = "有操作未完成，核对后恢复会先检查文件实际状态"
				_ = s.Store.SaveOrganizePlan(p)
				break
			}
			s.trace("整理文件完成 plan=%s file=%q elapsed=%s", p.ID, a.Source.Name, time.Since(started).Round(time.Millisecond))
			fresh, e := s.Store.OrganizePlan(p.ID)
			if e != nil {
				return e
			}
			p = fresh
		}
		if p.State == "running" {
			pending := false
			for _, a := range p.Actions {
				if a.State != "completed" && a.State != "conflict" {
					pending = true
				}
			}
			if pending {
				continue
			}
			p.State = "completed"
			// Incremental runs must not crawl the whole source again for empty folders.
			_, incremental := s.Store.(interface {
				OrganizePending(string) ([]pan115.File, error)
			})
			if !incremental || p.Rule.AllowExisting || p.Rule.Binding != nil {
				if e = s.cleanupEmptyDirectories(ctx, g, p.Rule); e != nil {
					p.Issues = append(p.Issues, Issue{Code: "cleanup", Message: "空目录清理未完成：" + e.Error()})
				}
			}
			for _, a := range p.Actions {
				if a.State == "conflict" {
					p.State = "completed_with_issues"
				}
			}
			if len(p.Issues) > 0 {
				p.State = "completed_with_issues"
			}
			if e = s.Store.SaveOrganizePlan(p); e != nil {
				return e
			}
			completed, conflicts := 0, 0
			for _, a := range p.Actions {
				if a.State == "completed" {
					completed++
				}
				if a.State == "conflict" {
					conflicts++
				}
			}
			s.trace("整理计划结束 plan=%s state=%s files=%d completed=%d conflicts=%d issues=%d", p.ID, p.State, len(p.Actions), completed, conflicts, len(p.Issues))
		}
	}
	return nil
}

func (s *Service) trace(format string, args ...any) {
	log.Printf("[整理] "+format, args...)
}
func (s *Service) save(p *Plan) error {
	if e := s.Store.SaveOrganizePlan(*p); e != nil {
		return e
	}
	p.Revision++
	return nil
}
func (s *Service) execute(ctx context.Context, g pan115.FileGateway, p *Plan, index int) error {
	rule, e := s.Store.OrganizeRule(p.Rule.ID)
	if e != nil {
		return e
	}
	if rule.Version != p.Rule.Version {
		return fmt.Errorf("规则或作品绑定已变更，请重新预览")
	}
	a := &p.Actions[index]
	f, e := g.GetFile(a.Source.ID)
	if e != nil {
		return pan115.SafeError(e)
	}
	if f.Directory || f.Size != a.Source.Size || a.Source.SHA1 != "" && !strings.EqualFold(f.SHA1, a.Source.SHA1) {
		return fmt.Errorf("文件内容已变更，请重新预览")
	}
	active, e := s.Store.OrganizeUnfinished(p.Rule.AccountID)
	if e != nil {
		return e
	}
	blocked := map[string]bool{}
	for _, task := range active {
		if task.AccountID == p.Rule.AccountID {
			blocked[task.DirectoryID] = true
		}
	}
	parentID := f.ParentID
	seen := map[string]bool{}
	for depth := 0; parentID != "" && parentID != "0"; depth++ {
		if blocked[parentID] {
			return fmt.Errorf("文件所在目录仍有未完成下载，暂停整理")
		}
		if depth >= 32 || seen[parentID] {
			return fmt.Errorf("目录层级异常")
		}
		seen[parentID] = true
		parent, e := g.GetFile(parentID)
		if e != nil {
			return pan115.SafeError(e)
		}
		parentID = parent.ParentID
	}
	if a.TargetParentID == "" {
		parent := a.TargetRootID
		for _, name := range a.TargetDirectories {
			if e = ctx.Err(); e != nil {
				return e
			}
			list, e := g.ListFiles(parent)
			if e != nil {
				return pan115.SafeError(e)
			}
			id := ""
			for _, candidate := range list {
				if strings.EqualFold(candidate.Name, name) {
					if !candidate.Directory || id != "" {
						return fmt.Errorf("目标目录名称冲突")
					}
					id = candidate.ID
				}
			}
			if id == "" {
				folder, e := g.CreateDirectory(parent, name)
				if e != nil {
					return pan115.SafeError(e)
				}
				if !folder.Directory || folder.ParentID != parent {
					return fmt.Errorf("新建目标目录返回异常")
				}
				id = folder.ID
			}
			parent = id
		}
		a.TargetParentID = parent
		if e = s.save(p); e != nil {
			return e
		}
	}
	if f.ParentID != a.Source.ParentID && f.ParentID != a.TargetParentID {
		return fmt.Errorf("来源文件已被其他操作移动")
	}
	if f.Name != a.Source.Name && f.Name != a.TargetName {
		return fmt.Errorf("来源文件已被其他操作改名")
	}
	list, e := g.ListFiles(a.TargetParentID)
	if e != nil {
		return pan115.SafeError(e)
	}
	for _, candidate := range list {
		if strings.EqualFold(candidate.Name, a.TargetName) && candidate.ID != f.ID {
			return fmt.Errorf("目标已有同名文件，保留来源文件")
		}
	}
	if f.Name != a.TargetName {
		siblings, e := g.ListFiles(f.ParentID)
		if e != nil {
			return pan115.SafeError(e)
		}
		for _, candidate := range siblings {
			if strings.EqualFold(candidate.Name, a.TargetName) && candidate.ID != f.ID {
				return fmt.Errorf("来源目录存在改名冲突")
			}
		}
		a.State = "renaming"
		if e = s.save(p); e != nil {
			return e
		}
		if e = g.RenameFile(f.ID, a.TargetName); e != nil {
			return pan115.SafeError(e)
		}
		f, e = g.GetFile(f.ID)
		if e != nil {
			return pan115.SafeError(e)
		}
		if f.Name != a.TargetName {
			return fmt.Errorf("改名结果尚未确认")
		}
	}
	a.State = "renamed"
	if e = s.save(p); e != nil {
		return e
	}
	if f.ParentID != a.TargetParentID {
		a.State = "moving"
		if e = s.save(p); e != nil {
			return e
		}
		if e = g.MoveFile(f.ID, a.TargetParentID); e != nil {
			return pan115.SafeError(e)
		}
	}
	f, e = g.GetFile(f.ID)
	if e != nil {
		return pan115.SafeError(e)
	}
	if f.ParentID != a.TargetParentID || f.Name != a.TargetName {
		return fmt.Errorf("移动结果尚未确认")
	}
	a.State = "completed"
	a.Error = ""
	return s.save(p)
}
