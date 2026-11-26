import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { dayKey } from "./model"

type Props = {
  value: Date
  todayDate: Date
  showToday?: boolean
  locale: string
  weekStartsOn: number
  onChange: (day: Date) => void
  dayDetails: (day: Date) => { label: string; content: ReactNode } | void
}
function dayInMonth(date: Date, offset: number) {
  const start = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12)
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  start.setDate(Math.min(date.getDate(), last))
  return start
}
export function Calendar({
  value,
  todayDate,
  onChange,
  dayDetails,
  showToday,
  locale,
  weekStartsOn,
}: Props) {
  const [focus, setFocus] = useState(value)
  const [month, setMonth] = useState(value)
  const grid = useRef<HTMLDivElement>(null)
  const moveFocus = useRef(false)
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  useLayoutEffect(() => {
    if (moveFocus.current) {
      grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
      moveFocus.current = false
    }
  }, [focus])
  function view(day: Date) {
    setMonth(day)
    setFocus(day)
  }
  function keyDown(e: KeyboardEvent, day: Date) {
    const weekDay = (day.getDay() - weekStartsOn + 7) % 7
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekDay,
      End: 6 - weekDay,
    }
    let target: Date
    if (e.key === "PageUp" || e.key === "PageDown")
      target = dayInMonth(
        day,
        (e.key === "PageUp" ? -1 : 1) * (e.shiftKey ? 12 : 1)
      )
    else if (e.key in offsets)
      target = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate() + offsets[e.key],
        12
      )
    else return
    e.preventDefault()
    moveFocus.current = true
    view(target)
  }
  const heading = first.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  })
  return (
    <section className="grid gap-3" aria-label="播出日历">
      <header className="flex items-center justify-between gap-2">
        <strong>{heading}</strong>
        <div className="flex gap-1">
          {showToday && (
            <Button
              variant="ghost"
              onClick={() => {
                view(todayDate)
                onChange(todayDate)
              }}
            >
              今天
            </Button>
          )}
          <Button variant="outline" size="icon" aria-label="上个月" title="上个月" onClick={() => view(dayInMonth(focus, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="下个月" title="下个月" onClick={() => view(dayInMonth(focus, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <div
          role="grid"
          aria-label={heading}
          ref={grid}
          className="schedule-grid grid gap-1"
        >
          <div role="row" className="grid grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => (
              <small role="columnheader" className="schedule-weekday" key={i}>
                {"一二三四五六日"[(weekStartsOn + 6 + i) % 7]}
              </small>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, week) => (
            <div key={week} role="row" className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, i) => {
                const day = new Date(
                  first.getFullYear(),
                  first.getMonth(),
                  1 - offset + week * 7 + i,
                  12
                )
                const details = dayDetails(day)
                return (
                  <button
                    key={dayKey(day)}
                    type="button"
                    role="gridcell"
                    aria-selected={dayKey(value) === dayKey(day)}
                    aria-current={
                      dayKey(todayDate) === dayKey(day) ? "date" : undefined
                    }
                    tabIndex={dayKey(focus) === dayKey(day) ? 0 : -1}
                    data-outside={day.getMonth() !== month.getMonth()}
                    aria-label={
                      day.toLocaleDateString(locale, { dateStyle: "full" }) +
                      (details ? "，" + details.label : "")
                    }
                    onKeyDown={(e) => keyDown(e, day)}
                    onClick={() => {
                      view(day)
                      onChange(day)
                    }}
                    className="schedule-day"
                  >
                    <span className="schedule-day-number">{day.getDate()}</span>
                    {details?.content}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
