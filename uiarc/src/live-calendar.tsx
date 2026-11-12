import { useEffect, useState } from 'react';
import { CalendarDays, Plus, RefreshCw, Tv } from 'lucide-react';
import { is115ShareURL } from '../../hero/src/lib/download-api';
import type { TV, TVDraft } from '../../hero/src/lib/media-service';
import { safeResourceURL } from '../../hero/src/lib/resource-search';
import { Button } from './arc/button/button';
import { Calendar } from './arc/calendar/calendar';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Switch } from './arc/switch/switch';
import { requestError, type LiveApi } from './live-api';
import { ResourceDownload } from './live-download';
import { dayKey, includes } from './model';
import { beijingToday } from './subscriptions';
import { NoResults, PageHeading, SectionHeading, Status } from './ui';

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
        <small className="muted">多个来源用逗号或空格分隔，按填写顺序匹配。{draft.source === 'pansou' && '留空时使用全局搜索来源。'}</small>
        <Select label="清晰度" value={quality} options={qualities} disabled={busy} onValueChange={next => {
          setQuality(next); setDraft(current => ({ ...current, match: generatedRule(current.title, next) }));
        }} />
        <details className="rule-disclosure"><summary>高级规则</summary><div className="stack">
          <Input label="资源匹配正则" value={draft.match} disabled={busy} onChange={event => setDraft({ ...draft, match: event.target.value })} />
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
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

function TVPoster({ poster }: { poster: string }) {
  const [broken, setBroken] = useState(false);
  const url = poster?.startsWith('/') && !poster.startsWith('//') ? 'https://image.tmdb.org/t/p/w500' + poster : safeResourceURL(poster || '');
  return url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Tv size={28} aria-hidden="true" />;
}

