import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { LoginPage } from "@/components/login-page"
import { MediaShell } from "@/layouts/media-shell/media-shell"
import { WorkspaceContext } from "@/layouts/media-shell/workspace-context"
import {
  menuSources,
  searchableNavigation,
} from "@/layouts/media-shell/navigation-data"
import {
  getAccessToken,
  clearAccessToken,
  getCurrentUser,
  logout,
  storeAccessToken,
  type AuthUser,
} from "@/lib/auth-api"
import { MediaDetailContext } from "@/components/media-detail-context"
import {
  createLiveApi,
  liveIdentity,
  presentLiveMedia,
  requestError,
  type LiveUser,
} from "@/features/live-api"
import { LiveDiscovery, Rankings, MediaDetail } from "@/features/catalog"
import { LiveSeriesCalendar, LiveTVEditor } from "@/features/live-calendar"
import { LiveTVEpisodes } from "@/features/live-tv-episodes"
import {
  mediaContextFromRecord,
  type DownloadMediaContext,
} from "@/lib/download-api"
import type { SettingValue } from "@/lib/settings-api"
import type { TVDraft } from "@/features/lib/media-service"
import type { Media } from "@/features/model"
import { Button } from "@/components/ui/button"
import "@/features/workspace.css"

const LiveSettings = lazy(() =>
  import("@/features/live-settings").then((m) => ({ default: m.LiveSettings }))
)
const EmbyHome = lazy(() =>
  import("@/features/emby-home").then((m) => ({ default: m.EmbyHome }))
)
const LiveMusic = lazy(() =>
  import("@/features/live-library").then((m) => ({ default: m.LiveMusic }))
)
const LiveComics = lazy(() =>
  import("@/features/live-comics").then((m) => ({ default: m.LiveComics }))
)
const LiveNovels = lazy(() =>
  import("@/features/live-novels").then((m) => ({ default: m.LiveNovels }))
)
const LiveProcessing = lazy(() =>
  import("@/features/live-processing").then((m) => ({
    default: m.LiveProcessing,
  }))
)
const LiveLogs = lazy(() =>
  import("@/features/live-logs").then((m) => ({ default: m.LiveLogs }))
)
const LiveAnime = lazy(() =>
  import("@/features/live-anime").then((m) => ({ default: m.LiveAnime }))
)
const LiveResourceSearch = lazy(() =>
  import("@/features/live-resource-search").then((m) => ({
    default: m.LiveResourceSearch,
  }))
)

const pathFor = (page: string) =>
  searchableNavigation.find((l) => l.id === page)?.path ?? "/emby"
function currentRoute() {
  const [hash, section, id] = location.hash
    .slice(1)
    .replace(/^\//, "")
    .split("?")[0]
    .split("/")
  const alias = searchableNavigation.find((l) => l.id === hash)
  const path = alias?.path ?? location.pathname
  const tab =
    path === "/tools/downloads"
      ? "downloads"
      : path === "/tools/organize"
        ? "organize"
        : undefined
  const page = tab
    ? "processing"
    : (searchableNavigation.find((l) => l.path === path)?.id ?? "emby")
  let work = new URLSearchParams(location.search).get("work")
  if (alias && section === "work" && id) {
    try {
      work = decodeURIComponent(id)
    } catch {
      work = null
    }
  }
  return { page, tab, work: work && liveIdentity(work) ? work : null }
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [restoring, setRestoring] = useState(Boolean(getAccessToken()))
  const [sessionError, setSessionError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    if (!getAccessToken()) return
    getCurrentUser()
      .then((u) => {
        if (active) setUser(u)
      })
      .catch((e) => {
        if (active && getAccessToken()) setSessionError(requestError(e))
      })
      .finally(() => {
        if (active) setRestoring(false)
      })
    return () => {
      active = false
    }
  }, [retry])
  if (restoring || sessionError)
    return (
      <div className="grid min-h-svh place-content-center gap-4">
        {sessionError ? (
          <>
            <p role="alert">{sessionError}</p>
            <Button
              onClick={() => {
                setRestoring(true)
                setSessionError("")
                setRetry((r) => r + 1)
              }}
            >
              重新连接
            </Button>
          </>
        ) : (
          "正在恢复登录状态…"
        )}
      </div>
    )
  if (!user)
    return (
      <LoginPage
        onLogin={(u) => {
          if (location.pathname === "/login")
            history.replaceState(null, "", "/emby")
          setUser(u)
        }}
      />
    )
  return (
    <Workspace key={user.id || "session"} user={user} updateUser={setUser} />
  )
}

