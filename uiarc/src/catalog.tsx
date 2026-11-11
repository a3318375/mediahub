import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Film, Globe, Heart, Plus, Search, Star, X } from 'lucide-react';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { FilterToolbar } from './arc/filter-toolbar/filter-toolbar';
import type { FilterChip, FilterField } from './arc/filter-toolbar/filter-toolbar';
import { LineChart } from './arc/line-chart/line-chart';
import { MetricCard } from './arc/metric-card/metric-card';
import { Progress } from './arc/progress/progress';
import { SearchField } from './arc/search-field/search-field';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Select } from './arc/select/select';
import { PageHeading, SectionHeading, MediaGrid, NoResults, WorkspaceTabs } from './ui';
import { backdrops, castProfiles, includes, media, options, workPath } from './model';
import type { DemoState, Media } from './model';
import wide from './posters/dune-wide.jpg';

type Open = (item: Media) => void;
type CatalogActions = { onOpen: Open; onSearchResource: (title: string) => void; onFavorite: Open; favorites: string[] };
const sources = ['TMDB', '豆瓣', 'AniList', 'Bangumi'];
const types = options(['全部', '电影', '剧集', '动画']);
const pageSize = 18;
const chart = [4, 7, 5, 12, 8, 16, 13].map((count, index) => ({
  key: String(index), label: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index], axisLabel: ['一', '二', '三', '四', '五', '六', '日'][index], values: { count },
}));

export function EmbyDashboard({ state, onOpen, go }: { state: DemoState; onOpen: Open; go: (page: string) => void }) {
  const [site, setSite] = useState('主媒体库');
  const [library, setLibrary] = useState('全部');
  const collection = media.filter(item => (site === '主媒体库' || item.kind === '动画') && (library === '全部' || library === item.kind));
  const featured = site === '主媒体库' ? media[0] : media[8];
  return <>
    <PageHeading title="Emby 看板" description="查看媒体库、观看进度和下载活动。"
      action={<Select label="站点" className="site-select" options={options(['主媒体库', '动画收藏'])} value={site} onValueChange={value => { setSite(value); setLibrary('全部'); }} />} />
    <div className="dashboard-top">
      <section className="feature" aria-label="精选作品">
        <img className="feature-image" src={featured.id === 'dune' ? wide : featured.poster} alt="" />
        <div className="feature-content">
          <div className="feature-meta"><Film size={15} aria-hidden="true" /> 最近入库 <span>·</span> {featured.year}</div>
          <h2>{featured.title}</h2>
          <p>{featured.original} <span>·</span> {featured.genre}</p>
          <Button variant="secondary" onClick={() => onOpen(featured)}>查看作品 <ArrowRight size={16} aria-hidden="true" /></Button>
        </div>
      </section>
      <section className="panel continue" aria-label="继续观看">
        <SectionHeading title="继续观看" />
        {(site === '主媒体库' ? [media[1], media[7], media[5]] : [media[8], media[9]]).map((item, index) => <div className="continue-row" key={item.id}>
          <img src={item.poster} alt="" />
          <div><strong>{item.title}</strong><p>{item.kind === '剧集' ? '第 4 季 · 第 2 集' : `已观看 ${[78, 26, 48][index]} 分钟`}</p><Progress value={[46, 62, 41][index]} aria-label={`${item.title}观看进度`} /></div>
          <Button variant="ghost" className="icon-button" aria-label={`查看${item.title}观看详情`} onClick={() => onOpen(item)}><ArrowRight size={16} aria-hidden="true" /></Button>
        </div>)}
      </section>
    </div>
    <div className="metrics">
      <MetricCard label="媒体库作品" value={collection.length} suffix=" 部" context={site} />
      <MetricCard label="启用订阅" value={state.subscriptions.filter(item => item.active).length} suffix=" 项" context="动漫、追剧及影片" />
      <MetricCard label="下载中" value={state.tasks.filter(item => item.status === '下载中').length} suffix=" 项" context="媒体处理中的任务" />
    </div>
    <section className="section">
      <SectionHeading title="媒体库" action={<Button variant="ghost" onClick={() => go('discover')}>打开影视探索 <ArrowRight size={16} aria-hidden="true" /></Button>} />
      <div className="row library-toolbar"><SegmentedControl label="媒体库类型" options={site === '主媒体库' ? types : options(['全部', '动画'])} value={library} onValueChange={setLibrary} /></div>
      <MediaGrid items={collection} onOpen={onOpen} />
    </section>
    <section className="section panel"><SectionHeading title="媒体活动" description="近一周示例入库数量" />
      <LineChart data={chart} series={[{ key: 'count', label: '入库作品' }]} height={190} label="每周入库作品" unit=" 部" />
    </section>
  </>;
}

