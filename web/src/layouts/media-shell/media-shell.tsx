import type { ReactNode } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth-api"
import { MediaHeader } from "./media-header"
import { MediaSidebar } from "./media-sidebar"
import { searchableNavigation } from "./navigation-data"
import "./media-shell.css"

export function MediaShell({ user, activePath, title, onNavigate, onLogout, children }: {
  user: AuthUser
  activePath: string
  title: string
  onNavigate: (path: string) => void
  onLogout: () => void
  children: ReactNode
}) {
  const section = searchableNavigation.find(link => link.path === activePath)?.section
  return (
    <TooltipProvider delay={150}>
      <SidebarProvider>
        <MediaSidebar activePath={activePath} onNavigate={onNavigate} user={user} onLogout={onLogout} />
        <SidebarInset className="media-inset min-w-0">
          <MediaHeader title={title} section={section} onNavigate={onNavigate} />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
