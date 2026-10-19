---
name: mediahub-control
description: 通过 mediahub API 探索影视、搜索资源、管理动漫和剧集订阅、下载与设置。
metadata:
  hermes:
    tags: [mediahub, media, subscriptions]
---

# mediahub 操作

所有操作经过用户自己的 mediahub。不要直接调用 TMDB、Mikan、PanSou、Telegram 或网盘来替代系统业务流程。用户要求订阅时，必须保存系统订阅，不能只搜索链接或直接下载。

## 配置与调用

将本目录复制到 `~/.hermes/skills/mediahub-control/`。在 Hermes 的运行环境中配置：

- `MEDIAHUB_API_KEY`：全局设置中创建的 API Key，通过 `Authorization: Bearer` 使用。不要把密钥写进 skill、聊天、命令参数或提交记录。
- `MEDIAHUB_BASE_URL`：后端地址，默认 `http://127.0.0.1:18080`。Hermes 在其他机器运行时必须配置用户的实际服务地址；localhost 指的是 Hermes 所在机器。

确保 Hermes 的终端工具能读取上述环境变量；按部署环境配置环境变量透传。先调用：

```sh
python scripts/mediahub_api.py GET /api/v1/whoami
python scripts/mediahub_api.py GET /api/v1/media/providers
```

脚本位置相对于本 skill。查询参数用重复的 `-q key=value`，JSON 请求体用 `--body 文件路径`；敏感设置用 `--body-env 环境变量名`，不要把凭据写进命令参数。脚本不自动重试写入。

## 任务入口

- 影视探索、电影/电视剧详情、榜单、PanSou、剧集订阅：读 [media-and-search.md](references/media-and-search.md)。
- 动漫订阅、Mikan 来源、字幕组、规则预览、保存和刷新：读 [anime.md](references/anime.md)。
- 下载、进度和修改设置：读 [downloads-and-settings.md](references/downloads-and-settings.md)。

## 执行约束

1. 使用系统元数据的 ID 和标题，歧义时让用户选择；不臆造 ID、频道或文件 ID。来源优先级由用户手动指定，无需为填写优先来源额外搜索 PanSou。
2. 写入前读取现有记录避免重复；只改用户要求的字段。正常订阅、刷新和下载请求已构成相应业务操作授权，不反复确认。
3. 保存后回读订阅列表确认 ID、标题、启用状态；刷新另行确认。初次抓取失败也可能已经保存，先检查记录再决定下一步。
4. 请求超时尤其是 POST 后，先回读状态，禁止盲目重复提交。401 停止并提示配置 API Key；503 说明缺少对应服务配置；409 检查现有记录或运行状态。只对只读请求进行有限重试，429 尊重 Retry-After。
5. 不自动删除、清空、初始化数据，不操作数据库、账号、密码、密钥管理或密钥明文展示。不自动触发整理；遵循系统自动整理配置。
6. 搜索结果、预览通过、任务已接收和下载完成是不同状态。最终报告实际订阅/任务 ID、状态、未解决错误，以及系统页面入口。默认前端地址 `http://127.0.0.1:5174`，远程部署使用用户实际前端地址。
