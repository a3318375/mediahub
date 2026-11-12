import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Film, Heart, Plus, Popcorn, Search, Star, UserRound, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { rankingDescriptions, sourceLinks } from '../../hero/src/lib/catalog-options';
import { optionLabel } from '../../hero/src/lib/discovery-labels';
import { saveMediaSearchHistory } from '../../hero/src/lib/resource-search';
import tmdbIcon from '../../hero/public/icons/tmdb.svg?inline';
import doubanIcon from '../../hero/public/icons/douban.svg?inline';
import bangumiIcon from '../../hero/public/icons/bangumi.svg?inline';
import anilistIcon from '../../hero/public/icons/anilist.svg?inline';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { LineChart } from './arc/line-chart/line-chart';
import { MetricCard } from './arc/metric-card/metric-card';
import { Progress } from './arc/progress/progress';
import { SearchField } from './arc/search-field/search-field';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Select } from './arc/select/select';
import { PageHeading, SectionHeading, MediaGrid, NoResults, WorkspaceTabs } from './ui';
import { backdrops, castProfiles, includes, media, options, workPath } from './model';
import type { DemoState, Media } from './model';
import { platformCatalogs, rankingRegions, rankingSources, viewingOptions } from './rankings-data';
import { liveIdentity, presentLiveMedia, requestError } from './live-api';
import { LocalOverview } from './local-overview';
import type { EmbyDashboardData, EmbyItem, EmbyLibrary, EmbyResumeItem, LiveApi } from './live-api';
import type { MediaPage, MediaSummary, ProviderCapabilities } from '../../hero/src/lib/media-contract';
import wide from './posters/dune-wide.jpg';

type Open = (item: Media) => void;
type CatalogActions = { onOpen: Open; onSearchResource: Open; onFavorite: Open; favorites: string[] };
const providerIcons: Record<string, string> = { tmdb: tmdbIcon, douban: doubanIcon, bangumi: bangumiIcon, anilist: anilistIcon };
const sources = ['TMDB', '豆瓣', 'AniList', 'Bangumi'];
const types = options(['全部', '电影', '剧集', '动画']);
const pageSize = 18;
const beijingDateTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
function updatedAt(value?: string) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? beijingDateTime.format(time) : '';
}
const chart = [4, 7, 5, 12, 8, 16, 13].map((count, index) => ({
  key: String(index), label: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index], axisLabel: ['一', '二', '三', '四', '五', '六', '日'][index], values: { count },
}));

function EmbyArtwork({ id, api, className }: { id: string; api: LiveApi; className?: string }) {
  return <CatalogArtwork api={api} src={'/api/emby/items/' + encodeURIComponent(id) + '/image'} className={className}
    lazy={!className} fallback={<span className="emby-cover-placeholder"><Film size={20} aria-hidden="true" /></span>} />;
}

