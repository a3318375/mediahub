import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { searchableNavigation } from "./navigation-data"
import { useWorkspace } from "./workspace-context"
export function HeaderSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const { menus } = useWorkspace()
  const results = searchableNavigation.filter(
    (l) =>
      menus["menus." + l.id] !== false &&
      (l.title + l.section).includes(query.trim())
  )
  function select(path: string) {
    setOpen(false)
    onNavigate(path)
  }
  function show() {
    setQuery("")
    setIndex(0)
    setOpen(true)
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        show()
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
  return (
    <>
      <Button variant="outline" className="media-menu-search" aria-label="搜索菜单" onClick={show}>
        <Search />
        <span className="hidden sm:inline">搜索菜单</span>
        <kbd className="hidden text-xs text-muted-foreground md:inline">
          Ctrl K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>搜索菜单</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="菜单名称"
            placeholder="输入菜单名称…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[index])
                select(results[index].path)
              if (
                results.length &&
                (e.key === "ArrowDown" || e.key === "ArrowUp")
              ) {
                e.preventDefault()
                setIndex(
                  (i) =>
                    (i + (e.key === "ArrowDown" ? 1 : -1) + results.length) %
                    results.length
                )
              }
            }}
          />
          <div className="grid max-h-[55dvh] gap-1 overflow-y-auto">
            {results.map((l, i) => (
              <Button
                key={l.id}
                className="justify-start"
                variant={i === index ? "secondary" : "ghost"}
                onPointerMove={() => setIndex(i)}
                onClick={() => select(l.path)}
              >
                <l.icon />
                {l.title}
              </Button>
            ))}
            {!results.length && <p>没有匹配的菜单</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
