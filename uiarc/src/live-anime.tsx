import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clapperboard, Plus, RefreshCw } from 'lucide-react';
import type { AnimeDraft, AnimePreview, MikanGroup, MikanItem, SavedAnimeSubscription } from '../../hero/src/lib/anime-api';
import type { AnimeDownloadRule } from '../../hero/src/lib/download-api';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Switch } from './arc/switch/switch';
import { Textarea } from './arc/textarea/textarea';
import { NoResults, PageHeading, Status } from './ui';
import { includes, options } from './model';
import { requestError } from './live-api';
import type { LiveApi } from './live-api';
import './anime.css';

const sources = [
  { value: 'mikan', label: 'Mikan' },
  { value: 'ani-bt', label: 'AniBT' },
  { value: 'anime-garden', label: 'AnimeGarden' },
  { value: 'other', label: '自定义 RSS' },
];
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const weekLabel = (day: number) => weekdays[day - 1] ?? '未设置更新日';
const status = (item: SavedAnimeSubscription) => item.completed ? '已完结' : item.enabled ? '更新中' : '已暂停';
const blankDraft = (source: AnimeDraft['source'] = 'mikan'): AnimeDraft => ({
  source, title: '', originalTitle: '', bangumiId: '', mikanId: '', url: '', subgroup: '',
  season: 1, offset: 0, totalEpisodes: 0, week: 0, releaseDate: '', poster: '', description: '',
  rating: '', enabled: true, match: [], exclude: [], standby: [],
});
const stepTitle = { source: '选择订阅来源', catalog: '查找番剧', groups: '选择字幕组', match: '选择匹配版本', rules: '配置订阅规则' };
type Step = keyof typeof stepTitle;

