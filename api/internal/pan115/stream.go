package pan115

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type StreamLocation struct {
	URL    string
	Header http.Header
}

func ValidStreamURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, suffix := range []string{"115.com", "115cdn.com", "115cdn.net", "anxia.com"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}
func (c *Client) Stream(id, ua string) (StreamLocation, error) {
	_, location, err := c.StreamFile(id, ua)
	return location, err
}

// StreamFile returns the metadata used to resolve the link, avoiding a second lookup.
func (c *Client) StreamFile(id, ua string) (File, StreamLocation, error) {
	f, err := c.sdk.GetFile(id)
	if err != nil {
		return File{}, StreamLocation{}, SafeError(err)
	}
	if f == nil || f.FileID != id || f.IsDirectory || f.PickCode == "" {
		return File{}, StreamLocation{}, fmt.Errorf("播放文件不可用")
	}
	result, err := c.sdk.DownloadWithUA(f.PickCode, ua)
	if err != nil {
		return File{}, StreamLocation{}, SafeError(err)
	}
	if result == nil || !ValidStreamURL(result.Url.Url) {
		return File{}, StreamLocation{}, fmt.Errorf("115 未返回受支持的安全播放地址")
	}
	return fromFile(f), StreamLocation{result.Url.Url, result.Header}, nil
}
