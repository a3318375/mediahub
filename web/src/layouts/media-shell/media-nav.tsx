import { MediaBrand } from "@/components/media-brand"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useWorkspace } from "./workspace-context"
import { navigationSections, type NavigationLink } from "./navigation-data"

function navigateFromLink(
  event: React.MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate: (path: string) => void
) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  onNavigate(path)
}

export function MediaHomeLink({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          tooltip="Emby 看板"
          render={
            <a
              href="/emby"
              aria-label="MediaHub 首页"
              onClick={(event) => navigateFromLink(event, "/emby", onNavigate)}
            />
          }
        >
          <MediaBrand />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function NavigationLinkItem({
  link,
  activePath,
  onNavigate,
}: {
  link: NavigationLink
  activePath: string
  onNavigate: (path: string) => void
}) {
  const LinkIcon = link.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={activePath === link.path}
        tooltip={link.title}
        className="text-base [&_svg]:size-5"
        render={
          <a
            href={link.path}
            aria-current={activePath === link.path ? "page" : undefined}
            onClick={(event) => navigateFromLink(event, link.path, onNavigate)}
          />
        }
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center">
          <LinkIcon />
        </span>
        <span>{link.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function MediaNav({
  activePath,
  onNavigate,
}: {
  activePath: string
  onNavigate: (path: string) => void
}) {
  const { menus } = useWorkspace()

  return navigationSections.map(({ title, links }) => {
    const visibleLinks = links.filter((link) => menus[`menus.${link.id}`] !== false)
    if (!visibleLinks.length) return null

    return (
      <SidebarGroup key={title}>
        <SidebarGroupLabel>{title}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {visibleLinks.map((link) => (
              <NavigationLinkItem
                key={link.path}
                link={link}
                activePath={activePath}
                onNavigate={onNavigate}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  })
}