export function LiveSeriesCalendar({ api, discover, notify }: {
  api: LiveApi; discover: () => void; notify: (message: string) => void;
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
  const [detailId, setDetailId] = useState('');
  const [remove, setRemove] = useState<TV>();
  const [busy, setBusy] = useState('');
  const [download, setDownload] = useState<{ item: TV; resource: TVResource }>();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.tvSubscriptions(controller.signal).then(result => {
      if (!controller.signal.aborted) setItems(result ?? []);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(requestError(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, revision]);

  const visible = items.filter(item => includes(item.title, query) && (filter === 'all' || item.enabled === (filter === 'active')));
  const detail = items.find(item => item.id === detailId);
  const events = new Map<string, { item: TV; episode: TV['episodes'][number]; label: string; status: string; resources: TVResource[] }[]>();
  for (const item of items) {
    for (const episode of item.episodes ?? []) {
      if (!episode.airDate) continue;
      const season = seasonOf(item, episode.season);
      const resources = (item.resources ?? []).filter(resource => seasonOf(item, resource.season) === season &&
        (resource.episode === episode.number || Boolean(resource.collectionEnd && episode.number <= resource.collectionEnd)));
      const label = episodeLabel(season, episode.number);
      const status = resources.length ? '资源已找到' : !item.enabled ? '订阅暂停' : episode.airDate > dayKey(today) ? '待播出' : '待搜资源';
      const day = events.get(episode.airDate) ?? [];
      day.push({ item, episode, label, status, resources });
      events.set(episode.airDate, day);
    }
  }

  function update(item: TV) { setItems(current => current.map(previous => previous.id === item.id ? item : previous)); }
  function editItem(item: TV) { setDetailId(''); setEventDate(''); setEdit(item); }
  async function action(item: TV, type: 'refresh' | 'toggle' | 'remove') {
    if (busy || loading) return;
    setBusy(item.id); setError('');
    try {
      if (type === 'remove') {
        await api.removeTV(item.id);
        setItems(current => current.filter(entry => entry.id !== item.id));
        setRemove(undefined);
      } else {
        update(type === 'refresh' ? await api.refreshTV(item.id) : await api.saveTV({ ...item, enabled: !item.enabled }, item.id));
      }
    } catch (reason) { setError(requestError(reason)); }
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
            onClick={() => { setEventDate(''); setDetailId(''); setDownload({ item, resource }); }}>下载 / 转存</Button>}
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
    <SectionHeading title="我的追剧" description={items.length + ' 部剧集'} action={<SearchField label="搜索追剧" value={query} onValueChange={setQuery} placeholder="搜索订阅…" />} />
    <div className="row"><SegmentedControl label="订阅状态" options={[
      { value: 'all', label: '全部 ' + items.length }, { value: 'active', label: '追踪中' }, { value: 'paused', label: '已暂停' },
    ]} value={filter} onValueChange={setFilter} /></div>
    {loading ? <p role="status">正在读取追剧订阅…</p> : visible.length ? <div className="series-grid">{visible.map(item => <article className="panel series-card" key={item.id}>
      <Button variant="ghost" className="series-cover" aria-label={`查看《${item.title}》订阅详情`} onClick={() => setDetailId(item.id)}><TVPoster poster={item.poster} /></Button>
      <div className="series-card-body">
        <div className="row"><Status tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '追踪中' : '已暂停'}</Status><span className="muted">{item.source === 'tg' ? 'TG 频道' : 'PanSou'}</span></div>
        <h3>{item.title}</h3>
        <p className="muted">{item.season ? '第 ' + item.season + ' 季' : '全部季度'} · {item.episodes?.length ? item.episodes.length + ' 集' : '集数待同步'}</p>
        <div className="row">
          <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => editItem(item)}>编辑</Button>
          <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => void action(item, 'toggle')}>{item.enabled ? '暂停' : '恢复'}</Button>
          <Button size="sm" variant="ghost" className="icon-button" disabled={Boolean(busy)} aria-label={`检查《${item.title}》更新`}
            onClick={() => void action(item, 'refresh')}><RefreshCw size={15} aria-hidden="true" /></Button>
        </div>
      </div>
    </article>)}</div> : !error && <NoResults title="没有符合条件的追剧订阅" description="可在影视探索的剧集详情中添加订阅。" />}
    {edit && <LiveTVEditor api={api} value={edit} close={() => setEdit(undefined)} saved={item => { update(item); setEdit(undefined); notify('已保存追剧规则。'); }} />}
    {detail && <Dialog open onOpenChange={open => { if (!open) setDetailId(''); }}>
      <DialogContent className="wide-dialog" title={detail.title} description="订阅详情">
        <div className="stack">
          {detail.lastCheckedAt && <p>上次检查 · {formatTime(detail.lastCheckedAt)}</p>}
          {detail.nextCheckAt && <p>下次检查 · {formatTime(detail.nextCheckAt)}</p>}
          {(!detail.episodes?.length || detail.episodes.some(episode => !episode.airDate)) && <p className="muted">部分或全部播出日期未知，每天检查一次。</p>}
          {[detail.metadataError, detail.lastError].filter(Boolean).map((message, index) => <p key={index} role="alert">{message}</p>)}
          {resourceList(detail, detail.resources ?? [])}
          <div className="row">
            <Button variant="secondary" onClick={() => editItem(detail)}>编辑订阅规则</Button>
            <Button variant="ghost" onClick={() => { setDetailId(''); setRemove(detail); }}>删除订阅</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>}
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
    {remove && <Dialog open onOpenChange={open => { if (!open && !busy) setRemove(undefined); }}>
      <DialogContent title="删除订阅" description={`删除《${remove.title}》的订阅和跟踪记录？`}>
        <div className="stack">
          {error && <p role="alert">{error}</p>}
          <div className="row form-actions">
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => setRemove(undefined)}>取消</Button>
            <Button disabled={Boolean(busy)} onClick={() => void action(remove, 'remove')}>确认删除</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>}
    {download && <ResourceDownload api={api} close={() => setDownload(undefined)} done={notify} resource={{
      ...download.resource, reference: {
        source: 'tv_subscription', sourceId: download.item.id,
        media: { type: 'tv', title: download.item.title, provider: 'tmdb', providerId: download.item.tmdbId,
          season: seasonOf(download.item, download.resource.season), episodes: download.resource.collectionEnd ? undefined : [download.resource.episode] },
      },
    }} />}
  </section>;
}