function EmbyLibraryCarousel({ libraries, api }: { libraries: EmbyLibrary[]; api: LiveApi }) {
  const reduceMotion = useReducedMotion();
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

type EmbyProps = { state: DemoState; onOpen: Open; go: (page: string) => void; api?: LiveApi };

export function EmbyHome(props: EmbyProps) {
  const { api } = props;
  const [useLocal, setUseLocal] = useState<boolean>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    api.settings('emby', controller.signal).then(settings => {
      if (!controller.signal.aborted) setUseLocal(settings.values['emby.localOverview'] === true);
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, retry]);

  if (!api || useLocal === false) return <EmbyDashboard {...props} />;
  if (useLocal) return <LocalOverview api={api} />;
  return <><PageHeading title="Emby 看板" />
    {error ? <CatalogError message={error} retry={() => { setError(''); setRetry(value => value + 1); }} />
      : <p role="status" className="muted">正在读取看板设置…</p>}
  </>;
}

function EmbyDashboard({ state, onOpen, go, api }: EmbyProps) {
  const [data, setData] = useState<EmbyDashboardData>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [subscriptions, setSubscriptions] = useState<number>();
  const [downloads, setDownloads] = useState<number>();
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    if (!api) return;
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
  const featured = media[0];
  return <>
    <PageHeading title="Emby 看板" description={syncedAt ? '更新于 ' + syncedAt + '（北京时间）' : '查看媒体库、观看进度和下载活动。'} />
    <div className="dashboard-top">
      {api ? data ? <EmbyLibraryCarousel libraries={libraries} api={api} /> : <section className="feature">
        <div className="feature-content">
          {error ? <><p role="alert">{error}</p><div className="row"><Button variant="secondary" onClick={() => { setError(''); setRevision(value => value + 1); }}>重试</Button>
            <Button variant="secondary" onClick={() => go('settings')}>打开全局设置</Button></div></>
            : <p role="status">正在读取媒体库…</p>}
        </div>
      </section> : <section className="feature" aria-label="精选作品">
        <img className="feature-image" src={featured.id === 'dune' ? wide : featured.poster} alt="" />
        <div className="feature-content">
          <div className="feature-meta"><Film size={15} aria-hidden="true" /> 最近入库 <span>·</span> {featured.year}</div>
          <h2>{featured.title}</h2>
          <p>{featured.original} <span>·</span> {featured.genre}</p>
          <Button variant="secondary" onClick={() => onOpen(featured)}>查看作品 <ArrowRight size={16} aria-hidden="true" /></Button>
        </div>
      </section>}
      <section className="panel continue" aria-label={api ? '继续播放' : '继续观看'}>
        <SectionHeading title={api ? '继续播放' : '继续观看'} action={api && resume.length > 3 && (
          <Button size="sm" variant="ghost" aria-expanded={showMore} onClick={() => setShowMore(value => !value)}>
            {showMore ? '收起' : '查看更多（' + resume.length + '）'}
          </Button>
        )} />
        {api ? resume.length ? (showMore ? resume : resume.slice(0, 3)).map((item, index) => <EmbyContinueRow item={item} api={api} key={item.id + ':' + index} />)
        : <p className="muted emby-continue-empty">{data ? '暂无观看进度' : error ? '继续播放暂不可用' : '正在读取观看进度…'}</p>
        : [media[1], media[7], media[5]].map((item, index) => <div className="continue-row" key={item.id}>
          <img src={item.poster} alt="" />
          <div><strong>{item.title}</strong><p>{item.kind === '剧集' ? '第 4 季 · 第 2 集' : `已观看 ${[78, 26, 48][index]} 分钟`}</p><Progress value={[46, 62, 41][index]} aria-label={`${item.title}观看进度`} /></div>
          <Button variant="ghost" className="icon-button" aria-label={`查看${item.title}观看详情`} onClick={() => onOpen(item)}><ArrowRight size={16} aria-hidden="true" /></Button>
        </div>)}
      </section>
    </div>
    <div className="metrics">
      <MetricCard compact label="媒体库作品" value={api ? data && libraries.reduce((total, item) => total + item.count, 0) : media.length} suffix=" 部" context="主媒体库" />
      <MetricCard compact label="启用订阅" value={api ? subscriptions : state.subscriptions.filter(item => item.active).length} suffix=" 项" context={api ? '动漫和追剧' : '动漫、追剧及影片'} />
      <MetricCard compact label="下载中" value={api ? downloads : state.tasks.filter(item => item.status === '下载中').length} suffix=" 项" context="媒体处理中的任务" />
    </div>
    {stats && <div className="row muted" role="group" aria-label="媒体分类统计">
      <span>电影 {stats.movies.toLocaleString('zh-CN')} 部</span>
      <span>剧集 {stats.series.toLocaleString('zh-CN')} 部</span>
      <span>总集数 {stats.episodes.toLocaleString('zh-CN')} 集</span>
    </div>}
    <section className="section">
      <SectionHeading title="最近入库" />
      {api ? recent.length ? <EmbyRecentGrid items={recent} api={api} /> :
        <p className="muted" role="status">{data ? '暂无最近入库作品' : error ? '最近入库暂不可用' : '正在读取入库记录…'}</p>
        : <MediaGrid items={media} onOpen={onOpen} />}
    </section>
    {api ? data?.warnings.map((warning, index) => <p className="muted" role="status" key={index}>{warning}</p>) : <section className="section panel"><SectionHeading title="媒体活动" description="近一周示例入库数量" />
      <LineChart data={chart} series={[{ key: 'count', label: '入库作品' }]} height={190} label="每周入库作品" unit=" 部" />
    </section>}
  </>;
}

const filterFields = [['genre', '类型'], ['region', '地区'], ['year', '年份'], ['month', '月份'],
  ['season', '季度'], ['status', '播出状态']] as const;
type DiscoveryFilter = (typeof filterFields)[number][0];
type DiscoveryFilters = Partial<Record<DiscoveryFilter, string>>;
type FilterChoices = Partial<Record<DiscoveryFilter, ReturnType<typeof options>>>;
const demoFilterOptions = {
  genre: options(['科幻', '剧情', '动作', '犯罪', '悬疑', '奇幻', '爱情', '动画', '冒险', '喜剧', '历史']),
  region: options(['欧美', '英国', '日本', '韩国', '大陆', '香港', '台湾']),
  year: options([...new Set(media.map(item => item.year))].sort((a, b) => b - a).map(String)),
};

function DiscoverySelects({ filters, choices, onChange }: {
  filters: DiscoveryFilters; choices: FilterChoices; onChange: (id: DiscoveryFilter, value: string) => void;
}) {
  return <div className="catalog-filters">{filterFields.map(([id, label]) => {
    const entries = choices[id];
    if (!entries) return null;
    return <Select key={id} label={label} options={[{ value: 'all', label: '全部' + label }, ...entries]} disabled={!entries.length}
      value={entries.some(option => option.value === filters[id]) ? filters[id] : 'all'}
      onValueChange={value => onChange(id, value === 'all' ? '' : value)} />;
  })}</div>;
}

function CatalogArtwork({ src, alt = '', api, className, lazy = false, fallback }: {
  src: string; alt?: string; api?: LiveApi; className?: string; lazy?: boolean; fallback?: ReactNode;
}) {
  const [image, setImage] = useState<{ src: string; url: string }>();
  const [broken, setBroken] = useState('');
  const proxy = src.startsWith('/api/media/image?') || src.startsWith('/api/emby/items/');
  useEffect(() => {
    if (!proxy || !api) return;
    const controller = new AbortController();
    let url: string | undefined;
    api.image(src, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(data);
      setImage({ src, url });
    }).catch(() => {
      if (!controller.signal.aborted) setBroken(src);
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, proxy, src]);
  const url = proxy ? image?.src === src ? image.url : '' : src;
  return url && broken !== src ? <img className={className} src={url} alt={alt}
    loading={lazy ? 'lazy' : undefined} onError={() => setBroken(src)} /> : fallback;
}

function CatalogGrid({ items, origin, source, ranked, api, onOpen, onSearchResource, onFavorite, favorites }: CatalogActions & {
  items: Media[]; origin: 'discover' | 'rankings'; source?: string; ranked?: boolean; api?: LiveApi;
}) {
  return <div className="catalog-grid">{items.map((item, index) => {
    const favorite = favorites.includes(item.id);
    return <article className="catalog-card" data-origin={origin} key={item.id}>
      <a className="catalog-poster" href={`#${workPath(origin, item.id)}`} aria-label={`查看${item.title}详情`} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onOpen(item);
      }}>
        <CatalogArtwork src={item.poster} api={api} lazy fallback={<span className="catalog-no-poster"><Film size={30} aria-hidden="true" /></span>} />
        <div className="catalog-poster-badges">
          <span>{ranked ? String(index + 1).padStart(2, '0') : item.kind}</span>
          {item.score > 0 && <span><Star size={12} fill="currentColor" aria-hidden="true" />{item.score.toFixed(1)}</span>}
        </div>
        <div className="catalog-poster-copy">
          <small className="catalog-poster-meta">{[item.year || '', item.kind, source].filter(Boolean).join(' · ')}</small>
          <h3 title={item.title}>{item.title}</h3>
          <div className="catalog-poster-description">
            {item.summary && <p>{item.summary}</p>}
          </div>
        </div>
      </a>
      <div className="catalog-quick-actions">
        <Button variant="ghost" className="catalog-action" aria-label={'搜索' + item.title + '资源'} title="搜索资源" onClick={() => onSearchResource(item)}><Search size={16} aria-hidden="true" /></Button>
        <Button variant="ghost" className="catalog-action" aria-label={`收藏${item.title}`} aria-pressed={favorite} title={favorite ? '取消收藏' : '收藏'} onClick={() => onFavorite(item)}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" /></Button>
      </div>
    </article>;
  })}</div>;
}

