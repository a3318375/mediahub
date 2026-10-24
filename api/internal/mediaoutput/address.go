package mediaoutput

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"runtime"
	"strings"
)

// PlaybackOrigin accepts the explicit browser origin, not proxy/Host headers.
func PlaybackOrigin(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if len(raw) > 2048 || err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Path != "" && u.Path != "/") || strings.ContainsAny(raw, "\r\n") {
		return "", fmt.Errorf("播放服务地址需为当前页面的 HTTP/HTTPS 来源地址")
	}
	return u.Scheme + "://" + u.Host, nil
}

// PlaybackURL derives the backend address without trusting browser Host headers.
func PlaybackURL() (string, error) {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":18080"
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", fmt.Errorf("无法识别后端监听地址")
	}
	ip := net.ParseIP(host)
	if host != "" && (ip == nil || (!ip.IsUnspecified() && !ip.IsLoopback())) {
		return "http://" + net.JoinHostPort(host, port), nil
	}
	interfaces, err := net.Interfaces()
	if err != nil {
		return "", fmt.Errorf("无法读取本机网络地址")
	}
	var fallback net.IP
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(iface.Name)
		virtual := strings.Contains(name, "vethernet") || strings.Contains(name, "docker") || strings.Contains(name, "tun") || strings.Contains(name, "vmware") || strings.Contains(name, "virtual")
		addresses, _ := iface.Addrs()
		for _, address := range addresses {
			candidate, _, e := net.ParseCIDR(address.String())
			if e != nil || candidate.To4() == nil || !candidate.IsGlobalUnicast() {
				continue
			}
			if !virtual && candidate.IsPrivate() {
				return "http://" + net.JoinHostPort(candidate.String(), port), nil
			}
			if fallback == nil || !virtual {
				fallback = candidate
			}
		}
	}
	if fallback == nil {
		return "", fmt.Errorf("未找到可用的本机 IPv4 地址")
	}
	return "http://" + net.JoinHostPort(fallback.String(), port), nil
}

// RuntimeDefaults preserves the saved external address across worker runs/restarts.
// Only installations that have not learned a browser origin use the fallback.
func (c Config) RuntimeDefaults(kind string) Config {
	if kind == "strm" {
		if c.BaseURL == "" {
			c.BaseURL, _ = PlaybackURL()
		}
		c.OutputDir = "/strm"
		if runtime.GOOS == "windows" {
			c.OutputDir = `D:\tmp\res\strm`
		}
	}
	return c
}
