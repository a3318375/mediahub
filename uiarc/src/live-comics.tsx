import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, FolderSync, LoaderCircle, RotateCw, Search, Sparkles, Star } from 'lucide-react';
import { languageLabel, namespaceLabel, searchTag, tagLabel } from '../../hero/src/lib/ehentai-tags';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { comicCoverPath, comicGalleryPath, localComicPath, requestError, type Comic, type ComicGallery, type LibraryPage, type LiveApi } from './live-api';
import { WorkspaceTabs } from './ui';
import './library.css';

const sites = { ehentai: 'e-hentai.org', exhentai: 'exhentai.org' };
type ComicTab = 'shelf' | keyof typeof sites;
function comicTabFromHash(): ComicTab {
  const value = new URLSearchParams(window.location.hash.split('?')[1]).get('tab');
  return value === 'ehentai' || value === 'exhentai' ? value : 'shelf';
}
type Reading = { title: string; id: string } | { title: string; gallery: ComicGallery };
const categories = [['all', '全部分类'], ['2', '同人志'], ['4', '漫画'], ['8', '画师 CG'], ['16', '游戏 CG'], ['32', '图集'], ['64', 'Cosplay'], ['128', '写真'], ['256', '非成人'], ['512', '欧美'], ['1', '其他']];
const languages = [['all', '全部语言'], ['chinese', '中文'], ['japanese', '日文'], ['english', '英文']];
const options = (pairs: string[][]) => pairs.map(([value, label]) => ({ value, label }));
const titleOf = (item: Comic) => item.metadata?.title || item.title;
const galleryKey = (item: ComicGallery) => `${item.id}/${item.token}`;
const date = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const size = (bytes: number) => bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

function ComicImage({ api, path, alt = '', onError, onRetry }: { api: LiveApi; path?: string; alt?: string; onError?: () => void; onRetry?: () => void }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(Boolean(alt));
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (visible || !path || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [path, visible]);
  useEffect(() => {
    if (!visible || !path) return;
    const controller = new AbortController();
    let url = '';
    api.image(path, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setSrc(url);
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason, '图片暂时无法读取。')); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, path, visible]);
  useEffect(() => { if (error) onError?.(); }, [error, onError]);
  const image = src && !error ? <img src={src} alt={alt} onError={() => setError('图片暂时无法读取。')} /> : null;
  if (!alt) return <span ref={frame} className="comic-cover">{image || <BookOpen size={27} aria-hidden="true" />}</span>;
  return image || <div className="comic-reader-feedback">
    {error ? <><p role="alert">{error}</p><Button variant="secondary" size="sm" onClick={onRetry}><RotateCw size={15} aria-hidden="true" />重试本页</Button></>
      : <p className="row" role="status"><LoaderCircle size={17} aria-hidden="true" />正在载入漫画页…</p>}
  </div>;
}

export function ReadingShelfCard({ api, title, cover, meta, open }: { api: LiveApi; title: string; cover?: string; meta: string; open: () => void }) {
  return <button className="comic-card" type="button" onClick={open} aria-label={`查看《${title}》详情`}>
    <ComicImage key={cover} api={api} path={cover} />
    <strong title={title}>{title}</strong><small title={meta}>{meta}</small>
  </button>;
}

function GalleryCards({ api, items, select }: { api: LiveApi; items: ComicGallery[]; select: (gallery: ComicGallery) => void }) {
  return <div className="comic-grid">{items.map(item => <ReadingShelfCard key={galleryKey(item)} api={api} title={item.title}
    cover={item.cover ? comicCoverPath(item.cover) : undefined} meta={[item.category || '画廊', item.posted].filter(Boolean).join(' · ')} open={() => select(item)} />)}</div>;
}

function ComicPager({ label, info, prev, next }: { label: string; info: string; prev?: () => void; next?: () => void }) {
  return <nav className="row comic-pager" aria-label={label}>
    <Button size="sm" variant="secondary" disabled={!prev} onClick={prev}><ChevronLeft size={15} aria-hidden="true" />上一页</Button>
    <span className="muted">{info}</span>
    <Button size="sm" variant="secondary" disabled={!next} onClick={next}>下一页<ChevronRight size={15} aria-hidden="true" /></Button>
  </nav>;
}

