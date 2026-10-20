package taskgroup

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestShutdownCancelsAndWaitsForWork(t *testing.T) {
	group := New(context.Background())
	started := make(chan struct{})
	var stopped atomic.Bool
	if !group.Go(func(ctx context.Context) { close(started); <-ctx.Done(); stopped.Store(true) }) {
		t.Fatal("work rejected")
	}
	<-started
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := group.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if !stopped.Load() {
		t.Fatal("shutdown returned before work finished")
	}
	if group.Go(func(context.Context) { t.Error("late job ran") }) {
		t.Fatal("accepted work after shutdown")
	}
}
func TestShutdownTimeoutDoesNotAcceptNewJobs(t *testing.T) {
	group := New(context.Background())
	release := make(chan struct{})
	group.Go(func(context.Context) { <-release })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := group.Shutdown(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("unexpected error %v", err)
	}
	if group.Go(func(context.Context) {}) {
		t.Fatal("accepted job after timeout")
	}
	close(release)
	if err := group.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}
func TestConcurrentSubmitAndShutdown(t *testing.T) {
	group := New(context.Background())
	var submit sync.WaitGroup
	for i := 0; i < 20; i++ {
		submit.Add(1)
		go func() { defer submit.Done(); group.Go(func(ctx context.Context) { <-ctx.Done() }) }()
	}
	group.Stop()
	submit.Wait()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := group.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
}
