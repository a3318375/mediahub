import type { ReactNode } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "./controls"
import { PageHeading, WorkspaceTabs } from "./ui"

export function VisibilityButton({
  label,
  visible,
  toggle,
}: {
  label: string
  visible: boolean
  toggle: () => void
}) {
  const action = `${visible ? "隐藏" : "显示"}${label}`
  const Icon = visible ? EyeOff : Eye
  return (
    <Button
      type="button"
      variant="ghost"
      className="icon-button visibility-button"
      aria-label={action}
      title={action}
      onClick={toggle}
    >
      <Icon size={18} aria-hidden="true" />
    </Button>
  )
}

const categories = [
  { id: "basic", label: "基础配置" },
  { id: "menus", label: "菜单管理" },
  { id: "organize", label: "媒体整理" },
  { id: "strm", label: "STRM 生成" },
  { id: "scraping", label: "元数据刮削" },
  { id: "rules", label: "搜索规则" },
  { id: "search", label: "资源搜索" },
  { id: "account", label: "账号与安全" },
  { id: "keys", label: "API 密钥" },
  { id: "notifications", label: "通知与机器人" },
] as const

export function SettingsLayout({ panels }: {
  panels: Record<typeof categories[number]["id"], ReactNode>
}) {
  return (
    <>
      <PageHeading title="全局设置" />
      <div className="settings-tabs">
        <WorkspaceTabs label="设置分类" appearance="underline" items={categories.map(category => ({
          ...category, content: panels[category.id],
        }))} />
      </div>
    </>
  )
}
