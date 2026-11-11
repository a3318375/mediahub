import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, BookText, ChevronLeft, ChevronRight, FolderSync, List, Search, Star } from 'lucide-react';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { Slider } from './arc/slider/slider';
import { NoResults, PageHeading, WorkspaceTabs } from './ui';
import { includes, options } from './model';
import type { DemoState, Update } from './model';
import desert from './posters/dune-wide.jpg';

type Kind = 'comics' | 'novels';
type Sample = { id: string; title: string; genre: string; tone: string; pages: string[] };
type Book = Sample & { path: string; format: string; size: string; modified: string; imported: string; source?: string; language?: string };

const comics = [
  { id: 'dunes', title: '沙海来信', genre: '科幻', tone: 'dawn', pages: ['离开驿站之前，女孩把最后一封信藏进背包。', '沙丘背后有灯光，她循着风找到一辆停了许多年的车。', '车里没有回信，只有一张指向北方的地图。'] },
  { id: 'neon', title: '霓虹之后', genre: '悬疑', tone: 'orbit', pages: ['午夜十二点，旧车站的时钟退回了一格。', '最后一班列车开来，却在空无一人的站台停下。', '车门打开，广播只报了一个她熟悉的名字。'] },
];
const novels = [
  { id: 'ocean', title: '潮汐备忘录', genre: '科幻', tone: 'orbit', pages: ['第一章 · 退潮\n\n傍晚，海水退到比往年任何时候都更远的地方。林桐沿着海堤走，发现几段被潮水遮住的台阶。台阶尽头立着一扇门，门把手上缠着一根红绳。', '第二章 · 留声机\n\n门后是一间狭小的值班室。桌上的留声机没有上发条，却在林桐放下背包时发出声响。她听见自己的声音，正用极慢的速度念一封从未写过的信。', '第三章 · 回信\n\n海水涨到门沿。她把纸条折好，塞进留声机下方的抽屉。转身时，台阶上的脚印已被海水一一抹去。'] },
  { id: 'station', title: '最后一班渡轮', genre: '剧情', tone: 'rain', pages: ['第一章 · 船票\n\n港口钟响的时候，天已经黑透。售票员从玻璃窗后推来一张船票，提醒她渡轮只在雾散前停留。', '第二章 · 雾中灯\n\n对岸的灯亮了一下，又熄灭。她站在甲板最靠前的位置，终于看清那点灯光来自一座离岸不远的小屋。'] },
];

const comicSamples = [...comics,
  { id: 'post', title: '海风邮局 · 第一卷', genre: '漫画', tone: 'orbit', pages: ['开门时，第一封信已经躺在柜台上。', '收信人写着一座地图上没有的岛。', '她把信放在窗边，等潮水涨起来。'] },
  { id: 'moon', title: '月球背面的旅人', genre: '科幻', tone: 'rain', pages: ['月面车在环形山的阴影里停下。', '头盔里的声音突然说，欢迎回家。'] },
  { id: 'store', title: '森林便利店', genre: '漫画', tone: 'rain', pages: ['狐狸每天六点准时来买一盒牛奶。', '今天它留下了一把刻着门牌的钥匙。'] },
  { id: 'rain-case', title: '雨夜侦探社 · 01', genre: '悬疑', tone: 'orbit', pages: ['窗外的脚印只有半个。', '侦探把伞撑开，沿着水声走到街角。'] },
  { id: 'train', title: '星际列车', genre: '科幻', tone: 'dawn', pages: ['列车驶出站台，车窗里渐渐亮起星光。', '下一站的名字，列车员也从未听过。'] },
  { id: 'town', title: '小镇日记', genre: '漫画', tone: 'rain', pages: ['夏末的风带着晒干的衣服的气味。', '书店门口多了一张写着明天见的纸。'] },
  { id: 'cloud', title: '云端图书馆', genre: '奇幻', tone: 'orbit', pages: ['每一层楼都漂浮在一朵云里。', '馆员说，借出的书会自己飞回来。'] },
];
const novelSamples = [...novels,
  { id: 'lighthouse', title: '长夜灯塔', genre: '悬疑', tone: 'orbit', pages: ['第一章 · 雾号\n\n灯塔上的钟停了三天。周澄沿着盘旋的楼梯向上走，手心里握着一枚生锈的铜钥匙。', '第二章 · 返航\n\n雾号突然响起。她跑到平台上，看见一艘小船正在灯光里缓缓转身。'] },
  { id: 'time-shelf', title: '时间的藏书室', genre: '科幻', tone: 'dawn', pages: ['第一章 · 借阅记录\n\n借书卡上写着她还没到过的日期。图书管理员合上簿册，问她是否想提前归还。', '第二章 · 空书架\n\n第二天，那一排书架全空了，只留下一封纸信。'] },
  { id: 'mountain', title: '远山有回声', genre: '剧情', tone: 'rain', pages: ['第一章 · 上山\n\n回乡的巴士走得很慢。她推开窗，让山谷的风吹走车厢里的闷气。', '第二章 · 回声\n\n她喊了一声，远山用了很久才回答。'] },
  { id: 'letter', title: '第七封来信', genre: '悬疑', tone: 'orbit', pages: ['第一章 · 邮戳\n\n前六封都没有寄件人。她翻过第七封，却看见自己多年前的住址。', '第二章 · 回执\n\n她找出笔，第一次试着给那个地址写回信。'] },
  { id: 'spring', title: '春日慢行', genre: '剧情', tone: 'rain', pages: ['第一章 · 花店\n\n天还没亮，花店门口的水桶已经装满了。她路过时，总会停下来看看今天的花。', '第二章 · 河边\n\n下午他们沿河走，没有目的地，也不必赶时间。'] },
  { id: 'galaxy', title: '银河拾荒者', genre: '科幻', tone: 'dawn', pages: ['第一章 · 漂流物\n\n雷达捞到一段失联已久的通讯。它反复播放同一句话：这里的早晨很美。', '第二章 · 航标\n\n阿颂把通讯存好，又在航图上点亮一个新的坐标。'] },
];

