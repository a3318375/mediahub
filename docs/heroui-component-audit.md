# HeroUI 组件审查与自定义组件清单

审查日期：2026-10-27。维护范围为 `hero/`（React 19、Vite、TypeScript、Tailwind v4、HeroUI v3）。`web/` 已按用户指令标记为放弃维护，不迁移、不再更新。

## 官方依据与限制

本次通过官方 `@heroui/react-mcp@1.1.3` 的 STDIO 协议调用 `list_components`、`get_component_docs` 和 `get_docs`，读取 Button、Input、TextArea、Checkbox、Switch、RadioGroup、Tabs、Select、ComboBox、ListBox、ProgressBar、Slider、Disclosure、Popover、Toast、Table、Skeleton、Alert、Avatar、Chip、Card、Link 等相关文档，以及 Styling 指南。组件组合和属性以 MCP 返回内容及项目已安装的 3.2.6 类型兼容性为依据。

官方 Figma Kit：https://www.figma.com/community/file/1546526812159103429/heroui-figma-kit-v3 。本次尝试读取时被 robots.txt 限制，未能取得画布、节点和尺寸；因此**没有声称逐项对齐 Figma**。实际依据为 MCP 官方组件/样式文档、HeroUI 主题令牌和现有业务结构。

## 已统一的基础组件

| 原实现 | 当前实现 |
| --- | --- |
| 原生操作按钮、封面按钮和阅读热区 | HeroUI Button；保留业务布局与无障碍名称 |
| 原生链接 | HeroUI Link |
| 普通输入、多行文本输入 | HeroUI Input、TextArea |
| 登录复选框、设置开关 | HeroUI Checkbox、Switch |
| 匹配规则单选卡片 | HeroUI RadioGroup、Radio |
| 来源与播出分类手写 tablist | 公共 FilterTabs（HeroUI Tabs） |
| 原生下拉 | 公共 AppSelect（HeroUI Select、ListBox） |
| 手写菜单搜索和键盘索引 | HeroUI ComboBox、Input、ListBox |
| 原生进度与 range 滑块 | AppProgress、AppSlider（HeroUI ProgressBar、Slider） |
| 原生 details / summary | AppDisclosure（HeroUI Disclosure） |
| 通知 details 弹层 | HeroUI Popover |
| 主界面和 dashboard 示例手写 Toast | HeroUI Toast.Provider、toast |
| 日志及 dashboard 示例表格 | HeroUI Table |
| 探索页占位块 | HeroUI Skeleton |
| 共用提示 Notice | HeroUI Alert |
| 示例头像和涨跌标记 | HeroUI Avatar、Chip |

已清理会覆盖新控件的旧搜索弹层、单选和开关样式，并补充封面、透明翻页区、音乐滑块的业务布局适配。普通段落、图片、网格、图表和内容容器保留语义 HTML，不能仅因为它们是 HTML 就强行替换成不匹配的控件。

## 保留的自定义展示与交互：20 个命名组件

统计口径：具有产品专用展示、布局或交互的命名组件；不把每个页面、每个内部函数或 HeroUI 公共包装都算成重新设计的基础控件。以下组件的按钮、表单、弹层等仍组合 HeroUI。

