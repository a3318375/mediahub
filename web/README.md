# MediaHub · shadcn/ui

本目录维护 React、TypeScript、Vite 和 shadcn/ui 前端。导航涵盖 Emby 看板、搜索历史、影视探索、榜单推荐、动漫订阅、追剧日历、音乐中心、漫画、小说、媒体处理、日志和全局设置。

## 开发

从仓库根目录执行以下命令。开发服务使用 5174 端口，默认将同源的 `/api` 转发至 `http://127.0.0.1:18080`。

```sh
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev
```

联调已有实例时，用 `VITE_API_PROXY_TARGET` 指定后端地址，使用该实例的账号登录。局域网访问可给 Vite 传入 `--host 0.0.0.0`。

## 构建与检查

```sh
pnpm --dir web build
(cd web && node --test tests/*.test.ts)
```

产物位于 `web/dist/`。部署需将 API 和静态文件挂在同一域名，并将前端路由回退到 `index.html`。当前仓库的 Docker 发布与 Pages 演示入口见根目录 README。

## 代码位置

- `src/layouts/media-shell/` 管理导航、账号菜单及主题入口。
- `src/components/ui/` 提供 shadcn/ui 基础组件。
- `src/features/` 包含业务页面、阅读器和真实接口调用。
- `src/lib/` 提供登录、媒体契约、资源历史记录与下载数据结构。
