import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, BookText, CalendarDays, Clapperboard, Compass, LibraryBig, LogOut, Menu, Moon, Music2, ScrollText, Search, Settings as SettingsIcon, Sun, Trophy, Workflow, X } from 'lucide-react';
import '@fontsource-variable/inter';
import './arc/foundation.css';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { CommandPalette } from './arc/command-palette/command-palette';
import { Dialog, DialogContent, DialogTrigger } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { EmbyDashboard, Discovery, Rankings, MediaDetail } from './catalog';
import { Music } from './library';
import { Reading } from './reading';
import { DownloadEditor, Logs, Processing, ResourceSearch } from './operations';
import { Anime, SeriesCalendar } from './subscriptions';
import { Settings } from './settings';
import { MediaGrid } from './ui';
import { initialState, media, uid, workPath } from './model';
import type { DemoState, Media, Notify, Task } from './model';
import './style.css';

const groups = [
  { label: '工作台', items: [
    { id: 'emby', label: 'Emby 看板', icon: LibraryBig }, { id: 'search', label: '搜索历史', icon: Search },
  ] },
  { label: '媒体', items: [
    { id: 'discover', label: '影视探索', icon: Compass }, { id: 'rankings', label: '榜单推荐', icon: Trophy },
    { id: 'anime', label: '动漫订阅', icon: Clapperboard }, { id: 'calendar', label: '追剧日历', icon: CalendarDays },
    { id: 'music', label: '音乐中心', icon: Music2 }, { id: 'comics', label: '漫画', icon: BookOpen }, { id: 'novels', label: '小说', icon: BookText },
  ] },
  { label: '管理', items: [
    { id: 'processing', label: '媒体处理', icon: Workflow }, { id: 'logs', label: '日志中心', icon: ScrollText },
    { id: 'settings', label: '全局设置', icon: SettingsIcon },
  ] },
];
const pages = groups.flatMap(group => group.items);
const storageKey = 'mediahub.uiarc.preview.v1';

function readState(): DemoState {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? { ...initialState, ...JSON.parse(raw) } : initialState;
  } catch { return initialState; }
}

