import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clapperboard, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { Progress } from './arc/progress/progress';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Switch } from './arc/switch/switch';
import { NoResults, SectionHeading, Status } from './ui';
import { includes, media, options, uid } from './model';
import type { AnimeSubscription, Media, Notify, Subscription, Update } from './model';
import './anime.css';

const feedSources = ['Mikan', 'AniBT', 'AnimeGarden', '自定义 RSS'];
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const groups = [
  { name: '示例字幕组 A', version: '简体字幕 · 1080p' },
  { name: '示例字幕组 B', version: '繁体字幕 · 720p' },
];
const feedCatalog = [
  { id: 'frieren', season: '2023 秋季', weekday: 5, total: 28, available: 8, sources: feedSources.slice(0, 3) },
  { id: 'yourname', season: '2016 夏季', total: 1, available: 1, sources: ['Mikan', 'AnimeGarden'] },
  { id: 'spirited', season: '2001 夏季', total: 1, available: 1, sources: ['AniBT', 'AnimeGarden'] },
];
const animeWorks = media.filter(item => item.kind === '动画' && item.region === '日本');
const episodeLabel = (number: number, total?: number) => total === 1 ? '正片' : '第 ' + number + ' 集';
const weekdayLabel = (day?: number) => weekdays[(day ?? 0) - 1] ?? '未设置更新日';
const isBangumiId = (value?: string) => /^[1-9]\d*$/.test(value?.trim() ?? '');
const workFor = (entry: Subscription) => animeWorks.find(item => item.id === entry.anime?.mediaId) ?? animeWorks.find(item => item.title === entry.title);
const startingEpisode = (entry: Subscription) => entry.anime?.start ?? (Number(entry.episode.match(/\d+/)?.[0]) || 1);
function feedFor(entry: Subscription) {
  const work = workFor(entry);
  return feedCatalog.find(item => item.id === work?.id);
}

function isFeedUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch { return false; }
}

function subscriptionStatus(entry: Subscription) {
  const total = entry.anime?.total ?? feedFor(entry)?.total;
  const known = (entry.anime?.knownEpisodes ?? []).filter(number => number >= 1 && (!total || number <= total));
  const state = total && known.length >= total ? '已完结' : entry.active ? '更新中' : '已暂停';
  const progress = total ? '已发现 ' + known.length + ' / ' + total + ' 集' : '已发现 ' + known.length + ' 集';
  const latest = known.length ? Math.max(...known) : 0;
  return { state, known, total, progress, latest, tone: state === '已完结' ? 'neutral' : entry.active ? 'success' : 'warning' } as const;
}

function matchingReleases(entry: Subscription) {
  const feed = feedFor(entry);
  if (!feed) return [];
  const terms = (value: string) => value.split(/[,，·]/).map(term => term.trim()).filter(Boolean);
  const required = terms(entry.rule);
  const excluded = terms(entry.anime?.exclude ?? '');
  return Array.from({ length: feed.available }, (_, i) => feed.available - i).flatMap(number => {
    if (number < (entry.anime?.start ?? 1) || number > (entry.anime?.total ?? feed.total)) return [];
    return groups.filter(group => !entry.anime?.group || entry.anime.group === group.name).flatMap(group => {
      const language = feed.total === 1 ? ' · 日语中字' : '';
      const title = '[' + group.name + '] ' + entry.title + ' · ' + episodeLabel(number, feed.total) + ' · ' + group.version + language;
      return required.every(term => includes(title, term)) && !excluded.some(term => includes(title, term))
        ? [{ number, title, group: group.name }] : [];
    });
  });
}

function discoveredEpisodes(entry: Subscription) {
  return [...new Set([...(entry.anime?.knownEpisodes ?? []), ...matchingReleases(entry).map(release => release.number)])];
}

type Step = 'source' | 'browse' | 'match' | 'settings';
const stepLabels = { source: '选择订阅来源', browse: '查找番剧', match: '选择字幕组与版本', settings: '配置订阅规则' };