function Metadata({ api, gallery, cover, findTag }: { api: LiveApi; gallery: ComicGallery; cover?: string; findTag?: (namespace: string, tag: string) => void }) {
  return <>
    <div className="comic-detail-grid">
      <ComicImage key={cover} api={api} path={cover} />
      <dl className="comic-facts">
        <dt>日文标题</dt><dd>{gallery.japaneseTitle || '—'}</dd><dt>分类</dt><dd>{gallery.category || '—'}</dd>
        <dt>页数</dt><dd>{gallery.pages || '—'}</dd><dt>语言</dt><dd>{languageLabel(gallery.language || '') || '—'}</dd>
        <dt>上传者</dt><dd>{gallery.uploader || '—'}</dd><dt>发布</dt><dd>{gallery.posted || '—'}</dd><dt>评分</dt><dd>{gallery.rating || '—'}</dd>
      </dl>
    </div>
    {Object.entries(gallery.tags ?? {}).map(([namespace, tags]) => <div className="comic-tag-group" key={namespace}>
      <strong>{namespaceLabel(namespace)}</strong><div className="row">{tags.map(tag => findTag
        ? <Button size="sm" variant="secondary" key={tag} aria-label={`搜索${namespaceLabel(namespace)} ${tagLabel(namespace, tag)}`} onClick={() => findTag(namespace, tag)}>{tagLabel(namespace, tag)}</Button>
        : <Badge size="sm" key={tag}>{tagLabel(namespace, tag)}</Badge>)}</div>
    </div>)}
  </>;
}

