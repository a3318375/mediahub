import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Input, Tabs } from "@heroui/react";
import { BookOpen, Settings, Star } from "lucide-react";
import { FilterTabs, errorText } from "../../components/media/MediaUI";
import { Overlay } from "../../components/ui/Overlay";
import { request, type Session } from "../../lib/media-service";
import { languageLabel, namespaceLabel, searchTag, tagLabel } from "../../lib/ehentai-tags";
import { ReadingLibrary } from "./ReadingLibrary";
import { ReadingReader, useReadingImage } from "./ReadingReader";

type Gallery = { id: string; token: string; site: string; title: string; japaneseTitle: string; cover: string; category: string; uploader: string; posted: string; language: string; rating: string; pages: number; tags: Record<string, string[]> };
type Results = { items: Gallery[]; next: string };
type TagSearch = { query: string; site: string; revision: number };
const base = "/api/v1/comics/ehentai";
const galleryBase = (g: Gallery) => `${base}/gallery/${g.id}/${g.token}`;
const categories = [["", "全部分类"], ["2", "同人志"], ["4", "漫画"], ["8", "画师 CG"], ["16", "游戏 CG"], ["32", "图集"], ["64", "Cosplay"], ["128", "写真"], ["256", "非成人"], ["512", "欧美"], ["1", "其他"]];

function Cover({ gallery, session }: { gallery: Gallery; session: Session }) {
  const [visible, setVisible] = useState(false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" });
    observer.observe(element); return () => observer.disconnect();
  }, [element]);
  const { src } = useReadingImage(visible && gallery.cover ? `${base}/cover?url=${encodeURIComponent(gallery.cover)}` : null, session);
  return <div ref={setElement} className="poster-art reading-cover eh-cover">{src ? <img className="reading-real-cover" src={src} alt={`${gallery.title}封面`} loading="lazy" /> : <BookOpen size={32} aria-hidden="true" />}</div>;
}