const shelf = (items: Sample[], comic: boolean): Book[] => items.map((item, index) => {
  const format = comic ? 'CBZ' : index % 2 ? 'TXT' : 'EPUB';
  const day = String(18 - index).padStart(2, '0');
  return {
    ...item, format, size: comic ? `${(48 + index * 8.6).toFixed(1)} MB` : `${(0.8 + index * .3).toFixed(1)} MB`,
    path: `${comic ? '漫画' : '小说'}/${item.title}.${format.toLowerCase()}`,
    modified: `2026-10-${day} 16:00`, imported: `2026-10-${String(19 - (index + 3) % items.length).padStart(2, '0')} 10:00`,
  };
});
const comicBooks = shelf(comicSamples, true);
const novelBooks = shelf(novelSamples, false);
const galleries: Book[] = [
  { ...comicBooks[2], id: 'gallery-post', source: 'E-Hentai', language: '中文', path: '本地画廊样例' },
  { ...comicBooks[3], id: 'gallery-moon', source: 'E-Hentai', language: '日文', path: '本地画廊样例' },
  { ...comicBooks[4], id: 'gallery-store', source: 'ExHentai', language: '中文', path: '本地画廊样例' },
];

function Cover({ book, comic }: { book: Book; comic: boolean }) {
  return <span className={`book-cover ${book.tone}`}>
    <span className="book-cover-kind">{comic ? '漫画' : book.format}</span>
    <strong>{book.title}</strong>
    <small>{book.source ?? (comic ? '漫画藏书' : '私人书架')}</small>
  </span>;
}

function BookGrid({ books, comic, onOpen }: { books: Book[]; comic: boolean; onOpen: (book: Book) => void }) {
  return <div className="book-grid">{books.map(book => <button type="button" className="book-card" key={book.id} aria-label={`查看《${book.title}》信息`} onClick={() => onOpen(book)}>
    <Cover book={book} comic={comic} />
    <span className="media-title">{book.title}</span><span className="muted">{book.size} · {book.format}</span>
  </button>)}</div>;
}

