import type { ReactNode } from "react"
import { SearchX } from "lucide-react"
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from "./controls"
import { Badge } from "@/components/ui/badge"
type Heading = { title: string; description?: string; action?: ReactNode }
export function PageHeading({ title, description, action }: Heading) {
  return (
    <div className="page-heading">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function SectionHeading({ title, description, action }: Heading) {
  return (
    <div className="section-heading">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function WorkspaceTabs({
  label,
  items,
  value,
  onChange,
  appearance,
  defaultValue,
}: {
  label: string
  items: { id: string; label: string; icon?: ReactNode; content: ReactNode }[]
  value?: string
  defaultValue?: string
  onChange?: (s: string) => void
  appearance?: "pill" | "underline"
}) {
  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? items[0]?.id}
      onValueChange={onChange}
    >
      <TabsList aria-label={label} appearance={appearance} wrap>
        {items.map((i) => (
          <TabsTrigger key={i.id} value={i.id}>
            {i.icon}{i.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((i) => (
        <TabsContent key={i.id} value={i.id}>
          {i.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
export function NoResults({
  title = "没有找到作品",
  description = "试试更换关键词或清除筛选。",
  reset,
}: {
  title?: string
  description?: string
  reset?: () => void
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true"><SearchX /></span>
      <strong>{title}</strong>
      <p className="text-sm text-muted-foreground">{description}</p>
      {reset && (
        <Button variant="outline" onClick={reset}>
          清除筛选
        </Button>
      )}
    </div>
  )
}
export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "info" | "success" | "warning" | "danger"
}) {
  return (
    <Badge
      data-tone={tone}
      variant={tone === "danger" ? "destructive" : "secondary"}
    >
      {children}
    </Badge>
  )
}
export function MetricCard({
  label,
  value,
  suffix,
  context,
}: {
  compact?: boolean
  label: string
  value?: number
  suffix: string
  context: string
}) {
  return (
    <div className="panel grid gap-2">
      <span className="metric-label">{label}</span>
      <strong className="metric-number">
        {value ?? "—"}
        <span className="metric-unit">{suffix}</span>
      </strong>
      <small className="muted">{context}</small>
    </div>
  )
}
