import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth-api"
import { MediaHomeLink, MediaNav } from "./media-nav"
import { ProfileSheet } from "./profile-sheet"

export function MediaSidebar({ activePath, onNavigate, user, onLogout }: {
  activePath: string
  onNavigate: (path: string) => void
  user: AuthUser
  onLogout: () => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  function handleNavigate(path: string) {
    onNavigate(path)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <MediaHomeLink onNavigate={handleNavigate} />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="主导航" className="group-data-[collapsible=icon]:overflow-y-auto">
        <MediaNav activePath={activePath} onNavigate={handleNavigate} />
      </SidebarContent>
      <SidebarFooter className="pb-[max(--spacing(2),env(safe-area-inset-bottom))]">
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <ProfileSheet user={user} onLogout={onLogout} onNavigate={handleNavigate} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label="通过边缘切换侧边栏" title="切换侧边栏" />
    </Sidebar>
  )
}
