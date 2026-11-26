import {useState,useEffect} from 'react'
import {Film,ChevronLeft,ChevronRight,ArrowRight} from 'lucide-react'
import type {LiveApi,EmbyDashboardData,EmbyItem,EmbyResumeItem,EmbyLibrary} from './live-api'
import {requestError} from './live-api'
import {CatalogArtwork} from './catalog'
import {Progress,Button} from './controls'
import {PageHeading,MetricCard,SectionHeading,WorkspaceTabs} from './ui'
import {LocalOverview} from './local-overview'
import {EmbyDashboard as LibraryStatistics} from '@/components/emby-dashboard'
const beijingDateTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
function updatedAt(value?: string) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? beijingDateTime.format(time) : '';
}
function EmbyArtwork({ id, api, className }: { id: string; api: LiveApi; className?: string }) {
  return <CatalogArtwork api={api} src={'/api/emby/items/' + encodeURIComponent(id) + '/image'} className={className}
    lazy={!className} fallback={<span className="emby-cover-placeholder"><Film size={20} aria-hidden="true" /></span>} />;
}

function EmbyLibraryCarousel({ libraries, api }: { libraries: EmbyLibrary[]; api: LiveApi }) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [manuallySelected, setManuallySelected] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState(0);
  const count = libraries.length;
  const playing = !reduceMotion && !manuallySelected && !interacting && !hovered;
  const active = libraries[position % count];
  function select(index: number) {
    setManuallySelected(true);
    setPosition((index + count) % count);
  }
  useEffect(() => {
    if (count < 2 || !playing) return;
    const timer = window.setInterval(() => setPosition(index => (index + 1) % count), 6000);
    return () => window.clearInterval(timer);
  }, [count, playing]);
  if (!active) return <section className="feature"><div className="feature-content"><h2>暂无媒体库分类</h2></div></section>;
  return <section className="feature" aria-label="媒体库封面" aria-roledescription="轮播图"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
    <a className="emby-feature-link" href={active.url} target="_blank" rel="noopener noreferrer"
      aria-label={`打开${active.title}媒体库（新标签页）`}>
      {libraries.map(item => <span key={item.id} hidden={item.id !== active.id} className="emby-feature-image">
        <EmbyArtwork id={item.id} api={api} className="feature-image" />
      </span>)}
      <div className="feature-content" aria-live={playing ? 'off' : 'polite'}>
        <h2>{active.title}</h2>
        <p>{active.count.toLocaleString()} 部作品</p>
      </div>
    </a>
    {count > 1 && <>
      <Button size="sm" variant="ghost" className="emby-carousel-arrow emby-carousel-prev" aria-label="上一个媒体库"
        onClick={() => select(position - 1)}><ChevronLeft size={18} aria-hidden="true" /></Button>
      <Button size="sm" variant="ghost" className="emby-carousel-arrow emby-carousel-next" aria-label="下一个媒体库"
        onClick={() => select(position + 1)}><ChevronRight size={18} aria-hidden="true" /></Button>
      <div className="emby-carousel-dots" role="group" aria-label="选择媒体库">
        {libraries.map((item, index) => <button type="button" key={item.id} aria-label={'显示' + item.title}
          aria-current={item.id === active.id ? 'true' : undefined} onClick={() => select(index)} />)}
      </div>
    </>}
  </section>;
}

function EmbyContinueRow({ item, api }: { item: EmbyResumeItem; api: LiveApi }) {
  const subtitle = [item.resumeLabel === '继续播放' ? '' : item.resumeLabel, item.remaining].filter(Boolean).join(' · ');
  return <a href={item.url} target="_blank" rel="noopener noreferrer" className="continue-row emby-continue-row"
    aria-label={`在 Emby 打开${item.title}（新标签页）`}>
    <span className="emby-continue-cover"><EmbyArtwork id={item.id} api={api} /></span>
    <div><strong title={item.title}>{item.title}</strong><p>{subtitle || '继续播放'}</p>
      <Progress value={item.progress} aria-label={item.title + '观看进度'} /></div>
    <span className="emby-continue-arrow"><ArrowRight size={16} aria-hidden="true" /></span>
  </a>;
}

function EmbyRecentGrid({ items, api }: { items: EmbyItem[]; api: LiveApi }) {
  return <div className="media-grid">{items.map((item, index) => <a key={item.id + ':' + index} className="media-card emby-recent-card"
    href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`在 Emby 打开${item.title}（新标签页）`}>
    <span className="media-art"><EmbyArtwork id={item.id} api={api} /></span>
    <span className="media-title" title={item.title}>{item.title}</span>
    <span className="muted">{[item.year || null, item.kind, item.rating || '—'].filter(Boolean).join(' · ')}</span>
  </a>)}</div>;
}

type EmbyProps = { go: (page: string) => void; api: LiveApi };