function LiveAnimeEditor({ api, onSave, onClose }: { api: LiveApi; onSave: (item: SavedAnimeSubscription) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(blankDraft);
  const [step, setStep] = useState<Step>('source');
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<MikanItem[]>([]);
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<MikanItem>();
  const [groups, setGroups] = useState<MikanGroup[]>([]);
  const [group, setGroup] = useState<MikanGroup>();
  const [version, setVersion] = useState('0');
  const [matchText, setMatchText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [preview, setPreview] = useState<AnimePreview>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  function go(next: Step) { setError(''); setStep(next); }
  function update(patch: Partial<AnimeDraft>) { setDraft(previous => ({ ...previous, ...patch })); setPreview(undefined); }
  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(label);
    setError('');
    try { await action(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) setError(requestError(reason)); }
    finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }
  function browse(nextSeason = season) {
    if (draft.source === 'other') return;
    const source = draft.source;
    go('catalog');
    setCatalog([]);
    setLimit(24);
    void run('正在读取番剧…', async signal => {
      const data = await api.animeCatalog(source, query.trim(), nextSeason, signal);
      if (!signal.aborted) { setCatalog(data.items ?? []); setSeasons(data.seasons ?? []); }
    });
  }
  function selectAnime(item: MikanItem) {
    if (draft.source === 'other') return;
    const source = draft.source;
    setSelected(item);
    setGroups([]);
    go('groups');
    void run('正在读取字幕组…', async signal => {
      const data = await api.animeGroups(source, item.id, signal);
      if (!signal.aborted) setGroups(data ?? []);
    });
  }
  function resolve(value: AnimeDraft) {
    void run('正在解析 RSS…', async signal => {
      const data = await api.animeResolve(value, signal);
      if (signal.aborted) return;
      setDraft({ ...data, standby: data.standby ?? [] });
      setMatchText((data.match ?? []).join('\n'));
      setExcludeText((data.exclude ?? []).join('\n'));
      setPreview(undefined);
      go('rules');
    });
  }
  const matches = [[], ...(group?.groupRegex?.regexList ?? [])];
  const splitRules = (value: string) => value.split(/\r?\n/).map(rule => rule.trim()).filter(Boolean);
  const configured = { ...draft, match: splitRules(matchText), exclude: splitRules(excludeText) };
  const chosenSource = sources.find(source => source.value === draft.source)?.label;
  return <Dialog open onOpenChange={open => { if (!open && busy !== '正在保存订阅…') onClose(); }}>
    <DialogContent className="wide-dialog" title="添加动漫订阅" description="选择订阅源和匹配规则，预览后保存。">
      <div className="stack">
        <p ref={heading} tabIndex={-1} className="anime-step">{stepTitle[step]}</p>
        {step === 'source' && <>
          <SegmentedControl label="订阅来源" options={sources} value={draft.source} onValueChange={value => {
            if (busy) return;
            setDraft(blankDraft(value as AnimeDraft['source']));
            setSeason(''); setSeasons([]); setQuery(''); setError('');
          }} />
          <form className="stack" onSubmit={event => { event.preventDefault(); resolve(draft); }}>
            <Input label="RSS 地址" type="url" value={draft.url} onChange={event => update({ url: event.target.value })} required placeholder="https://…/rss" />
            {draft.source === 'other' && <Input label="Bangumi ID" value={draft.bangumiId} inputMode="numeric"
              onChange={event => update({ bangumiId: event.target.value })} required />}
            <div className="row form-actions">
              {draft.source !== 'other' && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => browse()}>浏览 {chosenSource}</Button>}
              <Button type="submit" disabled={Boolean(busy) || !draft.url.trim()}>下一步</Button>
            </div>
          </form>
        </>}
        {step === 'catalog' && <>
          <form className="row fields" onSubmit={event => { event.preventDefault(); browse(); }}>
            <SearchField label="搜索番剧" value={query} onValueChange={setQuery} placeholder="输入作品名称" />
            {!!seasons.length && <Select label="播出季度" options={[{ value: 'current', label: '当前季度' }, ...options(seasons.filter(Boolean))]}
              value={season || 'current'} disabled={Boolean(busy)} onValueChange={value => {
                const next = value === 'current' ? '' : value; setSeason(next); browse(next);
              }} />}
            <Button type="submit" variant="secondary" disabled={Boolean(busy)}>搜索</Button>
          </form>
          {!busy && !error && !catalog.length && <p className="muted">没有找到番剧。</p>}
          <div className="stack anime-choices">
            {catalog.slice(0, limit).map(item => <Button key={item.id} variant="secondary" className="anime-choice" onClick={() => selectAnime(item)}>
              {item.poster && <img src={item.poster} alt="" loading="lazy" />}<span>{item.title}{item.week ? ' · ' + item.week : ''}</span>
            </Button>)}
          </div>
          <div className="row">
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => go('source')}>返回来源</Button>
            {catalog.length > limit && <Button variant="secondary" onClick={() => setLimit(value => value + 24)}>显示更多</Button>}
          </div>
        </>}
        {step === 'groups' && <>
          <h3>{selected?.title}</h3>
          {!busy && !error && !groups.length && <p className="muted">该番剧暂无可用字幕组。</p>}
          <div className="stack anime-choices">
            {groups.map(item => <Button key={item.url} variant="secondary" className="anime-choice" onClick={() => { setGroup(item); setVersion('0'); go('match'); }}>
              {item.label}{item.groupRegex?.tags?.length ? ' · ' + item.groupRegex.tags.join('、') : ''}
            </Button>)}
          </div>
          <div><Button variant="ghost" disabled={Boolean(busy)} onClick={() => go('catalog')}>返回片库</Button></div>
        </>}
        {step === 'match' && group && selected && <>
          <h3>{selected.title} · {group.label}</h3>
          <Select label="匹配版本" options={matches.map((rules, index) => ({
            value: String(index), label: rules.length ? rules.map(rule => rule.label).join(' · ') : '全部版本',
          }))} value={version} onValueChange={setVersion} />
          <div className="row form-actions">
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => go('groups')}>返回字幕组</Button>
            <Button disabled={Boolean(busy)} onClick={() => resolve({
              ...draft, title: selected.title, poster: selected.poster, url: group.url, bangumiId: group.bangumiId,
              mikanId: draft.source === 'mikan' ? selected.id : '', subgroup: group.label,
              week: weekdays.indexOf((selected.week || '').replace(/^星期/, '周')) + 1,
              match: matches[Number(version)].map(rule => rule.regex),
            })}>下一步</Button>
          </div>
        </>}
        {step === 'rules' && <form className="stack" onSubmit={event => {
          event.preventDefault();
          void run('正在保存订阅…', async signal => { const item = await api.animeCreate(configured, signal); if (!signal.aborted) onSave(item); });
        }}>
          <div className="field-grid">
            <Input label="作品名称" value={draft.title} onChange={event => update({ title: event.target.value })} required />
            <Input label="Bangumi ID" value={draft.bangumiId} onChange={event => update({ bangumiId: event.target.value })} required />
            <Input label="主 RSS" type="url" value={draft.url} onChange={event => update({ url: event.target.value })} required />
            <Input label="字幕组" value={draft.subgroup} onChange={event => update({ subgroup: event.target.value })} />
            <Input label="追踪季" type="number" min={1} value={draft.season} onChange={event => update({ season: Number(event.target.value) })} />
            <Input label="总集数" type="number" min={0} value={draft.totalEpisodes} onChange={event => update({ totalEpisodes: Number(event.target.value) })} />
            <Input label="集数偏移" type="number" value={draft.offset} onChange={event => update({ offset: Number(event.target.value) })} />
            <Select label="更新日" options={[{ value: '0', label: '未设置' }, ...weekdays.map((label, index) => ({ label, value: String(index + 1) }))]}
              value={String(draft.week)} onValueChange={value => update({ week: Number(value) })} />
            <Textarea label="匹配规则" placeholder="每行一条规则" value={matchText} onChange={event => { setMatchText(event.target.value); setPreview(undefined); }} />
            <Textarea label="排除规则" placeholder="每行一条规则" value={excludeText} onChange={event => { setExcludeText(event.target.value); setPreview(undefined); }} />
          </div>
          <Switch label="启用订阅" checked={draft.enabled} onCheckedChange={enabled => update({ enabled })} />
          {preview && <div className="stack workflow-preview" role="status">
            <strong>匹配 {preview.accepted} 条资源</strong>
            {preview.warnings?.map((message, index) => <p key={index}>{message}</p>)}
            {preview.items?.slice(0, 12).map((item, index) => <small key={index}>{item.accepted ? '匹配' : '排除'} · {item.fileName || item.title}{item.reason ? ' · ' + item.reason : ''}</small>)}
          </div>}
          <div className="row form-actions">
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => go(group ? 'match' : 'source')}>上一步</Button>
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void run('正在检查匹配规则…', async signal => {
              const result = await api.animePreview(configured, signal);
              if (!signal.aborted) setPreview(result);
            })}>预览匹配</Button>
            <Button type="submit" disabled={Boolean(busy)}>保存订阅</Button>
          </div>
        </form>}
        {busy && <p className="muted" role="status">{busy}</p>}
        {error && <p className="anime-error" role="alert">{error}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

const downloadState: Record<string, string> = {
  pending: '待处理', queued: '已入队', downloading: '下载中', completed: '已完成', failed: '失败', skipped: '已跳过',
};

function AnimeDownloads({ api, id, onBack }: { api: LiveApi; id: string; onBack: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<LiveApi['animeDownloads']>>>();
  const [draft, setDraft] = useState<AnimeDownloadRule>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.animeDownloads(id, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setDraft(current => current ?? result.rule); }
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, id, revision]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (reason) { setError(requestError(reason)); }
    finally { setBusy(false); }
  }

  const changed = draft?.enabled !== data?.rule.enabled || draft?.fromEpisode !== data?.rule.fromEpisode;
  return <div className="stack">
    <div><Button variant="ghost" disabled={busy} onClick={onBack}>返回订阅详情</Button></div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!draft || !data ? error ? <div><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重新读取</Button></div>
      : <p role="status">正在读取下载记录…</p> : <>
      <form className="stack" onSubmit={event => {
        event.preventDefault();
        void act(async () => {
          const rule = await api.saveAnimeDownloads(id, { ...draft, directoryId: draft.directoryId || 'library' });
          setDraft(rule); setData({ ...data, rule }); setNotice('已保存自动下载规则。');
          setRevision(value => value + 1);
        });
      }}>
        <Switch label="自动下载匹配的集数" checked={draft.enabled} disabled={busy} onCheckedChange={enabled => setDraft({ ...draft, enabled })} />
        <Input label="起始集数" type="number" min={1} max={10000} step={1} required value={draft.fromEpisode || ''}
          disabled={busy} onChange={event => setDraft({ ...draft, fromEpisode: Number(event.target.value) })} />
        <div className="row">
          <Button type="submit" disabled={busy || !changed || draft.fromEpisode < 1}>保存规则</Button>
          <Button variant="secondary" disabled={busy || changed || !draft.enabled} onClick={() => void act(async () => {
            const { count } = await api.retryAnimeDownloads(id);
            setNotice(count ? '已重新排队 ' + count + ' 项。' : '暂无可重试的资源。');
            setRevision(value => value + 1);
          })}>重试下载</Button>
        </div>
      </form>
      <h3>下载记录</h3>
      {data.items?.length ? <ul className="anime-resources">{data.items.map(item => <li key={item.id}>
        <span>第 {item.episode} 集 · {item.title}</span><small>{downloadState[item.state] ?? item.state}{item.error ? ' · ' + item.error : ''}</small>
      </li>)}</ul> : <p className="muted">暂无下载记录。</p>}
    </>}
  </div>;
}