function DiscoveryPanel({ source, onSearch, ...actions }: CatalogActions & { source: string; onSearch: (value: string) => void }) {
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [kind, setKind] = useState('全部');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('默认排序');
  const [page, setPage] = useState(1);
  const matches = media.filter(item =>
    (!['AniList', 'Bangumi'].includes(source) || (item.kind === '动画' && item.region === '日本')) &&
    (kind === '全部' || item.kind === kind) &&
    (includes(item.title, query) || includes(item.original, query)) &&
    (!filters.year || String(item.year) === filters.year) &&
    (!filters.genre || item.genre === filters.genre || filters.genre === '动画' && item.kind === '动画') &&
    (!filters.region || item.region === filters.region));
  if (sort === '评分') matches.sort((a, b) => b.score - a.score);
  if (sort === '最新') matches.sort((a, b) => b.year - a.year);
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));

  function reset() { setFilters({}); setKind('全部'); setDraft(''); setQuery(''); setSort('默认排序'); setPage(1); }
  return <>
    <div className="discovery-tools">
      <SegmentedControl label="作品类型" options={types} value={kind} onValueChange={value => { setKind(value); setPage(1); }} />
      <DiscoverySelects filters={filters} choices={demoFilterOptions} onChange={(id, value) => {
        setFilters(previous => ({ ...previous, [id]: value })); setPage(1);
      }} />
      <Select label="排序" options={options(['默认排序', '评分', '最新'])} value={sort} onValueChange={value => { setSort(value); setPage(1); }} />
      <form className="inline-form catalog-search" onSubmit={event => {
        event.preventDefault(); setQuery(draft); setPage(1); onSearch(draft);
      }}>
        <SearchField label="搜索片名" placeholder="输入中文或英文片名" value={draft} onValueChange={value => {
          setDraft(value); if (!value) { setQuery(''); setPage(1); }
        }} />
        <Button type="submit" variant="secondary" aria-label="搜索作品"><Search size={17} aria-hidden="true" /></Button>
      </form>
    </div>
    <div className="catalog-results-heading">
      <h2>探索结果</h2><p className="muted" aria-live="polite">{source} · {matches.length} 部作品</p>
    </div>
    {matches.length ? <CatalogGrid items={matches.slice((page - 1) * pageSize, page * pageSize)} origin="discover" source={source} {...actions} /> : <NoResults reset={reset} />}
    {pages > 1 && <div className="pagination row">
      <Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</Button>
      <span>{page} / {pages}</span>
      <Button variant="secondary" disabled={page === pages} onClick={() => setPage(value => value + 1)}>下一页</Button>
    </div>}
  </>;
}

export function Discovery({ api, onSearch, ...actions }: CatalogActions & { api?: LiveApi; onSearch: (value: string) => void }) {
  if (api) return <LiveDiscovery api={api} {...actions} />;
  return <section className="discovery-page">
    <PageHeading title="影视探索" />
    <WorkspaceTabs label="作品来源" appearance="underline" items={sources.map(source => ({ id: source, label: source, content: <DiscoveryPanel source={source} onSearch={onSearch} {...actions} /> }))} />
  </section>;
}