export function EmbyHome(props: EmbyProps) {
  const { api } = props;
  const [useLocal, setUseLocal] = useState<boolean>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    
    const controller = new AbortController();
    api.settings('emby', controller.signal).then(settings => {
      if (!controller.signal.aborted) setUseLocal(settings.values['emby.localOverview'] === true);
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, retry]);

  if (useLocal === false) return <WorkspaceTabs label="Emby 看板" items={[
    {id:'dashboard',label:'看板',content:<EmbyDashboard {...props}/>},
    {id:'library',label:'媒体库统计',content:<LibraryStatistics/>}
  ]} />;
  if (useLocal) return <LocalOverview api={api} />;
  return <><PageHeading title="Emby 看板" />
    {error ? <div role='alert'>{error} <Button onClick={() => {setError('');setRetry(value=>value+1)}}>重试</Button></div>
      : <p role="status" className="muted">正在读取看板设置…</p>}
  </>;
}

function EmbyDashboard({ go, api }: EmbyProps) {
  const [data, setData] = useState<EmbyDashboardData>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [subscriptions, setSubscriptions] = useState<number>();
  const [downloads, setDownloads] = useState<number>();
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    
    const controller = new AbortController();
    const { signal } = controller;
    api.embyDashboard(signal).then(result => { if (!signal.aborted) setData(result); })
      .catch(reason => { if (!signal.aborted) setError(requestError(reason, '无法读取 Emby 媒体库。')); });
    Promise.all([api.animeList(signal), api.tvSubscriptions(signal)]).then(lists => {
      if (!signal.aborted) setSubscriptions(lists.flat().filter(item => item.enabled).length);
    }).catch(() => {});
    api.downloadTasks(signal).then(result => {
      if (!signal.aborted) setDownloads(result.items.filter(task => task.state === 'downloading').length);
    }).catch(() => {});
    return () => controller.abort();
  }, [api, revision]);

  const libraries = data?.libraries ?? [];
  const recent = data?.recentlyAdded ?? [];
  const resume = data?.continueWatching.slice(0, 10) ?? [];
  const stats = data?.stats?.all;
  const syncedAt = updatedAt(data?.updatedAt);

  return <>
    <PageHeading title="Emby 看板" description={syncedAt ? '更新于 ' + syncedAt + '（北京时间）' : '查看媒体库、观看进度和下载活动。'} />
    <div className="dashboard-top">
      {data ? <EmbyLibraryCarousel libraries={libraries} api={api} /> : <section className="feature">
        <div className="feature-content">
          {error ? <><p role="alert">{error}</p><div className="row"><Button variant="secondary" onClick={() => { setError(''); setRevision(value => value + 1); }}>重试</Button>
            <Button variant="secondary" onClick={() => go('settings')}>打开全局设置</Button></div></>
            : <p role="status">正在读取媒体库…</p>}
        </div>
      </section> }
      <section className="panel continue" aria-label="继续播放">
        <SectionHeading title="继续播放" action={resume.length > 3 && (
          <Button size="sm" variant="ghost" aria-expanded={showMore} onClick={() => setShowMore(value => !value)}>
            {showMore ? '收起' : '查看更多（' + resume.length + '）'}
          </Button>
        )} />
        {resume.length ? (showMore ? resume : resume.slice(0, 3)).map((item, index) => <EmbyContinueRow item={item} api={api} key={item.id + ':' + index} />)
        : <p className="muted emby-continue-empty">{data ? '暂无观看进度' : error ? '继续播放暂不可用' : '正在读取观看进度…'}</p>
        }
      </section>
    </div>
    <div className="metrics">
      <MetricCard compact label="媒体库作品" value={data && libraries.reduce((total, item) => total + item.count, 0)} suffix=" 部" context="主媒体库" />
      <MetricCard compact label="启用订阅" value={subscriptions} suffix=" 项" context="动漫和追剧" />
      <MetricCard compact label="下载中" value={downloads} suffix=" 项" context="媒体处理中的任务" />
    </div>
    {stats && <div className="row muted" role="group" aria-label="媒体分类统计">
      <span>电影 {stats.movies.toLocaleString('zh-CN')} 部</span>
      <span>剧集 {stats.series.toLocaleString('zh-CN')} 部</span>
      <span>总集数 {stats.episodes.toLocaleString('zh-CN')} 集</span>
    </div>}
    <section className="section">
      <SectionHeading title="最近入库" />
      {recent.length ? <EmbyRecentGrid items={recent} api={api} /> :
        <p className="muted" role="status">{data ? '暂无最近入库作品' : error ? '最近入库暂不可用' : '正在读取入库记录…'}</p>
      }
    </section>
    {data?.warnings.map((warning, index) => <p className="muted" role="status" key={index}>{warning}</p>)}
  </>;
}