export function LiveAnime({ api }: { api: LiveApi }) {
  const [items, setItems] = useState<SavedAnimeSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [weekday, setWeekday] = useState('all');
  const [filter, setFilter] = useState('全部');
  const [add, setAdd] = useState(false);
  const [detail, setDetail] = useState('');
  const [downloads, setDownloads] = useState(false);
  const [updating, setUpdating] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.animeList(controller.signal).then(value => {
      if (!controller.signal.aborted) setItems(value ?? []);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(requestError(reason));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [api, revision]);
  const current = items.find(item => item.id === detail);
  const visible = items.filter(item => (includes(item.title, query) || includes(item.originalTitle || '', query)) &&
    (weekday === 'all' || String(item.week) === weekday) && (filter === '全部' || status(item) === filter));

  function save(item: SavedAnimeSubscription) {
    setItems(current => [item, ...current.filter(previous => previous.id !== item.id)]);
  }
  async function change(item: SavedAnimeSubscription, refresh: boolean) {
    if (updating) return;
    const signal = new AbortController().signal;
    setUpdating(item.id);
    setError('');
    try { save(refresh ? await api.animeRefresh(item.id, signal) : await api.animeEnable(item.id, !item.enabled, signal)); }
    catch (reason) { setError(requestError(reason)); }
    finally { setUpdating(''); }
  }

  return <section className="stack anime-subscriptions">
    <PageHeading title="动漫订阅" description={items.length + ' 部番剧'} action={<div className="row anime-actions">
      <SearchField label="搜索订阅" value={query} onValueChange={setQuery} placeholder="搜索作品或原名…" />
      <Button variant="secondary" disabled={loading || Boolean(updating)} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} aria-hidden="true" />刷新列表</Button>
      <Button onClick={() => setAdd(true)}><Plus size={16} aria-hidden="true" />添加动漫</Button>
    </div>} />
    <div className="anime-filter"><span>更新日</span><SegmentedControl label="更新日" options={[
      { value: 'all', label: '全部' }, ...weekdays.map((day, index) => ({ value: String(index + 1), label: day + ' · ' + items.filter(item => item.week === index + 1).length })),
    ]} value={weekday} onValueChange={setWeekday} /></div>
    <div className="anime-filter"><span>状态</span><SegmentedControl label="订阅状态" options={options(['全部', '更新中', '已暂停', '已完结'])} value={filter} onValueChange={setFilter} /></div>
    {error && <p className="anime-error" role="alert">{error}</p>}
    {loading ? <p className="muted" role="status">正在读取动漫订阅…</p>
      : visible.length ? <div className="anime-grid">{visible.map(item => <article className="panel anime-card" key={item.id}>
        <button className="anime-cover" type="button" aria-label={'查看《' + item.title + '》订阅详情'} onClick={() => setDetail(item.id)}>
          {item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <Clapperboard size={36} aria-hidden="true" />}
        </button>
        <div className="anime-card-body">
          <div className="row"><Status tone={status(item) === '更新中' ? 'success' : 'neutral'}>{status(item)}</Status>{item.rating && <small>{item.rating}</small>}</div>
          <h3><button type="button" className="anime-card-title" onClick={() => setDetail(item.id)}>{item.title}</button></h3>
          <p className="muted">已发现 {item.knownEpisodes?.length ?? 0}{item.totalEpisodes ? ' / ' + item.totalEpisodes : ''} 集</p>
          <div className="row anime-card-footer">
            <span className="muted"><CalendarDays size={14} aria-hidden="true" />{weekLabel(item.week)}</span>
            <Button variant="ghost" className="icon-button" disabled={Boolean(updating) || item.completed} aria-label={'刷新《' + item.title + '》订阅'}
              onClick={() => void change(item, true)}><RefreshCw size={15} aria-hidden="true" /></Button>
          </div>
          {item.lastError && <p className="anime-error">{item.lastError}</p>}
        </div>
      </article>)}</div> : !error && <NoResults title="没有符合条件的动漫订阅" description="试试其他关键词、更新日或状态。"
        reset={() => { setQuery(''); setFilter('全部'); setWeekday('all'); }} />}
    {add && <LiveAnimeEditor api={api} onClose={() => setAdd(false)} onSave={item => { save(item); setAdd(false); }} />}
    {current && <Dialog open onOpenChange={open => { if (!open) { setDetail(''); setDownloads(false); } }}>
      <DialogContent className="wide-dialog" title={current.title} description={downloads ? '下载记录与范围' : status(current) + ' · ' + weekLabel(current.week)}>
        {downloads ? <AnimeDownloads api={api} id={current.id} onBack={() => setDownloads(false)} /> : <div className="stack">
          {current.description && <p>{current.description}</p>}
          {current.subgroup && <p className="muted">字幕组 · {current.subgroup}</p>}
          {!!current.match?.length && <p className="muted">匹配规则 · {current.match.join('、')}</p>}
          <div className="row">
            {!current.completed && <Button variant="secondary" disabled={Boolean(updating)} onClick={() => void change(current, false)}>{current.enabled ? '暂停订阅' : '恢复订阅'}</Button>}
            <Button variant="secondary" onClick={() => setDownloads(true)}>下载记录与范围</Button>
          </div>
          {error && <p className="anime-error" role="alert">{error}</p>}
          <h3>已发现资源</h3>
          {current.resources?.length ? <ul className="anime-resources">{current.resources.map((resource, index) =>
            <li key={index}><span>{resource.episode ? '第 ' + resource.episode + ' 集 · ' : ''}{resource.fileName || resource.title}</span></li>)}</ul>
            : <p className="muted">暂无资源。</p>}
        </div>}
      </DialogContent>
    </Dialog>}
  </section>;
}