const mediaLabels: Record<string, string> = { movie: '电影', tv: '剧集', anime: '动画', documentary: '纪录片' };
const sortLabels: Record<string, string> = {
  'popularity.desc': '热度', 'vote_average.desc': '评分', 'date.desc': '最新',
  rank: '排名', date: '最新', POPULARITY_DESC: '人气', SCORE_DESC: '评分', TRENDING_DESC: '趋势',
  U: '推荐', T: '近期热度', S: '高分', R: '首播时间',
};
const genreLabels: Record<string, string> = {
  '28': '动作', '12': '冒险', '16': '动画', '35': '喜剧', '80': '犯罪', '99': '纪录', '18': '剧情',
  '10751': '家庭', '14': '奇幻', '36': '历史', '27': '恐怖', '10402': '音乐', '9648': '悬疑',
  '10749': '爱情', '878': '科幻', '53': '惊悚', '10752': '战争', '37': '西部',
  '10759': '动作冒险', '10765': '科幻奇幻', '10762': '儿童', '10763': '新闻', '10764': '真人秀',
  '10766': '肥皂剧', '10767': '脱口秀', '10768': '战争政治', '10770': '电视电影',
};
const movieGenres = new Set(['28', '12', '14', '36', '27', '10402', '10749', '878', '53', '10752', '10770']);
const tvGenres = new Set(['10759', '10765', '10762', '10763', '10764', '10766', '10767', '10768']);
const regionLabel = (region: string) => rankingRegions.find(option => option.value === region)?.label ?? region;

function LiveDiscovery({ api, ...actions }: CatalogActions & { api: LiveApi }) {
  const [providers, setProviders] = useState<ProviderCapabilities[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.providers(controller.signal).then(data => {
      if (!controller.signal.aborted) setProviders(data.providers);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(requestError(reason));
    });
    return () => controller.abort();
  }, [api, retry]);
  const available = providers?.filter(provider => provider.available && provider.mediaTypes.some(kind => kind !== 'person')) ?? [];
  const ordered = [...available.filter(provider => provider.source === 'tmdb'), ...available.filter(provider => provider.source !== 'tmdb')];
  return <section className="discovery-page">
    <PageHeading title="影视探索" />
    {error ? <CatalogError message={error} retry={() => setRetry(value => value + 1)} /> : !providers
      ? <p role="status" className="muted">正在读取数据源…</p> : available.length
      ? <WorkspaceTabs label="作品来源" appearance="underline" items={ordered.map(provider => ({
        id: provider.source, label: provider.label, content: <LiveDiscoveryPanel key={provider.source} api={api} provider={provider} {...actions} />,
      }))} />
      : <CatalogError message={providers.find(provider => provider.unavailableReason)?.unavailableReason || '当前没有可用的影视数据源。'} retry={() => setRetry(value => value + 1)} />}
  </section>;
}

function CatalogError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="row catalog-status"><p role="alert">{message}</p><Button size="sm" variant="secondary" onClick={retry}>重试</Button></div>;
}

