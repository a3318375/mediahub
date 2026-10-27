# 漫文书库

「漫画」与「小说」是独立导航入口。漫画提供「我的书架 / E-Hentai」来源 Tab，配置 Cookie 后刷新页面显示 ExHentai。书架合并显示本地漫画与收藏。小说保留独立书库。漫画「刷新库」先比对 comics 并删除已不存在作品的 SQLite 记录，再解包 download，最后扫描补充入库；不自动去重。「刷新元数据」独立执行网络刮削。

## 本地漫画元数据

刷新库右侧的「刷新元数据」弹窗提供「刷新全部」和「仅补缺失」。后台显示总数、进度、更新、未匹配和失败数量，不能与漫画扫描并发运行。

搜索顺序为：有 Cookie 时先 ExHentai 中文、再 E-Hentai 中文；未找到可信匹配时再按站点优先级取消语言限制补搜。未配置 Cookie 时仅使用 E-Hentai。按文件名搜索并核对候选标题，避免把无关首条结果直接写入。搜索不到则跳过，失败不覆盖旧值；仅补缺失保留已填写字段，不跨不同画廊混填。

SQLite 新增 `comic_metadata`（以本地 item_id 关联画廊 ID、token、来源站点、标题、日文标题、封面地址、分类、页数、语言、上传者、发布时间、评分和抓取时间）以及 `comic_metadata_tags`（命名空间、原始标签、版本）。当前字段与 E-Hentai Gallery 对齐，作者、角色、社团、原作等标签按命名空间保存。标签保留历史版本，详情读取当前版本；再次刷新书库不会覆盖刮削字段。

## E-Hentai 在线阅读

- 漫画 → E-Hentai：搜索画廊，按分类与语言筛选，默认中文；支持站点游标分页。详情显示标题、封面、页数、语言、上传者、评分与命名空间标签。
- 详情标签分类使用中文：作者、社团、语言、原作、角色等；常见语言值显示为中文。作者与社团保留原名。点击标签直接搜索同一来源，作者、社团等按原始标签精确匹配，保留语言筛选；点击中文 / 日文 / 英文标签会切换对应语言筛选。
- 点击「在线阅读」按当前页获取图片，复用现有漫画阅读器，支持翻页、跳页和缩放；进度保存在当前浏览器。返回后保留当前搜索条件。
- 「加入书架」保存 MediaHub 本地收藏，不修改站点收藏，也不下载画廊。收藏保存在现有数据库中。
- Cookie 为可选配置；游客可尝试 E-Hentai。ExHentai 需要有效的 ipb_member_id、ipb_pass_hash、igneous 与账号权限。Cookie 设置页接收单行 Cookie，加密保存，仅返回已保存状态；保存成功不代表已验证站点登录。
- 不提供独立代理配置，沿用服务既有网络环境。图片地址和重定向检查域名；仅官方 H@H 子域名可使用非标准端口，直连时拒绝内网地址。ExHentai 官方缩略图域名 `s.exhentai.org` 使用站点 Cookie，H@H 节点及公共 CDN 不接收 Cookie。封面解析过滤站点种子图标；图片解析失败可重试并刷新节点。
- 当前阶段不提供下载、自动入库、漫画刮削或站点收藏同步。CBZ 仅是现有本地阅读格式，尚未确定后续下载存储格式。
- 开发预览如需暂停已配置的后台业务任务，可仅为当前后端进程设置 `MEDIAHUB_PAUSE_AUTOMATION=true`；不修改数据库里的订阅、下载或整理配置。正常启动不设置该变量。

接口均使用现有鉴权，前缀为 `/api/v1/comics/ehentai`：`GET/PUT /settings`、`GET /search`、`GET /gallery/:id/:token`、`GET /gallery/:id/:token/pages/:page`（从 0 开始）、`GET /cover`、`GET /favorites`、`POST /gallery/:id/:token/favorite`。站点参数为 `site=e-hentai.org` 或 `site=exhentai.org`。

