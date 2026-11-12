import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, FolderSync, List } from 'lucide-react';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { Slider } from './arc/slider/slider';
import { requestError, type LibraryItem, type LiveApi } from './live-api';
import { ReadingShelfCard } from './live-comics';
import { PageHeading } from './ui';

const options = (values: string[][]) => values.map(([value, label]) => ({ value, label }));
const positionKey = (id: string) => 'mediahub.reading.position.' + id;
function position(id: string) {
  try {
    const value = Number(localStorage.getItem(positionKey(id)));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }
  catch { return 0; }
}

function NovelReader({ api, item, close }: { api: LiveApi; item: LibraryItem; close: () => void }) {
  const [book, setBook] = useState<Awaited<ReturnType<LiveApi['novelBook']>>>();
  const [chapter, setChapter] = useState<Awaited<ReturnType<LiveApi['novelChapter']>>>();
  const [index, setIndex] = useState(() => position(item.id));
  const [contents, setContents] = useState(false);
  const [theme, setTheme] = useState('纸色');
  const [font, setFont] = useState(19);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    if (book) return;
    const controller = new AbortController();
    setError('');
    api.novelBook(item.id, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setIndex(current => Math.max(0, Math.min(current, result.count - 1)));
      setBook(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, book, item.id, retry]);
  useEffect(() => {
    if (!book?.count) return;
    const controller = new AbortController();
    setError(''); setChapter(undefined);
    api.novelChapter(item.id, index, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setChapter(result);
      try { localStorage.setItem(positionKey(item.id), String(index)); } catch { /* Reading still works. */ }
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, book, index, item.id, retry]);

  function turn(next: number) {
    if (!book || next < 0 || next >= book.count || next === index) return;
    setChapter(undefined); setIndex(next);
    article.current?.scrollIntoView({ block: 'start' });
  }
  const chapters = Array.from({ length: book?.count ?? 0 }, (_, i) => ({
    value: String(i), label: book?.chapters?.[i]?.title || `第 ${i + 1} 章`,
  }));

  return <section className="stack reading-reader" aria-label={`阅读《${item.title}》`} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input, select, button, [role="combobox"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      turn(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  }}>
    <header className="panel reading-reader-header">
      <Button variant="ghost" onClick={close}><ArrowLeft size={17} aria-hidden="true" />返回书库</Button>
      <div><h1>{item.title}</h1>{!!book?.count && <p className="muted" aria-live="polite">第 {index + 1} / {book.count} 章 · 进度自动保存</p>}</div>
      <div className="row reading-reader-controls">
        <Button variant="secondary" disabled={!chapters.length} aria-expanded={contents} onClick={() => setContents(value => !value)}><List size={16} aria-hidden="true" />目录</Button>
        <Select label="阅读背景" options={options([['纸色', '纸色'], ['明亮', '明亮'], ['夜间', '夜间']])} value={theme} onValueChange={setTheme} />
      </div>
    </header>
    {contents && <div className="panel reading-contents">
      <Select label="章节目录" value={String(index)} options={chapters} onValueChange={value => { turn(Number(value)); setContents(false); }} />
      <Slider label="字号" value={font} min={15} max={28} onValueChange={setFont} />
    </div>}
    <article ref={article} tabIndex={0} className="novel-paper" data-reading-theme={theme} style={{ fontSize: font }}>
      {error ? <div className="stack"><p role="alert">{error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>重试</Button></div>
        : chapter ? <><h2>{chapter.title}</h2>{chapter.paragraphs?.map((text, i) => <p key={i}>{text}</p>)}</>
        : <p role="status">{book && !book.count ? '没有可阅读的章节。' : '正在读取章节…'}</p>}
    </article>
    {!!book?.count && <nav className="reading-turner" aria-label="章节翻页">
      <Button variant="secondary" disabled={index === 0} onClick={() => turn(index - 1)}><ChevronLeft size={16} aria-hidden="true" />上一章</Button>
      <Select label="跳转章节" value={String(index)} options={chapters} onValueChange={value => turn(Number(value))} />
      <Button variant="secondary" disabled={index >= book.count - 1} onClick={() => turn(index + 1)}>下一章<ChevronRight size={16} aria-hidden="true" /></Button>
    </nav>}
  </section>;
}

export function LiveNovels({ api }: { api: LiveApi }) {
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [sort, setSort] = useState('title');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [books, setBooks] = useState<Awaited<ReturnType<LiveApi['novels']>>>();
  const [status, setStatus] = useState<Awaited<ReturnType<LiveApi['novelsStatus']>>>();
  const [error, setError] = useState('');
  const [scanError, setScanError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<LibraryItem>();
  const [reading, setReading] = useState<LibraryItem>();

  useEffect(() => {
    const controller = new AbortController();
    setBooks(undefined); setError('');
    const timer = setTimeout(() => {
      api.novels({ query: query.trim(), format: format === 'all' ? '' : format, sort, page: String(page) }, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        const last = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > last) setPage(last);
        else setBooks(result);
      }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    }, query ? 180 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, format, page, query, revision, sort]);
  useEffect(() => {
    const controller = new AbortController();
    let previous: typeof status;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.novelsStatus(controller.signal);
        if (controller.signal.aborted) return;
        if (previous && (next.completedAt !== previous.completedAt || (previous.running && !next.running))) {
          setRevision(value => value + 1);
        }
        previous = next;
        setStatus(next); setStatusError('');
        if (!next.running) setScanning(false);
      } catch (reason) {
        if (!controller.signal.aborted) { setStatusError(requestError(reason)); setScanning(false); }
      } finally { if (!controller.signal.aborted) timer = setTimeout(poll, 3000); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api]);

  async function scan() {
    if (scanning || status?.running) return;
    setScanning(true); setScanError('');
    try { await api.refreshNovels(); }
    catch (reason) { setScanError(requestError(reason)); setScanning(false); }
  }
  const totalPages = Math.max(1, Math.ceil((books?.total ?? 0) / (books?.pageSize || 1)));
  const items = books?.items ?? [];
  return <>
    <section className="reading-library" hidden={Boolean(reading)}>
      <PageHeading title="小说" description="浏览本地 TXT 和 EPUB 书库。" action={
        <Button variant="secondary" disabled={!status || scanning || status.running} onClick={() => void scan()}>
          <FolderSync size={16} aria-hidden="true" />{scanning || status?.running ? '正在扫描…' : '刷新书库'}
        </Button>
      } />
      <div className="panel comic-tools">
        <SearchField label="搜索小说" placeholder="搜索书名…" value={query} onValueChange={value => { setQuery(value); setPage(1); }} />
        <Select label="文件格式" value={format} options={options([['all', '全部格式'], ['TXT', 'TXT'], ['EPUB', 'EPUB']])} onValueChange={value => { setFormat(value); setPage(1); }} />
        <Select label="排序" value={sort} options={options([['title', '名称'], ['recent', '最近入库'], ['modified', '文件更新']])} onValueChange={value => { setSort(value); setPage(1); }} />
      </div>
      <div className="reading-summary" role="status">
        {status?.root && <span>书库目录 · {status.root}</span>}{books && <span>{books.total} 部作品</span>}
      </div>
      {(statusError || scanError || status?.directoryError || status?.error) && <p role="alert" className="comic-feedback">{scanError || statusError || status?.directoryError || status?.error}</p>}
      {error ? <div className="row"><p role="alert">{error}</p><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重试</Button></div>
        : !books ? <p role="status">正在读取小说书库…</p>
        : items.length ? <div className="comic-grid">{items.map(item => <ReadingShelfCard api={api} key={item.id} title={item.title}
          cover={item.format === 'EPUB' && item.available ? '/api/v1/reading/novels/' + encodeURIComponent(item.id) + '/cover' : undefined}
          meta={item.format + (item.available ? '' : ' · 文件不可用')} open={() => setSelected(item)} />)}</div>
        : <div className="panel comic-empty"><BookOpen size={22} aria-hidden="true" /><p>{query || format !== 'all' ? '没有符合条件的小说。' : '书库暂无小说，可在目录可用后刷新书库。'}</p></div>}
      {totalPages > 1 && <nav className="row comic-pager" aria-label="小说书库分页">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
        <span>第 {page} / {totalPages} 页</span>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
      </nav>}
    </section>
    {selected && <Dialog open onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent title={selected.title} description={selected.format}>
        <div className="stack">
          <dl className="comic-facts">
            <dt>相对路径</dt><dd>{selected.path}</dd>
            <dt>大小</dt><dd>{(selected.size / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} KB</dd>
            <dt>文件更新</dt><dd>{new Date(selected.modifiedAt).toLocaleString('zh-CN', { hour12: false })}</dd>
            <dt>文件状态</dt><dd>{selected.available ? '可阅读' : '最近扫描未找到文件'}</dd>
          </dl>
          <div className="row form-actions"><Button disabled={!selected.available} onClick={() => {
            setReading(selected); setSelected(undefined); window.scrollTo(0, 0);
          }}>{position(selected.id) > 0 ? '继续阅读' : '开始阅读'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>}
    {reading && <NovelReader key={reading.id} api={api} item={reading} close={() => setReading(undefined)} />}
  </>;
}
