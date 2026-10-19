# 下载与设置

## 下载

动漫或剧集订阅优先沿用订阅自身的资源选择和自动下载流程。仅当用户明确要求手动下载时提交任务，保留真实作品和订阅关联。

`POST /api/v1/downloads`：

```json
{"kind":"offline","url":"真实magnet链接","reference":{"source":"search","media":{"type":"movie","title":"真实作品名","provider":"tmdb","providerId":"真实ID"}}}
```

省略 directoryId 沿用系统目录。支持的业务类型是 offline、share_transfer，不能假定任意网盘链接均支持。115 分享先用 `POST /api/v1/115/share/list` 请求 `{"url":"分享链接","receiveCode":"","directoryId":"0"}`，读取真实文件 ID。分享转存用 kind=share_transfer；用户要求整份转存时 wholeShare=true，否则提供 fileIds 和对应 sourceDirectoryId。不要编造文件 ID。目录可用 `GET /api/v1/115/directories?parentId=0` 查询。

关联订阅时 reference.source 使用 anime_subscription 或 tv_subscription，sourceId 填已保存订阅 ID。media 中的 season、episodes 使用资源实际季集，不能使用全剧订阅的 season=0。搜索下载使用 source=search，直接指定链接使用 manual。

返回 `{task,created}`，202 为新任务，200 可能是已有任务。记录 task.id：

- `GET /api/v1/downloads/{id}` 返回单任务；`GET /api/v1/downloads` → `{items,limit}`。
- 状态 queued、submitting、submitted、awaiting_files 都不代表完成；completed 才是下载完成。failed、unknown 如实报告错误。
- 每 2–3 秒查询，最多约一分钟；仍未结束则返回任务 ID 和当前状态，不能宣称成功完成。
- `POST /api/v1/downloads/{id}/retry` 或 `/resume` 仅在用户要求且状态适合时调用；未知状态先检查，不能重复提交。

系统中可在全局设置的媒体整理区域查看下载记录。不要为完成下载任务额外调用手动整理接口。

## 全局设置

`GET /api/v1/settings/{section}` 返回 `{values,configuredSecrets,maskedSecrets}`。
可用 section：tmdb、emby、115、organize、search、pansou、notifications。

先 GET，再 `PUT /api/v1/settings/{section}`，只提交要修改的键：

```json
{"values":{"tmdb.apiKey":"用户明确提供的密钥"}}
```

其他常见键：115.cookie、115.downloadDirectory、emby.url、emby.apiKey。其他键先依据 GET 返回的真实结构确认，不猜字段。PanSou 来源配置保持其他选择不变，不覆盖成默认值。

敏感请求体从安全环境变量通过 `--body-env` 传入。不要回显密钥或把 maskedSecrets 的掩码写回。空密钥保留原值；clearSecrets 会删除凭据，只有用户明确要求删除时才可以使用。不要为联调修改数据目录、账号或初始化系统。

PUT 后 GET 核对修改后的非敏感值及 configuredSecrets。若保存报错，先回读判断是否已经保存，再处理后续服务错误。API Key 可操作以上业务设置，但不能调用账号、密钥管理或明文凭据展示接口。

`GET /api/v1/logs` 可辅助查看业务错误。浏览器设置入口 `/#/settings`。不自动更改整理策略。