function BookReader({ book, comic, state, update, close }: {
  book: Book; comic: boolean; state: DemoState; update: Update; close: () => void;
}) {
  const [page, setPage] = useState(() => Math.max(0, Math.min(state.reading[book.id] ?? 0, book.pages.length - 1)));
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState('纸色');
  const [fit, setFit] = useState('适应宽度');
  const [showContents, setShowContents] = useState(false);
  const content = useRef<HTMLElement>(null);
  const unit = comic ? '页' : '章';
  const current = book.pages[page];
  const [chapter, ...paragraphs] = current.split('\n\n');
  const pageOptions = book.pages.map((text, index) => ({ value: String(index), label: comic ? `第 ${index + 1} 页` : text.split('\n\n')[0] }));
  function turn(next: number) {
    setPage(next);
    update(currentState => ({ ...currentState, reading: { ...currentState.reading, [book.id]: next } }));
    content.current?.scrollIntoView({ block: 'nearest' });
  }
  return <section className="stack reading-reader" aria-label={`阅读 ${book.title}`}>
    <header className="panel reading-reader-header">
      <Button variant="ghost" onClick={close}><ArrowLeft size={17} aria-hidden="true" />返回书库</Button>
      <div><h1>{book.title}</h1><p className="muted" aria-live="polite">第 {page + 1} / {book.pages.length} {unit} · 进度自动保存</p></div>
      <div className="row reading-reader-controls">
        {comic ? <Select label="漫画缩放" options={options(['适应宽度', '适应屏幕'])} value={fit} onValueChange={setFit} />
          : <><Button variant="secondary" aria-expanded={showContents} onClick={() => setShowContents(value => !value)}><List size={16} aria-hidden="true" />目录</Button>
            <Select label="阅读背景" options={options(['纸色', '明亮', '夜间'])} value={theme} onValueChange={setTheme} /></>}
      </div>
    </header>
    {showContents && <section className="panel reading-contents">
      <Select label="章节目录" options={pageOptions} value={String(page)} onValueChange={value => turn(Number(value))} />
      <Slider label="字号" value={fontSize} min={15} max={28} onValueChange={setFontSize} />
    </section>}
    {comic ? <figure className="comic-canvas" data-fit={fit} ref={content}>
      <div className={`comic-sheet ${book.tone}`} data-page={page % 3}>
        {book.id === 'dunes' && page === 0 && <img src={desert} alt="" />}
        <span className="comic-caption">{current}</span>
      </div>
    </figure> : <article ref={content} className="novel-paper" data-reading-theme={theme} style={{ fontSize }}>
      <h2>{chapter}</h2>
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </article>}
    <nav className="reading-turner" aria-label="阅读翻页">
      <Button variant="secondary" disabled={page === 0} onClick={() => turn(page - 1)}><ChevronLeft size={16} aria-hidden="true" />上一{unit}</Button>
      <Select label={comic ? '漫画页码' : '跳转章节'} options={pageOptions} value={String(page)} onValueChange={value => turn(Number(value))} />
      <Button variant="secondary" disabled={page === book.pages.length - 1} onClick={() => turn(page + 1)}>下一{unit}<ChevronRight size={16} aria-hidden="true" /></Button>
    </nav>
  </section>;
}

function Shelf({ books, comic, onOpen }: { books: Book[]; comic: boolean; onOpen: (book: Book) => void }) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('名称 A–Z');
  const [page, setPage] = useState(1);
  const [scan, setScan] = useState(false);
  const [scanTime, setScanTime] = useState('');
  const [metadataDialog, setMetadataDialog] = useState(false);
  const [metadataStatus, setMetadataStatus] = useState('');
  const kind = comic ? '漫画' : '小说';
  const results = books.filter(book => includes(book.title, query) || includes(book.path, query));
  results.sort((a, b) => sort === '名称 A–Z' ? a.title.localeCompare(b.title, 'zh-CN')
    : sort === '最近入库' ? b.imported.localeCompare(a.imported) : b.modified.localeCompare(a.modified));
  const pageSize = 36;
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  useEffect(() => {
    if (!scan) return;
    const timer = setTimeout(() => {
      setScanTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      setScan(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [scan]);
  return <div className="stack">
    <div className="panel reading-tools">
      <form className="reading-search" role="search" aria-label={`搜索${kind}书库`} onSubmit={event => {
        event.preventDefault(); setQuery(draft.trim()); setPage(1);
      }}>
        <SearchField label={`搜索${kind}`} placeholder={`搜索${kind}名称或路径…`} value={draft} onValueChange={value => {
          setDraft(value); if (!value) { setQuery(''); setPage(1); }
        }} />
        <Button variant="secondary" type="submit"><Search size={16} aria-hidden="true" />搜索</Button>
        <Button type="button" loading={scan} disabled={scan} onClick={() => setScan(true)}><FolderSync size={16} aria-hidden="true" />{scan ? '刷新中…' : '刷新库'}</Button>
        {comic && <Button variant="secondary" type="button" onClick={() => setMetadataDialog(true)}>刷新元数据</Button>}
      </form>
      <Select label="排序方式" value={sort} options={options(['名称 A–Z', '最近入库', '文件更新'])} onValueChange={value => { setSort(value); setPage(1); }} />
    </div>
    <div className="reading-summary" role="status">
      <span>共 {results.length} 部{kind}</span><span>{scan ? '正在刷新示例书库…' : scanTime ? `最近刷新 ${scanTime} · ${books.length} 个样例` : '示例书库'}</span>
      {metadataStatus && <span>{metadataStatus}</span>}
    </div>
    {results.length ? <BookGrid books={results.slice((page - 1) * pageSize, page * pageSize)} comic={comic} onOpen={onOpen} />
      : <NoResults title="没有找到匹配的作品" reset={() => { setDraft(''); setQuery(''); setPage(1); }} />}
    {pages > 1 && <nav className="row pagination" aria-label="书库分页">
      <Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</Button>
      <span>第 {page} / {pages} 页</span><Button variant="secondary" disabled={page === pages} onClick={() => setPage(value => value + 1)}>下一页</Button>
    </nav>}
    <Dialog open={metadataDialog} onOpenChange={setMetadataDialog}>
      <DialogContent title="刷新漫画元数据" description="预览标题、分类、语言与页数的整理流程。">
        <div className="row">{['仅补缺失', '刷新全部'].map((mode, index) => <Button key={mode} variant={index ? 'primary' : 'secondary'} onClick={() => {
          setMetadataStatus(index ? `已核对 ${books.length} 部示例作品的元数据` : '示例元数据已齐全');
          setMetadataDialog(false);
        }}>{mode}</Button>)}</div>
      </DialogContent>
    </Dialog>
  </div>;
}

function Gallery({ source, onOpen }: { source: string; onOpen: (book: Book) => void }) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('全部分类');
  const [language, setLanguage] = useState('全部语言');
  const books = galleries.filter(book => book.source === source && includes(book.title, query) &&
    (genre === '全部分类' || genre === book.genre) && (language === '全部语言' || language === book.language));
  return <div className="stack">
    <div className="panel reading-tools">
      <form className="reading-search" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); }}>
        <SearchField label="画廊搜索词" placeholder="搜索本地画廊样例" value={draft} onValueChange={value => { setDraft(value); if (!value) setQuery(''); }} />
        <Button variant="secondary" type="submit">搜索</Button>
      </form>
      <Select label="漫画分类" options={options(['全部分类', '漫画', '科幻'])} value={genre} onValueChange={setGenre} />
      <Select label="漫画语言" options={options(['全部语言', '中文', '日文'])} value={language} onValueChange={setLanguage} />
    </div>
    <p className="muted">{source} · {books.length} 部本地画廊样例</p>
    {books.length ? <BookGrid books={books} comic onOpen={onOpen} /> : <NoResults title="没有找到匹配的画廊" reset={() => { setDraft(''); setQuery(''); setGenre('全部分类'); setLanguage('全部语言'); }} />}
  </div>;
}

