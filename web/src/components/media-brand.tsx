import { Clapperboard } from "lucide-react"

export function MediaBrand() {
  return (
    <span className="media-brand flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="media-brand-mark flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Clapperboard className="size-4" />
      </span>
      <span className="media-brand-type grid min-w-0 text-left text-sm leading-tight">
        <strong lang="en" className="truncate font-medium">MediaHub</strong>
        <small className="truncate text-xs text-muted-foreground">媒体中心</small>
      </span>
    </span>
  )
}
