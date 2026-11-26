import {scheduleRequest} from './schedule-request';
import {Calendar} from './schedule-calendar'
import { Button, ConfirmDeleteDialog, Dialog, DialogContent, Input, SearchField, Select, SegmentedControl, Switch } from './controls';
import { useEffect, useState } from 'react';
import { CalendarDays, Ellipsis, Pause, Pencil, Play, Plus, RefreshCw, Star, Trash2, Tv } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { is115ShareURL } from '@/lib/download-api';
import type { TV, TVDraft } from './lib/media-service';
import { safeResourceURL } from '@/lib/resource-search';
import { imageUrl, requestError, type LiveApi } from './live-api';
import { ResourceDownload } from './live-download';
import { CatalogArtwork } from './catalog';
import { dayKey, includes, type Media } from './model';
import { beijingToday } from './model';
import { NoResults, PageHeading, Status } from './ui';

const qualities = [{ value: 'any', label: '不限' }, { value: '4k', label: '4K / 2160P / UHD' }, { value: '1080', label: '1080P' }];
function generatedRule(title: string, quality: string) {
  const name = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const condition = quality === '4k' ? '(?=.*(?:4K|2160P|UHD))' : quality === '1080' ? '(?=.*1080P)' : '';
  return `(?i)^(?=.*${name})${condition}.*$`;
}

function sourceNames(input: string, plugins: boolean) {
  const values = [...new Set(input.split(/[,，\s]+/).filter(Boolean).map(raw => {
    const telegram = /^(?:https?:\/\/)?t\.me\/(?:s\/)?([a-z0-9_]+)(?:\/\d+)?\/?(?:\?.*)?$/i.exec(raw);
    const name = telegram?.[1] ?? raw.replace(/^@/, '');
    if (!plugins) {
      if (!/^[a-z0-9_]{1,32}$/i.test(name)) throw new Error('请输入公开频道用户名或 t.me 链接。');
      return name.toLowerCase();
    }
    const value = telegram || raw.startsWith('@') ? 'tg:' + name : name.includes(':') ? name : 'plugin:' + name;
    if (!/^(plugin|tg):[a-z0-9_-]{1,64}$/i.test(value)) throw new Error('请输入插件名或公开频道链接。');
    return value.toLowerCase();
  }))];
  if (values.length > 20) throw new Error('最多可添加 20 个来源。');
  return values;
}

