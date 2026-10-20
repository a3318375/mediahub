package reading

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"
)

func TestCancelledImageRequestDoesNotOpenFile(t *testing.T) {
	reader := &Reader{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := reader.Image(ctx, "unused", "unused.cbz", &Book{}, 0, false)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled request: %v", err)
	}
}

func TestReaderCacheEvictsLeastRecentlyUsedAndRejectsStaleVersion(t *testing.T) {
	r := &Reader{}
	for i := 0; i < 4; i++ {
		r.remember(strconv.Itoa(i), "v1", &Book{Count: i})
	}
	if r.cached("0", "v1") == nil {
		t.Fatal("cache miss")
	}
	r.remember("4", "v1", &Book{Count: 4})
	if r.cached("1", "v1") != nil || r.cached("0", "v1") == nil {
		t.Fatal("recently read book was evicted")
	}
	if r.cached("0", "v2") != nil {
		t.Fatal("stale file content returned")
	}
	r.remember("0", "v2", &Book{Count: 99})
	if r.cached("0", "v2").Count != 99 {
		t.Fatal("replacement missing")
	}
	var total int64
	for _, entry := range r.cache {
		total += entry.size
	}
	if total != r.bytes {
		t.Fatalf("replacement accounting %d != %d", total, r.bytes)
	}
}
func TestReaderCacheEnforcesByteBudget(t *testing.T) {
	r := &Reader{}
	// Large chapters must be bounded by bytes as well as entry count.
	text := strings.Repeat("a", int(readerCacheBudget/2))
	r.remember("one", "v1", &Book{contents: [][]string{{text}}})
	r.remember("two", "v1", &Book{contents: [][]string{{text}}})
	if r.bytes > readerCacheBudget || r.cached("one", "v1") != nil || r.cached("two", "v1") == nil {
		t.Fatal("cache exceeded its memory budget")
	}
	r.remember("oversized", "v1", &Book{contents: [][]string{{text, text}}})
	if r.cached("oversized", "v1") != nil || r.bytes > readerCacheBudget {
		t.Fatal("oversized book retained")
	}
}