function ComicReader({ api, reading, close }: { api: LiveApi; reading: Reading; close: () => void }) {
  const remote = 'gallery' in reading ? reading.gallery : undefined;
  const id = 'id' in reading ? reading.id : '';
  const storageKey = 'mediahub.reading.position.' + (remote ? `ehentai.${remote.id}.${remote.token}` : id);
  const [position, setPosition] = useState(() => {
    try { return Math.max(0, Math.floor(Number(localStorage.getItem(storageKey))) || 0); } catch { return 0; }
  });
  const [localCount, setLocalCount] = useState<number>();
  const [fit, setFit] = useState('width');
  const [controls, setControls] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const reader = useRef<HTMLElement>(null);
  const count = remote?.pages ?? localCount;
  const index = count ? Math.min(position, count - 1) : 0;
  const [jump, setJump] = useState<number>();
  const pageOptions = useMemo(() => count && count <= 500
    ? Array.from({ length: count }, (_, page) => ({ value: String(page + 1), label: `${page + 1} / ${count}` })) : [], [count]);
  useEffect(() => {
    window.scrollTo(0, 0);
    reader.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setError('');
    api.comicBook(id, controller.signal).then(book => { if (!controller.signal.aborted) setLocalCount(book.count); })
      .catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, id, retry]);
  useEffect(() => {
    if (!count) return;
    try { localStorage.setItem(storageKey, String(index)); } catch { /* Reading also works without storage. */ }
  }, [count, index, storageKey]);
  function turn(next: number) {
    if (!count || !Number.isFinite(next)) return;
    setPosition(Math.min(Math.max(0, Math.floor(next)), count - 1));
    setJump(undefined);
    window.scrollTo(0, 0);
  }
  const base = remote ? comicGalleryPath(remote) : localComicPath(id);
  const path = `${base}/pages/${index}?${new URLSearchParams(remote ? { site: remote.site, retry: String(retry) } : { retry: String(retry) })}`;
  return <section ref={reader} tabIndex={-1} className="comic-reader" aria-label={`阅读《${reading.title}》`} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,button,[role="combobox"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); turn(index + (event.key === 'ArrowLeft' ? 1 : -1)); }
  }}>
    <header className="panel comic-reader-bar" hidden={!controls}>
      <Button size="sm" variant="ghost" className="comic-reader-back" onClick={close} aria-label="返回书库"><ArrowLeft size={17} aria-hidden="true" /><span className="comic-reader-button-label">返回书库</span></Button>
      <div><h1 title={reading.title}>{reading.title}</h1>{!!count && <span className="muted comic-reader-count">{index + 1} / {count} 页</span>}</div>
      <Select label="漫画缩放" value={fit} onValueChange={setFit} options={options([['width', '适应宽度'], ['height', '适应屏幕']])} />
    </header>
    <figure className="comic-reader-canvas" data-fit={fit}>
      {error ? <div className="comic-reader-feedback"><p role="alert">{error}</p><Button variant="secondary" size="sm" onClick={() => setRetry(value => value + 1)}><RotateCw size={15} aria-hidden="true" />重试</Button></div>
        : count === undefined ? <div className="comic-reader-feedback"><p className="row" role="status"><LoaderCircle size={17} aria-hidden="true" />正在打开漫画…</p></div>
          : !count ? <p className="comic-reader-feedback">此作品暂无可读页面。</p> : <>
          <ComicImage key={path} api={api} path={path} alt={`第 ${index + 1} 页`} onError={() => setControls(true)} onRetry={() => setRetry(value => value + 1)} />
          <div className="comic-reader-hit">
            <button type="button" aria-label="图片左侧上一页" disabled={index === 0} onClick={() => turn(index - 1)} />
            <button type="button" aria-label="显示或隐藏阅读菜单" aria-expanded={controls} onClick={() => setControls(value => !value)} />
            <button type="button" aria-label="图片右侧下一页" disabled={index >= count - 1} onClick={() => turn(index + 1)} />
          </div>
        </>}
    </figure>
    {controls && !!count && !error && <nav className="panel row comic-reader-turner" aria-label="阅读翻页">
      <Button size="sm" variant="secondary" aria-label="上一页" disabled={index === 0} onClick={() => turn(index - 1)}><ChevronLeft size={16} aria-hidden="true" /><span className="comic-reader-button-label">上一页</span></Button>
      {pageOptions.length ? <Select label="跳转页码" value={String(index + 1)} onValueChange={value => turn(Number(value) - 1)} options={pageOptions} />
        : <form className="row comic-page-jump" onSubmit={event => { event.preventDefault(); turn((jump ?? index + 1) - 1); }}>
          <Input label="跳转页码" type="number" min={1} max={count} value={jump ?? index + 1} onChange={event => setJump(event.target.valueAsNumber || 1)} />
          <Button type="submit" variant="ghost" size="sm">跳转</Button>
        </form>}
      <Button size="sm" variant="secondary" aria-label="下一页" disabled={index >= count - 1} onClick={() => turn(index + 1)}><span className="comic-reader-button-label">下一页</span><ChevronRight size={16} aria-hidden="true" /></Button>
    </nav>}
  </section>;
}

