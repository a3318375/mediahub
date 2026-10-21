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
	f, err := c.sdk.GetFile(id)
	if err != nil {
		return StreamLocation{}, SafeError(err)
	}
	if f == nil || f.FileID != id || f.IsDirectory || f.PickCode == "" {
		return StreamLocation{}, fmt.Errorf("播放文件不可用")
	}
	result, err := c.sdk.DownloadWithUA(f.PickCode, ua)
	if err != nil {
		return StreamLocation{}, SafeError(err)
	}
	if result == nil || !ValidStreamURL(result.Url.Url) {
		return StreamLocation{}, fmt.Errorf("115 未返回受支持的安全播放地址")
	}
	return StreamLocation{result.Url.Url, result.Header}, nil
}
