package mediaoutput

import (
	"fmt"
	"net"
	"os"
	"runtime"
	"strings"
)

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

// RuntimeDefaults supplies deployment-owned STRM settings, never scraping settings.
func (c Config) RuntimeDefaults(kind string) Config {
	if kind == "strm" {
		c.BaseURL, _ = PlaybackURL()
		c.OutputDir = "/strm"
		if runtime.GOOS == "windows" {
			c.OutputDir = `D:\tmp\res\strm`
		}
	}
	return c
}