function ComicShelf({ api, read }: { api: LiveApi; read: (item: Reading) => void }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('title');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<LibraryPage<Comic>>();
  const [listError, setListError] = useState('');
  const [jobError, setJobError] = useState('');
  const [scan, setScan] = useState<Awaited<ReturnType<LiveApi['comicsStatus']>>>();
  const [metadata, setMetadata] = useState<Awaited<ReturnType<LiveApi['comicMetadataStatus']>>>();
  const lastJobs = useRef<{ scan?: typeof scan; metadata?: typeof metadata }>({});
  const [action, setAction] = useState<'scan' | 'metadata' | 'delete'>();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [selected, setSelected] = useState<Comic>();
  const [loading, setLoading] = useState(true);
  const [pollRevision, setPollRevision] = useState(0);
  const locked = pending || scan?.running || metadata?.running;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError('');
    api.comics({ query, sort, page: String(page) }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const last = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (page > last) { setPage(last); return; }
      setResult(data); setLoading(false);
    }).catch(reason => {
      if (!controller.signal.aborted) { setListError(requestError(reason)); setLoading(false); }
    });
    return () => controller.abort();
  }, [api, query, sort, page, revision]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const [scanResult, metaResult] = await Promise.allSettled([api.comicsStatus(controller.signal), api.comicMetadataStatus(controller.signal)]);
      if (controller.signal.aborted) return;
      const previous = lastJobs.current;
      const nextScan = scanResult.status === 'fulfilled' ? scanResult.value : undefined;
      const nextMeta = metaResult.status === 'fulfilled' ? metaResult.value : undefined;
      if ((nextScan && previous.scan && (nextScan.completedAt !== previous.scan.completedAt || previous.scan.running && !nextScan.running))
        || (nextMeta && previous.metadata && nextMeta.completedAt !== previous.metadata.completedAt)) setRevision(value => value + 1);
      if (nextScan) { previous.scan = nextScan; setScan(nextScan); }
      if (nextMeta) { previous.metadata = nextMeta; setMetadata(nextMeta); }
      setJobError([scanResult, metaResult].map(result => result.status === 'rejected' ? requestError(result.reason) : '').filter(Boolean).join(' · '));
      timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api, pollRevision]);

  function chooseAction(next: typeof action) { setActionError(''); setAction(next); }
  async function run(mode: 'missing' | 'all' = 'missing') {
    if (locked || !action) return;
    setPending(true); setActionError('');
    try {
      if (action === 'scan') {
        await api.refreshComics();
        if (scan) { const next = { ...scan, running: true, error: '' }; lastJobs.current.scan = next; setScan(next); }
      } else if (action === 'metadata') {
        await api.refreshComicMetadata(mode);
        if (metadata) { const next = { ...metadata, running: true, total: 0, done: 0, updated: 0, skipped: 0, failed: 0, error: '' }; lastJobs.current.metadata = next; setMetadata(next); }
      } else if (selected) {
        await api.deleteComic(selected.id);
        setSelected(undefined);
        setRevision(value => value + 1);
      }
      setAction(undefined);
      setPollRevision(value => value + 1);
    } catch (reason) { setActionError(requestError(reason)); }
    finally { setPending(false); }
  }

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize || 1)));
  const localCover = (item: Comic) => item.available && ['CBZ', 'DIRECTORY'].includes(item.format) ? localComicPath(item.id) + '/cover' : undefined;
  const actionTitle = action === 'scan' ? '刷新漫画库' : action === 'metadata' ? '刷新漫画元数据' : '删除漫画';
  return <section className="comic-pane" aria-label="漫画书库">
    <form className="panel comic-tools" role="search" aria-label="搜索漫画书库" onSubmit={event => { event.preventDefault(); setQuery(input.trim()); setPage(1); }}>
      <SearchField label="搜索漫画" placeholder="按名称或相对路径查找" value={input} maxLength={170} onValueChange={value => {
        setInput(value); if (!value) { setQuery(''); setPage(1); }
      }} />
      <Button size="sm" variant="secondary" type="submit"><Search size={15} aria-hidden="true" />搜索</Button>
      <Select label="排序方式" value={sort} onValueChange={value => { setSort(value); setPage(1); }} options={options([['title', '名称 A–Z'], ['recent', '最近入库'], ['modified', '文件更新']])} />
      <div className="row comic-tool-actions">
        <Button size="sm" variant="secondary" disabled={locked} onClick={() => chooseAction('scan')}><FolderSync size={16} aria-hidden="true" />{scan?.running ? '刷新库中…' : '刷新库'}</Button>
        <Button size="sm" variant="ghost" disabled={locked} onClick={() => chooseAction('metadata')}><Sparkles size={16} aria-hidden="true" />{metadata?.running ? '更新元数据中…' : '刷新元数据'}</Button>
      </div>
    </form>
    <div className="row comic-summary" role="status">
      <strong>{result ? `共 ${result.total} 部漫画` : loading ? '正在读取书架…' : '漫画书架'}</strong>
      {scan && <small>{scan.running ? '正在扫描目录' : scan.completedAt ? `最近刷新 ${date(scan.completedAt)} · ${scan.found} 个文件` : '书库尚未刷新'}</small>}
    </div>
    {scan && !scan.configured && <p className="muted">{scan.directoryError || '漫画目录暂不可用。'}</p>}
    {(jobError || scan?.error || metadata?.error) && <p role="alert" className="comic-feedback">{[jobError, scan?.error, metadata?.error].filter(Boolean).join(' · ')}</p>}
    {metadata && (metadata.running || metadata.completedAt) && <p role="status" className="muted">元数据{metadata.running ? '刷新中' : '刷新完成'} · {metadata.done}/{metadata.total} · 更新 {metadata.updated} · 未匹配 {metadata.skipped} · 失败 {metadata.failed}</p>}
    {listError ? <div role="alert" className="panel row comic-feedback">{listError}<Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>重试</Button></div>
      : <div aria-busy={loading}>
        {loading ? <p className="panel comic-empty" role="status">正在读取漫画…</p> : result?.items?.length
          ? <div className="comic-grid">{result.items.map(item => <ReadingShelfCard key={item.id} api={api} title={titleOf(item)} cover={localCover(item)}
            meta={size(item.size) + (item.available ? '' : ' · 文件未找到')} open={() => { chooseAction(undefined); setSelected(item); }} />)}</div>
          : <p className="panel comic-empty">{query ? '没有找到匹配的漫画。' : '书架还没有本地漫画。'}</p>}
      </div>}
    {pageCount > 1 && <ComicPager label="书库分页" info={`第 ${page} / ${pageCount} 页`}
      prev={!loading && page > 1 ? () => setPage(page - 1) : undefined} next={!loading && page < pageCount ? () => setPage(page + 1) : undefined} />}

    <Dialog open={Boolean(selected && !action)} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      {selected && <DialogContent className="comic-detail-dialog" title={titleOf(selected)}>
        <div className="stack">
          {selected.metadata ? <Metadata api={api} gallery={selected.metadata} cover={localCover(selected)} /> : <p className="muted">尚未获取元数据，可用「刷新元数据」补充作品资料。</p>}
          <dl className="comic-facts">
            <dt>格式</dt><dd>{selected.format === 'DIRECTORY' ? '图片目录' : selected.format}</dd><dt>文件大小</dt><dd>{size(selected.size)}</dd>
            <dt>相对路径</dt><dd>{selected.path}</dd><dt>文件更新</dt><dd>{date(selected.modifiedAt)}</dd>
            <dt>首次入库</dt><dd>{date(selected.importedAt)}</dd><dt>文件状态</dt><dd>{selected.available ? '最近扫描时存在' : '最近扫描时未找到'}</dd>
          </dl>
          {selected.available && !localCover(selected) && <p className="muted">此格式暂不支持在线阅读。</p>}
          <div className="row comic-dialog-actions">
            <Button size="sm" variant="danger" disabled={locked} onClick={() => chooseAction('delete')}>删除漫画</Button>
            <Button size="sm" disabled={!localCover(selected)} onClick={() => { read({ title: titleOf(selected), id: selected.id }); setSelected(undefined); }}><BookOpen size={16} aria-hidden="true" />开始 / 继续阅读</Button>
          </div>
        </div>
      </DialogContent>}
    </Dialog>
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !pending) chooseAction(undefined); }}>
      {action && <DialogContent title={actionTitle}>
        <div className="stack">
          <p>{action === 'scan' ? '将导入下载目录中的漫画、清理失效书架记录，并在解压校验成功后删除源压缩包。'
            : action === 'metadata' ? '补充标题、分类、页数、语言、上传者、发布时间、评分及标签。未匹配的作品保留原有信息。'
              : `将永久删除《${selected ? titleOf(selected) : ''}》的本地文件、书架记录、封面和元数据。`}</p>
          {actionError && <p role="alert" className="comic-feedback">{actionError}</p>}
          <div className="row comic-dialog-actions">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => chooseAction(undefined)}>取消</Button>
            {action === 'metadata' ? <>
              <Button size="sm" variant="secondary" disabled={locked} onClick={() => void run('missing')}>仅补缺失</Button>
              <Button size="sm" disabled={locked} onClick={() => void run('all')}>刷新全部</Button>
            </> : <Button size="sm" variant={action === 'delete' ? 'danger' : 'primary'} loading={pending} disabled={locked} onClick={() => void run()}>{action === 'scan' ? '确认刷新' : '确认删除'}</Button>}
          </div>
        </div>
      </DialogContent>}
    </Dialog>
  </section>;
}

