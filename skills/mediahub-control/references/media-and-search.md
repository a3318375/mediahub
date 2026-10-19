# 影视与资源

以下路径均使用 API Key。参数、请求字段区分大小写。响应除特别说明外为直接对象。

## 探索与详情

- `GET /api/v1/media/providers` → `{providers:[...]}`：先读取可用来源、媒体类型和筛选能力。
- `GET /api/v1/media/discover?source=tmdb&mediaType=tv&page=1&pageSize=20&query=作品名` → `{items,hasMore,page,pageSize,total,...}`。按 hasMore 翻页并去重。搜索时不要随意附加筛选；只使用来源支持的 genre、region、year、month、season、status、sort、locale。未知参数会报错。
- `GET /api/v1/media/{source}/{sourceId}?mediaType=movie|tv|anime` → 详情。使用卡片真实来源和 ID，读取年份、简介、季集等确认作品。
- `GET /api/v1/media/rankings?source=tmdb&name=movie_day` → `{rankings:[...]}`；检查 supported、available 和 result。
- `GET /api/v1/media/rankings/platforms?mediaType=tv&region=US` → `{items}`。

浏览器入口：`/#/discover`、`/#/rankings`。

## PanSou

- `GET /api/v1/resources/meta` → `{data:{plugins,channels,cloudTypes,defaults,selection,...}}`。仅在需要了解可用搜索来源时调用，无需给手动优先来源做自动补全。
- `POST /api/v1/resources/search`：

```json
{"query":"作品名","source":"all","cloudTypes":["115"],"mode":"results","refresh":false}
```

返回 `{data:{total,items,linksByCloud}}`；items 包含 title、channel 和 links，links 包含 url、cloud、password、source 等。
可选 `plugins:["xiaokupan"]`、`channels:["channel_name"]`。省略沿用系统选择，显式空数组会关闭该类来源。不要把 `plugin:`、`tg:` 前缀放进这些搜索选择器。
异步来源未完成时可隔 1–3 秒重复相同搜索，保持 refresh=false，最多三次，按链接和来源去重。不要每次强制刷新。

搜索不等于订阅或下载。订阅请求走订阅接口；明确下载请求走下载接口。浏览器入口 `/#/search`。

## 全剧订阅

`GET /api/v1/subscriptions/tv` 返回数组，先检查相同 tmdbId 的现有记录。新剧默认订阅所有季：

```json
{"tmdbId":"从详情读取","title":"作品名","season":0,"source":"pansou","channels":[],"sources":["plugin:xiaokupan","tg:channel_name"],"match":"","exclude":"","enabled":true}
```

`POST /api/v1/subscriptions/tv` 保存。sources 是用户指定的优先顺序，多个资源按来源顺序择取；未指定则省略。`source:"tg"` 时 channels 填公开频道名称，移除 https://t.me/ 和 @，保留用户顺序。不额外调用 PanSou 验证用户手填来源。

匹配规则按用户意图生成并转义作品名，例如标题与清晰度分别使用正向条件；不要照搬其他作品规则，不要默认锁定首播年份而漏掉后续季度。质量未要求时不擅自限定 4K。match、exclude 是字符串，和动漫数组规则不同。

- `PUT /api/v1/subscriptions/tv/{id}`：完整订阅字段更新，先读取并保留未修改字段。不要擅自把旧的单季记录转换为全剧。
- `POST /api/v1/subscriptions/tv/{id}/refresh`：刷新后回读列表。409 可能是任务运行中或记录冲突，检查后处理。
- 下载资源的季和集必须取实际匹配结果；全剧 season=0 不能作为文件实际季度。

回读数组确认保存与刷新状态，浏览器 `/#/calendar` 查看剧集订阅。
