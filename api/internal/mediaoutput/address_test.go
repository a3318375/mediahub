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
	c := (Config{BaseURL: "http://192.168.5.3:15173"}).RuntimeDefaults("strm")
	if c.BaseURL != "http://192.168.5.3:15173" {
		t.Fatalf("saved external address overwritten: %q", c.BaseURL)
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

func TestPlaybackOriginPreservesMappedPortAndHTTPS(t *testing.T) {
	for _, want := range []string{"http://192.168.5.3:15173", "https://media.example.org", "http://[2001:db8::1]:15173"} {
		got, err := PlaybackOrigin(want + "/")
		if err != nil || got != want {
			t.Fatalf("%q %v", got, err)
		}
		if saved := (Config{BaseURL: got}).RuntimeDefaults("strm"); saved.BaseURL != want {
			t.Fatal(saved)
		}
	}
	for _, raw := range []string{"", "null", "file:///strm", "https://u:p@example.org", "https://example.org/path", "https://example.org?token=x", "https://example.org#x", "https://example.org\r\nHost:x"} {
		if _, err := PlaybackOrigin(raw); err == nil {
			t.Fatalf("accepted %q", raw)
		}
	}
}