参考：E-extensions 提供数据源与图片请求，下载由宿主处理；Suwayomi 有下载功能，并支持通过 `downloadAsCbz` 选择是否将章节压缩为 CBZ。见 [E-extensions](https://github.com/HyperionHXH/E-extensions) 与 [Suwayomi 配置说明](https://github.com/Suwayomi/Suwayomi-Server/blob/master/docs/Configuring-Suwayomi%E2%80%90Server.md)。

## 固定目录

### CBZ 解包导入

- Docker 将待导入 CBZ 放入 `/download`（Compose 默认 `./download:/download`）；公司 Windows 开发环境使用 `D:\tmp\res\download`。解压后的漫画存入原有 `/comics` 或 `D:\tmp\res\comics`。
- 点击漫画「刷新库」时递归导入，保留下载目录的相对层级，一本一个同名文件夹；下载和漫画目录均需可读写。现有 comics 中的 CBZ 不自动解包、不删除，继续支持原来的阅读方式。
- 先在隐藏暂存目录解压，验证 ZIP 校验和、逐文件大小及 SHA-256，再发布为书库目录。包内图片及其他文件（如 ComicInfo.xml）均保留；成功后再次核对源文件身份、大小、时间与完整 SHA-256，最后才删除源 CBZ。
- 目标目录冲突时新建带编号的目录；压缩包损坏、路径越界、符号链接、大小超限、取消或磁盘写入失败均保留源 CBZ，并在刷新状态中显示原因。若已解包但源文件删除失败，下次导入仍按独立漫画解包，重复项由用户手动删除。
- 已导入目录包含 `.mediahub-comic.json` 索引，扫描时作为一本漫画；阅读和封面直接读取图片文件。勿删除索引。单文件上限 40 MB、单包解压上限 4 GiB、最多 10000 张漫画页；CBR 不参与此导入。
- 不做内容去重，也不通过历史别名隐藏漫画。每个 CBZ 独立解压入库；同名目标存在时另建 `名称 (2)`、`名称 (3)` 等目录，不覆盖、不合并。自行整理、直接包含图片的漫画文件夹也支持识别和阅读。
- 不启动自动监控，也不会在服务启动时消费下载目录；没有待导入文件时正常刷新现有书库。

- Docker：漫画 `/comics`，小说 `/book`。将自己的主机目录挂载到这两个容器目录即可，无需配置目录环境变量。
- Windows 本地开发：漫画 `D:\tmp\res\comics`，小说 `D:\tmp\res\book`，由后端直接使用。

Compose 示例使用 `./comics:/comics` 和 `./book:/book` 的目录映射。将左侧路径改成自己的书库目录即可。

## 在线阅读

- CBZ：自然页码排序、图片封面、按页浏览、页码跳转、适应宽度/屏幕。原始跨页保持完整；键盘左方向键读下一页、右方向键读上一页。
- 刷新漫画书库时会将 CBZ 首页封面保存在数据库中，列表优先读取已保存的封面，避免反复解压。文件大小或修改时间变化后，下次刷新会更新封面；已有书库刷新一次即可生成缓存。单本封面提取失败会记录日志，不影响其他作品入库。
- TXT：识别 UTF-8、带 BOM 的 UTF-16、GB18030 文本，按章节标题拆分，超长内容分段；支持目录、字号和纸色/明亮/夜间背景。
- EPUB：按 spine 顺序提供文本章节阅读，移除脚本与样式，不执行书籍内 HTML。暂不展示正文内插图、复杂排版。
- CBR：支持入库和信息展示，暂不支持在线解码，请转换为 CBZ。

点击藏书卡片可查看信息并开始阅读。阅读位置自动保存在当前浏览器，重新打开可继续；清除浏览器数据后进度不再保留。源文件和账号配置均不改变。

单次读取受大小限制：TXT/EPUB 正文最多 64 MB，每张漫画图片最多 40 MB。既有归档按需读取，新导入漫画直接读解包后的图片目录。所有读取沿用现有鉴权，源文件必须位于固定书库根目录内。

## 接口

以下接口需要浏览器会话或 API Key，`kind` 为 `comics` 或 `novels`：

- `GET /api/v1/reading/:kind?query=&format=&sort=title&page=1`：SQLite 目录分页。
- `GET /api/v1/reading/:kind/status`：扫描状态。
- `POST /api/v1/reading/:kind/refresh`：后台扫描。
- `POST /api/v1/reading/comics/metadata/refresh`：后台元数据刮削，JSON `{"mode":"all"}` 或 `{"mode":"missing"}`。
- `GET /api/v1/reading/comics/metadata/status`：元数据任务进度与结果统计。
- `GET /api/v1/reading/:kind/:id/book`：页数或章节索引。
- `GET /api/v1/reading/:kind/:id/cover`：归档内封面。
- `GET /api/v1/reading/:kind/:id/pages/:page`：从 0 开始的漫画图片。
- `GET /api/v1/reading/:kind/:id/chapters/:chapter`：从 0 开始的小说章节。

漫画以实际目录为准：完整扫描成功后，源文件或图片目录不存在的作品会从 SQLite 删除，连同对应封面、详情、标签及旧别名关联一并清理。目录不可读、扫描失败时不执行该清理。小说仍保留原有缺失记录行为。页面不接受任意扫描目录或源文件路径。

漫画详情提供「删除漫画」及确认弹窗，同时删除所选本地文件/文件夹与对应 SQLite 记录、封面和元数据。删除与刷新/刮削互斥；本地删除失败保留数据库记录。`DELETE /api/v1/reading/comics/:id` 使用既有鉴权，只能删除当前漫画根目录中的指定作品，拒绝根目录、路径越界和符号链接。
