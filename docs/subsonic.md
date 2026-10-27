# Subsonic 音乐服务

MediaHub 提供第一版只读 Subsonic 服务端接口。第三方播放器的服务器地址填写 MediaHub 根地址（本地 `http://127.0.0.1:5174` 或后端 `http://127.0.0.1:18080`），客户端自行追加 `/rest/xxx.view`。其他设备请填写它们能访问的服务器地址。

## 配置

在「全局设置 → 音乐服务」填写现有 MediaHub 账号和单独的 Subsonic 专用密码，开启客户端连接并保存。专用密码使用现有 `master.key` 加密保存，不改变网页登录密码；设置默认关闭，不自动创建凭证。修改、停用后下次请求立即生效。

Docker 将音乐目录只读映射到 `/music`，项目 Compose 已加入 `./music:/music:ro`。本地 Windows 默认目录是 `E:\workspace\res\music`。其他开发环境启动后端前设置 `MEDIAHUB_MUSIC_DIR` 为真实目录；不会创建缺失目录。

服务启动时扫描已存在的音乐目录。新增文件后在「音乐中心」或「全局设置 → 音乐服务」点击「刷新库」，或由客户端调用 `startScan`。刷新时按钮禁用并显示进度状态，成功后显示总歌曲数与最后刷新时间，音乐中心重新读取真实歌曲列表；其他客户端发起的刷新完成后，打开的页面也会自动更新。扫描仅建立内存索引，不写入、整理、删除音频文件；扫描失败保留上次成功索引。曲库重启后重新扫描。歌曲 ID 根据相对路径生成；同一音乐目录迁移盘符不会改变 ID，改名或移动歌曲则会。

支持 MP3、FLAC、M4A、OGG、Opus、WAV、AAC。读取内嵌标题、歌手、专辑歌手、专辑、年份、流派、曲号、碟号及封面；没有标签时回退到文件名和父目录。专辑按专辑歌手和名称分组。Docker 内置 ffprobe 以读取时长及码率；本地可将 FFmpeg 的 ffprobe 加入 PATH，缺失时仍可索引和原格式播放，但无法报告准确时长及码率。

## 已实现接口

- 连接：`ping`、`getLicense`、`getUser`。
- 曲库：`getMusicFolders`、`getArtists`、`getIndexes`、`getArtist`、`getAlbum`、`getSong`、`getMusicDirectory`。
- 列表与搜索：`getAlbumList`、`getAlbumList2`（alphabeticalByName、alphabeticalByArtist、newest、random）、`search2`、`search3`、`getRandomSongs`。
- 音频与封面：`stream`、`download`、`getCoverArt`（原始内嵌封面）。
- 扫描：`startScan`、`getScanStatus`。扫描为同步请求，大曲库请增加客户端超时。

支持 GET 和表单 POST、`.view` 和无后缀路径、默认 XML 与 `f=json`。鉴权支持 `u/p`、`p=enc:十六进制` 和 `u/t/s`，token 使用协议规定的 `MD5(专用密码 + salt)`。声明基础协议版本 1.16.1，尚未声明 OpenSubsonic 扩展。所有 REST 方法均要求鉴权，失败使用协议错误响应。内置请求日志跳过携带凭证的 REST 路径；公网反向代理也应避免记录此类查询参数并使用 HTTPS。

原音播放支持 HTTP Range（206）及 seek。客户端应选择原格式/Direct Play。尚不支持格式转换、码率限制、timeOffset 转码、歌单、收藏、评分、播放统计、外部封面和歌词；未实现的方法返回失败。网页「音乐中心」正式模式支持真实曲库、刷新、原音播放/暂停、进度跳转和音量控制；演示模式保留原有示例交互。网页播放使用当前登录会话，不要求启用第三方 Subsonic 登录。音频引擎直接读取实际时长，可在本机缺少 ffprobe 时补齐当前歌曲的网页时长显示。离开音乐页会停止音频。

网页播放通过 `POST /api/v1/music/songs/:id/play` 取得单首歌曲的一小时临时播放地址，流接口为 `/api/stream/music/:id?ticket=…`，支持 GET/HEAD 和 Range。URL 不包含登录 token；每次流请求还会校验原登录会话，登出/会话失效后不能继续请求音频。

网页音乐中心沿用最初音乐页的封面主视觉、歌曲行、歌手/专辑卡片、详情与底部播放器。歌曲搜索、分类和封面均读取真实曲库：`GET /api/v1/music/catalogue` 返回歌手/专辑目录，歌曲接口支持 `query`、`artistId`、`albumId` 筛选，`GET /api/v1/music/songs/:id/cover` 在会话鉴权后读取内嵌封面。网页“我喜欢”仅保存在当前浏览器，不与 Subsonic 收藏同步；歌单管理仍未开放，页面保留入口并显示空状态。

管理 API 沿用项目 Bearer 会话/API Key 鉴权：`GET /api/v1/music/status` 返回目录、扫描状态、数量、错误和 `completedAt`；`POST /api/v1/music/scan` 触发扫描，完成后返回 `count` 与 `completedAt`；`GET /api/v1/music/songs?page=1` 返回真实歌曲列表，每页 50 首。服务配置使用现有 `/api/settings/subsonic` 接口，字段为 `subsonic.enabled`、`subsonic.username`、`subsonic.password`。

## 验证边界

协议单元测试只使用临时音频文件和内存 HTTP 请求，覆盖 ID3 标签解析、XML/JSON、token/密码鉴权、表单 POST、搜索分页、扫描失败保留曲库、Range 播放及源文件不变，不创建测试数据库。

2026-10-27 已在真实 5174 音乐中心点击「刷新库」，从 `E:\workspace\res\music` 识别 1 首 FLAC：Hi Noise 的《Want U More》，页面显示成功提示与刷新时间。音频 SHA256 在刷新前后保持一致。随后在真实页面点击播放，浏览器原生 audio 状态为 `paused=false`、`readyState=4`、无错误，读取时长 188.571429 秒；已验证暂停及通过进度控件跳转到 29 秒。第三方 Subsonic 客户端兼容性仍需完成专用密码配置后验证；基础接口测试通过不代表所有 Subsonic 客户端均已兼容。

恢复原设计后，已在同一真实 5174 页面重新验证主视觉内嵌封面、开始聆听、底部播放器播放/暂停、歌手卡片及详情、专辑卡片及详情、歌曲详情和搜索空状态，未通过创建/删除业务记录验证写操作。收藏持久化未通过自动点击改动用户偏好。

协议参考：[Subsonic API](https://www.subsonic.org/pages/api.jsp)、[OpenSubsonic API](https://opensubsonic.netlify.app/docs/api-reference/)。