const filterFields: FilterField[] = [
  { id: 'genre', label: '类型', icon: <Film size={16} />, options: ['科幻', '剧情', '动作', '犯罪', '悬疑', '奇幻', '爱情', '动画', '冒险', '喜剧', '历史'] },
  { id: 'region', label: '地区', icon: <Globe size={16} />, options: ['欧美', '英国', '日本', '韩国', '大陆', '香港', '台湾'] },
  { id: 'year', label: '年份', icon: <CalendarDays size={16} />, options: [...new Set(media.map(item => item.year))].sort((a, b) => b - a).map(String) },
];

function CatalogGrid({ items, origin, ranked, onOpen, onSearchResource, onFavorite, favorites }: CatalogActions & {
  items: Media[]; origin: 'discover' | 'rankings'; ranked?: boolean;
}) {
  return <div className="catalog-grid">{items.map((item, index) => {
    const favorite = favorites.includes(item.id);
    return <article className="catalog-card" key={item.id}>
      <a className="catalog-poster" href={`#${workPath(origin, item.id)}`} aria-label={`查看${item.title}详情`} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onOpen(item);
      }}>
        <img src={item.poster} alt="" loading="lazy" />
        <div className="catalog-poster-badges">
          <span>{ranked ? String(index + 1).padStart(2, '0') : item.kind}</span>
          <span><Star size={12} fill="currentColor" aria-hidden="true" />{item.score.toFixed(1)}</span>
        </div>
        <div className="catalog-poster-copy">
          <h3 title={item.title}>{item.title}</h3>
          <div className="catalog-poster-description">
            <small>{item.year} · {item.genre}</small><p>{item.summary}</p>
          </div>
        </div>
      </a>
      <div className="catalog-quick-actions">
        <Button variant="ghost" className="catalog-action" aria-label={`搜索${item.title}资源`} title="搜索资源" onClick={() => onSearchResource(item.title)}><Search size={16} aria-hidden="true" /></Button>
        <Button variant="ghost" className="catalog-action" aria-label={`收藏${item.title}`} aria-pressed={favorite} title={favorite ? '取消收藏' : '收藏'} onClick={() => onFavorite(item)}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" /></Button>
      </div>
    </article>;
  })}</div>;
}

function DiscoveryPanel({ source, onSearch, ...actions }: CatalogActions & { source: string; onSearch: (value: string) => void }) {
  const [filters, setFilters] = useState<FilterChip[]>([]);
  const [kind, setKind] = useState('全部');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('默认排序');
  const [page, setPage] = useState(1);
  const matches = media.filter(item =>
    (!['AniList', 'Bangumi'].includes(source) || (item.kind === '动画' && item.region === '日本')) &&
    (kind === '全部' || item.kind === kind) &&
    (includes(item.title, query) || includes(item.original, query)) &&
    filters.every(({ id, value }) => id === 'year' ? String(item.year) === value : id === 'genre' ? (item.genre === value || value === '动画' && item.kind === '动画') : item.region === value));
  if (sort === '评分') matches.sort((a, b) => b.score - a.score);
  if (sort === '最新') matches.sort((a, b) => b.year - a.year);
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));

  function reset() { setFilters([]); setKind('全部'); setDraft(''); setQuery(''); setSort('默认排序'); setPage(1); }
  return <>
    <div className="discovery-tools">
      <SegmentedControl label="作品类型" options={types} value={kind} onValueChange={value => { setKind(value); setPage(1); }} />
      <div className="catalog-filters">
        <FilterToolbar label="作品筛选" filters={filters}
          onRemove={id => { setFilters(items => items.filter(item => item.id !== id)); setPage(1); }}
          onClearAll={() => { setFilters([]); setPage(1); }}
          addFilter={{ label: '添加筛选', align: 'start', fields: filterFields, onAdd: filter => {
            setFilters(items => [...items.filter(item => item.id !== filter.id), filter]); setPage(1);
          } }} />
      </div>
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
    {matches.length ? <CatalogGrid items={matches.slice((page - 1) * pageSize, page * pageSize)} origin="discover" {...actions} /> : <NoResults reset={reset} />}
    {pages > 1 && <div className="pagination row">
      <Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</Button>
      <span>{page} / {pages}</span>
      <Button variant="secondary" disabled={page === pages} onClick={() => setPage(value => value + 1)}>下一页</Button>
    </div>}
  </>;
}

export function Discovery({ onSearch, ...actions }: CatalogActions & { onSearch: (value: string) => void }) {
  return <section className="discovery-page">
    <PageHeading title="影视探索" />
    <WorkspaceTabs label="作品来源" appearance="underline" items={sources.map(source => ({ id: source, label: source, content: <DiscoveryPanel source={source} onSearch={onSearch} {...actions} /> }))} />
  </section>;
}

