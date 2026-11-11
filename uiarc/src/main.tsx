import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, BookText, CalendarDays, Clapperboard, Compass, LibraryBig, LogOut, Menu, Moon, Music2, ScrollText, Search, Settings as SettingsIcon, Sun, Trophy, Workflow, X } from 'lucide-react';
import '@fontsource-variable/inter';
import './arc/foundation.css';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { CommandPalette } from './arc/command-palette/command-palette';
import { Dialog, DialogContent, DialogTrigger } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { EmbyHome, Discovery, Rankings, MediaDetail } from './catalog';
import { LiveResourceSearch } from './live-resource-search';
import { Music } from './library';
import { Reading } from './reading';
import { LiveMusic } from './live-library';
import { LiveComics } from './live-comics';
import { DownloadEditor, Logs, Processing, ResourceSearch } from './operations';
import { LiveProcessing } from './live-processing';
import { Anime, SeriesCalendar } from './subscriptions';
import { LiveAnime } from './live-anime';
import { Settings } from './settings';
import { LiveSettings } from './live-settings';
import { MediaGrid } from './ui';
import { ApiError, createLiveApi, liveIdentity, loginLive, logoutLive, presentLiveMedia, readLiveToken, readLiveUser, readSetupStatus, requestError, saveLiveToken } from './live-api';
import type { LiveSession } from './live-api';
import type { SettingValue } from '../../hero/src/lib/settings-api';
import { initialState, media, uid, workPath } from './model';
import type { DemoState, Media, Notify, Task } from './model';
import screeningRoom from './sign-in-screening-room.jpg';
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
const settingsMenus = pages.filter(item => !['emby', 'settings'].includes(item.id));
const connectedPages = new Set(['emby', 'search', 'anime', 'music', 'comics', 'processing', 'logs', 'settings']);
const storageKey = 'mediahub.uiarc.preview.v1';
const offline = window.location.protocol === 'file:';

function readState(): DemoState {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? { ...initialState, ...JSON.parse(raw) } : initialState;
  } catch { return initialState; }
}

type Route = { page: string; mediaId: string | null };
function readRoute(): Route {
  const [key, section, id] = window.location.hash.slice(1).replace(/^\//, '').split('?')[0].split('/');
  const page = pages.some(entry => entry.id === key) ? key : offline ? 'emby' : 'discover';
  if (section === 'work' && id) {
    try {
      const workId = decodeURIComponent(id);
      if (media.some(item => item.id === workId) || (!offline && liveIdentity(workId))) return { page, mediaId: workId };
    } catch { /* Ignore malformed URLs. */ }
  }
  return { page, mediaId: null };
}

function Brand() {
  return <div className="brand"><span className="brand-icon"><Clapperboard size={21} aria-hidden="true" /></span><span>MediaHub</span></div>;
}

function SignIn({ account, password, onEnter, onLogin }: {
  account: string; password: string; onEnter: () => void; onLogin: (session: LiveSession) => void;
}) {
  const [enteredAccount, setEnteredAccount] = useState(offline ? account : '');
  const [enteredPassword, setEnteredPassword] = useState('');
  const [error, setError] = useState('');
  const [serviceError, setServiceError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (offline) return;
    const controller = new AbortController();
    readSetupStatus(controller.signal).then(({ setupRequired }) => {
      if (!controller.signal.aborted && setupRequired) setServiceError('服务尚无管理员账号。请确认后端使用已有数据目录。');
    }).catch(error => {
      if (!controller.signal.aborted) setServiceError(requestError(error));
    });
    return () => controller.abort();
  }, []);

  return <main className="sign-in">
    <section className="sign-in-card" aria-labelledby="sign-in-title">
      <div className="sign-in-content">
        <Brand />
        <div>
          <h1 id="sign-in-title">进入媒体工作台</h1>
          <p className="muted">{offline
            ? password ? '使用此浏览器中设置的演示账号登录。' : '当前演示账号未设置密码，密码可留空。'
            : '使用现有 MediaHub 账号登录。'}</p>
          <form className="stack sign-in-form" onSubmit={async event => {
            event.preventDefault();
            if (busy) return;
            const submittedAccount = enteredAccount.trim();
            if (!submittedAccount) { setError('请输入账号。'); return; }
            if (offline) {
              if (submittedAccount === account && enteredPassword === password) onEnter();
              else setError('账号或密码不正确。');
              return;
            }
            setBusy(true);
            setError('');
            setServiceError('');
            try { onLogin(await loginLive(submittedAccount, enteredPassword)); }
            catch (error) { setError(requestError(error)); }
            finally { setBusy(false); }
          }}>
            <Input label={offline ? '演示账号' : '账号'} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
              required value={enteredAccount} onChange={event => { setEnteredAccount(event.target.value); setError(''); }} />
            <Input label="密码" name="password" type="password" autoComplete="current-password"
              required={!offline || Boolean(password)} value={enteredPassword} onChange={event => { setEnteredPassword(event.target.value); setError(''); }} />
            {serviceError && !error && <p className="sign-in-error" role="status">{serviceError}</p>}
            {error && <p className="sign-in-error" role="alert">{error}</p>}
            <Button size="lg" type="submit" disabled={busy}>{busy ? '正在登录…' : offline ? '进入演示' : '登录'} <ArrowRight size={16} aria-hidden="true" /></Button>
          </form>
        </div>
      </div>
      <div className="sign-in-art">
        <img src={screeningRoom} alt="" />
      </div>
    </section>
  </main>;
}

