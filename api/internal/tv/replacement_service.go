package tv

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

type ReplacementRepository interface {
	Repository
	ReadSecret(string, string) (string, error)
	TVFileHistory(string) ([]download.Task, []organize.Plan, error)
	SaveTVReplacement(string, Replacement) error
	SimpleOrganizeRule() (organize.Rule, error)
	GetDownload(string) (download.Task, error)
}
type ReplacementService struct {
	Store     ReplacementRepository
	Downloads *download.Service
	Organizer *organize.Service
	mu        sync.Mutex
}
type ReplaceRequest struct {
	Season   int              `json:"season"`
	Episode  int              `json:"episode"`
	Resource Candidate        `json:"resource"`
	Download download.Request `json:"download"`
}

func (s *ReplacementService) Files(sub Subscription) ([]EpisodeFile, error) {
	cookie, err := s.Store.ReadSecret("115", "115.cookie")
	if err != nil {
		return nil, err
	}
	account, err := pan115.AccountID(cookie)
	if err != nil {
		return nil, err
	}
	tasks, plans, err := s.Store.TVFileHistory(account)
	if err != nil {
		return nil, err
	}
	return EpisodeFiles(sub, tasks, plans), nil
}

func ensureReplacementDirectory(g pan115.FileGateway, parent, name string) (string, error) {
	files, err := g.ListFiles(parent)
	if err != nil {
		return "", err
	}
	id := ""
	for _, f := range files {
		if strings.EqualFold(f.Name, name) {
			if !f.Directory || id != "" {
				return "", fmt.Errorf("临时目录名称冲突")
			}
			id = f.ID
		}
	}
	if id != "" {
		return id, nil
	}
	f, err := g.CreateDirectory(parent, name)
	if err != nil {
		return "", err
	}
	if !f.Directory || f.ParentID != parent {
		return "", fmt.Errorf("临时目录创建结果未确认")
	}
	return f.ID, nil
}

func (s *ReplacementService) gateway(ctx context.Context, account string) (pan115.FileGateway, error) {
	cookie, err := s.Store.ReadSecret("115", "115.cookie")
	if err != nil {
		return nil, err
	}
	current, err := pan115.AccountID(cookie)
	if err != nil {
		return nil, err
	}
	if account != "" && current != account {
		return nil, fmt.Errorf("115 账号已变更，停止替换")
	}
	g, err := s.Downloads.Factory(ctx, cookie)
	if err != nil {
		return nil, err
	}
	f, ok := g.(pan115.FileGateway)
	if !ok {
		return nil, fmt.Errorf("115 文件操作不可用")
	}
	return f, f.CheckAccount()
}

