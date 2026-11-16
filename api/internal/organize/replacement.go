package organize

import (
	"context"
	"fmt"
	"mediahub/internal/download"
	"mediahub/internal/pan115"
)

// PreviewReplacement reuses normal naming and file validation, scoped to one
// verified new episode. It does not save or change the user's directory rule.
func (s *Service) PreviewReplacement(ctx context.Context, r Rule, temp string, f pan115.File, m download.MediaContext) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, err := s.gateway(ctx, r.AccountID)
	if err != nil {
		return Plan{}, err
	}
	r.SourceID = temp
	r.Recursive = true
	p, err := PreviewFiles(ctx, g, r, func(context.Context, pan115.File) (Binding, error) {
		return Binding{Media: m, Ready: true, Size: f.Size, SHA1: f.SHA1}, nil
	}, []pan115.File{f})
	if err != nil {
		return p, err
	}
	if len(p.Actions) != 1 || len(p.Issues) != 0 {
		return p, fmt.Errorf("新文件无法生成唯一整理操作，请核对集数与整理规则")
	}
	p.Mode = "tv_replacement"
	p.State = "replacement"
	return s.Store.CreateOrganizePlan(p)
}

func (s *Service) ExecuteReplacement(ctx context.Context, id string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, err := s.Store.OrganizePlan(id)
	if err != nil {
		return p, err
	}
	if p.Mode != "tv_replacement" || len(p.Actions) != 1 {
		return p, fmt.Errorf("不是单集替换计划")
	}
	if p.State == "completed" {
		return p, nil
	}
	g, err := s.gateway(ctx, p.Rule.AccountID)
	if err != nil {
		return p, err
	}
	if err = s.execute(ctx, g, &p, 0); err != nil {
		return p, err
	}
	p.State = "completed"
	return p, s.save(&p)
}