function LiveDiscoveryPanel({ api, provider, ...actions }: CatalogActions & { api: LiveApi; provider: ProviderCapabilities }) {
  const kinds = provider.mediaTypes.filter(kind => kind !== 'person');
  const [kind, setKind] = useState<string>(kinds[0]);
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [sort, setSort] = useState('');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; items: Media[]; page: MediaPage<MediaSummary> }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const fetching = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const source = provider.source;
  const onlySearch = Boolean(query) && source !== 'anilist';
  const ranges = provider.filters;
  const year = ranges.year;
  const years = year && (!onlySearch || source !== 'bangumi')
    ? Array.from({ length: year.max - year.min + 1 }, (_, index) => String(year.max - index)) : [];
  const genres = ranges.genre.filter(value => source !== 'tmdb' || !(kind === 'tv' ? movieGenres : tvGenres).has(value));
  const choices: FilterChoices = {
    genre: onlySearch ? [] : genres.map(value => ({ value, label: genreLabels[value] ?? value })),
    region: onlySearch ? [] : ranges.region.map(value => ({ value, label: regionLabel(value) })),
    year: options(years),
    month: ranges.month ? (!onlySearch && years.includes(filters.year ?? '') ? Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1), label: (i + 1) + ' 月',
    })) : []) : undefined,
    season: ranges.season?.length ? ranges.season.map(value => ({ value, label: optionLabel(value) })) : undefined,
    status: ranges.status?.length ? ranges.status.map(value => ({ value, label: optionLabel(value) })) : undefined,
  };
  const activeFilters = Object.fromEntries(filterFields.flatMap(([id]) =>
    choices[id]?.some(option => option.value === filters[id]) ? [[id, filters[id]]] : []));
  const key = JSON.stringify({
    source, mediaType: kind, query, pageSize: String(Math.min(20, provider.pageSizeMax || 20)),
    ...activeFilters,
    ...(!onlySearch && sort ? { sort } : {}),
  });
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    fetching.current = true;
    setBusy(true);
    setError('');
    const params = { ...JSON.parse(key) as Record<string, string>, page: String(page) };
    api.discover(params, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setResult(previous => {
        const combined = new Map(page > 1 && previous?.key === key ? previous.items.map(item => [item.id, item]) : []);
        for (const item of data.items ?? []) combined.set(item.mediaId, presentLiveMedia(item));
        return { key, items: [...combined.values()], page: data };
      });
    }).catch(reason => {
      if (!controller.signal.aborted) setError(requestError(reason));
    }).finally(() => {
      if (!controller.signal.aborted) { fetching.current = false; setBusy(false); }
    });
    return () => controller.abort();
  }, [api, key, page, retry]);

  function loadMore() {
    if (!current?.page.hasMore || busy || error || fetching.current) return;
    fetching.current = true;
    setPage(value => value + 1);
  }
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !current?.page.hasMore || busy || error || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !fetching.current) {
        fetching.current = true;
        setPage(value => value + 1);
      }
    }, { rootMargin: '0px 0px 360px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [current, busy, error]);
  function reset() {
    setKind(kinds[0]); setFilters({}); setSort(''); setDraft(''); setQuery(''); setPage(1);
  }
  return <>
    <div className="discovery-tools">
      <SegmentedControl label="作品类型" options={kinds.map(value => ({ value, label: mediaLabels[value] ?? value }))} value={kind}
        onValueChange={value => { setKind(value); setFilters({}); setPage(1); }} />
      <DiscoverySelects filters={filters} choices={choices} onChange={(id, value) => {
        setFilters(previous => ({ ...previous, [id]: value, ...(id === 'year' && !value ? { month: '' } : {}) }));
        setPage(1);
      }} />
      <Select label="排序" placeholder="默认排序" disabled={onlySearch || !ranges.sort.length} options={[
        { value: 'default', label: '默认排序' }, ...ranges.sort.map(value => ({ value, label: sortLabels[value] ?? value })),
      ]} value={onlySearch ? 'default' : sort || 'default'} onValueChange={value => { setSort(value === 'default' ? '' : value); setPage(1); }} />
      {provider.supportsSearch && <form className="inline-form catalog-search" onSubmit={event => {
        event.preventDefault();
        const keyword = draft.trim();
        setQuery(keyword); setPage(1);
        if (keyword) saveMediaSearchHistory(localStorage, { kind: 'media', keyword, source, at: Date.now() });
      }}>
        <SearchField label="搜索片名" placeholder="输入作品名称" value={draft} onValueChange={value => {
          setDraft(value); if (!value) { setQuery(''); setPage(1); }
        }} />
        <Button type="submit" variant="secondary" aria-label="搜索作品"><Search size={17} aria-hidden="true" /></Button>
      </form>}
    </div>
    <div className="catalog-results-heading">
      <h2>探索结果</h2><p className="muted" aria-live="polite">{current?.page.total != null
        ? '已加载 ' + current.items.length + ' / ' + current.page.total + (current.page.totalCapped ? '+' : '') + ' 部作品'
        : (current?.items.length ?? 0) + ' 部作品'}</p>
    </div>
    {!!current?.items.length && <CatalogGrid items={current.items} origin="discover" source={provider.label} api={api} {...actions} />}
    {current && !current.items.length && !busy && !error && <NoResults reset={reset} />}
    {error ? <CatalogError message={error} retry={() => setRetry(value => value + 1)} />
      : busy || !current ? <p className="catalog-status muted" role="status">正在加载作品…</p>
      : current.page.hasMore && <div ref={sentinel} className="catalog-status">
        <Button size="sm" variant="secondary" onClick={loadMore}>加载更多</Button>
      </div>}
  </>;
}

const byId = new Map(media.map(item => [item.id, item]));
const rankedMedia = (ids: string[]) => ids.flatMap(id => byId.get(id) ?? []);

function SiteRanking({ source, api, ...actions }: CatalogActions & { source: (typeof rankingSources)[number]; api?: LiveApi }) {
  const [label, setLabel] = useState(source.charts[0].label);
  const chart = source.charts.find(item => item.label === label) ?? source.charts[0];
  const airing = chart.label === '今日放送';
  const friday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Shanghai' }).format(new Date()) === 'Fri';
  const items = airing && !friday ? [] : rankedMedia(chart.ids);
  return <div className="stack">
    <SegmentedControl label="榜单" value={label} options={options(source.charts.map(item => item.label))} onValueChange={setLabel} />
    {api ? <LiveRankingResults api={api} source={source.id} chart={chart.key} label={chart.label} ranked={!airing} {...actions} />
      : <>
        <SectionHeading title={chart.label} description={items.length + ' 部作品 · ' + (airing ? '北京时间 · 示例放送表' : source.label + ' · 示例榜单')}
          action={<a className="catalog-source-link" href={source.url} target="_blank" rel="noreferrer">访问 {source.label}</a>} />
        {items.length ? <CatalogGrid ranked={!airing} origin="rankings" items={items} {...actions} /> : <NoResults title="今日没有示例放送" description="可以切换到动画排名浏览作品。" />}
      </>}
  </div>;
}