export function LiveTVEditor({ api, value, close, saved }: {
  api: LiveApi; value: TV | TVDraft; close: () => void; saved: (item: TV) => void;
}) {
  const id = 'id' in value ? value.id : undefined;
  const [draft, setDraft] = useState<TVDraft>({ ...value, match: value.match || generatedRule(value.title, 'any') });
  const [quality, setQuality] = useState(/2160|4k|uhd/i.test(value.match) ? '4k' : /1080/i.test(value.match) ? '1080' : 'any');
  const [channels, setChannels] = useState(value.channels?.join(', ') ?? '');
  const [sources, setSources] = useState(value.sources?.join(', ') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
	  if (!draft.match.trim()) throw new Error('请填写资源匹配正则，所有来源都必须符合此规则。');
      const parsedChannels = draft.source === 'tg' ? sourceNames(channels, false) : [];
      if (draft.source === 'tg' && !parsedChannels.length) throw new Error('请至少添加一个公开频道。');
      const item = await api.saveTV({
        ...draft, channels: parsedChannels, sources: draft.source === 'pansou' ? sourceNames(sources, true) : draft.sources,
      }, id);
      saved(item);
    } catch (reason) { setError(requestError(reason)); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent title={id ? '编辑追剧规则' : '订阅此剧'}
      description={value.title + ' · ' + (value.season ? '第 ' + value.season + ' 季' : '全部季度 · 持续跟踪新季度')}>
      <form className="stack" onSubmit={event => { event.preventDefault(); void save(); }}>
        <SegmentedControl label="资源来源" value={draft.source} options={[{ value: 'pansou', label: 'PanSou' }, { value: 'tg', label: 'TG 公开频道' }]}
          onValueChange={source => { if (!busy) setDraft(current => ({ ...current, source: source as TVDraft['source'] })); }} />
        {draft.source === 'tg' ? <Input label="公开频道" value={channels} disabled={busy} onChange={event => setChannels(event.target.value)} placeholder="公开频道用户名或 t.me 链接" required />
          : <Input label="优先来源（可选）" value={sources} disabled={busy} onChange={event => setSources(event.target.value)} placeholder="插件名或公开频道链接" />}
        <small className="muted">{draft.source === 'pansou'
          ? '多个来源用逗号或空格分隔。符合正则时按填写顺序优先选择，未命中则从全局来源补选；留空时使用全局来源。'
          : '多个频道用逗号或空格分隔，只搜索填写的公开频道，所有结果仍须符合正则。'}</small>
        <Select label="清晰度" value={quality} options={qualities} disabled={busy} onValueChange={next => {
          setQuality(next); setDraft(current => ({ ...current, match: generatedRule(current.title, next) }));
        }} />
        <details className="rule-disclosure"><summary>高级规则</summary><div className="stack">
          <Input label="资源匹配正则（必填）" value={draft.match} disabled={busy} onChange={event => setDraft({ ...draft, match: event.target.value })} />
          <small className="muted">先匹配正则并排除不需要的资源，再按优先来源选择；同等条件下 115 优先、磁力兜底。</small>
          <Input label="排除正则" value={draft.exclude} disabled={busy} onChange={event => setDraft({ ...draft, exclude: event.target.value })} />
          <Switch label="启用订阅" checked={draft.enabled} disabled={busy} onCheckedChange={enabled => setDraft({ ...draft, enabled })} />
        </div></details>
        {error && <p role="alert">{error}</p>}
        <div className="row form-actions">
          <Button variant="secondary" disabled={busy} onClick={close}>取消</Button>
          <Button type="submit" disabled={busy}>{busy ? '正在保存…' : '保存订阅'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

type TVResource = TV['resources'][number];
const episodeLabel = (season: number, episode: number) => `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
const seasonOf = (item: TV, season?: number) => season || item.season || 1;

function coversEpisode(item: TV, resource: TVResource, episode: TV['episodes'][number]) {
  return seasonOf(item, resource.season) === seasonOf(item, episode.season) &&
    (resource.episode === episode.number || Boolean(resource.collectionEnd && episode.number <= resource.collectionEnd));
}

function seriesMedia(item: TV): Media {
  return { id: `tmdb:tv:${item.tmdbId}`, title: item.title, poster: imageUrl(item.poster),
    score: item.rating ?? 0, kind: '剧集', original: '', year: 0, genre: '', region: '', duration: '', summary: '', cast: [] };
}

function TVRating({ api, item }: { api: LiveApi; item: TV }) {
  const [lookup, setLookup] = useState<{id:string;value:number}>();
  const rating=item.rating || (lookup?.id===item.tmdbId ? lookup.value : 0);
  useEffect(() => {
    if (item.rating) return;
    const controller = new AbortController();
    api.detail({ source: 'tmdb', sourceId: item.tmdbId, mediaType: 'tv' }, controller.signal)
      .then(detail => { if (!controller.signal.aborted) setLookup({id:item.tmdbId,value:detail.ratings?.find(r => r.source === 'tmdb')?.value ?? 0}); }).catch(() => {});
    return () => controller.abort();
  }, [api, item.tmdbId, item.rating]);
  return rating > 0 && <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`TMDB 评分 ${rating.toFixed(1)}`}>
    <Star className="size-3.5" aria-hidden="true" />{rating.toFixed(1)}
  </span>;
}

export function SeriesCard({ api, item, busy, onOpen, onEdit, onToggle, onRefresh, onRemove }: {
  api: LiveApi; item: TV; busy: boolean; onOpen: (item: Media) => void;
  onEdit: () => void; onToggle: () => void; onRefresh: () => void; onRemove: () => void;
}) {
  const media = seriesMedia(item);
  const episodes = item.episodes ?? [];
  const found = episodes.filter(ep => item.resources?.some(r => coversEpisode(item, r, ep))).length;
  const status = item.enabled ? '追踪中' : '已暂停';
  return <li>
    <Card size="sm" className="relative grid h-full grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl p-3 shadow-none sm:gap-4">
      <div className="grid aspect-[2/3] w-24 place-items-center self-start overflow-hidden rounded-md bg-muted text-muted-foreground sm:w-28">
        <CatalogArtwork src={media.poster} api={api} lazy className="size-full object-cover"
          fallback={<Tv className="size-6" aria-hidden="true" />} />
      </div>
      <div className="flex min-w-0 flex-col py-1">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${item.enabled ? 'bg-(--success)' : 'bg-muted-foreground'}`} />{status}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="relative z-10 -my-1 text-muted-foreground" />}
              id={`series-menu-${item.id}`} disabled={busy} aria-label={`管理《${item.title}》订阅`}><Ellipsis /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}><Pencil />编辑订阅</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggle}>{item.enabled ? <Pause /> : <Play />}{item.enabled ? '暂停追踪' : '恢复追踪'}</DropdownMenuItem>
              <DropdownMenuItem onClick={onRefresh}><RefreshCw />检查更新</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 />删除订阅</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3 className="mt-2 text-base leading-snug font-semibold">
          <a className="line-clamp-2 break-words rounded-sm after:absolute after:inset-0 hover:underline focus-visible:underline"
            href={`/discover/calendar?work=${encodeURIComponent(media.id)}`} onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); onOpen(media);
            }}>{item.title}</a>
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{item.season ? `第 ${item.season} 季` : '全部季度'}</span><TVRating api={api} item={item} />
        </div>
        <div className="mt-auto space-y-2 pt-4 text-xs text-muted-foreground">
          {episodes.length ? <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2"><span>已发现</span>
              <span className="tabular-nums"><strong className="font-medium text-foreground">{found}</strong> / {episodes.length} 集</span></div>
            <Progress aria-label="已发现集数" max={episodes.length} value={found} />
          </> : <span>集数待定</span>}
        </div>
      </div>
    </Card>
  </li>;
}

