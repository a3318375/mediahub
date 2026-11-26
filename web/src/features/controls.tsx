import {
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react"
import { cn } from "cn"
import { Button as UiButton } from "@/components/ui/button"
import { Input as UiInput } from "@/components/ui/input"
import { Textarea as UiTextarea } from "@/components/ui/textarea"
import { Switch as UiSwitch } from "@/components/ui/switch"
import * as List from "@/components/ui/select"
import * as Tab from "@/components/ui/tabs"
import * as Modal from "@/components/ui/dialog"
import { Dialog as Primitive } from "@base-ui/react/dialog"
import { Progress as UiProgress, ProgressValue } from "@/components/ui/progress"
import { Badge as UiBadge } from "@/components/ui/badge"
import {
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"

export function Button({
  loading,
  disabled,
  variant,
  ...props
}: Omit<ComponentProps<typeof UiButton>, "variant"> & {
  loading?: boolean
  variant?: ComponentProps<typeof UiButton>["variant"] | "danger" | "primary"
}) {
  return (
    <UiButton
      type="button"
      variant={
        variant === "danger"
          ? "destructive"
          : variant === "primary"
            ? "default"
            : variant
      }
      aria-busy={loading}
      disabled={disabled || loading}
      {...props}
    />
  )
}

type FieldProps = { label?: string; description?: string; error?: string }
function Field({
  label,
  description,
  error,
  children,
  id,
}: FieldProps & { children: ReactNode; id: string }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {(error || description) && (
        <small
          id={id + "-hint"}
          role={error ? "alert" : undefined}
          className={error ? "text-destructive" : "text-muted-foreground"}
        >
          {error || description}
        </small>
      )}
    </div>
  )
}
export function Input({
  label,
  description,
  error,
  id,
  ...props
}: FieldProps & ComponentProps<"input">) {
  const generated = useId()
  const key = id ?? generated
  return (
    <Field {...{ label, description, error, id: key }}>
      <UiInput
        id={key}
        aria-invalid={Boolean(error)}
        aria-describedby={error || description ? key + "-hint" : undefined}
        {...props}
      />
    </Field>
  )
}
export function Textarea({
  label,
  description,
  error,
  ...props
}: FieldProps & ComponentProps<"textarea">) {
  const id = useId()
  return (
    <Field {...{ label, description, error, id }}>
      <UiTextarea
        id={id}
        aria-describedby={error || description ? id + "-hint" : undefined}
        {...props}
      />
    </Field>
  )
}
export function SearchField({
  onValueChange, label, value, disabled, id, description, error, className, ...props
}: ComponentProps<typeof Input> & { onValueChange: (s: string) => void }) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <Field id={inputId} label={label} description={description} error={error}>
      <div className="search-field">
        <Search className="search-field-icon" aria-hidden="true" />
        <UiInput
          {...props}
          id={inputId}
          value={value}
          type="search"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error || description ? inputId + "-hint" : undefined}
          className={cn("pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden", className)}
          onChange={event => onValueChange(event.target.value)}
        />
        {value && (
          <Button size="icon-sm" variant="ghost" className="search-field-clear" aria-label="清空搜索" disabled={disabled}
            onClick={() => {
              onValueChange("")
              document.getElementById(inputId)?.focus()
            }}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </Field>
  )
}
export function Switch({
  label,
  description,
  ...props
}: ComponentProps<typeof UiSwitch> & FieldProps) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <UiSwitch id={id} {...props} />
      {label && <label htmlFor={id}>{label}</label>}
      {description && <small>{description}</small>}
    </div>
  )
}
type Options = {
  value: string
  label: string
  disabled?: boolean
  accessory?: ReactNode
}[]
type Choice = {
  value: string
  options: Options
  onValueChange: (s: string) => void
  label?: string
  className?: string
}
export function Select({
  value,
  options,
  onValueChange,
  label,
  className,
  placeholder,
  disabled,
  description,
}: Choice & {
  placeholder?: string
  disabled?: boolean
  description?: string
}) {
  const id = useId()
  return (
    <Field {...{ label, description, id }}>
      <List.Select
        value={value}
        items={options}
        onValueChange={(s) => {
          if (s !== null) onValueChange(s)
        }}
        disabled={disabled}
      >
        <List.SelectTrigger id={id} className={"w-full " + (className || "")}>
          <List.SelectValue placeholder={placeholder} />
        </List.SelectTrigger>
        <List.SelectContent>
          {options.map((o) => (
            <List.SelectItem
              key={o.value}
              value={o.value}
              disabled={o.disabled}
            >
              {o.label}
            </List.SelectItem>
          ))}
        </List.SelectContent>
      </List.Select>
    </Field>
  )
}
export function SegmentedControl({
  value,
  options,
  onValueChange,
  label,
  className,
  onOptionIntent,
}: Choice & { onOptionIntent?: (s: string) => void }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={"segmented-control " + (className || "")}
    >
      {options.map((o) => (
        <Button
          key={o.value}
          size="sm"
          aria-pressed={value === o.value}
          variant="ghost"
          onFocus={() => onOptionIntent?.(o.value)}
          onPointerEnter={() => onOptionIntent?.(o.value)}
          onClick={() => onValueChange(o.value)}
        >
          {o.label}
          {o.accessory}
        </Button>
      ))}
    </div>
  )
}
export const Dialog = Modal.Dialog
export function DialogTrigger({
  children,
}: {
  children: ReactElement
  asChild?: boolean
}) {
  return <Primitive.Trigger render={children} />
}
export function DialogContent({
  title,
  description,
  children,
  className,
  ...props
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
  "aria-describedby"?: string
  finalFocus?: ComponentProps<typeof Modal.DialogContent>["finalFocus"]
}) {
  return (
    <Modal.DialogContent
      {...props}
      className={
        "feature-dialog max-h-[90dvh] overflow-y-auto " + (className || "")
      }
    >
      <Modal.DialogHeader>
        <Modal.DialogTitle>{title}</Modal.DialogTitle>
        {description && (
          <Modal.DialogDescription>{description}</Modal.DialogDescription>
        )}
      </Modal.DialogHeader>
      {children}
    </Modal.DialogContent>
  )
}

