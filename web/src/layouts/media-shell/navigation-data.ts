import {
  BookOpen,
  BookText,
  CalendarDays,
  Clapperboard,
  Compass,
  LibraryBig,
  Music2,
  Search,
  ScrollText,
  Settings,
  Trophy,
  Workflow,
  type LucideIcon,
} from "lucide-react"
export type NavigationLink = {
  id: string
  title: string
  path: string
  icon: LucideIcon
}
export const navigationSections: { title: string; links: NavigationLink[] }[] =
  [
    {
      title: "工作台",
      links: [
        { id: "emby", title: "Emby 看板", path: "/emby", icon: LibraryBig },
        { id: "search", title: "搜索历史", path: "/search", icon: Search },
      ],
    },
    {
      title: "媒体",
      links: [
        {
          id: "discover",
          title: "影视探索",
          path: "/discover/explore",
          icon: Compass,
        },
        {
          id: "rankings",
          title: "榜单推荐",
          path: "/discover/rankings",
          icon: Trophy,
        },
        {
          id: "anime",
          title: "动漫订阅",
          path: "/discover/anime",
          icon: Clapperboard,
        },
        {
          id: "calendar",
          title: "追剧日历",
          path: "/discover/calendar",
          icon: CalendarDays,
        },
        { id: "music", title: "音乐中心", path: "/music", icon: Music2 },
        { id: "comics", title: "漫画", path: "/comics", icon: BookOpen },
        { id: "novels", title: "小说", path: "/novels", icon: BookText },
      ],
    },
    {
      title: "管理",
      links: [
        {
          id: "processing",
          title: "媒体处理",
          path: "/tools/processing",
          icon: Workflow,
        },
        {
          id: "logs",
          title: "日志中心",
          path: "/tools/logs",
          icon: ScrollText,
        },
        {
          id: "settings",
          title: "全局设置",
          path: "/settings",
          icon: Settings,
        },
      ],
    },
  ]
export const searchableNavigation = navigationSections.flatMap((s) =>
  s.links.map((l) => ({ ...l, section: s.title }))
)
export const menuSources = searchableNavigation
  .filter((l) => !["emby", "settings"].includes(l.id))
  .map((l) => ({ id: l.id, label: l.title }))
