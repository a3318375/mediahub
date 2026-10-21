package httpapi

import (
	"net/url"
	"strings"
	"testing"
)

func TestEmbyWebURL(t *testing.T) {
	for _, base := range []string{
		"https://media.example/proxy/",
		"https://media.example/proxy/emby",
		"https://media.example/proxy/web/index.html?api_key=secret#old",
		"https://media.example/proxy/web/",
	} {
		for _, library := range []bool{false, true} {
			target := embyWebURL(base, "123&456", "server-1", library)
			if !strings.HasPrefix(target, "https://media.example/proxy/web/index.html#!/") || strings.Contains(target, "secret") {
				t.Fatalf("unexpected web URL: %s", target)
			}
			fragment := strings.SplitN(target, "#!/", 2)[1]
			route, query, _ := strings.Cut(fragment, "?")
			values, err := url.ParseQuery(query)
			if err != nil || values.Get("serverId") != "server-1" {
				t.Fatalf("invalid server query: %s", target)
			}
			key, expectedRoute := "id", "item"
			if library {
				key, expectedRoute = "parentId", "videos"
			}
			if route != expectedRoute || values.Get(key) != "123&456" {
				t.Fatalf("invalid destination: %s", target)
			}
		}
	}
	if target := embyWebURL("https://media.example", "123", "", false); target != "https://media.example/web/index.html#!/item?id=123" {
		t.Fatalf("missing server ID fallback: %s", target)
	}
	for _, base := range []string{"javascript:alert(1)", "//media.example", "invalid"} {
		if target := embyWebURL(base, "123", "", false); target != "" {
			t.Fatalf("unsafe URL accepted: %s", target)
		}
	}
}
