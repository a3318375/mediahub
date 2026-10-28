import { AppSelect } from "../../components/ui/AppSelect";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, Input, Link } from "@heroui/react";
import { ArrowDownWideNarrow, BookOpen, BookText, FolderSync, Search } from "lucide-react";
import { errorText } from "../../components/media/MediaUI";
import { Overlay } from "../../components/ui/Overlay";
import { request, type Session } from "../../lib/media-service";
import { readingPreview } from "../../mocks/reading-library";
import { ReadingCover, ReadingReader } from "./ReadingReader";
import { ComicMetadataDetails, type GalleryMetadata } from "../../components/media/ComicMetadata";

type Kind = "comics" | "novels";
type Item = { id: string; title: string; path: string; format: string; size: number; modifiedAt: string; importedAt: string; available: boolean; metadata?: GalleryMetadata };
type MetadataStatus = { running: boolean; total: number; done: number; updated: number; skipped: number; failed: number; error: string; completedAt: string };
type Page = { items: Item[]; total: number; page: number; pageSize: number };
type Status = { configured: boolean; running: boolean; error: string; completedAt: string; found: number; root?: string; directoryError?: string };
const names = { comics: "漫画", novels: "小说" };
function date(value: string) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未刷新"; }
function size(bytes: number) { return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

export function ReadingLibrary({ session, kind = "comics" }: { session: Session; kind?: Kind }) {
  const demo = new URLSearchParams(window.location.search).get("readingDemo") === "1" || session.mode === "demo";
  return <section className="reading-library" aria-label={`${names[kind]}书库`}>
    {demo && <p className="reading-hint"><strong>书库示例预览</strong> · 以下为虚构作品，刷新仅演示交互，不扫描目录、不写入数据库。{!import.meta.env.STATIC_DEMO && <Link href={`${import.meta.env.BASE_URL}#/reading`}>返回真实书库</Link>}</p>}
    <LibraryTab key={kind} kind={kind} session={session} demo={demo} />
  </section>;
}

function LibraryTab({ kind, session, demo }: { kind: Kind; session: Session; demo: boolean }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const [sort, setSort] = useState("title");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Page | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [busy, setBusy] = useState(true);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [reading, setReading] = useState<Item | null>(null);
  const [metadataDialog, setMetadataDialog] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus | null>(null);
  const [metadataStarting, setMetadataStarting] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const previousMetadata = useRef<MetadataStatus | null>(null);
  const previous = useRef<Status | null>(null);
  const base = `/api/v1/reading/${kind}`;
  const load = <T,>(path: string, method = "GET", signal?: AbortSignal): Promise<T> => demo ? readingPreview(path, method) as Promise<T> : request<T>(path, session, method, undefined, 30000, signal);
  const Icon = kind === "comics" ? BookOpen : BookText;
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    const params = new URLSearchParams({ query, format, sort, page: String(page) });
    load<Page>(`${base}?${params}`, "GET", controller.signal)
      .then(setResult).catch((e) => { if (!controller.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [base, session, demo, query, format, sort, page, revision]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await load<Status>(`${base}/status`, "GET", controller.signal);
        if (controller.signal.aborted) return;
        if (previous.current && (previous.current.completedAt !== next.completedAt || previous.current.running && !next.running)) setRevision((n) => n + 1);
        previous.current = next; setStatus(next); setStatusError("");
      } catch (e) { if (!controller.signal.aborted) setStatusError(errorText(e)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, session, demo]);
  async function refresh() {
    if (starting || status?.running || metadataStarting || metadataStatus?.running) return;
    setStarting(true); setStatusError("");
    try {
      await load(`${base}/refresh`, "POST");
      setStatus((s) => s ? { ...s, running: true, error: "" } : s);
    } catch (e) { setStatusError(errorText(e)); }
    finally { setStarting(false); }
  }
  useEffect(() => {
    if (kind !== "comics" || demo) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await load<MetadataStatus>(`${base}/metadata/status`, "GET", controller.signal);
        if (controller.signal.aborted) return;
        if (previousMetadata.current && previousMetadata.current.completedAt !== next.completedAt) setRevision(n => n + 1);
        previousMetadata.current = next; setMetadataStatus(next); setMetadataError("");
      } catch (e) { if (!controller.signal.aborted) setMetadataError(errorText(e)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, kind, demo, session]);
  async function refreshMetadata(mode: "all" | "missing") {
    setMetadataStarting(true); setMetadataError("");
    try {
      await request(`${base}/metadata/refresh`, session, "POST", { mode });
      setMetadataDialog(false);
      setMetadataStatus({ running: true, total: 0, done: 0, updated: 0, skipped: 0, failed: 0, error: "", completedAt: "" });
    } catch (e) { setMetadataError(errorText(e)); }
    finally { setMetadataStarting(false); }
  }
  function search(e: FormEvent) { e.preventDefault(); setPage(1); setQuery(input.trim()); setRevision((n) => n + 1); }
  async function deleteComic() {
    if (!deleteItem) return;
    setDeleting(true); setDeleteError("");
    try {
      await request(`${base}/${deleteItem.id}`, session, "DELETE");
      setDeleteItem(null); setSelected(null); setPage(1); setRevision(n => n + 1);
    } catch (e) { setDeleteError(errorText(e)); }
    finally { setDeleting(false); }
  }
  const running = starting || status?.running;
  const metadataRunning = metadataStarting || metadataStatus?.running;
  const pages = Math.max(1, Math.ceil((result?.total || 0) / (result?.pageSize || 36)));
  if (reading) return <ReadingReader item={reading} kind={kind} session={session} close={() => setReading(null)} />;
  return <>
    <Card className="reading-controls">
      <form className="reading-search" onSubmit={search} role="search" aria-label={`搜索${names[kind]}书库`}>
        <Input aria-label={`搜索${names[kind]}`} placeholder={`搜索${names[kind]}名称或路径…`} value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" variant="secondary"><Search size={16} aria-hidden="true" />搜索</Button>
        <Button type="button" isDisabled={!!running || !!metadataRunning} onPress={refresh}><FolderSync size={16} aria-hidden="true" className={running ? "reading-spinning" : undefined} />{running ? "刷新中…" : "刷新库"}</Button>
        {kind === "comics" && <Button type="button" variant="secondary" isDisabled={demo || !!running || !!metadataRunning} onPress={() => setMetadataDialog(true)}>{metadataRunning ? "元数据刷新中…" : "刷新元数据"}</Button>}
      </form>
      <div className="reading-filters">
        <AppSelect label="排序方式" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={[["title", "名称 A–Z"], ["recent", "最近入库"], ["modified", "文件更新"]]} icon={<ArrowDownWideNarrow size={16} aria-hidden="true" />} variant="compact" />
      </div>
    </Card>
    {kind === "comics" && <p className="media-note">刷新库会清理已不存在的漫画记录，再导入下载目录；不去重，解压校验成功后删除源压缩包。</p>}
    <div className="reading-summary" role="status" aria-live="polite">
      <span>{result ? `共 ${result.total} 部${names[kind]}` : "正在读取书库…"}</span>
      <span>{running ? `正在扫描${names[kind]}目录，完成后自动更新` : status?.completedAt ? `最近刷新 ${date(status.completedAt)} · 扫描到 ${status.found} 个文件` : "书库尚未刷新"}</span>
      {status && !status.configured && <span className="reading-inline-warning">{status.directoryError || `${names[kind]}目录暂不可用${status.root ? `（${status.root}）` : ""}`}。修复挂载或权限后可再次点击“刷新库”。</span>}
    </div>
    {(statusError || status?.error) && <p className="media-error" role="alert">{statusError || status?.error}</p>}
    {kind === "comics" && <>
      {metadataStatus && (metadataStatus.running || metadataStatus.completedAt) && <p className="media-note" role="status">元数据{metadataStatus.running ? "刷新中" : "刷新完成"} · {metadataStatus.done}/{metadataStatus.total} · 更新 {metadataStatus.updated} · 未匹配 {metadataStatus.skipped} · 失败 {metadataStatus.failed}</p>}
      {(metadataError || metadataStatus?.error) && <p className="media-error" role="alert">{metadataError || metadataStatus?.error}</p>}
      {metadataDialog && <Overlay title="刷新漫画元数据" onClose={() => setMetadataDialog(false)} footer={<><Button variant="secondary" isDisabled={metadataStarting} onPress={() => void refreshMetadata("missing")}>仅补缺失</Button><Button isDisabled={metadataStarting} onPress={() => void refreshMetadata("all")}>刷新全部</Button></>}><p>获取标题、分类、页数、语言、上传者、发布时间、评分和分组标签。</p><p>配置 Cookie 后优先 ExHentai，再尝试 E-Hentai。先搜索中文，无匹配再取消语言限制；仍未匹配则跳过，保留原有信息。</p>{metadataError && <p role="alert" className="media-error">{metadataError}</p>}</Overlay>}
    </>}
    {error && <div className="media-error" role="alert">{error}<Button variant="ghost" onPress={() => setRevision((n) => n + 1)}>重试</Button></div>}
    <div aria-busy={busy} className="reading-results">
      {busy ? <div className="reading-empty" role="status">正在读取{names[kind]}书库…</div> : !error && !result?.items.length ? <div className="reading-empty"><Icon size={36} aria-hidden="true" /><h2>{query || format ? "没有找到匹配的作品" : `你的${names[kind]}书库还没有作品`}</h2><p>{query || format ? "试试其他关键词，或清除筛选条件。" : `点击「刷新库」从已配置目录导入${names[kind]}，之后随时浏览。`}</p>{(query || format) && <Button variant="secondary" onPress={() => { setInput(""); setQuery(""); setFormat(""); setPage(1); }}>清除筛选</Button>}</div> : !error && <div className="poster-grid reading-grid">{result?.items.map((item) => <Button variant="ghost" key={item.id} className="poster-card reading-card" onPress={() => setSelected(item)} aria-label={`查看《${item.title}》信息`}>
        <div className={`poster-art reading-cover reading-cover--${kind}`}><ReadingCover item={item} kind={kind} session={session} />{kind !== "comics" && <span className="reading-format">{item.format}</span>}</div>
        <h2 className="poster-title">{item.metadata?.title || item.title}</h2><p className="poster-meta">{size(item.size)}{!item.available ? " · 最近扫描未找到文件" : kind !== "comics" ? ` · ${item.format}` : ""}</p>
      </Button>)}</div>}
    </div>
    {result && pages > 1 && <nav className="reading-pagination" aria-label="书库分页"><Button variant="secondary" isDisabled={busy || page <= 1} onPress={() => setPage((n) => n - 1)}>上一页</Button><span>第 {page} / {pages} 页</span><Button variant="secondary" isDisabled={busy || page >= pages} onPress={() => setPage((n) => n + 1)}>下一页</Button></nav>}
    {selected && !deleteItem && <Overlay title={selected.metadata?.title || selected.title} onClose={() => setSelected(null)} footer={<>{kind === "comics" && <Button variant="danger-soft" isDisabled={demo || !!running || !!metadataRunning} onPress={() => {setDeleteError(""); setDeleteItem(selected);}}>删除漫画</Button>}<Button isDisabled={selected.format === "CBR" || demo} onPress={() => { setReading(selected); setSelected(null); }}>开始 / 继续阅读</Button></>}>
      {kind === "comics" && selected.metadata && <ComicMetadataDetails metadata={selected.metadata} cover={<div className="poster-art reading-cover eh-cover"><ReadingCover item={selected} kind={kind} session={session} /></div>} />}
      {kind === "comics" && !selected.metadata && <p className="media-note">尚未获取作品元数据，可使用「刷新元数据」补充详情。</p>}
      <dl className="reading-details"><dt>类型</dt><dd>{names[kind]}</dd>{kind !== "comics" && <><dt>格式</dt><dd>{selected.format}</dd></>}<dt>文件大小</dt><dd>{size(selected.size)}</dd><dt>相对路径</dt><dd>{selected.path}</dd><dt>文件更新</dt><dd>{date(selected.modifiedAt)}</dd><dt>首次入库</dt><dd>{date(selected.importedAt)}</dd><dt>文件状态</dt><dd>{selected.available ? "最近扫描时存在" : "最近扫描时未找到，入库信息已保留"}</dd></dl>{selected.format === "CBR" && <p className="reading-hint">这部漫画暂不支持在线阅读，请转换为支持的漫画文件后重试。</p>}</Overlay>}
    {deleteItem && <Overlay title="删除漫画" onClose={() => {if (!deleting) setDeleteItem(null);}} footer={<><Button variant="secondary" isDisabled={deleting} onPress={() => setDeleteItem(null)}>取消</Button><Button variant="danger" isDisabled={deleting} onPress={() => void deleteComic()}>{deleting ? "删除中…" : "确认删除"}</Button></>}><p>确定删除《{deleteItem.metadata?.title || deleteItem.title}》？</p><p>将永久删除本地漫画文件或文件夹，以及书库记录、封面和元数据。</p>{deleteError && <p className="media-error" role="alert">{deleteError}</p>}</Overlay>}
  </>;
}
