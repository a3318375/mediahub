# MediaHub uiarc

MediaHub 的独立 UIArc 前端预览。在浏览器中打开 `dist/index.html` 即可离线使用。切换到「影视探索」可试用带条件标签的筛选工具栏。

## 页面

- **工作台**：Emby 看板、媒体库与继续观看、搜索历史和资源结果。
- **媒体**：影视探索、榜单、作品详情、收藏、动漫订阅及自动下载、追剧日历、音乐中心、漫画和小说。
- **管理**：下载任务、媒体整理、STRM、元数据刮削、日志导出和全局设置。
- 顶部可搜索菜单、切换主题、查看活动和演示账号。音乐中心可以播放内嵌的原创试听音轨，书库提供示例章节和进度记录。

订阅、下载状态、阅读进度和配置使用独立的浏览器存储。外部来源、凭据、后台计划和文件操作均为示例，页面无需连接 Emby、TMDB、115 或 MediaHub 服务。

## 2026-11-11 开发记录

- **独立前端**：以 HeroUI 的 12 个主菜单为参照，使用 UIArc 组件重做布局。Emby 看板、搜索、订阅、音乐、阅读和管理页面共用本地示例数据。早期的 `cinema/` 和 `arc-demo/` 原型已清理。
- **影视探索与榜单**：来源用下划线标签，作品类型用胶囊切换，已选条件显示为可移除的标签。探索页在 1920 像素宽的窗口中一行可放 9 张海报。桌面端移入海报或使用键盘聚焦时显示搜索和收藏，触屏上常显。
- **作品详情**：海报点开是独立页面，放大的海报、年份、片长、简介和演职员都放在同一背景中。从详情返回会恢复列表的筛选和滚动位置。《星际穿越》示例包含演员照片及角色名。
- **书库、追剧和设置**：漫画与小说采用书架、作品详情、独立阅读页的流程。追剧默认显示订阅卡片，按需展开月历。设置中的凭据和 API 密钥使用眼睛图标切换显隐。
- **验证**：通过 TypeScript 与生产构建，浏览器离线检查覆盖 12 个主页面。影视探索和详情额外检查了 375 至 1920 像素之间的 7 种窗口宽度，以及键盘切换、快捷操作和返回列表。

## 本地开发

在本目录使用 Node.js 22.12+ 或 24。

```powershell
npm ci
npm run dev
npm run build
```

构建产物 `dist/index.html` 内嵌脚本、样式、字体、海报和音频，可直接双击打开。UIArc 公共 Registry 组件位于 `src/arc/`，部分界面文案做了中文化。[UIArc 组件的 MIT 许可证](src/arc/LICENSE) 随源码保留。电影图片来自 TMDB。

## 《星际穿越》演员照片

照片来自 Wikimedia Commons，以缩略图显示，页面按 3:4 裁切。

- 马修·麦康纳，由 All-Pro Reels 拍摄。[原图](https://commons.wikimedia.org/wiki/File:Matthew_McConaughey_2019_(48648344772)_(cropped).jpg) · [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)
- 安妮·海瑟薇，由 Elena Ternovaja 拍摄。[原图](https://commons.wikimedia.org/wiki/File:Anne_Hathaway_at_Berlinale_2023_(close-up).jpg) · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- 杰西卡·查斯坦，由 Philip Romano 拍摄。[原图](https://commons.wikimedia.org/wiki/File:Jessica_Chastain.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