function LiveRankingResults({ api, source, chart, label, ranked = true, ...actions }: CatalogActions & {
  api: LiveApi; source: string; chart: string; label: string; ranked?: boolean;
}) {
  const [result, setResult] = useState<MediaPage<MediaSummary> | null>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError('');
    api.ranking(source, chart, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data ?? null);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(requestError(reason));
    });
    return () => controller.abort();
  }, [api, source, chart, revision]);
  const items = result?.items?.map(presentLiveMedia) ?? [];
  const platformChart = chart.startsWith('platform_');
  const sourceUrl = sourceLinks[platformChart ? 'streaming' : source];
  const fetchedAt = updatedAt(result?.fetchedAt);
  return <>
    <SectionHeading title={label} description={result ? [rankingDescriptions[chart], items.length + ' 部作品'].filter(Boolean).join(' · ') : undefined} />
    {error ? <CatalogError message={error} retry={() => setRevision(value => value + 1)} /> : result === undefined
      ? <p className="muted" role="status">正在加载榜单…</p>
      : items.length ? <CatalogGrid origin="rankings" ranked={ranked} items={items} api={api} {...actions} />
      : <NoResults title="当前榜单暂无作品" description={result?.message || '请选择其他榜单或筛选条件。'} />}
    {result && (fetchedAt || sourceUrl) && <p className="row muted">
      {fetchedAt && <span>数据抓取于 {fetchedAt}（北京时间）</span>}
      {sourceUrl && <a className="catalog-source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
        {platformChart ? '可观看性数据：JustWatch' : '查看' + (rankingSources.find(item => item.id === source)?.label ?? source) + '来源'}
      </a>}
    </p>}
  </>;
}

const liveViewingOptions = [
  { value: 'flatrate', label: '订阅' }, { value: 'free', label: '免费' }, { value: 'ads', label: '含广告' },
  { value: 'rent', label: '租借' }, { value: 'buy', label: '购买' },
];

function LiveStreamingCatalog({ api, kind, setKind, region, setRegion, platform, setPlatform, result, error, retry, ...actions }: CatalogActions & {
  api: LiveApi; kind: string; setKind: (value: string) => void; region: string; setRegion: (value: string) => void;
  platform: string; setPlatform: (value: string) => void; result?: Awaited<ReturnType<LiveApi['platforms']>>;
  error: string; retry: () => void;
}) {
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState('flatrate');
  const selected = result?.find(item => String(item.id) === platform) ?? result?.[0];
  const visible = result?.filter(item => item === selected || includes(item.name, query)) ?? [];
  const chart = selected ? ['platform', kind, region, selected.id, access].join('_') : '';
  return <div className="stack">
    <div className="panel rank-tools">
      <SegmentedControl label="作品类型" options={[{ value: 'movie', label: '电影' }, { value: 'tv', label: '剧集' }]} value={kind} onValueChange={setKind} />
      <div className="row fields compact-fields">
        <Select label="地区" options={rankingRegions} value={region} onValueChange={setRegion} />
        <SearchField label="搜索平台" value={query} onValueChange={setQuery} placeholder="输入平台名称" />
        <Select label="平台" disabled={!visible.length} placeholder="选择平台" options={visible.map(item => ({ value: String(item.id), label: item.name }))}
          value={String(selected?.id ?? '')} onValueChange={setPlatform} />
      </div>
      <SegmentedControl label="观看方式" options={liveViewingOptions} value={access} onValueChange={setAccess} />
      <p className="muted">平台片库按 TMDB 热度排序，可按地区与观看方式筛选。</p>
    </div>
    {error ? <CatalogError message={error} retry={retry} />
      : !result ? <p className="muted" role="status">正在读取平台…</p>
      : selected ? <LiveRankingResults key={chart} api={api} source="tmdb" chart={chart} label={selected.name} {...actions} />
      : <NoResults title="此地区暂无平台" description="可切换地区或作品类型。" />}
  </div>;
}

function StreamingCatalog({ platform, setPlatform, ...actions }: CatalogActions & { platform: string; setPlatform: (value: string) => void }) {
  const [kind, setKind] = useState('剧集');
  const [region, setRegion] = useState('US');
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState('订阅');
  const localPlatforms = platformCatalogs.filter(provider => provider.offers.some(offer => offer.regions.includes(region)));
  const candidates = localPlatforms.filter(provider => includes(provider.name, query));
  const selected = candidates.find(provider => provider.name === platform) ?? candidates[0];
  const listed = rankedMedia(selected?.offers.filter(offer => offer.kind === kind && offer.regions.includes(region) &&
    offer.access.some(value => value === access)).map(offer => offer.id) ?? []);
  return <div className="stack">
    <div className="panel rank-tools">
      <SegmentedControl label="作品类型" options={options(['电影', '剧集'])} value={kind} onValueChange={setKind} />
      <div className="row fields compact-fields">
        <Select label="地区" options={rankingRegions} value={region} onValueChange={setRegion} />
        <SearchField label="搜索平台" value={query} onValueChange={setQuery} placeholder="输入平台名称" />
        <Select label="平台" disabled={!candidates.length} placeholder="没有匹配的平台" options={options(candidates.map(item => item.name))} value={selected?.name ?? ''} onValueChange={setPlatform} />
      </div>
      <SegmentedControl label="观看方式" options={options(viewingOptions)} value={access} onValueChange={setAccess} />
    </div>
    <SectionHeading title={selected?.name ?? '平台片库'} description={rankingRegions.find(item => item.value === region)?.label + ' · ' + kind + ' · ' + access + ' · ' + listed.length + ' 部示例作品'} />
    {listed.length ? <CatalogGrid ranked origin="rankings" items={listed} {...actions} /> : <NoResults
      title={selected ? '没有符合条件的作品' : '没有匹配的平台'}
      description={selected ? '试试更换作品类型、观看方式或平台。' : '试试其他平台名称或地区。'} />}
  </div>;
}