func (s *ReplacementService) Create(ctx context.Context, id string, r ReplaceRequest) (Replacement, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var job Replacement
	sub, err := s.Store.GetTV(id)
	if err != nil {
		return job, err
	}
	if r.Season < 1 || r.Episode < 1 || r.Season > 100 || r.Episode > 10000 || (sub.Season != 0 && sub.Season != r.Season) {
		return job, fmt.Errorf("季集参数无效")
	}
	known := false
	for _, ep := range sub.Episodes {
		if ep.Season == r.Season && ep.Number == r.Episode {
			known = true
		}
	}
	if !known {
		return job, fmt.Errorf("该季集不在订阅中")
	}
	for _, j := range sub.Replacements {
		if j.Season == r.Season && j.Episode == r.Episode && j.State != "completed" {
			return job, fmt.Errorf("这一集已有替换任务，请重试现有任务")
		}
	}
	link, err := download.NormalizeLink(r.Resource.URL, r.Resource.Password)
	if err != nil {
		return job, err
	}
	r.Download.Kind = link.Kind
	r.Download.URL = link.URL
	r.Download.ReceiveCode = link.ReceiveCode
	r.Download.DirectoryID = "1"
	r.Download.WholeShare = false
	media := download.MediaContext{Type: "tv", Provider: "tmdb", ProviderID: sub.TMDBID, Title: sub.Title, Season: r.Season, Episodes: []int{r.Episode}}
	r.Download.Reference = download.Reference{Source: "tv_replacement", SourceID: id, Media: media}
	if _, err = download.Validate(&r.Download); err != nil {
		return job, err
	}
	rule, err := s.Store.SimpleOrganizeRule()
	if err != nil {
		return job, fmt.Errorf("请先配置未整理目录和整理目标目录")
	}
	g, err := s.gateway(ctx, rule.AccountID)
	if err != nil {
		return job, err
	}
	if _, ok := g.(interface{ DeleteFile(string) error }); !ok {
		return job, fmt.Errorf("115 文件替换不可用")
	}
	if link.Kind == "share_transfer" {
		if len(r.Download.FileIDs) != 1 {
			return job, fmt.Errorf("替换单集时请选择一个视频文件")
		}
		share, ok := g.(pan115.ShareGateway)
		if !ok {
			return job, fmt.Errorf("115 分享查询不可用")
		}
		_, code, password, e := download.ParseShare(link.URL, link.ReceiveCode)
		if e != nil {
			return job, e
		}
		dir := r.Download.SourceDirectoryID
		if dir == "" {
			dir = "0"
		}
		files, e := share.ListShare(code, password, dir)
		if e != nil {
			return job, e
		}
		valid := false
		for _, f := range files {
			if f.ID == r.Download.FileIDs[0] && !f.Directory && organize.IsVideo(f.Name) {
				valid = true
			}
		}
		if !valid {
			return job, fmt.Errorf("请选择当前分享目录内的单个视频文件")
		}
	}
	files, err := s.Files(sub)
	if err != nil {
		return job, err
	}
	for _, f := range files {
		if f.Season == r.Season && f.Episode == r.Episode {
			current, e := g.GetFile(f.File.ID)
			if e != nil {
				return job, e
			}
			if current.Directory || current.Size != f.File.Size || current.ParentID != f.File.ParentID || current.Name != f.File.Name || (f.File.SHA1 != "" && !strings.EqualFold(current.SHA1, f.File.SHA1)) {
				return job, fmt.Errorf("原文件已变化，请先核对文件与整理记录")
			}
			job.OldFiles = append(job.OldFiles, f)
			job.Organized = job.Organized || f.Organized
		}
	}
	root, err := g.GetFile(rule.SourceID)
	if err != nil {
		return job, err
	}
	if !root.Directory {
		return job, fmt.Errorf("未整理目录无效")
	}
	b := make([]byte, 12)
	if _, err = rand.Read(b); err != nil {
		return job, err
	}
	job.ID = hex.EncodeToString(b)
	job.AccountID = rule.AccountID
	job.Season = r.Season
	job.Episode = r.Episode
	job.Rule = rule
	job.Resource = r.Resource
	job.Resource.Password = ""
	job.Resource.URL = link.URL
	job.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	tmp, err := ensureReplacementDirectory(g, root.ID, "tmp")
	if err != nil {
		return job, err
	}
	work, err := ensureReplacementDirectory(g, tmp, "tv-"+job.ID)
	if err != nil {
		return job, err
	}
	job.TempID, err = ensureReplacementDirectory(g, work, "new")
	if err != nil {
		return job, err
	}
	job.OldTempID, err = ensureReplacementDirectory(g, work, "old")
	if err != nil {
		return job, err
	}
	if !job.Organized {
		if len(job.OldFiles) > 0 {
			job.DestinationID = job.OldFiles[0].File.ParentID
		} else {
			job.DestinationID, err = s.Downloads.ResolveLibraryDirectory(ctx, "tv")
			if err != nil {
				return job, err
			}
		}
	}
	r.Download.DirectoryID = job.TempID
	task, created, err := s.Downloads.Enqueue(r.Download)
	if err != nil {
		return job, err
	}
	if !created || task.AccountID != job.AccountID || task.DirectoryID != job.TempID {
		return job, fmt.Errorf("该资源已有其他下载任务，请选用不同资源")
	}
	job.TaskID = task.ID
	job.State = "downloading"
	return job, s.Store.SaveTVReplacement(id, job)
}

