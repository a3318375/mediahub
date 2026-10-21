package store

import (
	"fmt"
	"mediahub/internal/organize"
	"testing"
	"time"
)

func TestProcessingRetentionBoundsAndActiveWork(t *testing.T) {
	now := time.Date(2026, 10, 21, 0, 0, 0, 0, time.UTC)
	rows := []organize.MediaItem{}
	for i := 0; i < 1000; i++ {
		rows = append(rows, organize.MediaItem{ID: fmt.Sprint(i), LastActivityAt: now.Add(-time.Duration(i) * time.Minute).Format(time.RFC3339Nano)})
	}
	rows[999].Active = true
	kept := retainedProcessing(rows, now)
	if len(kept) != 101 || kept[len(kept)-1].ID != "999" {
		t.Fatalf("retention dropped active work or exceeded recent limit: %d", len(kept))
	}
	for i := range rows {
		rows[i].LastActivityAt = now.AddDate(0, 0, -30).Add(-time.Duration(i) * time.Minute).Format(time.RFC3339Nano)
		rows[i].Active = false
	}
	if kept = retainedProcessing(rows, now); len(kept) != 10 {
		t.Fatalf("old recent view should retain ten: %d", len(kept))
	}
	if kept = retainedProcessing(rows[:3], now); len(kept) != 3 {
		t.Fatal("small view invented rows")
	}
	if kept = retainedProcessing(nil, now); len(kept) != 0 {
		t.Fatal("empty view invented rows")
	}
}