export function ConfirmDeleteDialog({
  title, description, label, busy, error, onCancel, onConfirm, finalFocus, children,
}: {
  title: string; description: string; label: string; busy: boolean; error: string;
  onCancel: () => void; onConfirm: () => void; children?: ReactNode;
  finalFocus: () => HTMLElement | null;
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onCancel() }}>
      <DialogContent title={title} description={description} finalFocus={finalFocus}>
        {children}
        {error && <p role="alert">{error}</p>}
        <Modal.DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>取消</Button>
          <Button variant="destructive" loading={busy} onClick={onConfirm}>{busy ? "正在删除…" : label}</Button>
        </Modal.DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Tabs({
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Tab.Tabs>, "onValueChange"> & {
  onValueChange?: (s: string) => void
}) {
  return (
    <Tab.Tabs {...props} onValueChange={(v) => onValueChange?.(String(v))} />
  )
}
export function TabsList({
  appearance,
  wrap,
  ...props
}: ComponentProps<typeof Tab.TabsList> & {
  appearance?: "pill" | "underline"
  wrap?: boolean
}) {
  return (
    <Tab.TabsList
      {...props}
      variant={appearance === "underline" ? "line" : appearance}
      className={
        "max-w-full justify-start " +
        (wrap ? "h-auto! flex-wrap" : "overflow-x-auto")
      }
    />
  )
}
export const TabsTrigger = Tab.TabsTrigger
export function TabsContent({
  forceMount,
  ...props
}: ComponentProps<typeof Tab.TabsContent> & { forceMount?: boolean }) {
  return <Tab.TabsContent keepMounted={forceMount} {...props} />
}
export function Progress({
  showValue,
  ...props
}: ComponentProps<typeof UiProgress> & { showValue?: boolean }) {
  return <UiProgress {...props}>{showValue && <ProgressValue />}</UiProgress>
}
export function Badge({ children }: { size?: "sm"; children: ReactNode }) {
  return <UiBadge variant="secondary">{children}</UiBadge>
}
export function Slider({
  label,
  value,
  min,
  max,
  onValueChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onValueChange: (n: number) => void
}) {
  return (
    <label className="grid gap-2">
      {label} · {value}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onValueChange(e.target.valueAsNumber)}
      />
    </label>
  )
}
type Column<T> = {
  key: string
  label: string
  sortable?: boolean
  numeric?: boolean
  width?: string
  render?: (value: unknown, row: T) => ReactNode
}
export function SortableDataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  rowKey,
  caption,
  emptyMessage = "暂无记录",
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: keyof T
  caption: string
  emptyMessage?: string
}) {
  const [sort, setSort] = useState({ key: "", asc: true })
  const sorted = sort.key
    ? [...rows].sort(
        (a, b) =>
          String(a[sort.key] ?? "").localeCompare(
            String(b[sort.key] ?? ""),
            "zh-CN",
            { numeric: true }
          ) * (sort.asc ? 1 : -1)
      )
    : rows
  return (
    <Table aria-label={caption}>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead
              key={c.key}
              style={{ width: c.width }}
              data-numeric={c.numeric || undefined}
              aria-sort={
                sort.key === c.key
                  ? sort.asc
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              {c.sortable === false ? (
                c.label
              ) : (
                <button type="button" className="table-sort"
                  onClick={() =>
                    setSort({
                      key: c.key,
                      asc: sort.key !== c.key || !sort.asc,
                    })
                  }
                >
                  {c.label}
                  {sort.key !== c.key ? <ArrowUpDown aria-hidden="true" /> :
                    sort.asc ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
                </button>
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={String(row[rowKey])}>
            {columns.map((c) => (
              <TableCell key={c.key} data-numeric={c.numeric || undefined}>
                {c.render
                  ? c.render(row[c.key], row)
                  : String(row[c.key] ?? "—")}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {!sorted.length && (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="py-8 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
