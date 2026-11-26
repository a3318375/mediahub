import {useWorkspace} from "./workspace-context"
import { BellIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function NotificationsMenu() {
  const {activity}=useWorkspace()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="rounded-full"
            aria-label="打开通知"
            title="通知"
          />
        }
      >
        <BellIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>通知</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          {activity.length?activity.map((text,i)=><p key={i}>{text}</p>):'暂无新通知'}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