function AnimeEditor({ seed, onSave, onClose }: {
  seed?: Subscription; onSave: (entry: Subscription) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Subscription>(() => {
    if (seed) {
      const legacyRss = seed.source === '自定义 RSS' && isFeedUrl(seed.rule);
      return {
        ...seed, rule: legacyRss ? '' : seed.rule,
        anime: { rss: legacyRss ? seed.rule : '', start: startingEpisode(seed), ...seed.anime },
      };
    }
    return { id: '', title: '', kind: '动漫', source: feedSources[0], rule: '', active: true, auto: false, episode: '第 1 集', anime: {} };
  });
  const [step, setStep] = useState<Step>(seed ? 'settings' : 'source');
  const [previous, setPrevious] = useState<Step>('source');
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('全部季度');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const stepTitle = useRef<HTMLParagraphElement>(null);
  useEffect(() => { stepTitle.current?.focus(); }, [step]);
  const spec = draft.anime ?? {};
  const work = workFor(draft);
  const available = feedCatalog.filter(item => item.sources.includes(draft.source));
  const seasons = [...new Set(available.map(item => item.season))];
  const found = animeWorks.filter(item => available.some(feed => feed.id === item.id && (season === '全部季度' || season === feed.season)) &&
    (includes(item.title, query) || includes(item.original, query)));
  const releases = step === 'match' || preview ? matchingReleases(draft) : [];

  function change(patch: Partial<Subscription>) {
    setDraft(current => ({ ...current, ...patch }));
    setPreview(false);
    setError('');
  }
  function changeSpec(patch: Partial<AnimeSubscription>) { change({ anime: { ...spec, ...patch } }); }
  function go(next: Step) { setError(''); setPreview(false); setStep(next); }
  function configure(from: Step) { setPrevious(from); go('settings'); }
  function chooseGroup(group: string) {
    change({ rule: groups.find(entry => entry.name === group)?.version ?? draft.rule, anime: { ...spec, group: group || undefined } });
  }

  function chooseWork(item: Media) {
    const feed = available.find(entry => entry.id === item.id);
    if (!feed) return;
    change({ title: item.title, rule: groups[0].version, anime: { mediaId: item.id, total: feed.total, weekday: feed.weekday, start: 1, group: groups[0].name } });
    go('match');
  }
  function fromFeed() {
    if (!isFeedUrl(spec.rss?.trim() ?? '')) { setError('请输入有效的 HTTP 或 HTTPS RSS 地址。'); return; }
    if (draft.source === '自定义 RSS' && !isBangumiId(spec.bangumiId)) { setError('请输入有效的 Bangumi ID。'); return; }
    change({ title: '', rule: '', anime: { rss: spec.rss, bangumiId: spec.bangumiId } });
    configure('source');
  }
  function save() {
    const title = draft.title.trim();
    if (!title) { setError('请输入作品名称。'); return; }
    if ((spec.rss?.trim() && !isFeedUrl(spec.rss.trim())) || (draft.backup?.trim() && !isFeedUrl(draft.backup.trim()))) {
      setError('主 RSS 和备用 RSS 需要使用有效的 HTTP 或 HTTPS 地址。'); return;
    }
    const start = spec.start ?? 1;
    if (start < 1 || !Number.isInteger(start) || (spec.total !== undefined && (!Number.isInteger(spec.total) || spec.total < start))) {
      setError('请输入有效集数，总集数需要大于或等于起始集数。'); return;
    }
    if (!seed && previous === 'source' && !spec.rss?.trim()) { setError('请输入主 RSS 地址。'); return; }
    const bangumiId = spec.bangumiId?.trim();
    if (draft.source === '自定义 RSS' && (bangumiId || !seed) && !isBangumiId(bangumiId)) {
      setError('请输入有效的 Bangumi ID。'); return;
    }
    const episode = seed && start === startingEpisode(seed) ? seed.episode : episodeLabel(start, spec.total ?? feedFor(draft)?.total);
    const entry: Subscription = {
      ...draft, title, id: draft.id || uid(), episode,
      rule: draft.rule.trim(), backup: draft.backup?.trim(), directory: draft.directory?.trim(),
      anime: { ...spec, rss: spec.rss?.trim(), bangumiId, start },
    };
    if (!seed && spec.mediaId) {
      entry.anime = { ...entry.anime, knownEpisodes: discoveredEpisodes(entry), checkedAt: new Date().toISOString() };
    }
    onSave(entry);
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="wide-dialog" title={seed ? '编辑动漫订阅' : '添加动漫订阅'} description="本地演示使用内置片库和资源样例，RSS 地址仅保存到当前浏览器。">
      <div className="stack">
        {!seed && <p className="muted anime-step" ref={stepTitle} tabIndex={-1}>{stepLabels[step]}</p>}
        {step === 'source' && <div className="stack">
          <SegmentedControl label="订阅来源" options={options(feedSources)} value={draft.source} onValueChange={source => {
            change({ source, title: '', rule: '', anime: {} }); setSeason('全部季度'); setQuery('');
          }} />
          <form className="stack" onSubmit={event => { event.preventDefault(); fromFeed(); }}>
            <Input label="RSS 地址" type="url" placeholder="https://…/rss" value={spec.rss ?? ''} onChange={event => changeSpec({ rss: event.target.value })} />
            {draft.source === '自定义 RSS' && <Input label="Bangumi ID" inputMode="numeric" value={spec.bangumiId ?? ''} onChange={event => changeSpec({ bangumiId: event.target.value })} />}
            <div className="row form-actions">
              {draft.source !== '自定义 RSS' && <Button type="button" variant="secondary" onClick={() => go('browse')}>浏览 {draft.source}</Button>}
              <Button type="submit" disabled={!spec.rss?.trim()}>下一步</Button>
            </div>
          </form>
        </div>}
        {step === 'browse' && <div className="stack">
          <div className="field-grid">
            <SearchField label="搜索番剧" value={query} onValueChange={setQuery} placeholder="输入作品名称" />
            <Select label="播出季度" value={season} options={options(['全部季度', ...seasons])} onValueChange={setSeason} />
          </div>
          {found.length ? <div className="stack anime-choices">{found.map(item => <Button key={item.id} className="anime-choice" variant="secondary" onClick={() => chooseWork(item)}>
            <img src={item.poster} alt="" /><span>{item.title}</span>
          </Button>)}</div> : <p className="muted">没有找到番剧。</p>}
          <div className="row"><Button variant="ghost" onClick={() => go('source')}>返回来源</Button></div>
        </div>}
        {step === 'match' && <div className="stack">
          <SectionHeading title={work?.title ?? draft.title} />
          <Select label="字幕组" options={groups.map(group => ({ value: group.name, label: group.name + ' · ' + group.version }))} value={spec.group}
            onValueChange={chooseGroup} />
          <p className="muted">示例发布 · {releases.length} 条匹配</p>
          <div className="row form-actions"><Button variant="ghost" onClick={() => go('browse')}>返回片库</Button><Button onClick={() => configure('match')}>下一步</Button></div>
        </div>}
        {step === 'settings' && <form className="stack" onSubmit={event => { event.preventDefault(); save(); }}>
          <div className="field-grid">
            <Input label="作品名称" required value={draft.title} onChange={event => change({ title: event.target.value })} />
            <Select label="更新日" value={String(spec.weekday ?? 0)} options={[{ value: '0', label: '未设置' }, ...weekdays.map((label, i) => ({ value: String(i + 1), label }))]}
              onValueChange={value => changeSpec({ weekday: Number(value) })} />
            {seed && <Select label="订阅来源" value={draft.source} options={options([...new Set([seed.source, ...feedSources])])} onValueChange={source => change({ source })} />}
            <Input label="主 RSS" type="url" value={spec.rss ?? ''} placeholder="内置片库可留空" onChange={event => changeSpec({ rss: event.target.value })} />
            <Input label="备用 RSS" type="url" value={draft.backup ?? ''} placeholder="可选" onChange={event => change({ backup: event.target.value })} />
            {draft.source === '自定义 RSS' && <Input label="Bangumi ID" inputMode="numeric" value={spec.bangumiId ?? ''} onChange={event => changeSpec({ bangumiId: event.target.value })} />}
            {work && <Select label="字幕组" value={spec.group ?? '全部'} options={options(['全部', ...groups.map(group => group.name)])}
              onValueChange={value => chooseGroup(value === '全部' ? '' : value)} />}
            <Input label="匹配关键词" value={draft.rule} placeholder="以逗号分隔" onChange={event => change({ rule: event.target.value })} />
            <Input label="排除关键词" value={spec.exclude ?? ''} placeholder="以逗号分隔" onChange={event => changeSpec({ exclude: event.target.value })} />
            <Input label="起始集数" type="number" min={1} value={spec.start ?? 1} onChange={event => changeSpec({ start: event.target.valueAsNumber || undefined })} />
            <Input label="总集数" type="number" min={1} value={spec.total ?? ''} placeholder="未知" onChange={event => changeSpec({ total: event.target.valueAsNumber || undefined })} />
            <Input label="目标目录" value={draft.directory ?? ''} placeholder="自动归类" onChange={event => change({ directory: event.target.value })} />
          </div>
          <div className="field-grid">
            <label className="switch-row">启用订阅<Switch checked={draft.active} onCheckedChange={active => change({ active })} /></label>
            <label className="switch-row">自动下载<Switch checked={draft.auto} onCheckedChange={auto => change({ auto })} /></label>
          </div>
          {preview && <div className="workflow-preview stack" role="status">
            <strong>匹配 {releases.length} 条示例资源</strong>
            {releases.slice(0, 5).map(item => <small key={item.title}>{item.title}</small>)}
          </div>}
          <div className="row form-actions">
            {!seed && <Button type="button" variant="ghost" onClick={() => go(previous)}>上一步</Button>}
            <Button type="button" variant="secondary" onClick={() => setPreview(value => !value)}>{preview ? '收起预览' : '预览匹配'}</Button>
            <Button type="submit">保存订阅</Button>
          </div>
        </form>}
        {error && <p role="alert" className="anime-error">{error}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

export function AnimeSubscriptions({ items, update, notify, onOpen, onDownload }: {
  items: Subscription[]; update: Update; notify: Notify; onOpen: (item: Media) => void; onDownload: (title: string, source: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [weekday, setWeekday] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'detail' | 'edit' | 'remove'; id: string } | null>(null);
  const selected = dialog && 'id' in dialog ? items.find(item => item.id === dialog.id) : undefined;
  const rows = items.filter(item => (includes(item.title, query) || includes(workFor(item)?.original ?? '', query)) &&
    (weekday === '全部' || String(item.anime?.weekday ?? feedFor(item)?.weekday ?? 0) === weekday) &&
    (status === '全部' || subscriptionStatus(item).state === status));
  const dayOptions = [{ value: '全部', label: '全部' }, ...weekdays.map((day, index) => ({
    value: String(index + 1), label: day + ' · ' + items.filter(item => (item.anime?.weekday ?? feedFor(item)?.weekday) === index + 1).length,
  })), { value: '0', label: '未设置' }];

  function save(entry: Subscription) {
    update(current => ({ ...current, subscriptions: current.subscriptions.some(item => item.id === entry.id)
      ? current.subscriptions.map(item => item.id === entry.id ? entry : item) : [entry, ...current.subscriptions] }));
    setDialog(null);
    notify('已保存《' + entry.title + '》的订阅', '订阅');
  }
  function refresh(id?: string) {
    const checkedAt = new Date().toISOString();
    update(current => ({ ...current, subscriptions: current.subscriptions.map(item => {
      if (item.kind !== '动漫' || !item.active || (id && item.id !== id) || subscriptionStatus(item).state === '已完结') return item;
      return { ...item, anime: { ...item.anime, knownEpisodes: discoveredEpisodes(item), checkedAt } };
    }) }));
    notify(id ? '已检查本地示例资源' : '已检查启用订阅的本地示例资源', '订阅');
  }
  function clearFilters() { setQuery(''); setWeekday('全部'); setStatus('全部'); }
  const selectedWork = selected && workFor(selected);
  const selectedStatus = selected && subscriptionStatus(selected);
  const resources = selected ? matchingReleases(selected).filter(item => selectedStatus?.known.includes(item.number)) : [];
  return <section className="stack anime-subscriptions" aria-label="我的动漫订阅">
    <SectionHeading title="我的动漫订阅" description={rows.length + ' / ' + items.length + ' 部'} action={<div className="row anime-actions">
      <SearchField label="搜索订阅" value={query} onValueChange={setQuery} placeholder="搜索作品或原名…" />
      <Button variant="secondary" disabled={!items.some(item => item.active && subscriptionStatus(item).state !== '已完结')} onClick={() => refresh()}><RefreshCw size={15} aria-hidden="true" />刷新</Button>
      <Button onClick={() => setDialog({ kind: 'create' })}><Plus size={16} aria-hidden="true" />添加动漫</Button>
    </div>} />
    <div className="anime-filter"><span>更新日</span><SegmentedControl label="更新日" options={dayOptions} value={weekday} onValueChange={setWeekday} /></div>
    <div className="anime-filter"><span>状态</span><SegmentedControl label="订阅状态" options={options(['全部', '更新中', '已暂停', '已完结'])} value={status} onValueChange={setStatus} /></div>
    {rows.length ? <div className="anime-grid">{rows.map(item => {
      const work = workFor(item);
      const view = subscriptionStatus(item);
      const open = () => setDialog({ kind: 'detail', id: item.id });
      return <article className="panel anime-card" key={item.id}>
        <button type="button" className="anime-cover" aria-label={'查看《' + item.title + '》订阅详情'} onClick={open}>
          {work ? <img src={work.poster} alt="" loading="lazy" /> : <Clapperboard size={36} aria-hidden="true" />}
        </button>
        <div className="anime-card-body">
          <div className="row"><Status tone={view.tone}>{view.state}</Status>{work && <span className="anime-rating"><Star size={13} aria-hidden="true" />{work.score.toFixed(1)}</span>}</div>
          <h3><button type="button" className="anime-card-title" onClick={open}>{item.title}</button></h3>
          <p className="muted">{item.source} · {view.progress}</p>
          {view.total !== undefined && <Progress value={view.known.length} max={view.total}
            label={view.latest ? (view.total === 1 ? '已发现正片' : '最新资源 · ' + episodeLabel(view.latest)) : '尚未发现资源'} />}
          <div className="row anime-card-footer">
            <span className="muted"><CalendarDays size={14} aria-hidden="true" />{weekdayLabel(item.anime?.weekday ?? feedFor(item)?.weekday)}</span>
            <Button size="sm" variant="ghost" className="icon-button" disabled={view.state !== '更新中'} aria-label={'刷新《' + item.title + '》订阅'} onClick={() => refresh(item.id)}><RefreshCw size={15} aria-hidden="true" /></Button>
            <Button size="sm" variant="ghost" className="icon-button" aria-label={'移除《' + item.title + '》订阅'} onClick={() => setDialog({ kind: 'remove', id: item.id })}><Trash2 size={15} aria-hidden="true" /></Button>
          </div>
        </div>
      </article>;
    })}</div> : <NoResults title="没有符合条件的动漫订阅" description="试试其他关键词、更新日或状态。" reset={clearFilters} />}
    {(dialog?.kind === 'create' || (dialog?.kind === 'edit' && selected)) &&
      <AnimeEditor key={selected?.id ?? 'new'} seed={selected} onSave={save} onClose={() => setDialog(null)} />}
    {dialog?.kind === 'detail' && selected && selectedStatus && <Dialog open onOpenChange={open => { if (!open) setDialog(null); }}>
      <DialogContent className="wide-dialog" title={selected.title} description={selected.source + ' · ' + selectedStatus.state + ' · ' + selectedStatus.progress}>
        <div className="stack">
          <div className="anime-detail">
            {selectedWork && <img src={selectedWork.poster} alt="" />}
            <div className="stack">
              {selectedWork && <p>{selectedWork.summary}</p>}
              <dl>
                <div><dt>更新日</dt><dd>{weekdayLabel(selected.anime?.weekday ?? feedFor(selected)?.weekday)}</dd></div>
                <div><dt>字幕组</dt><dd>{selected.anime?.group || '全部'}</dd></div>
                <div><dt>匹配规则</dt><dd>{selected.rule || '全部'}</dd></div>
                <div><dt>自动下载</dt><dd>{selected.auto ? '已开启' : '已关闭'}</dd></div>
                <div><dt>最近检查</dt><dd>{selected.anime?.checkedAt ? new Date(selected.anime.checkedAt).toLocaleString('zh-CN') : '尚未检查'}</dd></div>
              </dl>
            </div>
          </div>
          <div className="row">
            <Button variant="secondary" onClick={() => setDialog({ kind: 'edit', id: selected.id })}>编辑订阅</Button>
            {selectedStatus.state !== '已完结' && <Button variant="secondary" onClick={() => {
              const active = !selected.active;
              update(current => ({ ...current, subscriptions: current.subscriptions.map(item => item.id === selected.id ? { ...item, active } : item) }));
              notify(active ? '已恢复订阅' : '已暂停订阅', '订阅');
            }}>{selected.active ? '暂停' : '恢复'}</Button>}
            {selectedWork && <Button variant="ghost" onClick={() => { setDialog(null); onOpen(selectedWork); }}>查看作品资料</Button>}
          </div>
          <SectionHeading title="已发现资源" />
          {resources.length ? <ul className="anime-resources">{resources.map(item => <li key={item.title}>
            <span><strong>{episodeLabel(item.number, selectedStatus.total)}</strong><small className="muted">{item.title}</small></span>
            <Button size="sm" variant="secondary" onClick={() => { setDialog(null); onDownload(item.title, '115 网盘'); }}>下载资源</Button>
          </li>)}</ul> : <p className="muted">暂无匹配的示例资源，可从订阅卡片检查更新。</p>}
        </div>
      </DialogContent>
    </Dialog>}
    {dialog?.kind === 'remove' && selected && <Dialog open onOpenChange={open => { if (!open) setDialog(null); }}>
      <DialogContent title="移除动漫订阅" description={'确定移除《' + selected.title + '》的本地订阅？'}>
        <div className="row form-actions">
          <Button variant="secondary" onClick={() => setDialog(null)}>取消</Button>
          <Button variant="danger" onClick={() => {
            update(current => ({ ...current, subscriptions: current.subscriptions.filter(item => item.id !== selected.id) }));
            setDialog(null);
            notify('已移除《' + selected.title + '》的订阅', '订阅');
          }}>移除订阅</Button>
        </div>
      </DialogContent>
    </Dialog>}
  </section>;
}
