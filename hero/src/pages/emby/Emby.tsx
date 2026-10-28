import { Button, Card, Link } from "@heroui/react";
import { AppProgress } from "../../components/ui/AppControls";
import { Film, Tv, Clapperboard, Play, Users, Clock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { settingsApi } from "../../lib/settings-api";
import { ProcessingOverview } from "../processing/ProcessingOverview";
import {
  Empty,
  FilterTabs,
  errorText,
  time,
} from "../../components/media/MediaUI";
import { Notice } from "../../components/ui/ManagementUI";
import { request, type Session } from "../../lib/media-service";
import { embyDemoEnabled, embySites, embyStats, embyLibraries, recentlyAdded, continueWatching } from "../../mocks/emby-dashboard";
type Item = {
  url?: string;
  id: string;
  title: string;
  kind: string;
  year: number;
  rating: string;
  libraryId: string;
  siteId: string;
  summary: string;
  progress?: number;
  resumeLabel?: string;
  remaining?: string;
};
type Dashboard = {
  updatedAt: string;
  warnings: string[];
  sites: { id: string; label: string }[];
  stats: Record<string, Record<string, number>>;
  libraries: {
    url?: string;
    id: string;
    title: string;
    type: string;
    count: number;
    siteId: string;
  }[];
  recentlyAdded: Item[];
  continueWatching: Item[];
};
function EmbyArtwork({
  id,
  title,
  session,
}: {
  id: string;
  title: string;
  session: Session;
}) {
  const [url, setURL] = useState("");
  useEffect(() => {
    if (embyDemoEnabled || session.mode === "demo") return;
    const c = new AbortController();
    let objectURL = "";
    setURL("");
    fetch(`/api/emby/items/${encodeURIComponent(id)}/image`, {
      signal: c.signal,
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("图片不可用");
        return r.blob();
      })
      .then((blob) => {
        if (!c.signal.aborted) {
          objectURL = URL.createObjectURL(blob);
          setURL(objectURL);
        }
      })
      .catch(() => {});
    return () => {
      c.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [id, session]);
  return url ? (
    <img src={url} alt={`${title}海报`} loading="lazy" />
  ) : (
    <div className="poster-placeholder">
      <Film size={28} />
      <strong>{title}</strong>
    </div>
  );
}
function EmbyDashboard({
  session,
}: {
  session: Session;
}) {
  const demo = embyDemoEnabled || session.mode === "demo";
  const [data, setData] = useState<Dashboard | null>(null);
  const [site, setSite] = useState("all");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    if (demo) {
      setData({ updatedAt: new Date().toISOString(), warnings: [], sites: [...embySites], stats: embyStats, libraries: [...embyLibraries], recentlyAdded, continueWatching });
      setBusy(false);
      return;
    }
    request<Dashboard>(
      `/api/emby/dashboard${revision ? "?refresh=true" : ""}`,
      session,
    )
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [session, revision, demo]);
  const visible = (list: Item[]) =>
    list.filter((i) => site === "all" || i.siteId === site);
  return (
    <section className="management-stack emby-dashboard">
      <div className="emby-toolbar">
        <div className="emby-overview"><h2>媒体概览</h2>{data && <span>更新于 {time(data.updatedAt)}</span>}</div>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onPress={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={14} className={busy ? "emby-syncing" : undefined} />
          {busy ? "读取中…" : "同步媒体库"}
        </Button>
      </div>
      <Notice error={error} />
      {data ? (
        <>
          {data.warnings.map((w, i) => (
            <Notice key={i} error={w} />
          ))}
          <FilterTabs
            label="站点"
            value={site}
            options={data.sites.map((s) => [s.id, s.label])}
            onChange={(v) => {
              setSite(v);
            }}
          />
          <div className="media-stat-grid">
            {([
              ["movies", "电影", Film],
              ["series", "剧集", Tv],
              ["episodes", "总集数", Clapperboard],
              ["plays", "播放次数", Play],
              ["viewers", "活跃观众", Users],
              ["hours", "观看时长（小时）", Clock],
            ] as const).map(([key, label, Icon]) => (
              <Card key={key} className="media-stat">
                <div className="emby-stat-label"><span>{label}</span><Icon size={16} aria-hidden="true" /></div>
                <strong>{data.stats[site]?.[key]?.toLocaleString() ?? "—"}</strong>
              </Card>
            ))}
          </div>
          <div className="media-section-heading">
            <h2>媒体库分类</h2>
          </div>
          <div className="emby-library-grid">
            {data.libraries
              .filter((l) => site === "all" || l.siteId === site)
              .map((l) => (
                <Link
                  href={demo ? undefined : l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`在 Emby 打开${l.title}媒体库（新标签页）`}
                  key={l.id}
                  className="emby-library-card"
                >
                  <div className="emby-library-cover"><EmbyArtwork id={l.id} title={l.title} session={session} /></div>
                  <div className="emby-library-caption"><strong>{l.title}</strong><span>{l.count.toLocaleString()} 部作品</span></div>
                </Link>
              ))}
          </div>
          <div className="emby-activity-grid">
          {[
            ["最近入库", visible(data.recentlyAdded)],
            ["继续播放", visible(data.continueWatching)],
          ].map(([title, items]) => (
            <section className="management-stack emby-activity-section" key={String(title)}>
              <h2>{String(title)}</h2>
              {(items as Item[]).length ? (
                <div className="poster-grid">
                  {(items as Item[]).slice(0, 10).map((i) => (
                    <Link
                      href={demo ? undefined : i.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`在 Emby 打开${i.title}播放页（新标签页）`}
                      key={i.id}
                      className="poster-card"
                    >
                      <div className="poster-art">
                        <EmbyArtwork
                          id={i.id}
                          title={i.title}
                          session={session}
                        />
                      </div>
                      <strong className="poster-title">{i.title}</strong>
                      <span className="poster-meta">
                        {i.year} · {i.kind} · {i.rating || "暂无评分"}
                      </span>
                      {i.progress !== undefined && (
                        <>
                          <AppProgress label={`${i.title}观看进度`} value={i.progress} />
                          <small>
                            {i.resumeLabel} · {i.remaining}
                          </small>
                        </>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty>此分类暂无作品</Empty>
              )}
            </section>
          ))}
          </div>
        </>
      ) : !busy && !error ? (
        <Empty>Emby 尚未配置</Empty>
      ) : busy ? (
        <Empty>正在读取媒体库…</Empty>
      ) : null}
    </section>
  );
}

export function Emby({ session }: { session: Session }) {
  const [local, setLocal] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("downloads");
  useEffect(() => {
    let active = true;
    settingsApi.get("emby").then(result => { if (active) setLocal(result.values["emby.localOverview"] === true); })
      .catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [session]);
  if (error) return <Notice error={error} />;
  if (local === null) return <Empty>正在读取概览设置…</Empty>;
  if (!local) return <EmbyDashboard session={session} />;
  return <section className="management-stack">
    <h2>系统本地概览</h2>
    <FilterTabs label="本地记录" value={tab} onChange={setTab} options={[["downloads", "最近下载"], ["organize", "最近整理"]]} />
    <ProcessingOverview session={session} mode={tab === "organize" ? "organize" : "downloads"} />
  </section>;
}
