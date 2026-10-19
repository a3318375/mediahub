# 动漫订阅流程

不要直接解析 Mikan 页面或将链接提交到网盘绕过订阅。所有步骤通过 mediahub，最终必须在 `/#/anime` 能看到记录。

1. `GET /api/v1/subscriptions/anime` 返回订阅数组，检查作品和季度是否已有订阅。
2. `GET /api/v1/anime/sources/mikan/catalog?query=作品名&year=2026&season=秋&refresh=false` → `{items,seasons}`。items 有 id、title、poster、week。按真实结果确定作品。其他支持来源 ani-bt、anime-garden；它们的季度使用来源实际返回值，例如 `2026 秋`。
3. `GET /api/v1/anime/sources/mikan/{id}/groups?refresh=false` → 字幕组数组，包含 label、url、bangumiId、items、groupRegex。根据用户偏好选择字幕组、语言、清晰度；有歧义才询问。
4. 构建草稿并 `POST /api/v1/subscriptions/anime/resolve`，返回补全草稿。
5. 将补全后的草稿提交 `POST /api/v1/subscriptions/anime/preview` → `{items,accepted,warnings}`，检查 accepted、集数与拒绝原因。resolve 和 preview 都没有保存订阅。
6. `POST /api/v1/subscriptions/anime` 保存完整草稿，随后回读列表确认 ID；再按需要 `POST /api/v1/subscriptions/anime/{id}/refresh`，回读最新状态并报告错误。

草稿结构（元数据用真实解析结果替换，保留 resolve 返回内容）：

```json
{"title":"作品名","originalTitle":"","bangumiId":"","mikanId":"","source":"mikan","url":"字幕组RSS地址","subgroup":"字幕组","season":1,"offset":0,"totalEpisodes":0,"week":0,"releaseDate":"","poster":"","description":"","rating":"","enabled":true,"match":[],"exclude":[],"standby":[]}
```

match、exclude 是正则字符串数组。选择一个版本的条件组合；groupRegex.regexList 每个内层数组是一组共同满足的条件，不要把互斥版本全放进 match。动漫规则遵循 Go 正则语法，不使用任意 PCRE lookahead；按系统返回的规则组合即可。

保存会建立默认自动下载规则，并可能立即刷新、唤醒下载，正常“订阅”沿用系统策略。若用户明确只订阅、不自动下载：先 enabled=false 保存，再 `PUT /api/v1/subscriptions/anime/{id}/downloads` 设置 `{"enabled":false,"directoryId":"library","fromEpisode":1}`，成功后 `PATCH /api/v1/subscriptions/anime/{id}` 设 `{"enabled":true}`；中途失败保留暂停状态并如实报告。

- `PATCH /api/v1/subscriptions/anime/{id}` 只支持 enabled。没有完整草稿编辑接口，不要编造 PUT 路径。
- `GET /api/v1/subscriptions/anime/{id}/downloads` → `{rule,items,limit}`，查看下载候选和状态。
- `PUT /api/v1/subscriptions/anime/{id}/downloads` 更新 enabled、directoryId、fromEpisode；library 使用系统目录，需要已有 115 配置。
- `POST /api/v1/subscriptions/anime/{id}/downloads/retry` → `{count}`，仅在用户要求重试失败项时调用。

没有单条 GET 订阅接口，按 ID 筛选列表。保存 201 但 lastError 有值意味着记录已保存、抓取有问题；不要重新创建。409 检查重复订阅或刷新占用。POST 超时先回读列表，避免重复。刷新可耗时约 90 秒。