const featuredPlatform = /^(Netflix|奈飞|奈菲|Disney\+|Disney Plus|Amazon Prime Video|Prime Video|HBO Max|Max|HBO|Apple TV(?:\+| Plus)?|Crunchyroll|Hulu|Amazon Video|Paramount\+|Peacock(?: Premium)?)$/i;

export function Rankings({ api, ...actions }: CatalogActions & { api?: LiveApi }) {
  const [sourceId, setSourceId] = useState('tmdb');
  const [kind, setKind] = useState('tv');
  const [region, setRegion] = useState('US');
  const [platform, setPlatform] = useState('');
  const [retry, setRetry] = useState(0);
  const [platformData, setPlatformData] = useState<{ key: string; items?: Awaited<ReturnType<LiveApi['platforms']>>; error?: string }>();
  const platformKey = kind + ':' + region + ':' + retry;
  const data = platformData?.key === platformKey ? platformData : undefined;
  const availablePlatforms = api ? data?.items ?? [] : platformCatalogs.map(item => ({ id: item.name, name: item.name, logo: undefined }));
  const quickPlatforms = availablePlatforms.filter(item => featuredPlatform.test(item.name)).slice(0, 10);
  const featuredSelection = platform && quickPlatforms.some(item => String(item.id) === platform);
  const site = rankingSources.find(item => item.id === sourceId);
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    api.platforms(kind, region, controller.signal).then(items => {
      if (!controller.signal.aborted) setPlatformData({ key: platformKey, items });
    }).catch(reason => {
      if (!controller.signal.aborted) setPlatformData({ key: platformKey, error: requestError(reason) });
    });
    return () => controller.abort();
  }, [api, kind, region, platformKey]);

  return <section className="rankings-page">
    <PageHeading title="榜单推荐" description={api ? '浏览站点榜单，或按地区和观看方式探索平台片库。' : '浏览各站点的示例榜单，或按地区和观看方式探索平台片库。'} />
    <div className="ranking-sources" role="group" aria-label="榜单与平台">
      {rankingSources.map(item => <Button key={item.id} variant="secondary" aria-pressed={sourceId === item.id} onClick={() => setSourceId(item.id)}>
        <img src={providerIcons[item.id]} alt="" />{item.label}
      </Button>)}
      {quickPlatforms.map(item => <Button key={item.id} variant="secondary" aria-pressed={sourceId === 'streaming' && platform === String(item.id)}
        onClick={() => { setPlatform(String(item.id)); setSourceId('streaming'); }}>
        {item.logo ? <img src={item.logo.startsWith('/') ? 'https://image.tmdb.org/t/p/w45' + item.logo : item.logo} alt="" loading="lazy" />
          : <span className="ranking-source-icon" aria-hidden="true">{item.name[0]}</span>}
        {item.name}
      </Button>)}
      <Button variant="secondary" aria-pressed={sourceId === 'streaming' && !featuredSelection} onClick={() => { setPlatform(''); setSourceId('streaming'); }}>
        <Film size={17} aria-hidden="true" />更多平台
      </Button>
    </div>
    {site ? <>
      {data?.error && <CatalogError message={data.error} retry={() => setRetry(value => value + 1)} />}
      <SiteRanking key={site.id} source={site} api={api} {...actions} />
    </> : api ? <LiveStreamingCatalog api={api} {...actions}
        kind={kind} setKind={setKind} region={region} setRegion={setRegion} platform={platform} setPlatform={setPlatform}
        result={data?.items} error={data?.error ?? ''} retry={() => setRetry(value => value + 1)} />
      : <StreamingCatalog platform={platform} setPlatform={setPlatform} {...actions} />}
  </section>;
}