function GalleryBrowse({ api, site, initialQuery, language, setLanguage, select }: {
  api: LiveApi; site: string; initialQuery: string; language: string; setLanguage: (language: string) => void; select: (gallery: ComicGallery) => void;
}) {
  const [input, setInput] = useState(initialQuery);
  const [category, setCategory] = useState('all');
  const [filters, setFilters] = useState({ query: initialQuery, category: '', language: language === 'all' ? '' : language });
  const [cursors, setCursors] = useState(['']);
  const [result, setResult] = useState<Awaited<ReturnType<LiveApi['comicGalleries']>>>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.comicGalleries({ site, ...filters, cursor: cursors.at(-1) || '' }, controller.signal).then(data => {
      if (!controller.signal.aborted) { setResult(data); setLoading(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setError(requestError(reason)); setLoading(false); }
    });
    return () => controller.abort();
  }, [api, site, filters, cursors, revision]);

  return <section className="comic-pane" aria-label={site === sites.exhentai ? 'ExHentai 画廊' : 'E-Hentai 画廊'}>
    <form className="panel comic-tools comic-source-tools" role="search" aria-label="搜索画廊" onSubmit={event => {
      event.preventDefault(); setCursors(['']);
      setFilters({ query: input.trim(), category: category === 'all' ? '' : category, language: language === 'all' ? '' : language });
    }}>
      <SearchField label="画廊搜索词" placeholder="搜索标题、作者或标签" value={input} maxLength={200} onValueChange={setInput} />
      <Button size="sm" type="submit" disabled={loading}><Search size={15} aria-hidden="true" />搜索</Button>
      <Select label="漫画分类" value={category} onValueChange={setCategory} options={options(categories)} />
      <Select label="漫画语言" value={language} onValueChange={setLanguage} options={options(languages)} />
    </form>
    {error ? <div className="panel row comic-feedback" role="alert">{error}<Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>重试</Button></div>
      : loading ? <p className="panel comic-empty" role="status">正在读取站点画廊…</p>
        : result?.items?.length ? <GalleryCards api={api} items={result.items} select={select} /> : <p className="panel comic-empty">没有找到匹配的画廊。</p>}
    {result && !error && <ComicPager label="画廊分页" info={`第 ${cursors.length} 页 · 本页 ${result.items?.length ?? 0} 部`}
      prev={!loading && cursors.length > 1 ? () => setCursors(value => value.slice(0, -1)) : undefined}
      next={!loading && result.next ? () => setCursors(value => [...value, result.next]) : undefined} />}
  </section>;
}