export function Reading({ kind, state, update }: { kind: Kind; state: DemoState; update: Update }) {
  const comic = kind === 'comics';
  const [selected, setSelected] = useState<Book | null>(null);
  const [reading, setReading] = useState<Book | null>(null);
  const [returnTo, setReturnTo] = useState(0);
  const library = comic ? [...comicBooks, ...galleries.filter(book => state.readingShelf.includes(book.id))] : novelBooks;
  const Icon = comic ? BookOpen : BookText;
  const shelfView = <Shelf books={library} comic={comic} onOpen={setSelected} />;
  const sources = ['E-Hentai', ...(state.settings['basic.comicsCookie'] ? ['ExHentai'] : [])];
  function openReader(book: Book) {
    setReturnTo(window.scrollY);
    setSelected(null);
    setReading(book);
    window.scrollTo(0, 0);
  }
  return <>
  <section className="reading-library" hidden={Boolean(reading)}>
    <PageHeading title={comic ? '漫画' : '小说'} />
    {comic ? <WorkspaceTabs label="漫画来源" items={[
      { id: 'shelf', label: '我的书架', content: shelfView },
      ...sources.map(source => ({ id: source, label: source, content: <Gallery source={source} onOpen={setSelected} /> })),
    ]} /> : shelfView}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
      {selected && <DialogContent className="wide-dialog" title={selected.title} description={selected.source ?? '书库示例作品'}>
        <div className="book-detail">
          <Cover book={selected} comic={comic} />
          <div className="stack">
            <div className="row"><Badge>{selected.genre}</Badge><Badge>{selected.format}</Badge>{selected.language && <Badge>{selected.language}</Badge>}</div>
            <dl>
              <div><dt>文件大小</dt><dd>{selected.size}</dd></div><div><dt>相对路径</dt><dd>{selected.path}</dd></div>
              <div><dt>文件更新</dt><dd>{selected.modified}</dd></div><div><dt>首次入库</dt><dd>{selected.imported}</dd></div>
              <div><dt>文件状态</dt><dd>可阅读样章</dd></div>
            </dl>
            <div className="row">
              {selected.source && <Button variant="secondary" disabled={state.readingShelf.includes(selected.id)} onClick={() => update(current => ({ ...current, readingShelf: [...new Set([...current.readingShelf, selected.id])] }))}><Star size={16} aria-hidden="true" />{state.readingShelf.includes(selected.id) ? '已加入书架' : '加入书架'}</Button>}
              <Button onClick={() => openReader(selected)}><Icon size={16} aria-hidden="true" />{(state.reading[selected.id] ?? 0) > 0 ? '继续阅读' : '开始阅读'}</Button>
            </div>
          </div>
        </div>
      </DialogContent>}
    </Dialog>
  </section>
  {reading && <BookReader book={reading} comic={comic} state={state} update={update} close={() => {
    setReading(null);
    requestAnimationFrame(() => window.scrollTo(0, returnTo));
  }} />}
  </>;
}