func (s *ReplacementService) Retry(id, jobID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sub, err := s.Store.GetTV(id)
	if err != nil {
		return err
	}
	for _, j := range sub.Replacements {
		if j.ID == jobID {
			if j.State != "failed" {
				return fmt.Errorf("只有失败任务可重试")
			}
			t, err := s.Store.GetDownload(j.TaskID)
			if err != nil {
				return err
			}
			if t.State == "failed" {
				if _, err = s.Downloads.Retry(t.ID); err != nil {
					return err
				}
			}
			j.State = "downloading"
			j.Error = ""
			return s.Store.SaveTVReplacement(id, j)
		}
	}
	return fmt.Errorf("替换任务不存在")
}

func (s *ReplacementService) Run(ctx context.Context) {
	timer := time.NewTicker(10 * time.Second)
	defer timer.Stop()
	for {
		subs, err := s.Store.ListTV()
		if err == nil {
			for _, sub := range subs {
				for _, job := range sub.Replacements {
					if job.State == "completed" || job.State == "failed" {
						continue
					}
					s.mu.Lock()
					work, cancel := context.WithTimeout(ctx, 90*time.Second)
					err = s.advance(work, sub, &job)
					cancel()
					if err != nil && ctx.Err() == nil {
						job.State = "failed"
						job.Error = err.Error()
						_ = s.Store.SaveTVReplacement(sub.ID, job)
					}
					s.mu.Unlock()
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
	}
}

func (s *ReplacementService) advance(ctx context.Context, sub Subscription, j *Replacement) error {
	if err := s.Downloads.TickTask(ctx, j.TaskID); err != nil {
		return err
	}
	t, err := s.Store.GetDownload(j.TaskID)
	if err != nil {
		return err
	}
	if t.AccountID != j.AccountID || t.DirectoryID != j.TempID {
		return fmt.Errorf("替换任务账号或目录不匹配")
	}
	if t.State == "failed" || t.State == "cancelled" {
		return fmt.Errorf("新资源获取失败：%s", t.Error)
	}
	if t.State != "completed" {
		return nil
	}
	g, err := s.gateway(ctx, j.AccountID)
	if err != nil {
		return err
	}
	media := download.MediaContext{Type: "tv", Provider: "tmdb", ProviderID: sub.TMDBID, Title: sub.Title, Season: j.Season, Episodes: []int{j.Episode}}
	if j.NewFile == nil {
		videos := []pan115.File{}
		for _, f := range t.Artifacts {
			if !f.Directory && organize.IsVideo(f.Name) {
				videos = append(videos, f)
			}
		}
		matches := []pan115.File{}
		for _, f := range videos {
			n, ok := singleEpisode(normalizeSeasonTitle(f.Name), j.Season)
			if ok && n == j.Episode {
				matches = append(matches, f)
			}
		}
		if len(matches) == 0 && len(videos) == 1 && !numbered.MatchString(videos[0].Name) && !simpleEpisode.MatchString(videos[0].Name) && !ambiguousEpisodes.MatchString(videos[0].Name) {
			matches = videos
		}
		if len(matches) != 1 {
			return fmt.Errorf("新资源无法唯一对应 S%02dE%02d，已保留原文件", j.Season, j.Episode)
		}
		f, e := g.GetFile(matches[0].ID)
		if e != nil {
			return e
		}
		if f.Directory || f.Size <= 0 || f.Size != matches[0].Size {
			return fmt.Errorf("新文件尚未完整核验")
		}
		j.NewFile = &f
		if err = s.Store.SaveTVReplacement(sub.ID, *j); err != nil {
			return err
		}
	}
	currentNew, err := g.GetFile(j.NewFile.ID)
	if err != nil {
		return err
	}
	if currentNew.Directory || currentNew.Size != j.NewFile.Size || (j.NewFile.SHA1 != "" && !strings.EqualFold(currentNew.SHA1, j.NewFile.SHA1)) {
		return fmt.Errorf("新文件已变化，保留原文件")
	}
	if j.Organized && j.PlanID == "" {
		p, e := s.Organizer.PreviewReplacement(ctx, j.Rule, j.TempID, *j.NewFile, media)
		if e != nil {
			return e
		}
		j.PlanID = p.ID
		if err = s.Store.SaveTVReplacement(sub.ID, *j); err != nil {
			return err
		}
	}
	// Old files are staged, not deleted, until the replacement is in its final location.
	for _, old := range j.OldFiles {
		if old.File.ID == j.NewFile.ID {
			return fmt.Errorf("新旧文件相同，停止替换")
		}
		f, e := g.GetFile(old.File.ID)
		if e != nil {
			if pan115.SafeError(e).Code == "not_found" {
				continue
			}
			return e
		}
		if f.Directory || f.Size != old.File.Size || (old.File.SHA1 != "" && !strings.EqualFold(f.SHA1, old.File.SHA1)) {
			return fmt.Errorf("原文件内容已变化，停止替换")
		}
		if f.ParentID == j.OldTempID {
			continue
		}
		if f.ParentID != old.File.ParentID || f.Name != old.File.Name {
			return fmt.Errorf("原文件位置已变化，停止替换")
		}
		staged, e := g.ListFiles(j.OldTempID)
		if e != nil {
			return e
		}
		for _, other := range staged {
			if strings.EqualFold(other.Name, f.Name) && other.ID != f.ID {
				return fmt.Errorf("旧文件临时目录存在同名文件，停止替换")
			}
		}
		if err = g.MoveFile(f.ID, j.OldTempID); err != nil {
			return err
		}
	}
	if j.Organized {
		p, e := s.Organizer.ExecuteReplacement(ctx, j.PlanID)
		if e != nil {
			return e
		}
		j.DestinationID = p.Actions[0].TargetParentID
	} else {
		f, e := g.GetFile(j.NewFile.ID)
		if e != nil {
			return e
		}
		if f.ParentID != j.DestinationID {
			list, e := g.ListFiles(j.DestinationID)
			if e != nil {
				return e
			}
			for _, other := range list {
				if strings.EqualFold(other.Name, f.Name) && other.ID != f.ID {
					return fmt.Errorf("目标存在同名文件，保留临时文件")
				}
			}
			if err = g.MoveFile(f.ID, j.DestinationID); err != nil {
				return err
			}
		}
	}
	f, err := g.GetFile(j.NewFile.ID)
	if err != nil {
		return err
	}
	if f.Directory || f.Size != j.NewFile.Size {
		return fmt.Errorf("替换结果尚未核验")
	}
	if f.ParentID != j.DestinationID || (j.NewFile.SHA1 != "" && !strings.EqualFold(f.SHA1, j.NewFile.SHA1)) {
		return fmt.Errorf("移动结果尚未确认")
	}
	j.NewFile = &f
	j.State = "deleting"
	if err = s.Store.SaveTVReplacement(sub.ID, *j); err != nil {
		return err
	}
	remover, ok := g.(interface{ DeleteFile(string) error })
	if !ok {
		return fmt.Errorf("115 删除文件不可用")
	}
	for _, old := range j.OldFiles {
		f, e := g.GetFile(old.File.ID)
		if e != nil {
			if pan115.SafeError(e).Code == "not_found" {
				continue
			}
			return e
		}
		if f.Directory || f.ParentID != j.OldTempID || f.Name != old.File.Name || f.Size != old.File.Size || (old.File.SHA1 != "" && !strings.EqualFold(f.SHA1, old.File.SHA1)) {
			return fmt.Errorf("待删除文件核验失败")
		}
		if err = remover.DeleteFile(f.ID); err != nil {
			return err
		}
	}
	j.State = "completed"
	j.Error = ""
	return s.Store.SaveTVReplacement(sub.ID, *j)
}
