# MediaHub

**[在线演示](https://a3318375.github.io/mediahub/)** · 免登录，无需后端，使用示例数据体验界面。真实下载、转存与服务连接需自行部署。

**缝合大师，一款0人工作品。**

基于网盘的动漫和电影的自动化路线，一般是：

`ani-rss` + `moviePolit(tgToDriver)` + `pansoou` + `openlist` + `emby`。

我部署了这么一堆东西，太过于杂乱了，原理又不复杂，所以就让ai写了一个。

我本身是搞java的，没啥审美技术又一般，所以就让ai，用shadcn（react） + go写的。

我其实不知道模仿其他人的代码，侵权不侵权，假如侵权，可以通知我，我隐藏起来。

**项目正在持续开发，欢迎试用、反馈问题和参与二次开发。** 当前已提供基础业务功能，完整自动化流程和使用体验还在完善。

## 功能介绍

- 📺 **Emby 看板**：连接自己的 Emby，查看媒体库概况、最近入库和继续观看，让收藏一目了然。
- 🔎 **搜索历史**：聚合 PanSou 网盘资源与 TG 频道搜索，回看搜索记录，找到资源后直接下载或转存。
- 🎬 **影视探索**：从 TMDB、豆瓣、Bangumi、AniList 发现电影、电视剧和动漫，查看详情、搜索资源、添加订阅。
- 🏆 **榜单推荐**：汇集热门、高分、动画放送与流媒体平台片库，轻松发现下一部想看的作品。
- 🌸 **动漫订阅**：按番剧选择来源、字幕组与匹配规则，订阅 RSS、追踪新集数，支持自动下载。
- 📅 **追剧日历**：按播出日期查看电视剧更新，结合 TG 或 PanSou 搜索资源，管理追剧进度。
- 🎵 **音乐中心**：浏览歌单、歌手与专辑，体验收藏和播放队列；当前为交互演示，尚未接入真实音源。
- 📚 **漫文书库**：管理本地漫画与小说，支持在线阅读、阅读进度和手机浏览。[目录配置说明](docs/reading-library.md)。
- 🛠️ **媒体处理**：下载、整理、STRM 生成、刮削统一入口，共享最近作品与处理统计；STRM 支持手动和定时生成，刮削支持手动补充 NFO 与图片。
- 📋 **日志中心**：查看订阅、搜索、下载和整理的中文业务日志，支持筛选、搜索与导出。
- ⚙️ **全局设置**：集中配置服务连接、整理目录与定时任务、搜索来源、通知、账号及 API 密钥。

当前下载、分享转存与整理主要围绕 **115 网盘**，外部服务按需配置。

## 在线演示

[打开无需后端的演示版](https://a3318375.github.io/mediahub/)。使用示例数据，修改仅保存在浏览器；真实下载、转存、账号与服务连接需自行部署。

演示版与正式版共用界面，通过独立构建模式区分。`hero` 目录执行 `pnpm build:demo` 输出 `dist-demo/`，可部署到 GitHub Pages 等静态托管；正常 `pnpm build` 仍输出 `dist/`，保持正式登录和后端接口行为。推送前端更新到 `main` 后，Pages 工作流自动更新演示站。首次需在仓库 Settings → Pages 中将 Source 设为 GitHub Actions。

## Docker 部署

前后端已打包为一个镜像。将以下内容保存为 `docker-compose.yml`：

```yaml
services:
  mediahub:
    image: ghcr.io/a3318375/mediahub:latest
    ports:
      - "5173:18080"
    volumes:
      - ./data:/data
      - ./strm:/strm
      - ./comics:/comics
      - ./download:/download
      - ./book:/book
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

将映射左侧的 `./comics`、`./book` 改成自己的漫画、小说目录即可。

| 主机目录（可修改） | 容器目录 | 用途 |
| :--- | :--- | :--- |
| `./data` | `/data` | 数据库、密钥和配置，需持久化 |
| `./strm` | `/strm` | STRM 输出目录，可读写 |
| `./comics` | `/comics` | 漫画书库 |
| `./download` | `/download` | CBZ 导入目录；解压校验成功后删除源 CBZ，需可读写 |
| `./book` | `/book` | 小说书库 |

漫画和小说的容器目录固定为 `/comics` 和 `/book`，无需配置目录环境变量。启动后进入「漫文书库」，点击“刷新库”扫描文件。支持格式和阅读限制见[漫文书库说明](docs/reading-library.md)。

启动或更新：

```sh
docker compose pull
docker compose up -d
```

整理进度直接输出到 Docker 日志：包含待整理检测、计划编号、原始文件名、偏移前后集数、115 操作耗时及跳过/失败原因。复制一次点击后从 `[整理] 收到手动整理请求` 到 `整理计划结束` 的日志即可排查；出现 `115开始` 而没有对应的 `115结束`，可定位正在等待的操作。成功的健康检查和整理状态轮询不再刷屏，错误请求仍记录。

上面的 `logging` 配置将容器日志限制为每份 10 MB、最多 3 份并自动轮转。已有 NAS 部署需要将配置加到自己的 Compose 中，再执行 `docker compose up -d` 使容器配置生效；只更新镜像不会改变已有容器的日志策略。通过 NAS 界面部署的用户可设置同等的日志大小和份数限制。轮转仅管理容器日志，不处理数据库、密钥、下载文件或 STRM。

STRM 播放地址在登录或恢复登录会话时自动记住当前浏览器来源地址。例如通过 `http://192.168.5.3:15173` 访问时，后续 STRM 使用该地址，定时生成和服务重启也沿用它，不再覆盖成容器内部的 `18080`。保存 STRM 设置、手动生成时也会同步当前页面地址。首次部署需通过播放器可访问的地址打开页面并登录一次；容器启动本身无法推断 Docker 外部端口映射。

打开 `http://服务器IP:5173`，首次访问创建管理员账号，再到全局设置配置所需服务。

账号、订阅、任务和配置保存在 `./data`。升级时保留整个目录，备份时同时保存数据库与 `master.key`。

## 页面预览

点击缩略图可打开原图查看。

| 影视探索 | 作品详情 |
| :---: | :---: |
| [<img src="docs/images/discover.png" alt="影视探索" width="360">](docs/images/discover.png) | [<img src="docs/images/media-detail.png" alt="作品详情" width="360">](docs/images/media-detail.png) |
| 浏览多来源影视与动漫作品 | 查看作品资料、演职员并搜索资源 |

| 资源搜索 | 动漫订阅 |
| :---: | :---: |
| [<img src="docs/images/resource-search.png" alt="资源搜索" width="360">](docs/images/resource-search.png) | [<img src="docs/images/anime-subscriptions.png" alt="动漫订阅" width="360">](docs/images/anime-subscriptions.png) |
| 聚合搜索网盘资源，按网盘分类查看 | 跟踪新集数，配置字幕组与匹配规则 |

| 中文业务日志 | 全局设置 |
| :---: | :---: |
| [<img src="docs/images/business-logs.png" alt="中文业务日志" width="360">](docs/images/business-logs.png) | [<img src="docs/images/settings.png" alt="全局设置" width="360">](docs/images/settings.png) |
| 筛选、搜索和导出业务操作记录 | 统一管理服务连接、搜索来源和通知 |

| 账号登录 |
| :---: |
| [<img src="docs/images/login.png" alt="账号登录" width="360">](docs/images/login.png) |
| 首次部署创建管理员账号，之后使用该账号登录 |

截图来自开发版本，部分页面仍显示旧名称 FRAME，界面和功能会随版本更新。

## 版本进展

- **0.0.1**：搭建 Go + SQLite 后端与 React + shadcn/ui 前端，完成账号登录、服务配置、影视探索、作品详情与 PanSou 资源搜索，支持 Docker 一体部署。
- **0.0.2**：接入动漫 RSS 订阅、115 离线下载与分享转存，加入媒体整理、定时任务和中文业务日志。
- **0.0.3**：加入电视剧订阅与追剧日历，支持 TG、PanSou 资源检索，完善榜单推荐与流媒体平台片库。
- **0.0.4**：接入 HeroUI 界面，统一探索、订阅、搜索与下载体验，完善 Emby 看板、作品卡片和移动端布局。
- **0.0.5**：加入漫画、小说书库与在线阅读，完善阅读进度和手机阅读体验，优化缓存与下载管理，新增音乐中心演示。
- **0.0.6 · 开发中**：整合媒体处理四个 Tab，统一最近记录和处理统计；加入 STRM 手动 / 定时生成与手动刮削，未配置时不触发任务。

以上版本号按开发阶段归纳，具体变更见 [GitHub 提交记录](https://github.com/a3318375/mediahub/commits/main/)。

## 二次开发

准备好 Git、Node.js、pnpm 和 Go 1.26+，克隆时一并拉取 PanSou 子模块：

```sh
git clone --recurse-submodules https://github.com/a3318375/mediahub.git
cd mediahub
```

```text
mediahub/
├── hero/                   # React + HeroUI 前端，当前默认界面
├── web/                    # 已放弃维护的旧 shadcn/ui 前端，仅供历史参考
├── api/
│   ├── cmd/server/          # Go 服务入口
│   ├── internal/            # API、业务逻辑与 SQLite 存储
│   └── third_party/pansou/  # PanSou 子模块与搜索插件
├── data/                   # 本地数据库、密钥与运行数据
├── docs/                   # 文档和截图
├── Dockerfile
└── docker-compose.yml
```

本地开发以 Windows 为例，分别打开两个终端：

```powershell
# 后端，仓库根目录执行
cd api
$env:HTTP_ADDR = '127.0.0.1:18080'
./scripts/dev.ps1
```

```sh
# 前端，仓库根目录执行
pnpm --dir hero install --frozen-lockfile
pnpm --dir hero dev
```

打开 `http://127.0.0.1:5174`。前端将 `/api` 转发到 `127.0.0.1:18080`，后端脚本默认使用仓库根目录的 `data/`。需要代理时，在后端终端设置 `HTTP_PROXY`、`HTTPS_PROXY` 后再启动。

如需修改 shadcn 界面，安装 `web/` 依赖后运行 `pnpm --dir web dev --host 127.0.0.1 --port 5173 --strictPort`，访问 `http://127.0.0.1:5173`。两套前端共用 Go 后端，按需选一套开发即可。

PanSou 插件位于 `api/third_party/pansou/plugin/`，接口适配位于 `api/internal/pansoubridge/`，以内嵌方式运行，无需再启动独立服务。修改插件注册后运行 `api/scripts/generate-pansou.ps1`；升级子模块可使用 `api/scripts/update-pansou.ps1`。

本地构建镜像：`docker build -f Dockerfile --build-context hero=./hero -t mediahub:local ./api`。推送 `main` 时，提交信息包含 `[build]` 才自动发布镜像，也可在 GitHub Actions 手动触发。

## 致谢

资源搜索基于 [PanSou](https://github.com/fish2018/pansou)，项目通过固定版本的 fork 子模块集成。115 接口适配使用 [115driver](https://github.com/SheltonZhu/115driver)，前端使用 React、Vite、HeroUI 和 shadcn/ui。

TMDB、豆瓣与 AniList 图标来自 [Simple Icons](https://simpleicons.org/)，Bangumi 图标来自其[官方客户端仓库](https://github.com/bangumi/Bangumi-iOS)。品牌标识归各自所有。