export function LiveSeriesCalendar({ api, discover, notify, onOpen }: {
  api: LiveApi; discover: () => void; notify: (message: string) => void; onOpen: (item: Media) => void;
}) {
  const [items, setItems] = useState<TV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCalendar, setShowCalendar] = useState(false);
  const [today] = useState(beijingToday);
  const [selected, setSelected] = useState(today);
  const [eventDate, setEventDate] = useState('');
  const [edit, setEdit] = useState<TV>();
  const [remove, setRemove] = useState<TV>();
  const [removeError, setRemoveError] = useState('');
  const [busy, setBusy] = useState('');
  const [download, setDownload] = useState<{ item: TV; resource: TVResource }>();

  useEffect(() => scheduleRequest(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.tvSubscriptions(controller.signal).then(result => {
      if (!controller.signal.aborted) setItems(result ?? []);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(requestError(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }), [api, revision]);

  const visible = items.filter(item => includes(item.title, query) && (filter === 'all' || item.enabled === (filter === 'active')));
  const events = new Map<string, { item: TV; episode: TV['episodes'][number]; label: string; status: string; resources: TVResource[] }[]>();
  for (const item of items) {
    for (const episode of item.episodes ?? []) {
      if (!episode.airDate) continue;
      const season = seasonOf(item, episode.season);
      const resources = (item.resources ?? []).filter(resource => coversEpisode(item, resource, episode));
      const label = episodeLabel(season, episode.number);
      const status = resources.length ? '资源已找到' : !item.enabled ? '订阅暂停' : episode.airDate > dayKey(today) ? '待播出' : '待搜资源';
      const day = events.get(episode.airDate) ?? [];
      day.push({ item, episode, label, status, resources });
      events.set(episode.airDate, day);
    }
  }

  function update(item: TV) { setItems(current => current.map(previous => previous.id === item.id ? item : previous)); }
  function editItem(item: TV) { setEventDate(''); setEdit(item); }
  async function action(item: TV, type: 'refresh' | 'toggle' | 'remove') {
    if (busy || loading) return;
    setBusy(item.id); setError(''); setRemoveError('');
    try {
      if (type === 'remove') {
        await api.removeTV(item.id);
        setItems(current => current.filter(entry => entry.id !== item.id));
        setRemove(undefined);
        notify(`已删除《${item.title}》的追剧订阅。`);
      } else {
        update(type === 'refresh' ? await api.refreshTV(item.id) : await api.saveTV({ ...item, enabled: !item.enabled }, item.id));
      }
    } catch (reason) {
      if (type === 'remove') setRemoveError(requestError(reason));
      else setError(requestError(reason));
    }
    finally { setBusy(''); }
  }
  function resourceList(item: TV, resources: TVResource[]) {
    return resources.length ? <ul className="anime-resources">{resources.map((resource, index) => {
      const url = safeResourceURL(resource.url);
      return <li className="series-resource" key={resource.url + ':' + index}>
        <strong>{episodeLabel(seasonOf(item, resource.season), resource.episode)}{resource.collectionEnd ? '–' + resource.collectionEnd : ''} · {resource.title}</strong>
        <div className="row">
          {url && !/^magnet:/i.test(url) && <a className="catalog-source-link" href={url} target="_blank" rel="noopener noreferrer">打开资源</a>}
          {resource.password && <small className="muted">提取码 {resource.password}</small>}
          {(/^magnet:\?/i.test(resource.url) || is115ShareURL(resource.url)) && <Button size="sm" variant="secondary"
            onClick={() => { setEventDate(''); setDownload({ item, resource }); }}>下载 / 转存</Button>}
        </div>
      </li>;
    })}</ul> : <p className="muted">尚未找到资源。</p>;
  }

  return <section className="stack series-library">
    <PageHeading title="追剧日历" description="管理剧集订阅、播出计划与资源更新。" action={<div className="row">
      <Button variant="secondary" aria-pressed={showCalendar} onClick={() => setShowCalendar(current => !current)}><CalendarDays size={17} aria-hidden="true" />{showCalendar ? '订阅列表' : '播出日历'}</Button>
      <Button variant="secondary" disabled={loading || Boolean(busy)} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />刷新</Button>
      <Button onClick={discover}><Plus size={16} aria-hidden="true" />添加追剧</Button>
    </div>} />
    {error && <p role="alert">{error}</p>}
    {showCalendar && <section className="panel series-calendar">
      <Calendar value={selected} locale="zh-CN" weekStartsOn={1} todayDate={today} showToday
        onChange={date => { setSelected(date); setEventDate(events.has(dayKey(date)) ? dayKey(date) : ''); }}
        dayDetails={date => {
          const day = events.get(dayKey(date));
          if (!day?.length) return;
          return {
            label: day.map(event => `${event.item.title} ${event.label} ${event.status}`).join('、'),
            content: day.map(event => <span key={event.item.id + event.label} className="schedule-event" data-available={Boolean(event.resources.length)}>
              <strong>{event.item.title}</strong><small>{event.label} · {event.status}</small></span>),
          };
        }} />
      <p className="muted">播出日期按北京时间展示。</p>
    </section>}
    <h2 className="text-xl font-semibold">我的追剧</h2>
    <div className="flex flex-wrap items-center justify-between gap-3"><SegmentedControl label="订阅状态" options={[
      { value: 'all', label: '全部 ' + items.length }, { value: 'active', label: '追踪中' }, { value: 'paused', label: '已暂停' },
    ]} value={filter} onValueChange={setFilter} />
      <SearchField id="series-search" aria-label="搜索追剧" value={query} onValueChange={setQuery} placeholder="搜索追剧" />
    </div>
    {loading ? <p role="status">正在读取追剧订阅…</p> : visible.length ? <ul aria-label="追剧订阅" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-4">
      {visible.map(item => <SeriesCard key={item.id} item={item} api={api} busy={Boolean(busy)} onOpen={onOpen} onEdit={() => editItem(item)}
        onToggle={() => void action(item, 'toggle')} onRefresh={() => void action(item, 'refresh')}
        onRemove={() => { setRemoveError(''); setRemove(item); }} />)}
    </ul> : !error && <NoResults title={items.length ? '没有符合条件的追剧订阅' : '还没有追剧订阅'} description={items.length ? '试试其他片名或订阅状态。' : '可在影视探索的剧集详情中添加订阅。'} />}
    {edit && <LiveTVEditor api={api} value={edit} close={() => setEdit(undefined)} saved={item => { update(item); setEdit(undefined); notify('已保存追剧规则。'); }} />}
    {eventDate && <Dialog open onOpenChange={open => { if (!open) setEventDate(''); }}>
      <DialogContent className="wide-dialog" title={eventDate + ' 播出计划'}>
        <div className="stack">{events.get(eventDate)?.map(event => <div className="panel stack" key={event.item.id + event.label}>
          <div className="row"><strong>{event.item.title} · {event.label}</strong><Status tone={event.resources.length ? 'success' : 'neutral'}>{event.status}</Status></div>
          {event.episode.name && <p>{event.episode.name}</p>}
          {resourceList(event.item, event.resources)}
          <div><Button variant="secondary" onClick={() => editItem(event.item)}>编辑订阅规则</Button></div>
        </div>)}</div>
      </DialogContent>
    </Dialog>}
    {remove && <ConfirmDeleteDialog title="删除追剧订阅？" label="删除订阅" busy={Boolean(busy)} error={removeError}
      description={`《${remove.title}》会从追剧日历移除并停止追踪。已转存的文件会保留。`}
      finalFocus={() => document.getElementById(`series-menu-${remove.id}`) ?? document.getElementById('series-search')}
      onCancel={() => setRemove(undefined)} onConfirm={() => void action(remove, 'remove')} />}
    {download && <ResourceDownload api={api} close={() => setDownload(undefined)} done={notify} resource={{
      ...download.resource, reference: {
        source: 'tv_subscription', sourceId: download.item.id,
        media: { type: 'tv', title: download.item.title, provider: 'tmdb', providerId: download.item.tmdbId,
          season: seasonOf(download.item, download.resource.season), episodes: download.resource.collectionEnd ? undefined : [download.resource.episode] },
      },
    }} />}
  </section>;
}