export function MediaDetail({ item, api, favorite, subscribed, detailError, onRetry, onClose, onFavorite, onSubscribe, onSearch, onDownload }: {
  item: Media; favorite: boolean; subscribed: boolean; onClose: () => void; onFavorite: Open;
  api?: LiveApi; detailError?: string; onRetry: () => void;
  onSubscribe: (item: Media, season: string) => void; onSearch: Open; onDownload: Open;
}) {
  const [season, setSeason] = useState('第 1 季');
  const backdrop = item.backdrop || backdrops[item.id];
  const cast = castProfiles[item.id];
  const identity = liveIdentity(item.id);
  const live = Boolean(identity);
  const detail = item.detail;
  const imdb = detail?.imdb;
  const credits = detail?.credits ?? item.cast.map(name => ({ name, role: cast?.[name]?.character || '', photo: cast?.[name]?.photo || '', personId: undefined }));
  const ratings = detail?.ratings?.filter(rating => Number.isFinite(rating.value)) ?? [];
  const canSubscribe = live && identity?.mediaType === 'tv' && Boolean(detail?.tmdbId || identity.source === 'tmdb');
  const facts = [
    ['类型', item.kind], ['原名', item.original], ['发布日期', detail?.releaseDate], ['年份', item.year || ''],
    ['地区', item.region], ['题材', item.genre], ['片长', item.duration], ['来源', identity?.source.toUpperCase()], ['状态', detail?.status],
  ].filter(([, value]) => Boolean(value));
  return <article className="work-detail" aria-label={`${item.title}详情`}>
    <div className="work-back"><Button variant="ghost" onClick={onClose}><ArrowLeft size={17} aria-hidden="true" />返回列表</Button></div>
    <section className="work-hero">
      <CatalogArtwork className={backdrop ? 'work-backdrop' : 'work-backdrop work-backdrop-fallback'} src={backdrop || item.poster} api={api} />
      <div className="work-hero-inner">
        <div className="work-feature">
          <CatalogArtwork className="work-poster" src={item.poster} api={api} alt={item.title + '海报'}
            fallback={<div className="work-poster catalog-no-poster"><Film size={40} aria-hidden="true" /></div>} />
          <div className="work-intro">
            <h1 tabIndex={-1}>{item.title}{!!item.year && <small> {item.year}</small>}</h1>
            {item.original && item.original !== item.title && <p className="work-original">{item.original}</p>}
            <p className="work-meta">{[item.kind, item.genre, item.duration, item.region].filter(Boolean).join(' · ')}</p>
            {detail?.tagline && <p className="work-tagline">{detail.tagline}</p>}
            {imdb && /^tt\d+$/.test(imdb) && <a className="work-imdb" href={`https://www.imdb.com/title/${imdb}/`} target="_blank" rel="noopener noreferrer">查看 IMDb 条目</a>}
            <div className="row work-ratings">
              {ratings.map(rating => <span className="work-rating" key={rating.source}>
                {providerIcons[rating.source] ? <img src={providerIcons[rating.source]} alt="" />
                  : rating.source === 'tomatoes' ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 7C7 3 2 7 2 13c0 5 5 9 10 8 5 1 10-3 10-8 0-6-5-10-10-6Z" fill="#fa5555" />
                    <path d="m12 8-5-3 4 1 1-4 2 4 4-1-4 4-2-1Z" fill="#71d48b" />
                    <path d="M7 10c-2 1-2 3-2 4" stroke="#ffb3ab" strokeWidth="2" strokeLinecap="round" />
                  </svg> : rating.source === 'popcorn' ? <Popcorn size={18} aria-hidden="true" /> : <Star size={16} fill="currentColor" aria-hidden="true" />}
                {rating.source === 'tomatoes' ? '烂番茄' : rating.source === 'popcorn' ? '爆米花' : rating.source.toUpperCase()} · {rating.value}{['tomatoes', 'popcorn'].includes(rating.source) ? '%' : ''}
              </span>)}
              {!ratings.length && item.score > 0 && <span className="work-rating"><Star size={14} fill="currentColor" aria-hidden="true" />{item.score.toFixed(1)}</span>}
            </div>
            {detail?.ratingsMessage && <p className="work-rating-note" role="status">{detail.ratingsMessage}</p>}
            {item.summary && <p className="work-summary">{item.summary}</p>}
            {detailError && <CatalogError message={detailError} retry={onRetry} />}
            <div className="row work-actions">
              <Button variant="secondary" onClick={() => onSearch(item)}><Search size={17} aria-hidden="true" />搜索资源</Button>
              <Button variant="secondary" onClick={() => onFavorite(item)} aria-pressed={favorite}>
                <Heart size={17} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />{favorite ? '已收藏' : '收藏'}
              </Button>
              {!live && <Button variant="ghost" onClick={() => onDownload(item)}>添加下载任务</Button>}
              {canSubscribe && <Button onClick={() => onSubscribe(item, '')}><Plus size={16} aria-hidden="true" />订阅此剧</Button>}
            </div>
            {!live && <div className="row work-subscribe">
              {item.kind === '剧集' && <Select label="订阅季" options={options(['第 1 季', '第 2 季', '第 3 季', '第 4 季', '第 5 季'])} value={season} onValueChange={setSeason} />}
              <Button variant="ghost" onClick={() => onSubscribe(item, season)}>
                {subscribed ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{subscribed ? '取消订阅' : '添加订阅'}
              </Button>
            </div>}
          </div>
        </div>
      </div>
    </section>
    <div className="section work-details-grid">
      <section className="panel stack">
        <SectionHeading title="作品资料" />
        <dl className="work-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {!!detail?.seasons?.length && <>
          <h3>季与集</h3>
          <dl className="work-facts">{detail.seasons.map(entry => <div key={entry.seasonNumber}>
            <dt>{entry.name || '第 ' + entry.seasonNumber + ' 季'}</dt><dd>{entry.episodeCount ? entry.episodeCount + ' 集' : '待公布'}</dd>
          </div>)}</dl>
        </>}
      </section>
      <section className="panel stack work-cast">
        <SectionHeading title="演职员" />
        {credits.length ? <ul>{credits.map((credit, index) => <li key={(credit.personId || credit.name) + ':' + index}>
          <CatalogArtwork src={credit.photo} api={api} lazy
            fallback={<span className="work-cast-placeholder"><UserRound size={24} aria-hidden="true" /></span>} />
          <strong title={credit.name}>{credit.name}</strong>
          {credit.role && <small title={credit.role}>{credit.role}</small>}
        </li>)}</ul> : <p className="muted">暂无演职员资料</p>}
      </section>
    </div>
  </article>;
}
