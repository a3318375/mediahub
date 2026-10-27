import { AppSelect } from "../../components/ui/AppSelect";
import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Minus, Plus, RotateCcw } from "lucide-react";
import { request, type Session } from "../../lib/media-service";
import { errorText } from "../../components/media/MediaUI";
export type ReadingItem = { id: string; title: string; path: string; format: string; size: number; modifiedAt: string; importedAt: string; available: boolean };
export type ReadingKind = "comics" | "novels";
type Book = { format: string; count: number; chapters: { title: string }[] };
type Chapter = { title: string; paragraphs: string[] };
function savedPosition(id: string) { try { return Number(localStorage.getItem(`mediahub.reading.position.${id}`)) || 0; } catch { return 0; } }
export function useReadingImage(url: string | null, session: Session) {
  const [src, setSrc] = useState(""); const [error, setError] = useState("");
  useEffect(() => {
    setSrc(""); setError(""); if (!url) return;
    const controller = new AbortController(); let object = "";
    fetch(url, { signal: controller.signal, headers: { Authorization: `Bearer ${session.token}` } }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "图片暂时无法读取");
      return r.blob();
    }).then((blob) => { if (!controller.signal.aborted) { object = URL.createObjectURL(blob); setSrc(object); } }).catch((e) => { if (!controller.signal.aborted) setError(errorText(e)); });
    return () => { controller.abort(); if (object) URL.revokeObjectURL(object); };
  }, [url, session.token]);
  return { src, error };
}
export function ReadingCover({ item, kind, session }: { item: ReadingItem; kind: ReadingKind; session: Session }) {
  const { src } = useReadingImage(item.available && ["CBZ", "DIRECTORY", "EPUB"].includes(item.format) && session.mode === "live" ? `/api/v1/reading/${kind}/${item.id}/cover` : null, session);
  return src ? <img className="reading-real-cover" src={src} alt={`${item.title}封面`} loading="lazy" onLoad={(e) => { if(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight * 1.6) e.currentTarget.style.objectPosition = "27% center"; }} /> : <div className={`reading-book-art reading-book-art-${kind}`} aria-hidden="true"><span>{kind === "comics" ? "COMIC" : "NOVEL"}</span><strong>{item.title}</strong><small>{kind === "comics" ? "漫画藏书" : "私人书架"}</small></div>;
}
export function ReadingReader({ item, kind, session, close, source, positionKey }: { item: ReadingItem; kind: ReadingKind; session: Session; close: () => void; source?: { base: string; site: string; count: number }; positionKey?: string }) {
  const [book, setBook] = useState<Book | null>(null); const [index, setIndex] = useState(() => savedPosition(positionKey || item.id));
  const [chapter, setChapter] = useState<Chapter | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0); const [contents, setContents] = useState(false); const [font, setFont] = useState(19);
  const [controls, setControls] = useState(false);
  const [theme, setTheme] = useState("paper"); const [fit, setFit] = useState("width");
  const novelPage = useRef<HTMLElement | null>(null);
  const base = source?.base || `/api/v1/reading/${kind}/${item.id}`;
  const remoteCount = source?.count;
  useEffect(() => {
    const c = new AbortController();setError("");
    (remoteCount !== undefined ? Promise.resolve({ format: "CBZ", count: remoteCount, chapters: [] }) : request<Book>(`${base}/book`,session,"GET",undefined,30000,c.signal)).then((r) => { if(c.signal.aborted) return;setBook(r); setIndex((old) => Math.max(0,Math.min(old,r.count-1))); }).catch((e) => { if(!c.signal.aborted) setError(errorText(e)); });
    return () => c.abort();
  }, [base,session,retry,remoteCount]);
  useEffect(() => {
    if (!book) return;
    try { localStorage.setItem(`mediahub.reading.position.${positionKey || item.id}`,String(index)); } catch { /* Reading works without browser storage. */ }
  },[book,index,item.id,positionKey]);
  useEffect(() => {
    if (!book || book.format === "CBZ" || book.format === "DIRECTORY") return;
    const c = new AbortController();setBusy(true);setError("");setChapter(null);
    request<Chapter>(`${base}/chapters/${index}`,session,"GET",undefined,30000,c.signal).then((r) => { if(!c.signal.aborted) setChapter(r); }).catch((e) => {if(!c.signal.aborted) setError(errorText(e));}).finally(() => {if(!c.signal.aborted) setBusy(false);});
    return () => c.abort();
  },[book,base,index,session,retry]);
  const image = useReadingImage(book && ["CBZ", "DIRECTORY"].includes(book.format) ? `${base}/pages/${index}?retry=${retry}${source ? `&site=${encodeURIComponent(source.site)}` : ""}` : null,session);
  useEffect(() => { if(error || image.error) setControls(true); }, [error,image.error]);
  function turn(next: number) { if(!book) return;setIndex(Math.max(0,Math.min(next,book.count-1)));setContents(false);if(novelPage.current) novelPage.current.scrollTop=0;window.scrollTo({top:0,behavior:"instant"}); }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if((e.target as HTMLElement)?.closest("input,select,textarea,button")) return;
      if(e.key === "ArrowRight") { e.preventDefault();turn(index + (kind === "comics" ? -1 : 1)); }
      if(e.key === "ArrowLeft") { e.preventDefault();turn(index + (kind === "comics" ? 1 : -1)); }
    }
    window.addEventListener("keydown",key);return () => window.removeEventListener("keydown",key);
  },[index,book,kind]);
  return <section className={`reading-reader reading-reader-${theme} ${kind === "comics" ? "reading-comic-reader" : "reading-novel-reader"} ${controls ? "reading-controls-visible" : ""}`} aria-label={`阅读 ${item.title}`}>
    <header className="reading-reader-toolbar"><Button size="sm" variant="ghost" onPress={close}><ArrowLeft size={16} />返回书库</Button><div><h2>{item.title}</h2><small>{book ? `${index+1} / ${book.count} ${kind === "comics" ? "页" : "章"}` : "正在打开…"}{kind === "comics" ? " · 从右向左阅读" : " · 进度自动保存在当前浏览器"}</small></div><div className="reading-reader-tools">
      {kind === "novels" ? <><Button size="sm" variant="secondary" onPress={() => setContents(!contents)}><List size={15} />目录</Button><Button isIconOnly size="sm" variant="ghost" aria-label="缩小字号" isDisabled={font<=15} onPress={() => setFont(font-1)}><Minus size={15} /></Button><span>{font}</span><Button isIconOnly size="sm" variant="ghost" aria-label="放大字号" isDisabled={font>=28} onPress={() => setFont(font+1)}><Plus size={15} /></Button><AppSelect label="阅读背景" value={theme} onChange={setTheme} options={[["paper", "纸色"], ["light", "明亮"], ["night", "夜间"]]} /></> : <AppSelect label="漫画缩放" value={fit} onChange={setFit} options={[["width", "适应宽度"], ["height", "适应屏幕"]]} />}
    </div></header>
    {(error || image.error) && <div className="media-error" role="alert">{error || image.error}<Button size="sm" variant="ghost" onPress={() => setRetry(retry+1)}><RotateCcw size={14} />重试</Button></div>}
    {contents && book && <div className="reading-chapters"><label>跳转章节<AppSelect label="章节目录" value={index} onChange={(value) => turn(Number(value))} options={book.chapters.map((chapter, n) => [String(n), `${n + 1}. ${chapter.title}`])} /></label></div>}
    {kind === "comics" ? <div className={`reading-comic-canvas reading-fit-${fit}`} aria-busy={!image.src && !image.error}>{image.src ? <div className="reading-comic-sheet"><img src={image.src} alt={`${item.title}第 ${index+1} 页`} /><Button variant="ghost" className="reading-image-turn reading-image-prev" aria-label="点击图片左侧上一页" isDisabled={index<=0} onPress={() => turn(index-1)} /><Button variant="ghost" className="reading-image-menu" aria-label="显示或隐藏阅读菜单" aria-expanded={controls} onPress={() => setControls(!controls)} /><Button variant="ghost" className="reading-image-turn reading-image-next" aria-label="点击图片右侧下一页" isDisabled={!book || index>=book.count-1} onPress={() => turn(index+1)} /></div> : !error && !image.error && <p role="status">正在载入漫画页…</p>}{!image.src && <Button variant="ghost" className="reading-image-menu" aria-label="显示或隐藏阅读菜单" aria-expanded={controls} onPress={() => setControls(!controls)} />}</div> : <article ref={novelPage} className="reading-novel-page" style={{fontSize:font}} aria-busy={busy} onClick={(event) => { const bounds=event.currentTarget.getBoundingClientRect(); const x=(event.clientX-bounds.left)/bounds.width; if(x>=0.28 && x<=0.72 && !window.getSelection()?.toString()) setControls(!controls); }}>{chapter ? <><h3>{chapter.title}</h3>{chapter.paragraphs.map((p,n) => <p key={n}>{p}</p>)}</> : !error && <p role="status">正在载入章节…</p>}</article>}
    {!controls && <p className="reading-mobile-hint">{kind === "comics" ? "左侧上一页 · 中间菜单 · 右侧下一页" : "上下滑动阅读 · 轻点中间显示菜单"}</p>}
    {kind === "novels" && <Button variant="ghost" className="reading-novel-menu-toggle" aria-label="显示或隐藏小说阅读菜单" aria-expanded={controls} onPress={() => setControls(!controls)}>阅读菜单</Button>}
    {book && <nav className="reading-turner" aria-label="阅读翻页"><Button variant="secondary" isDisabled={index<=0} onPress={() => turn(index-1)}><ChevronLeft size={16} />上一{kind === "comics" ? "页" : "章"}</Button><label><AppSelect label={kind === "comics" ? "漫画页码" : "跳转章节"} value={index} onChange={(value) => turn(Number(value))} options={Array.from({length: book.count}, (_, n) => [String(n), `${n + 1} / ${book.count}`])} /></label><Button variant="secondary" isDisabled={index>=book.count-1} onPress={() => turn(index+1)}>下一{kind === "comics" ? "页" : "章"}<ChevronRight size={16} /></Button></nav>}
  </section>;
}