export function Comics({ session }: { session: Session }) {
  const [tab, setTab] = useState(() => {
    const value = new URLSearchParams(window.location.hash.split("?")[1]).get("tab");
    return value === "ehentai" || value === "exhentai" ? value : "shelf";
  });
  function chooseTab(value: string) {
    setTab(value);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/comics?tab=${value}`);
  }
  const [shelf, setShelf] = useState("local");
  const [favorites, setFavorites] = useState<Gallery[]>([]);
  const [favoriteError, setFavoriteError] = useState("");
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [selected, setSelected] = useState<Gallery | null>(null);
  const [reading, setReading] = useState<Gallery | null>(null);
  const [revision, setRevision] = useState(0);
  const [browseLanguage, setBrowseLanguage] = useState("chinese");
  const [tagSearch, setTagSearch] = useState<TagSearch | null>(null);
  function findTag(gallery: Gallery, namespace: string, tag: string) {
    const next = searchTag(namespace, tag, browseLanguage);
    setBrowseLanguage(next.language);
    setTagSearch((previous) => ({ query: next.query, site: gallery.site, revision: (previous?.revision || 0) + 1 }));
    setSelected(null); chooseTab(gallery.site === "exhentai.org" ? "exhentai" : "ehentai");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const live = session.mode === "live";
  useEffect(() => {
    if (!live || tab !== "shelf" || shelf !== "favorites") return;
    const c = new AbortController(); setFavoriteError(""); setLoadingFavorites(true);
    request<{ items: Gallery[] }>(`${base}/favorites`, session, "GET", undefined, 30000, c.signal).then((r) => { if (!c.signal.aborted) setFavorites(r.items.sort((a, b) => a.title.localeCompare(b.title))); }).catch((e) => { if (!c.signal.aborted) setFavoriteError(errorText(e)); }).finally(() => { if (!c.signal.aborted) setLoadingFavorites(false); });
    return () => c.abort();
  }, [session, live, tab, shelf, revision]);
  return <section className="reading-library" aria-label="漫画">
    {reading && <ReadingReader key={`${reading.id}/${reading.token}`} session={session} kind="comics" item={{ id: reading.id, title: reading.title, path: "", format: "REMOTE", size: 0, modifiedAt: "", importedAt: "", available: true }} source={{ base: galleryBase(reading), site: reading.site, count: reading.pages }} positionKey={`ehentai.${reading.id}.${reading.token}`} close={() => setReading(null)} />}
    <div className="reading-library" hidden={!!reading}>
    <header className="comics-header"><h1>漫画</h1><Tabs className="discovery-source-tabs comics-source-tabs" aria-label="漫画来源" selectedKey={tab} onSelectionChange={(key) => chooseTab(String(key))}>
      <Tabs.ListContainer><Tabs.List aria-label="漫画来源">
        {[["shelf", "我的书架"], ["ehentai", "E-Hentai"], ["exhentai", "ExHentai"]].map(([id, label]) => <Tabs.Tab key={id} id={id}>{label}<Tabs.Indicator /></Tabs.Tab>)}
      </Tabs.List></Tabs.ListContainer>
    </Tabs></header>
    <div className="comics-shelf" hidden={tab !== "shelf"}>
      <FilterTabs label="书架" value={shelf} options={[["local", "本地 / 已下载"], ["favorites", "已收藏"]]} onChange={setShelf} />
      {tab === "shelf" && shelf === "local" && <ReadingLibrary session={session} />}
      {shelf === "favorites" && <div className="eh-favorites">{favoriteError && <p role="alert" className="media-error">{favoriteError}<Button variant="ghost" onPress={() => setRevision((v) => v + 1)}>重试</Button></p>}{loadingFavorites ? <p role="status">正在读取收藏…</p> : !favoriteError && (favorites.length ? <GalleryGrid items={favorites} session={session} select={setSelected} /> : <div className="reading-empty"><Star size={32} /><h2>还没有收藏漫画</h2><p>在 E-Hentai 的画廊详情中加入书架，无需下载也能继续在线阅读。</p><Button onPress={() => chooseTab("ehentai")}>前往 E-Hentai</Button></div>)}</div>}
    </div>
    {tab !== "shelf" && (live ? <Browse key={`${tab}-${tagSearch?.revision || 0}`} session={session} select={setSelected} site={tab === "exhentai" ? "exhentai.org" : "e-hentai.org"} initialSearch={tagSearch?.site === (tab === "exhentai" ? "exhentai.org" : "e-hentai.org") ? tagSearch : null} language={browseLanguage} setLanguage={setBrowseLanguage} /> : <p className="reading-hint">请连接真实服务后浏览漫画来源。</p>)}
    {selected && <GalleryDetail key={`${selected.site}/${selected.id}/${selected.token}`} gallery={selected} session={session} close={() => setSelected(null)} read={(g) => { setSelected(null); setReading(g); }} saved={() => setRevision((v) => v + 1)} findTag={(namespace, tag) => findTag(selected, namespace, tag)} />}
    </div>
  </section>;
}

function GalleryGrid({ items, session, select }: { items: Gallery[]; session: Session; select: (g: Gallery) => void }) {
  return <div className="poster-grid reading-grid">{items.map((g) => <button key={`${g.id}/${g.token}`} className="poster-card reading-card" onClick={() => select(g)} aria-label={`查看《${g.title}》详情`}><Cover gallery={g} session={session} /><h2 className="poster-title">{g.title}</h2><p className="poster-meta">{g.category || "画廊"}{g.posted && ` · ${g.posted}`}</p></button>)}</div>;
}

function Browse({ session, select, site, initialSearch, language, setLanguage }: { session: Session; select: (g: Gallery) => void; site: string; initialSearch: TagSearch | null; language: string; setLanguage: (value: string) => void }) {
  const sourceName = site === "exhentai.org" ? "ExHentai" : "E-Hentai";
  const [input, setInput] = useState(initialSearch?.query || "");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState({ query: initialSearch?.query || "", category: "", language });
  const [cursors, setCursors] = useState([""]);
  const [result, setResult] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController(); setBusy(true); setError(""); setResult(null);
    const params = new URLSearchParams({ site, ...search, cursor: cursors[cursors.length - 1] });
    request<Results>(`${base}/search?${params}`, session, "GET", undefined, 60000, c.signal).then((r) => { if (!c.signal.aborted) setResult(r); }).catch((e) => { if (!c.signal.aborted) setError(errorText(e)); }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [session, site, search, cursors, revision]);
  function submit(e: FormEvent) { e.preventDefault(); setCursors([""]); setSearch({ query: input.trim(), category, language }); }
  return <>
    <Card className="reading-controls">
      <form className="eh-search-form" role="search" aria-label={`搜索 ${sourceName}`} onSubmit={submit}>
        <div className="reading-search"><Input aria-label="画廊搜索词" placeholder='搜索标题、作者或标签，例如 artist:…' value={input} onChange={(e) => setInput(e.target.value)} /><Button type="submit" isDisabled={busy}>{busy ? "搜索中…" : "搜索"}</Button></div>
        <div className="eh-filters"><label>分类<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label><label>语言<select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">全部语言</option><option value="chinese">中文</option><option value="japanese">日文</option><option value="english">英文</option></select></label></div>
        <Button type="button" variant="secondary" onPress={() => setSettings(true)}><Settings size={16} />Cookie 设置</Button>
      </form>
    </Card>
    {error && <div className="media-error" role="alert">{error}<Button variant="ghost" onPress={() => setRevision((v) => v + 1)}>重试</Button><Button variant="ghost" onPress={() => setSettings(true)}>检查 Cookie</Button></div>}
    <div aria-busy={busy}>{busy ? <div className="reading-empty" role="status">正在读取站点画廊…</div> : result && (result.items.length ? <GalleryGrid items={result.items} session={session} select={select} /> : <div className="reading-empty"><BookOpen size={32} /><h2>没有找到匹配的画廊</h2><p>试试其他关键词或筛选条件。</p></div>)}</div>
    {result && <nav className="reading-pagination" aria-label="画廊分页"><Button variant="secondary" isDisabled={busy || cursors.length <= 1} onPress={() => setCursors((v) => v.slice(0, -1))}>上一页</Button><span>第 {cursors.length} 页 · 本页 {result.items.length} 部</span><Button variant="secondary" isDisabled={busy || !result.next} onPress={() => setCursors((v) => [...v, result.next])}>下一页</Button></nav>}
    {settings && <CookieSettings session={session} close={() => setSettings(false)} saved={() => { setSettings(false); setCursors([""]); setRevision((v) => v + 1); }} />}
  </>;
}

function CookieSettings({ session, close, saved }: { session: Session; close: () => void; saved: () => void }) {
  const [cookie, setCookie] = useState(""); const [configured, setConfigured] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { const c = new AbortController(); request<{ configured: boolean }>(`${base}/settings`, session, "GET", undefined, 30000, c.signal).then((r) => setConfigured(r.configured)).catch((e) => { if (!c.signal.aborted) setError(errorText(e)); }); return () => c.abort(); }, [session]);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await request(`${base}/settings`, session, "PUT", { cookie }); setCookie(""); saved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <Overlay title="E-Hentai Cookie" onClose={close}><form className="eh-settings" onSubmit={submit}><p>{configured === null ? "正在读取保存状态…" : configured ? "已保存 Cookie。留空不会修改现有凭据。" : "尚未保存 Cookie，可先尝试 E-Hentai 游客浏览。"}</p><label>Cookie<Input aria-label="E-Hentai Cookie" type="password" autoComplete="off" value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder="ipb_member_id=…; ipb_pass_hash=…; igneous=…" /></label><p className="reading-hint">从已登录的浏览器复制 Cookie 中的 ipb_member_id、ipb_pass_hash 和 igneous。ExHentai 需要有效 Cookie 和账号访问权限。凭据加密保存在服务端，保存状态不代表站点已验证登录。</p>{error && <p role="alert" className="media-error">{error}</p>}<Button type="submit" isDisabled={busy || !cookie.trim()}>{busy ? "保存中…" : "保存 Cookie"}</Button></form></Overlay>;
}

function GalleryDetail({ gallery, session, close, read, saved, findTag }: { gallery: Gallery; session: Session; close: () => void; read: (g: Gallery) => void; saved: () => void; findTag: (namespace: string, tag: string) => void }) {
  const [detail, setDetail] = useState<Gallery | null>(null); const [error, setError] = useState(""); const [favorite, setFavorite] = useState(false); const [saving, setSaving] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const c = new AbortController(); setError(""); request<Gallery>(`${galleryBase(gallery)}?site=${gallery.site}`, session, "GET", undefined, 60000, c.signal).then((g) => { if (!c.signal.aborted) setDetail(g); }).catch((e) => { if (!c.signal.aborted) setError(errorText(e)); }); return () => c.abort(); }, [gallery, session, revision]);
  async function collect() { setSaving(true); setError(""); try { await request(`${galleryBase(gallery)}/favorite?site=${gallery.site}`, session, "POST"); setFavorite(true); saved(); } catch (e) { setError(errorText(e)); } finally { setSaving(false); } }
  return <Overlay title={detail?.title || gallery.title} onClose={close} wide footer={<><Button variant="secondary" isDisabled={!detail || saving || favorite} onPress={collect}><Star size={16} />{favorite ? "已加入书架" : saving ? "收藏中…" : "加入书架"}</Button><Button isDisabled={!detail?.pages} onPress={() => detail && read(detail)}><BookOpen size={16} />在线阅读</Button></>}>
    {error && <div role="alert" className="media-error">{error}<Button variant="ghost" onPress={() => setRevision((v) => v + 1)}>重试</Button></div>}
    {!detail && !error && <p role="status">正在读取画廊详情…</p>}
    {detail && <><div className="eh-detail"><Cover gallery={detail} session={session} /><dl className="reading-details"><dt>日文标题</dt><dd>{detail.japaneseTitle || "—"}</dd><dt>分类</dt><dd>{detail.category || "—"}</dd><dt>页数</dt><dd>{detail.pages || "未知"}</dd><dt>语言</dt><dd>{languageLabel(detail.language) || "—"}</dd><dt>上传者</dt><dd>{detail.uploader || "—"}</dd><dt>发布</dt><dd>{detail.posted || "—"}</dd><dt>评分</dt><dd>{detail.rating || "—"}</dd></dl></div><div className="eh-tags">{Object.entries(detail.tags).map(([namespace, tags]) => <div key={namespace}><strong>{namespaceLabel(namespace)}</strong><p>{tags.map((tag) => <button type="button" key={tag} className="eh-tag" title={`搜索${namespaceLabel(namespace)}：${tag}`} aria-label={`搜索${namespaceLabel(namespace)}：${tagLabel(namespace, tag)}`} onClick={() => findTag(namespace, tag)}>{tagLabel(namespace, tag)}</button>)}</p></div>)}</div></>}
  </Overlay>;
}
