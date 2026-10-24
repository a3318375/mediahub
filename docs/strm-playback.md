# STRM 302 播放

STRM 播放接口校验签名和生成记录后，返回 302 跳转至 115 HTTPS 直链。视频由播放器直接读取，不再经过 MediaHub 中转；已有 STRM 无需重新生成。

解析沿用播放器的 User-Agent，并检查来源文件大小和 SHA1。成功结果按凭据、文件版本和 User-Agent 在内存缓存最多 60 秒（已知直链到期时间前 30 秒停止缓存）；同一链接的并发解析合并，失败不缓存。缓存最多保留 256 个链接，重启即失效。缓存命中时仍检查 STRM 签名、数据库生成记录和本地 STRM 文件。

GET 和 HEAD 均返回 302，响应禁止缓存。并发上限只限制未命中缓存的地址解析，不限制持续播放连接。不会向播放器发送账号 Cookie；直链查询参数属于临时访问凭证，请勿公开。

播放器需支持跟随 302，并在跳转后保持 User-Agent 和 Range 请求。播放器所在网络需能直接访问 115。如果播放器改变 UA，或直链受出口 IP、额外请求头限制，可能无法播放；此版本不自动回退代理。

更新 Docker 后，可以在播放器使用原有 STRM 测试起播、拖动进度和持续播放。排查时用同一 User-Agent 请求 STRM 地址，关闭自动跟随跳转，应看到 HTTP 302 和 115 域名的 Location；再在播放器所在网络跟随跳转检查能否收到 200/206。不要在日志或问题反馈中附上完整 token 和 Location。

实现参考：[OpenList 115 驱动](https://github.com/OpenListTeam/OpenList/blob/main/drivers/115/driver.go) 根据客户端 User-Agent 调用 DownloadWithUA 获取下载地址的方式。
