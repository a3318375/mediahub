import { ChevronRight } from "lucide-react"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { HeaderSearch } from "./header-search"
import { NotificationsMenu } from "./notifications-menu"
import { ThemeToggle } from "./theme-toggle"

export function MediaHeader({ title, section, onNavigate }: {
  title: string
  section?: string
  onNavigate: (path: string) => void
}) {
  const { isMobile, open, openMobile } = useSidebar()
  const expanded = isMobile ? openMobile : open
  return (
    <header className="media-header">
      <nav aria-label="顶部导航">
        <SidebarTrigger aria-label="切换侧边栏" aria-expanded={expanded} title={expanded ? "收起侧边栏" : "展开侧边栏"} />
        <div className="media-location">
          {section && <><span>{section}</span><ChevronRight aria-hidden="true" /></>}
          <strong>{title}</strong>
        </div>
        <div className="media-header-tools">
          <HeaderSearch onNavigate={onNavigate} />
          <ThemeToggle />
          <NotificationsMenu />
        </div>
      </nav>
    </header>
  )
}
