# 漫文书库

菜单「漫文书库」提供漫画 / 小说两个独立 Tab。页面浏览、搜索、格式筛选、排序、分页和作品信息均来自项目 SQLite，不访问源文件。

点击搜索按钮右侧的「刷新库」才会递归扫描当前 Tab 对应的固定目录。漫画支持 `.cbz` / `.cbr`，小说支持 `.txt` / `.epub`，扩展名不区分大小写。当前以文件名作为书名，每个文件对应一条记录，保存相对路径、格式、大小、文件更新时间和首次入库时间。暂不提取内嵌封面、作者，也不提供在线阅读。

刷新在后台执行，页面轮询进度；切换 Tab 或离开页面不会停止任务。两类书库独立刷新。扫描完整成功后才在一个事务中入库，重复文件更新原记录。不存在的源文件标记为缺失，已有记录保留；扫描失败不改变书库记录。符号链接不跟随，不解压归档，不读取正文。

## Docker Compose

在 `docker-compose.yml` 同目录的 `.env` 中配置已有的主机目录，例如：

```dotenv
MEDIAHUB_COMICS_PATH=/mnt/books/comics
MEDIAHUB_NOVELS_PATH=/mnt/books/novels
```

Compose 分别只读挂载至 `/comics` 和 `/novels`，并设置后端环境变量 `MEDIAHUB_COMICS_DIR`、`MEDIAHUB_NOVELS_DIR`。目录必须已存在，Compose 不会自动创建空目录。根据自己的实际目录修改路径后再启动。

本地开发在启动 `api/scripts/dev.ps1` 前，将这两个 `*_DIR` 环境变量设为本机已有目录的绝对路径。未配置目录时仍可浏览已入库内容，刷新按钮禁用。不支持从页面传入扫描路径。

## 接口

以下接口沿用现有浏览器会话 / API Key 鉴权，`kind` 为 `comics` 或 `novels`：

- `GET /api/v1/reading/:kind?query=&format=&sort=title&page=1`：查询 SQLite，每页 36 条。排序支持 `title` / `recent` / `modified`。
- `GET /api/v1/reading/:kind/status`：目录是否配置、任务状态、最近成功刷新时间及文件数。
- `POST /api/v1/reading/:kind/refresh`：开始扫描，返回 202；同类任务运行中返回 409。

仅新增 `reading_items`、`reading_scans` 表及索引，不改动现有账号、配置、订阅或源文件。

## 界面示例

访问 `/?readingDemo=1#/reading` 可预览虚构书库。该模式明确显示预览提示，搜索、筛选和刷新均只操作内存示例，不调用书库接口、不扫描目录、不写入 SQLite。普通 `/#/reading` 始终读取真实数据库。
