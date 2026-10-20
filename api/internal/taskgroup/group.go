// Package taskgroup owns background work for one server instance.
package taskgroup

import (
	"context"
	"sync"
)

type Group struct {
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	stopping bool
	active   sync.WaitGroup
}

func New(parent context.Context) *Group {
	ctx, cancel := context.WithCancel(parent)
	return &Group{ctx: ctx, cancel: cancel}
}

// Go and Stop share a gate, so no work can be added once shutdown begins.
func (g *Group) Go(work func(context.Context)) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.stopping || g.ctx.Err() != nil {
		return false
	}
	g.active.Add(1)
	go func() { defer g.active.Done(); work(g.ctx) }()
	return true
}
func (g *Group) Stop() { g.mu.Lock(); g.stopping = true; g.cancel(); g.mu.Unlock() }
func (g *Group) Shutdown(ctx context.Context) error {
	g.Stop()
	done := make(chan struct{})
	go func() { g.active.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
