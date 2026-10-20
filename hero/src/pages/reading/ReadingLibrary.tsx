import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, Input } from "@heroui/react";
import { BookOpen, BookText, FolderSync, Search } from "lucide-react";
import { FilterTabs, errorText } from "../../components/media/MediaUI";
import { Overlay } from "../../components/ui/Overlay";
import { request, type Session } from "../../lib/media-service";
import { readingPreview } from "../../mocks/reading-library";
import { ReadingCover, ReadingReader } from "./ReadingReader";

type Kind = "comics" | "novels";
type Item = { id: string; title: string; path: string; format: string; size: number; modifiedAt: string; importedAt: string; available: boolean };
type Page = { items: Item[]; total: number; page: number; pageSize: number };
type Status = { configured: boolean; running: boolean; error: string; completedAt: string; found: number };
const names = { comics: "漫画", novels: "小说" };
const formats = { comics: ["CBZ", "CBR"], novels: ["TXT", "EPUB"] };
function date(value: string) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未刷新"; }
function size(bytes: number) { return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

export function ReadingLibrary({ session }: { session: Session }) {
  const [kind, setKind] = useState<Kind>("comics");
  const demo = new URLSearchParams(window.location.search).get("readingDemo") === "1" || session.mode === "demo";
  return <section className="reading-library" aria-label="漫文书库">
    {demo && <p className="reading-hint"><strong>书库示例预览</strong> · 以下为虚构作品，刷新仅演示交互，不扫描目录、不写入数据库。<a href="/#/reading">返回真实书库</a></p>}
    <FilterTabs label="书库" value={kind} options={[["comics", "漫画"], ["novels", "小说"]]} onChange={(v) => setKind(v as Kind)} />
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
    setStarting(true); setStatusError("");
    try {
      await load(`${base}/refresh`, "POST");
      setStatus((s) => s ? { ...s, running: true, error: "" } : s);
    } catch (e) { setStatusError(errorText(e)); }
    finally { setStarting(false); }
  }
  function search(e: FormEvent) { e.preventDefault(); setPage(1); setQuery(input.trim()); setRevision((n) => n + 1); }
  const running = starting || status?.running;
  const pages = Math.max(1, Math.ceil((result?.total || 0) / (result?.pageSize || 36)));
  if (reading) return <ReadingReader item={reading} kind={kind} session={session} close={() => setReading(null)} />;
  return <>
    <Card className="reading-controls">
      <form className="reading-search" onSubmit={search} role="search" aria-label={`搜索${names[kind]}书库`}>
        <Input aria-label={`搜索${names[kind]}`} placeholder={`搜索${names[kind]}名称或路径…`} value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" variant="secondary"><Search size={16} aria-hidden="true" />搜索</Button>
        <Button type="button" isDisabled={!status?.configured || !!running} onPress={refresh}><FolderSync size={16} aria-hidden="true" className={running ? "reading-spinning" : undefined} />{running ? "刷新中…" : "刷新库"}</Button>
      </form>
      <div className="reading-filters">
        <FilterTabs label="格式" value={format} options={[["", "全部"], ...formats[kind].map((f) => [f, f])]} onChange={(value) => { setFormat(value); setPage(1); }} />
        <label className="reading-sort">排序<select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="title">名称 A–Z</option><option value="recent">最近入库</option><option value="modified">文件更新</option></select></label>
      </div>
    </Card>
    <div className="reading-summary" role="status" aria-live="polite">
      <span>{result ? `共 ${result.total} 部${names[kind]}` : "正在读取书库…"}</span>
      <span>{running ? `正在扫描${names[kind]}目录，完成后自动更新` : status?.completedAt ? `最近刷新 ${date(status.completedAt)} · 扫描到 ${status.found} 个文件` : "书库尚未刷新"}</span>
    </div>
    {status && !status.configured && <p className="reading-hint">{names[kind]}目录暂不可用，请检查书库挂载后刷新。</p>}
    {(statusError || status?.error) && <p className="media-error" role="alert">{statusError || status?.error}</p>}
    {error && <div className="media-error" role="alert">{error}<Button variant="ghost" onPress={() => setRevision((n) => n + 1)}>重试</Button></div>}
    <div aria-busy={busy} className="reading-results">
      {busy ? <div className="reading-empty" role="status">正在读取{names[kind]}书库…</div> : !error && !result?.items.length ? <div className="reading-empty"><Icon size={36} aria-hidden="true" /><h2>{query || format ? "没有找到匹配的作品" : `你的${names[kind]}书库还没有作品`}</h2><p>{query || format ? "试试其他关键词，或清除筛选条件。" : `支持 ${formats[kind].join(" / ")}。点击「刷新库」从已配置目录导入，之后随时浏览。`}</p>{(query || format) && <Button variant="secondary" onPress={() => { setInput(""); setQuery(""); setFormat(""); setPage(1); }}>清除筛选</Button>}</div> : !error && <div className="poster-grid reading-grid">{result?.items.map((item) => <button key={item.id} className="poster-card reading-card" onClick={() => setSelected(item)} aria-label={`查看《${item.title}》信息`}>
        <div className={`poster-art reading-cover reading-cover--${kind}`}><ReadingCover item={item} kind={kind} session={session} /><span className="reading-format">{item.format}</span></div>
        <h2 className="poster-title">{item.title}</h2><p className="poster-meta">{size(item.size)} · {item.available ? item.format : "源文件缺失"}</p>
      </button>)}</div>}
    </div>
    {result && pages > 1 && <nav className="reading-pagination" aria-label="书库分页"><Button variant="secondary" isDisabled={busy || page <= 1} onPress={() => setPage((n) => n - 1)}>上一页</Button><span>第 {page} / {pages} 页</span><Button variant="secondary" isDisabled={busy || page >= pages} onPress={() => setPage((n) => n + 1)}>下一页</Button></nav>}
    {selected && <Overlay title={selected.title} onClose={() => setSelected(null)} footer={<Button isDisabled={!selected.available || selected.format === "CBR" || demo} onPress={() => { setReading(selected); setSelected(null); }}>开始 / 继续阅读</Button>}><dl className="reading-details"><dt>类型</dt><dd>{names[kind]}</dd><dt>格式</dt><dd>{selected.format}</dd><dt>文件大小</dt><dd>{size(selected.size)}</dd><dt>相对路径</dt><dd>{selected.path}</dd><dt>文件更新</dt><dd>{date(selected.modifiedAt)}</dd><dt>首次入库</dt><dd>{date(selected.importedAt)}</dd><dt>文件状态</dt><dd>{selected.available ? "最近扫描时存在" : "最近扫描时未找到，入库信息已保留"}</dd></dl>{selected.format === "CBR" && <p className="reading-hint">CBR 暂仅支持入库，请转成 CBZ 后在线阅读。</p>}</Overlay>}
  </>;
}
