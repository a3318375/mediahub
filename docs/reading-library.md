# 漫文书库

「漫画」与「小说」是独立导航入口。漫画顶部提供「我的书架 / E-Hentai / ExHentai」一组胶囊 Tab，通过 Tab 直接切换来源；我的书架分为本地 / 已下载与已收藏。小说保留独立的本地书库。点击“刷新库”扫描已有文件并入库，支持搜索、格式筛选、排序和分页；目录不存在或扫描失败时保留已有记录，不创建空目录、不修改源文件。

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

单次读取受大小限制：TXT/EPUB 正文最多 64 MB，每张漫画图片最多 40 MB。归档图片直接读取，不向磁盘解压。所有读取沿用现有鉴权，源文件必须位于固定书库根目录内。

## 接口

以下接口需要浏览器会话或 API Key，`kind` 为 `comics` 或 `novels`：

- `GET /api/v1/reading/:kind?query=&format=&sort=title&page=1`：SQLite 目录分页。
- `GET /api/v1/reading/:kind/status`：扫描状态。
- `POST /api/v1/reading/:kind/refresh`：后台扫描。
- `GET /api/v1/reading/:kind/:id/book`：页数或章节索引。
- `GET /api/v1/reading/:kind/:id/cover`：归档内封面。
- `GET /api/v1/reading/:kind/:id/pages/:page`：从 0 开始的漫画图片。
- `GET /api/v1/reading/:kind/:id/chapters/:chapter`：从 0 开始的小说章节。

扫描仅新增/更新书库元数据，源文件缺失时标记不可用并保留原有目录记录，不删除作品。页面不接受任意扫描目录或源文件路径。