| # | 组件名 | 源文件（相对 hero/src） | 自定义内容与保留原因 |
| --- | --- | --- | --- |
| 1 | WorkspaceSidebar | layouts/WorkspaceChrome.tsx | 按媒体业务分组的侧边导航；MCP 组件列表没有完整 Sidebar。操作使用 Button。 |
| 2 | WorkspaceHeader | layouts/WorkspaceChrome.tsx | 当前工作区标题、导航和服务状态的业务布局；搜索、通知、头像使用 HeroUI。 |
| 3 | Empty | components/media/MediaUI.tsx | 媒体空状态、图标、解释和操作区域；没有对应的完整 Empty 组件。 |
| 4 | Poster | components/media/MediaUI.tsx | 媒体封面、评分、排名及快捷操作；容器 Card、操作 Button，媒体信息排布自定义。 |
| 5 | PosterGrid | components/media/MediaUI.tsx | 海报响应式网格；没有媒体网格组件。 |
| 6 | MediaImage | components/media/MediaUI.tsx | 带授权的图片代理、Object URL 生命周期、失败占位；不是普通 Avatar。 |
| 7 | HomeRecommendations | components/media/HomeRecommendations.tsx | 首页推荐数据与海报组合；复用 PosterGrid、Notice。 |
| 8 | EmbyArtwork | pages/emby/Emby.tsx | Emby 授权图片与媒体库封面占位；没有对应业务组件。 |
| 9 | AnimeCard | pages/anime/AnimeCard.tsx | 动漫订阅状态、字幕组及更新信息组合；Card、Chip、Button 为 HeroUI。 |
| 10 | Calendar | pages/tv/Calendar.tsx | 播出事件月历与每日电视剧条目；HeroUI Calendar 是日期选择器，不直接覆盖此事件看板。 |
| 11 | SourceTags | pages/tv/TVEditor.tsx | 来源标准化、去重、数量限制、优先级调整；基于 Chip、Button、Input。 |
| 12 | DirectoryPicker | components/ui/ManagementUI.tsx | 115 远程目录导航、异步加载及路径选择；基于 Modal、Button。 |
| 13 | ReadingCover | pages/reading/ReadingReader.tsx | 本地书库封面和无封面书脊排版。 |
| 14 | ReadingReader | pages/reading/ReadingReader.tsx | 漫画画布、透明翻页区、小说排版和阅读进度；控件使用 Button、AppSelect。 |
| 15 | Cover | pages/reading/Comics.tsx | 远程画廊封面懒加载与授权图片读取。 |
| 16 | GalleryGrid | pages/reading/Comics.tsx | 画廊标题、分类和日期的封面网格；操作使用 Button。 |
| 17 | GalleryDetail | pages/reading/Comics.tsx | 画廊元数据、命名空间标签及阅读操作；弹层和按钮均为 HeroUI。 |
| 18 | Artwork | pages/music/MusicCenter.tsx | 原创演示音乐封面图形；非表单或基础控件。 |
| 19 | SalesChart | mocks/charts.tsx | 示例销售柱状图；MCP 列表没有 Chart，保留 SVG 图表。 |
| 20 | TrafficChart | mocks/charts.tsx | 示例流量折线图；MCP 列表没有 Chart，保留 SVG 图表。 |

## HeroUI 组合包装，不计入上述 20 个

`AppSelect`、`AppDisclosure`、`AppProgress`、`AppSlider`、`Overlay`、`FilterTabs`、`Field`、`Toggle`、`SelectField`、`Notice`、`HeaderSearch`、`MediaUserMenu`、示例 `Avatar`、`Growth`、`SecretField`、`DirectoryField` 共 16 项。它们统一参数、认证或业务数据，交互基础由 HeroUI 负责。

`HeroUISmoke` 是显式查询参数开启的开发验证组件，不是产品自定义基础控件。

## 页面与业务表单

其余组件为页面或业务表单组合，包括登录、探索、媒体详情、资源搜索、动漫订阅与编辑步骤、追剧列表与编辑、下载对话框与任务、日志、媒体处理、书库及漫画来源、音乐详情/队列和全局设置各分类。这些界面仍需自己的字段和业务结构，但不再直接实现原生基础控件；与上表中的专用展示组件及 HeroUI 组合使用。

## 验证与未完成核验

- 生产构建和 TypeScript 检查通过。
- 前端 34 项测试通过，包含新增 AST 规范检查：维护前端不能直接引入原生 button、a、input、textarea、select、details、progress、table、dialog。将来确需原生特例时，须记录官方缺口并调整检查范围。
- 实际前端 5174、后端 18080、前端代理健康检查正常；后端日志确认使用 `D:\tmp\mediahub\data`。
- 未调用刷新书库、保存配置、删除或初始化数据等业务操作。后台任务沿用进程暂停状态。
- 浏览器工具恢复后，已在真实 5174 页面登录并完成 12 个导航入口首屏检查，以及排序、设置下拉、通知/搜索、订阅弹窗、日志表格、下载任务折叠区、音乐滑块和登录/Toast 的专项检查。完成 390px 窄屏和深色排序菜单检查。详见 `heroui-visual-acceptance.md`。未通过创建、保存、删除记录验证写操作，也未配置 Cookie 来验证 ExHentai 已配置分支。
