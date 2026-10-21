package mediaoutput

import (
	"runtime"
	"testing"
)

func TestAutomaticPlaybackAddressUsesBackendPort(t *testing.T) {
	t.Setenv("HTTP_ADDR", "192.168.5.10:28080")
	got, err := PlaybackURL()
	if err != nil || got != "http://192.168.5.10:28080" {
		t.Fatalf("address = %q, error = %v", got, err)
	}
	c := (Config{BaseURL: "http://old.invalid"}).RuntimeDefaults("strm")
	if c.BaseURL != got {
		t.Fatalf("automatic address did not replace stale address: %q", c.BaseURL)
	}
	expected := "/strm"
	if runtime.GOOS == "windows" {
		expected = `D:\tmp\res\strm`
	}
	c = (Config{OutputDir: "custom"}).RuntimeDefaults("strm")
	if c.OutputDir != expected {
		t.Fatalf("STRM output must be fixed: %q", c.OutputDir)
	}
	if (Config{OutputDir: "custom"}).RuntimeDefaults("scraping").OutputDir != "custom" {
		t.Fatal("scraping directory was changed")
	}
	t.Setenv("HTTP_ADDR", "[2001:db8::1]:18080")
	got, err = PlaybackURL()
	if err != nil || got != "http://[2001:db8::1]:18080" {
		t.Fatalf("IPv6 address = %q, error = %v", got, err)
	}
}