function Workspace({
  user,
  updateUser,
}: {
  user: AuthUser
  updateUser: (u: AuthUser | null) => void
}) {
  const token = getAccessToken()!
  const api = useMemo(
    () =>
      createLiveApi(token, () => {
        if (getAccessToken() === token) {
          clearAccessToken()
          updateUser(null)
        }
      }),
    [token, updateUser]
  )
  const [route, setRoute] = useState(currentRoute)
  const { page, work } = route
  const [visited, setVisited] = useState<string[]>([page])
  const [menus, setMenus] = useState<Record<string, SettingValue>>({})
  const [detail, setDetail] = useState<Media>()
  const [failure, setFailure] = useState<{ id: string; message: string }>()
  const [retry, setRetry] = useState(0)
  const [draft, setDraft] = useState<TVDraft>()
  const [notice, setNotice] = useState("")
  const [activity, setActivity] = useState<string[]>([])
  const favoritesKey = "mediahub.shadcn.favorites." + (user.id || user.account)
  const [favorites, setFavorites] = useState<Media[]>(() => {
    try {
      const items: Media[] = JSON.parse(
        localStorage.getItem(favoritesKey) || "[]"
      )
      return items.filter((i) => i && liveIdentity(i.id))
    } catch {
      return []
    }
  })
  const [search, setSearch] = useState<{
    version: number
    query: string
    media?: DownloadMediaContext
  }>({ version: 0, query: "" })
  const [origin, setOrigin] = useState<{ page: string; scroll: number }>()
  const scroll = useRef<Record<string, number>>({})
  const previous = useRef(route)
  const notify = useCallback((s: string) => {
    setNotice(s)
    setActivity((list) => [s, ...list].slice(0, 10))
  }, [])
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4200)
      return () => clearTimeout(timer)
    }
  }, [notice])
  useEffect(() => {
    const abort = new AbortController()
    api
      .settings("menus", abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setMenus(result.values)
      })
      .catch(() => {})
    return () => abort.abort()
  }, [api])
  useEffect(() => {
    const sync = () => setRoute(currentRoute())
    window.addEventListener("popstate", sync)
    window.addEventListener("hashchange", sync)
    return () => {
      window.removeEventListener("popstate", sync)
      window.removeEventListener("hashchange", sync)
    }
  }, [])
  if (!visited.includes(page)) setVisited([...visited, page])
  useLayoutEffect(() => {
    const last = previous.current
    if (last.page === page && last.work === work) return
    previous.current = route
    window.scrollTo(0, work ? 0 : (scroll.current[page] ?? 0))
  }, [route, page, work, visited])
  useEffect(() => {
    const identity = work && liveIdentity(work)
    if (!identity || !work) return
    const abort = new AbortController()
    api
      .detail(identity, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setFailure(undefined)
          setDetail(presentLiveMedia(result))
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setFailure({ id: work, message: requestError(e) })
      })
    return () => abort.abort()
  }, [work, retry, api])
  function navigate(path: string) {
    if (!work) scroll.current[page] = window.scrollY
    history.pushState(null, "", path)
    setRoute(currentRoute())
  }
  function openWork(item: Media) {
    if (!work) scroll.current[page] = window.scrollY
    setDetail(item)
    history.pushState(
      { fromList: true },
      "",
      pathFor(page) + "?work=" + encodeURIComponent(item.id)
    )
    setRoute(currentRoute())
  }
  function backToList() {
    if (history.state?.fromList) history.back()
    else {
      history.replaceState(null, "", pathFor(page))
      setRoute(currentRoute())
    }
  }
  function searchWork(item: Media) {
    const identity = liveIdentity(item.id)
    setOrigin({
      page,
      scroll: work ? (scroll.current[page] ?? 0) : window.scrollY,
    })
    const context = identity
      ? mediaContextFromRecord({
          ...identity,
          title: item.title,
          year: item.year || undefined,
          ...(item.detail?.tmdbId
            ? { provider: "tmdb", providerId: item.detail.tmdbId }
            : {}),
        })
      : undefined
    setSearch((s) => ({
      version: s.version + 1,
      query: item.title,
      media: context,
    }))
    navigate("/search")
  }
  function favorite(item: Media) {
    const next = favorites.some((f) => f.id === item.id)
      ? favorites.filter((f) => f.id !== item.id)
      : [item, ...favorites]
    setFavorites(next)
    try {
      localStorage.setItem(favoritesKey, JSON.stringify(next))
    } catch {
      notify("浏览器存储已满，本次收藏仅在当前页面有效。")
    }
  }
  const actions = {
    onOpen: openWork,
    onSearchResource: searchWork,
    onFavorite: favorite,
    favorites: favorites.map((f) => f.id),
  }
  const current = detail?.id === work ? detail : undefined
  const error = failure?.id === work ? failure?.message : undefined
  function account(u: LiveUser) {
    updateUser({ ...user, ...u })
  }
  return (
    <WorkspaceContext.Provider value={{ menus, favorites, openWork, activity }}>
      <MediaDetailContext.Provider
        value={(r) => {
          const id = r.source + ":" + r.mediaType + ":" + r.sourceId
          if (liveIdentity(id))
            openWork({
              id,
              title: r.title,
              original: r.originalTitle || "",
              year: r.year || 0,
              kind: r.mediaType === "movie" ? "电影" : "剧集",
              genre: "",
              region: "",
              poster: r.posterPath || "",
              score: Number(r.rating) || 0,
              duration: "",
              summary: r.summary || "",
              cast: [],
            })
        }}
      >
        <MediaShell
          user={user}
          activePath={pathFor(page)}
          title={
            work
              ? "作品详情"
              : searchableNavigation.find((l) => l.id === page)!.title
          }
          onNavigate={(path) => {
            setOrigin(undefined)
            navigate(path)
          }}
          onLogout={() => {
            void logout()
              .catch(() => {})
              .finally(() => {
                updateUser(null)
                history.replaceState(null, "", "/login")
              })
          }}
        >
          <Suspense
            fallback={
              <p role="status" className="p-6">
                正在加载页面…
              </p>
            }
          >
            <div className="feature-page" data-page={work ? "detail" : page}>
              {(visited.includes("discover") || page === "discover") && (
                <div hidden={page !== "discover" || Boolean(work)}>
                  <LiveDiscovery api={api} {...actions} />
                </div>
              )}
              {(visited.includes("rankings") || page === "rankings") && (
                <div hidden={page !== "rankings" || Boolean(work)}>
                  <Rankings api={api} {...actions} />
                </div>
              )}
              {(visited.includes("search") || page === "search") && (
                <div hidden={page !== "search" || Boolean(work)}>
                  <LiveResourceSearch
                    key={user.account + search.version}
                    api={api}
                    account={user.account}
                    active={page === "search" && !work}
                    initialQuery={search.query}
                    media={search.media}
                    notify={notify}
                    backLabel={
                      "返回" +
                      (searchableNavigation.find((l) => l.id === origin?.page)
                        ?.title ?? "影视探索")
                    }
                    onBack={() => {
                      const target = origin
                      if (target) scroll.current[target.page] = target.scroll
                      navigate(pathFor(target?.page ?? "discover"))
                    }}
                  />
                </div>
              )}
              {work ? (
                current ? (
                  <MediaDetail
                    item={current}
                    api={api}
                    favorite={favorites.some((item) => item.id === current.id)}
                    onClose={backToList}
                    detailError={error}
                    onRetry={() => setRetry((r) => r + 1)}
                    onFavorite={favorite}
                    onSearch={searchWork}
                    hideSubscribe={page === "calendar"}
                    onSubscribe={(item) => {
                      const id = liveIdentity(item.id)
                      const tmdbId =
                        item.detail?.tmdbId ||
                        (id?.source === "tmdb" ? id.sourceId : "")
                      if (tmdbId)
                        setDraft({
                          title: item.title,
                          tmdbId,
                          season: 0,
                          source: "pansou",
                          channels: [],
                          enabled: true,
                          match: "",
                          exclude: "",
                        })
                    }}
                  >
                    {page === "calendar" && (
                      <LiveTVEpisodes
                        api={api}
                        tmdbId={
                          current.detail?.tmdbId ||
                          liveIdentity(current.id)!.sourceId
                        }
                        notify={notify}
                      />
                    )}
                  </MediaDetail>
                ) : (
                  <section>
                    <Button variant="ghost" onClick={backToList}>
                      返回列表
                    </Button>
                    <p role="status">{error || "正在加载作品详情…"}</p>
                    {error && (
                      <Button onClick={() => setRetry((r) => r + 1)}>
                        重试
                      </Button>
                    )}
                  </section>
                )
              ) : page === "emby" ? (
                <EmbyHome api={api} go={(id) => navigate(pathFor(id))} />
              ) : page === "music" ? (
                <LiveMusic api={api} account={user.account} />
              ) : page === "comics" ? (
                <LiveComics api={api} />
              ) : page === "novels" ? (
                <LiveNovels api={api} />
              ) : page === "anime" ? (
                <LiveAnime api={api} />
              ) : page === "calendar" ? (
                <LiveSeriesCalendar
                  api={api}
                  notify={notify}
                  onOpen={openWork}
                  discover={() => {
                    navigate(pathFor("discover"))
                    notify("在剧集详情中点击「订阅此剧」。")
                  }}
                />
              ) : page === "processing" ? (
                <LiveProcessing
                  key={route.tab || "default"}
                  api={api}
                  defaultTab={route.tab}
                />
              ) : page === "logs" ? (
                <LiveLogs api={api} />
              ) : page === "settings" ? (
                <LiveSettings
                  api={api}
                  user={user}
                  onUser={account}
                  onSession={(s) => {
                    storeAccessToken(s.accessToken)
                    account(s.user)
                  }}
                  menuSources={menuSources}
                  onMenus={setMenus}
                />
              ) : null}
              {draft && (
                <LiveTVEditor
                  api={api}
                  value={draft}
                  close={() => setDraft(undefined)}
                  saved={() => {
                    setDraft(undefined)
                    notify("已添加追剧订阅。")
                    navigate(pathFor("calendar"))
                  }}
                />
              )}
            </div>
          </Suspense>
          <div
            role="status"
            aria-live="polite"
            className="fixed right-4 bottom-4 z-50"
          >
            {notice && (
              <span className="block rounded-lg border bg-popover px-4 py-2 text-popover-foreground shadow">
                {notice}
              </span>
            )}
          </div>
        </MediaShell>
      </MediaDetailContext.Provider>
    </WorkspaceContext.Provider>
  )
}
export { App }