type Route = { page: string; mediaId: string | null };
function readRoute(): Route {
  const [key, section, id] = window.location.hash.slice(1).replace(/^\//, '').split('?')[0].split('/');
  const page = pages.some(entry => entry.id === key) ? key : 'emby';
  return { page, mediaId: section === 'work' && media.some(item => item.id === id) ? id : null };
}

function Brand() {
  return <div className="brand"><span className="brand-icon"><Clapperboard size={21} aria-hidden="true" /></span><span>MediaHub</span><span className="edition">uiarc</span></div>;
}

function SignIn({ name, onEnter }: { name: string; onEnter: () => void }) {
  return <main className="sign-in"><section className="panel stack">
    <Brand /><h1>进入媒体工作台</h1>
    <form className="stack" onSubmit={event => { event.preventDefault(); onEnter(); }}>
      <Input label="演示账号" value={name} readOnly />
      <Button type="submit">进入演示 <ArrowRight size={16} aria-hidden="true" /></Button>
    </form>
  </section></main>;
}

function App() {
  const [state, setState] = useState(readState);
  const [route, setRoute] = useState(readRoute);
  const { page, mediaId } = route;
  const [visitedCatalogs, setVisitedCatalogs] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [command, setCommand] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notice, setNotice] = useState('');
  const [download, setDownload] = useState<{ title: string; source: string } | null>(null);
  const [resourceSearch, setResourceSearch] = useState({ query: '', version: 0 });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const main = useRef<HTMLElement>(null);
  const previousRoute = useRef(route);
  const searchOrigin = useRef<{ page: string; scroll: number } | null>(null);
  const workOrigin = useRef<{ page: string; id: string; scroll: number; element: HTMLElement | null } | null>(null);
  const closingWork = useRef(false);
  const detail = media.find(item => item.id === mediaId);
  const title = pages.find(item => item.id === page)?.label ?? 'Emby 看板';

  useEffect(() => {
    const listener = () => { setRoute(readRoute()); setMobile(false); };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useLayoutEffect(() => {
    const previous = previousRoute.current;
    previousRoute.current = { page, mediaId };
    closingWork.current = false;
    const origin = workOrigin.current;
    if (mediaId) {
      main.current?.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else if (origin && previous.mediaId === origin.id && page === origin.page) {
      origin.element?.focus({ preventScroll: true });
      window.scrollTo(0, origin.scroll);
    } else if (previous.page === 'search' && searchOrigin.current?.page === page) {
      window.scrollTo(0, searchOrigin.current.scroll);
    } else if (previous.page !== page || previous.mediaId) {
      window.scrollTo(0, 0);
    }
  }, [page, mediaId]);
  useEffect(() => {
    if (page === 'discover' || page === 'rankings') {
      setVisitedCatalogs(current => current.includes(page) ? current : [...current, page]);
    }
  }, [page]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && signedIn) {
        event.preventDefault(); setCommand(value => !value);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [signedIn]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { setStorageAvailable(false); }
  }, [state]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4400);
    return () => clearTimeout(id);
  }, [notice]);

  const notify: Notify = (message, source, level = '信息') => {
    setNotice(message);
    if (source) setState(current => ({ ...current, logs: [{ id: uid(), message, source, level, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }, ...current.logs].slice(0, 100) }));
  };
  function go(target: string) {
    const current = readRoute();
    setRoute({ page: target, mediaId: null }); setMobile(false);
    if (current.page !== target || current.mediaId || !window.location.hash) window.location.hash = target;
    else window.scrollTo(0, 0);
  }
  function openDetail(item: Media) {
    workOrigin.current = { page, id: item.id, scroll: window.scrollY, element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    window.location.hash = workPath(page, item.id);
  }
  function closeDetail() {
    if (closingWork.current) return;
    closingWork.current = true;
    const origin = workOrigin.current;
    if (origin?.page === page && origin.id === mediaId) window.history.back();
    else {
      window.history.replaceState(window.history.state, '', `#${page}`);
      setRoute({ page, mediaId: null });
    }
  }
  function remember(value: string) {
    const query = value.trim();
    if (query) setState(current => ({ ...current, history: [query, ...current.history.filter(item => item !== query)].slice(0, 16) }));
  }
  function startSearch(query: string) {
    remember(query);
    if (!mediaId && (page === 'discover' || page === 'rankings')) searchOrigin.current = { page, scroll: window.scrollY };
    setResourceSearch(current => ({ query, version: current.version + 1 }));
    go('search');
  }
  function startDownload(title = '', source = '115 网盘') {
    setDownload({ title, source });
  }
  function addTask(task: Task) {
    setState(current => ({ ...current, tasks: [task, ...current.tasks] }));
    setDownload(null);
    notify(`${task.title}已加入演示下载队列`, '下载');
    go('processing');
  }
  function toggleFavorite(item: Media) {
    setState(current => ({ ...current, favorites: current.favorites.includes(item.id) ? current.favorites.filter(id => id !== item.id) : [...current.favorites, item.id] }));
  }
  function toggleSubscription(item: Media, season: string) {
    const existing = state.subscriptions.find(entry => entry.title === item.title);
    if (existing) {
      setState(current => ({ ...current, subscriptions: current.subscriptions.filter(entry => entry.id !== existing.id) }));
      notify(`已取消${item.title}的示例订阅`, '订阅');
      return;
    }
    const kind = item.kind === '剧集' ? '追剧' : item.kind === '动画' ? '动漫' : '电影';
    const subscription = { id: uid(), title: item.title, kind, source: kind === '动漫' ? 'Bangumi' : 'TMDB', active: true, auto: false, rule: '1080p', episode: item.kind === '剧集' ? '第 1 集' : '正片', season: item.kind === '剧集' ? season : undefined } as const;
    setState(current => ({ ...current, subscriptions: [...current.subscriptions, subscription] }));
    notify(`已订阅${item.title}`, '订阅');
  }

  const update = setState;
  const common = { state, update, notify };
  const catalogActions = { onOpen: openDetail, onSearchResource: startSearch, onFavorite: toggleFavorite, favorites: state.favorites };
  const name = String(state.settings['account.name'] || '演示用户');
  const account = String(state.settings['account.user'] || 'demo');
  const renderPage = () => {
    switch (page) {
      case 'search': return <ResourceSearch key={resourceSearch.version} state={state} initialQuery={resourceSearch.query} remember={remember} onDownload={startDownload} notify={notify} />;
      case 'anime': return <Anime {...common} onOpen={openDetail} onDownload={startDownload} />;
      case 'calendar': return <SeriesCalendar {...common} onDownload={startDownload} />;
      case 'music': return <Music {...common} />;
      case 'comics':
      case 'novels': return <Reading key={page} kind={page} state={state} update={update} />;
      case 'processing': return <Processing {...common} onNew={() => startDownload()} />;
      case 'logs': return <Logs state={state} />;
      case 'settings': return <Settings {...common} menus={pages.filter(item => !['emby', 'settings'].includes(item.id))} />;
      default: return <EmbyDashboard state={state} onOpen={openDetail} go={go} />;
    }
  };

  if (!signedIn) return <SignIn name={account} onEnter={() => { setSignedIn(true); go('emby'); }} />;
  return <div className="workspace">
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`} aria-label="侧边栏" id="workspace-sidebar">
      <a href="#emby" className="brand-link" onClick={() => go('emby')}><Brand /></a>
      <nav aria-label="主导航">
        {groups.map(group => {
          const visible = group.items.filter(item => state.settings[`menu.${item.id}`] !== false);
          return visible.length > 0 && <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {visible.map(({ id, label, icon: Icon }) => <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined}
              onClick={event => { event.preventDefault(); go(id); }}><Icon size={17} aria-hidden="true" />{label}</a>)}
          </div>;
        })}
      </nav>
      <div className="sidebar-bottom"><Badge color="amber" dot size="sm">离线演示</Badge><span>{storageAvailable ? '保存到当前浏览器' : '保存在当前页面'}</span></div>
    </aside>
    <div className="stage">
      <header className="topbar">
        <div className="row top-left">
          <Button variant="ghost" className="icon-button menu-toggle" aria-label={mobile ? '关闭菜单' : '打开菜单'} aria-expanded={mobile} aria-controls="workspace-sidebar" onClick={() => setMobile(value => !value)}>{mobile ? <X size={20} /> : <Menu size={20} />}</Button>
          <span className="breadcrumb"><span>MediaHub</span><span aria-hidden="true">/</span><strong>{title}</strong></span>
        </div>
        <div className="row top-actions">
          <Dialog open={command} onOpenChange={setCommand}>
            <DialogTrigger asChild><Button variant="secondary" className="command-trigger" aria-label="搜索菜单"><Search size={16} aria-hidden="true" /><span className="command-label">搜索菜单</span><kbd>Ctrl K</kbd></Button></DialogTrigger>
            <DialogContent title="搜索菜单" description="输入页面名称并快速跳转。"><CommandPalette autoFocus placeholder="输入菜单名称…" items={pages.map(({ id, label, icon: Icon }) => ({ id, label, icon: <Icon size={16} /> }))} onSelect={item => { setCommand(false); go(item.id); }} /></DialogContent>
          </Dialog>
          <Button variant="ghost" className="icon-button" aria-label={dark ? '切换浅色主题' : '切换深色主题'} onClick={() => setDark(value => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</Button>
          <Dialog>
            <DialogTrigger asChild><Button variant="ghost" className="icon-button notifications-button" aria-label="查看最近活动"><Bell size={18} /></Button></DialogTrigger>
            <DialogContent title="最近活动" description="最近的演示操作。"><div className="stack">{state.logs.slice(0, 4).map(log => <div key={log.id}><p>{log.message}</p><small className="muted">{log.time} · {log.source}</small></div>)}</div></DialogContent>
          </Dialog>
          <Dialog open={profile} onOpenChange={setProfile}>
            <DialogTrigger asChild><Button variant="secondary" className="icon-button profile-trigger" aria-label="打开演示账号">{name.slice(0, 1)}</Button></DialogTrigger>
            <DialogContent title={name} description={`演示账号 · ${account}`}>
              <div className="stack">
                {!!state.favorites.length && <><h3>我的收藏</h3><MediaGrid items={media.filter(item => state.favorites.includes(item.id))} onOpen={item => { setProfile(false); openDetail(item); }} /></>}
                <div className="row"><Button variant="secondary" onClick={() => { setProfile(false); go('settings'); }}><SettingsIcon size={16} aria-hidden="true" />打开设置</Button><Button variant="ghost" onClick={() => { setProfile(false); setSignedIn(false); }}><LogOut size={16} aria-hidden="true" />退出演示</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <main ref={main} className={detail ? 'main detail-main' : 'main'} id="main-content">
        {(page === 'discover' || visitedCatalogs.includes('discover')) && <div hidden={page !== 'discover' || Boolean(detail)}><Discovery {...catalogActions} onSearch={remember} /></div>}
        {(page === 'rankings' || visitedCatalogs.includes('rankings')) && <div hidden={page !== 'rankings' || Boolean(detail)}><Rankings {...catalogActions} /></div>}
        {page !== 'discover' && page !== 'rankings' && <div hidden={Boolean(detail)}>{renderPage()}</div>}
        {detail && <MediaDetail key={detail.id} item={detail} favorite={state.favorites.includes(detail.id)} subscribed={state.subscriptions.some(entry => entry.title === detail.title)}
          onClose={closeDetail} onFavorite={toggleFavorite} onSubscribe={toggleSubscription} onSearch={item => startSearch(item.title)} onDownload={item => startDownload(item.title)} />}
      </main>
    </div>
    {download && <DownloadEditor seed={download} onClose={() => setDownload(null)} onSave={addTask} />}
    <div className="notice-region" role="status" aria-live="polite">{notice && <span>{notice}</span>}</div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