function GalleryDetail({ api, item, favorite, close, read, save, findTag }: {
  api: LiveApi; item: ComicGallery; favorite: boolean; close: () => void; read: (gallery: ComicGallery) => void;
  save: (gallery: ComicGallery) => void; findTag: (namespace: string, tag: string) => void;
}) {
  const [detail, setDetail] = useState<ComicGallery>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.comicGallery(item, controller.signal).then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, item, revision]);
  async function collect(gallery: ComicGallery) {
    setSaving(true); setSaveError('');
    try { await api.favoriteComic(gallery); save(gallery); }
    catch (reason) { setSaveError(requestError(reason)); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent title={detail?.title || item.title} className="comic-detail-dialog">
      <div className="stack">
        {error ? <div role="alert" className="row comic-feedback">{error}<Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>重试</Button></div>
          : detail ? <Metadata api={api} gallery={detail} cover={detail.cover ? comicCoverPath(detail.cover) : undefined} findTag={findTag} />
            : <p role="status">正在读取画廊详情…</p>}
        {saveError && <p role="alert" className="comic-feedback">{saveError}</p>}
        <div className="row comic-dialog-actions">
          <Button size="sm" variant="secondary" disabled={!detail || saving || favorite} onClick={() => { if (detail) void collect(detail); }}><Star size={16} aria-hidden="true" />{favorite ? '已加入书架' : saving ? '收藏中…' : '加入书架'}</Button>
          <Button size="sm" disabled={!detail?.pages} onClick={() => { if (detail) read(detail); }}><BookOpen size={16} aria-hidden="true" />在线阅读</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function LiveComics({ api }: { api: LiveApi }) {
  const [tab, setTab] = useState(comicTabFromHash);
  const [configured, setConfigured] = useState<boolean>();
  const [credentialsError, setCredentialsError] = useState('');
  const [favorites, setFavorites] = useState<ComicGallery[]>();
  const [favoriteError, setFavoriteError] = useState('');
  const [favoriteRevision, setFavoriteRevision] = useState(0);
  const [language, setLanguage] = useState('chinese');
  const [tag, setTag] = useState<{ query: string; tab: ComicTab; revision: number }>();
  const [selected, setSelected] = useState<ComicGallery>();
  const [reading, setReading] = useState<Reading>();
  const active = tab === 'exhentai' && !configured ? configured === false ? 'ehentai' : 'shelf' : tab;
  function chooseTab(next: ComicTab) {
    setTab(next);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#comics?tab=${next}`);
  }
  useEffect(() => {
    const sync = () => {
      if (/^#\/?comics(?:\?|$)/.test(window.location.hash)) setTab(comicTabFromHash());
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.comicCredentials(controller.signal).then(data => { if (!controller.signal.aborted) setConfigured(data.configured); })
      .catch(reason => { if (!controller.signal.aborted) { setConfigured(false); setCredentialsError(requestError(reason)); } });
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    const controller = new AbortController();
    setFavoriteError('');
    api.comicFavorites(controller.signal).then(data => {
      if (!controller.signal.aborted) setFavorites((data.items ?? []).sort((a, b) => a.title.localeCompare(b.title)));
    }).catch(reason => { if (!controller.signal.aborted) setFavoriteError(requestError(reason)); });
    return () => controller.abort();
  }, [api, favoriteRevision]);

  const tabs = [
    { id: 'shelf', label: '我的书架', content: <div className="comic-pane"><ComicShelf api={api} read={setReading} />
      {(!!favorites?.length || favoriteError) && <section className="comic-pane" aria-label="在线收藏">
        <h2>在线收藏</h2>
        {favoriteError && <div className="row comic-feedback" role="alert">{favoriteError}<Button size="sm" variant="ghost" onClick={() => setFavoriteRevision(value => value + 1)}>重试</Button></div>}
        {!!favorites?.length && <GalleryCards api={api} items={favorites} select={setSelected} />}
      </section>}
    </div> },
    ...(['ehentai', 'exhentai'] as const).filter(id => id !== 'exhentai' || configured).map(id => ({
      id, label: id === 'ehentai' ? 'E-Hentai' : 'ExHentai',
      content: <GalleryBrowse key={`${id}/${tag?.tab === id ? tag.revision : 0}`} api={api} site={sites[id]} initialQuery={tag?.tab === id ? tag.query : ''}
        language={language} setLanguage={setLanguage} select={setSelected} />,
    })),
  ];
  return <section className="comics-page" aria-label="漫画">
    <div hidden={Boolean(reading)}>
      <h1>漫画</h1>
      {credentialsError && <p role="alert" className="comic-feedback">无法读取漫画来源配置。{credentialsError}</p>}
      <WorkspaceTabs label="漫画来源" items={tabs} value={active} onChange={value => chooseTab(value as ComicTab)} />
    </div>
    {selected && <GalleryDetail key={`${selected.site}/${galleryKey(selected)}`} api={api} item={selected} close={() => setSelected(undefined)}
      favorite={favorites?.some(item => galleryKey(item) === galleryKey(selected)) ?? false}
      read={gallery => { setSelected(undefined); setReading({ title: gallery.title, gallery }); }}
      save={gallery => {
        setFavorites(items => [...(items ?? []).filter(item => galleryKey(item) !== galleryKey(gallery)), gallery]);
        setFavoriteRevision(value => value + 1);
      }} findTag={(namespace, value) => {
        const target = selected.site === sites.exhentai && configured ? 'exhentai' : 'ehentai';
        const next = searchTag(namespace, value, language);
        setLanguage(next.language);
        setTag(previous => ({ query: next.query, tab: target, revision: (previous?.revision ?? 0) + 1 }));
        setSelected(undefined); chooseTab(target);
      }} />}
    {reading && <ComicReader api={api} reading={reading} close={() => setReading(undefined)} />}
  </section>;
}