export function Rankings(actions: CatalogActions) {
  const [kind, setKind] = useState('全部');
  const [platform, setPlatform] = useState('全部平台');
  const [region, setRegion] = useState('所有地区');
  const [access, setAccess] = useState('全部方式');
  const availability: Record<string, string[]> = {
    dune: ['租借', '购买'], interstellar: ['订阅', '租借'], blade: ['租借', '购买'], oppenheimer: ['购买'],
    batman: ['订阅', '购买'], arrival: ['免费', '广告'], breaking: ['订阅'], stranger: ['订阅'],
    spirited: ['订阅', '租借'], yourname: ['免费', '广告'],
  };
  const listed = [...media].filter(item => (kind === '全部' || item.kind === kind) &&
    (region === '所有地区' || item.region === region) &&
    (platform === '全部平台' || (platform === '动画专区' ? item.kind === '动画' : item.kind !== '动画')) &&
    (access === '全部方式' || (availability[item.id] ?? ['租借']).includes(access))).sort((a, b) => b.score - a.score);
  return <>
    <PageHeading title="榜单推荐" description="按评分浏览本地示例榜单，也可按地区和平台缩小范围。" />
    <div className="panel rank-tools">
      <SegmentedControl label="榜单类别" options={types} value={kind} onValueChange={setKind} />
      <div className="row fields compact-fields">
        <Select label="地区" options={options(['所有地区', '欧美', '英国', '日本'])} value={region} onValueChange={setRegion} />
        <Select label="平台" options={options(['全部平台', '流媒体片库', '动画专区'])} value={platform} onValueChange={setPlatform} />
        <Select label="观看方式" options={options(['全部方式', '订阅', '免费', '广告', '租借', '购买'])} value={access} onValueChange={setAccess} />
      </div>
    </div>
    <div className="section"><SectionHeading title="评分榜" description={`${listed.length} 部作品`} />
      {listed.length ? <CatalogGrid ranked origin="rankings" items={listed} {...actions} /> : <NoResults />}
    </div>
  </>;
}

export function MediaDetail({ item, favorite, subscribed, onClose, onFavorite, onSubscribe, onSearch, onDownload }: {
  item: Media; favorite: boolean; subscribed: boolean; onClose: () => void; onFavorite: Open;
  onSubscribe: (item: Media, season: string) => void; onSearch: Open; onDownload: Open;
}) {
  const [season, setSeason] = useState('第 1 季');
  const backdrop = backdrops[item.id];
  const cast = castProfiles[item.id];
  return <article className="work-detail" aria-label={`${item.title}详情`}>
    <section className="work-hero">
      <img className="work-backdrop" data-fallback={!backdrop} src={backdrop || item.poster} alt="" />
      <div className="work-hero-inner">
        <div className="work-back">
          <Button variant="ghost" onClick={onClose}><ArrowLeft size={17} aria-hidden="true" />返回列表</Button>
        </div>
        <div className="work-feature">
          <img className="work-poster" src={item.poster} alt={`${item.title}海报`} />
          <div className="work-intro">
            <div className="work-meta">
              <span className="work-rating"><Star size={15} fill="currentColor" aria-hidden="true" />{item.score.toFixed(1)}</span>
              <span>{item.year}</span><span>{item.duration}</span><span>{item.kind} · {item.genre}</span><span>{item.region}</span>
            </div>
            <h1 tabIndex={-1}>{item.title}</h1>
            <p className="work-original">{item.original}</p>
            <p className="work-summary">{item.summary}</p>
            <div className="row work-actions">
              <Button onClick={() => onSearch(item)}><Search size={17} aria-hidden="true" />搜索资源</Button>
              <Button variant="secondary" onClick={() => onFavorite(item)} aria-pressed={favorite}>
                <Heart size={17} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />{favorite ? '已收藏' : '收藏'}
              </Button>
              <Button variant="ghost" onClick={() => onDownload(item)}>添加下载任务</Button>
            </div>
            <section className="work-cast">
              <h2>主要演职员</h2>
              <ul>{item.cast.map(name => <li key={name}>
                {cast?.[name] && <img src={cast[name].photo} alt="" />}
                <span>{name}</span>
                {cast?.[name] && <small>{cast[name].character}</small>}
              </li>)}</ul>
            </section>
            <div className="row work-subscribe">
              {item.kind === '剧集' && <Select label="订阅季" options={options(['第 1 季', '第 2 季', '第 3 季', '第 4 季', '第 5 季'])} value={season} onValueChange={setSeason} />}
              <Button variant="ghost" onClick={() => onSubscribe(item, season)}>
                {subscribed ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{subscribed ? '取消订阅' : '添加订阅'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </article>;
}
