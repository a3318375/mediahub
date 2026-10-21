package pan115

import "testing"

func TestOutputStreamRejectsUntrustedDownloadAddresses(t *testing.T) {
	for _, address := range []string{"http://cdn.115cdn.net/video", "https://127.0.0.1/video", "https://115cdn.net.evil.test/video", "https://user:pass@cdn.115cdn.net/video", "https://cdn.115cdn.net:1234/video"} {
		if ValidStreamURL(address) {
			t.Fatalf("unsafe stream address: %s", address)
		}
	}
	if !ValidStreamURL("https://cdn.115cdn.net/video?signature=x") {
		t.Fatal("valid 115 CDN rejected")
	}
}