function App() {
  const [state, setState] = useState(readState);
  const password = String(state.settings['account.password'] || '');
  const [storedToken] = useState(() => offline ? '' : readLiveToken());
  const [session, setSession] = useState<LiveSession | null>(null);
  const [serverMenus, setServerMenus] = useState<Record<string, SettingValue>>({});
  const [restoring, setRestoring] = useState(Boolean(storedToken));
  const [loggingOut, setLoggingOut] = useState(false);
  const token = session?.accessToken;
  const api = useMemo(() => token ? createLiveApi(token, () => {
    if (readLiveToken() === token) saveLiveToken('');
    setSession(current => current?.accessToken === token ? null : current);
    setLiveDetail(null);
    setProfile(false);
  }) : undefined, [token]);
  const [route, setRoute] = useState(readRoute);
  const { page, mediaId } = route;
  const [liveDetail, setLiveDetail] = useState<Media | null>(null);
  const [detailFailure, setDetailFailure] = useState<{ id: string; message: string }>();
  const [detailRetry, setDetailRetry] = useState(0);
  const [visitedCatalogs, setVisitedCatalogs] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [demoEntered, setDemoEntered] = useState(() => !password);
  const signedIn = offline ? demoEntered : Boolean(session);
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
  const detail = liveDetail?.id === mediaId ? liveDetail : media.find(item => item.id === mediaId);
  const viewingDetail = Boolean(mediaId);
  const title = pages.find(item => item.id === page)?.label ?? 'Emby 看板';

  useEffect(() => {
    if (!storedToken) return;
    const controller = new AbortController();
    readLiveUser(storedToken, controller.signal).then(user => {
      if (!controller.signal.aborted) setSession({ accessToken: storedToken, user });
    }).catch(error => {
      if (!controller.signal.aborted && error instanceof ApiError && error.status === 401) saveLiveToken('');
    }).finally(() => {
      if (!controller.signal.aborted) setRestoring(false);
    });
    return () => controller.abort();
  }, [storedToken]);

  useEffect(() => {
    if (!api) { setServerMenus({}); return; }
    const controller = new AbortController();
    api.settings('menus', controller.signal).then(result => {
      if (!controller.signal.aborted) setServerMenus(result.values);
    }).catch(() => {});
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    const identity = mediaId && liveIdentity(mediaId);
    if (!api || !identity || !mediaId) return;
    const controller = new AbortController();
    setDetailFailure(undefined);
    api.detail(identity, controller.signal).then(data => {
      if (!controller.signal.aborted) setLiveDetail(presentLiveMedia(data));
    }).catch(error => {
      if (!controller.signal.aborted) setDetailFailure({ id: mediaId, message: requestError(error) });
    });
    return () => controller.abort();
  }, [api, mediaId, detailRetry]);

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
  function go(target: string, resourceQuery = '') {
    const current = readRoute();
    if (target === 'search') setResourceSearch(previous => ({ query: resourceQuery, version: previous.version + 1 }));
    setRoute({ page: target, mediaId: null }); setMobile(false);
    if (current.page !== target || current.mediaId || !window.location.hash) window.location.hash = target;
    else window.scrollTo(0, 0);
  }
  function openDetail(item: Media) {
    workOrigin.current = { page, id: item.id, scroll: window.scrollY, element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    if (liveIdentity(item.id)) setLiveDetail(item);
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
    if (!api) remember(query);
    if (!mediaId && (page === 'discover' || page === 'rankings')) searchOrigin.current = { page, scroll: window.scrollY };
    go('search', query);
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

  async function signOut() {
    if (loggingOut) return;
    if (token) {
      setLoggingOut(true);
      try { await logoutLive(token); }
      catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          notify(requestError(error, '退出登录失败，请重试。'));
          return;
        }
      } finally { setLoggingOut(false); }
      saveLiveToken('');
      setSession(null);
      setLiveDetail(null);
    }
    setProfile(false);
    setDemoEntered(false);
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
  const name = session?.user.name || session?.user.account || String(state.settings['account.name'] || '演示用户');
  const account = String(state.settings['account.user'] || '').trim() || 'demo';
  const renderPage = () => {
    switch (page) {
      case 'search': return api ? <LiveResourceSearch key={resourceSearch.version} api={api} initialQuery={resourceSearch.query} />
        : <ResourceSearch key={resourceSearch.version} state={state} initialQuery={resourceSearch.query} remember={remember} onDownload={startDownload} notify={notify} />;
      case 'anime': return api ? <LiveAnime api={api} /> : <Anime {...common} onOpen={openDetail} onDownload={startDownload} />;
      case 'calendar': return <SeriesCalendar {...common} onDownload={startDownload} />;
      case 'music': return api ? <LiveMusic api={api} /> : <Music {...common} />;
      case 'comics': return api ? <LiveComics api={api} /> : <Reading key={page} kind={page} state={state} update={update} />;
      case 'novels': return <Reading key={page} kind={page} state={state} update={update} />;
      case 'processing': return api ? <LiveProcessing api={api} /> : <Processing {...common} onNew={() => startDownload()} />;
      case 'logs': return <Logs state={state} api={api} />;
      case 'settings': return api && session ? <LiveSettings api={api} user={session.user} menuSources={settingsMenus} onMenus={setServerMenus}
        onUser={user => setSession(current => current ? { ...current, user } : null)}
        onSession={next => { saveLiveToken(next.accessToken); setSession(next); }} /> : <Settings {...common} menus={settingsMenus} />;
      default: return <EmbyHome state={state} onOpen={openDetail} go={go} api={api} />;
    }
  };

  if (restoring) return <main className="sign-in" role="status">正在恢复登录…</main>;
  if (!signedIn) return <SignIn account={account} password={password} onEnter={() => { setDemoEntered(true); go('emby'); }}
    onLogin={next => { saveLiveToken(next.accessToken); setSession(next); }} />;
  return <div className="workspace">
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`} aria-label="侧边栏" id="workspace-sidebar">
      <a href="#emby" className="brand-link" onClick={() => go('emby')}><Brand /></a>
      <nav aria-label="主导航">
        {groups.map(group => {
          const visible = group.items.filter(item => !settingsMenus.includes(item) ||
            (session ? serverMenus[`menus.${item.id}`] : state.settings[`menu.${item.id}`]) !== false);
          return visible.length > 0 && <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {visible.map(({ id, label, icon: Icon }) => <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined}
              onClick={event => { event.preventDefault(); go(id); }}><Icon size={17} aria-hidden="true" />{label}</a>)}
          </div>;
        })}
      </nav>
      <div className="sidebar-bottom"><Badge color="amber" dot size="sm">{session ? '已连接 MediaHub' : '离线演示'}</Badge>
        {!session && <span>{storageAvailable ? '保存到当前浏览器' : '保存在当前页面'}</span>}</div>
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
            <DialogTrigger asChild><Button variant="secondary" className="icon-button profile-trigger" aria-label="打开账号菜单">{name.slice(0, 1)}</Button></DialogTrigger>
            <DialogContent title={name} description={session?.user.account ?? '演示账号 · ' + account}>
              <div className="stack">
                {!!state.favorites.length && <><h3>我的收藏</h3><MediaGrid items={media.filter(item => state.favorites.includes(item.id))} onOpen={item => { setProfile(false); openDetail(item); }} /></>}
                <div className="row"><Button variant="secondary" onClick={() => { setProfile(false); go('settings'); }}><SettingsIcon size={16} aria-hidden="true" />打开设置</Button><Button variant="ghost" disabled={loggingOut} onClick={signOut}><LogOut size={16} aria-hidden="true" />{session ? '退出登录' : '退出演示'}</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <main ref={main} className={detail ? 'main detail-main' : 'main'} id="main-content">
        {(page === 'discover' || visitedCatalogs.includes('discover')) && <div hidden={page !== 'discover' || viewingDetail}><Discovery {...catalogActions} api={api} onSearch={remember} /></div>}
        {(page === 'rankings' || visitedCatalogs.includes('rankings')) && <div hidden={page !== 'rankings' || viewingDetail}><Rankings {...catalogActions} api={api} /></div>}
        {page !== 'discover' && page !== 'rankings' && <div hidden={viewingDetail}>
          {session && !connectedPages.has(page) && <p className="muted catalog-status">此页使用本地演示数据。</p>}
          {renderPage()}
        </div>}
        {viewingDetail && !detail && <div className="stack">
          <div><Button variant="secondary" onClick={closeDetail}>返回列表</Button></div>
          {detailFailure?.id === mediaId ? <>
            <p role="alert">{detailFailure?.message}</p>
            <div><Button variant="secondary" onClick={() => setDetailRetry(value => value + 1)}>重试</Button></div>
          </> : <p className="muted" role="status">正在加载作品详情…</p>}
        </div>}
        {detail && <MediaDetail key={detail.id} item={detail} api={api} favorite={state.favorites.includes(detail.id)} subscribed={state.subscriptions.some(entry => entry.title === detail.title)}
          detailError={detailFailure?.id === detail.id ? detailFailure.message : undefined} onRetry={() => setDetailRetry(value => value + 1)}
          onClose={closeDetail} onFavorite={toggleFavorite} onSubscribe={toggleSubscription} onSearch={item => startSearch(item.title)} onDownload={item => startDownload(item.title)} />}
      </main>
    </div>
    {download && <DownloadEditor seed={download} onClose={() => setDownload(null)} onSave={addTask} />}
    <div className="notice-region" role="status" aria-live="polite">{notice && <span>{notice}</span>}</div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
