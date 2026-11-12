import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Clapperboard, Plus, RefreshCw, Search } from 'lucide-react';
import { animeResourceSize, emptyAnimeDraft } from '../../hero/src/lib/anime-api';
import type { AnimeDraft, AnimePreview, MikanGroup, MikanItem, SavedAnimeSubscription } from '../../hero/src/lib/anime-api';
import { animeSeasonOptions, currentAnimeSeason } from '../../hero/src/lib/anime-season';
import type { AnimeDownloadRule } from '../../hero/src/lib/download-api';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Switch } from './arc/switch/switch';
import { Textarea } from './arc/textarea/textarea';
import { Tabs, TabsList, TabsTrigger } from './arc/tabs/tabs';
import { NoResults, PageHeading, Status } from './ui';
import { includes, options } from './model';
import { requestError } from './live-api';
import type { LiveApi } from './live-api';
import './anime.css';

const browseSources = [
  { value: 'anime-garden', label: 'AnimeGarden' },
  { value: 'ani-bt', label: 'AniBT' },
  { value: 'mikan', label: 'Mikan' },
] as const;
type BrowseSource = (typeof browseSources)[number]['value'];
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const weekLabel = (day: number) => weekdays[day - 1] ?? '未设置更新日';
const status = (item: SavedAnimeSubscription) => item.completed ? '已完结' : item.enabled ? '更新中' : '已暂停';
const stepTitle = { source: '选择订阅来源', catalog: '选择番剧与字幕组', match: '选择番剧与字幕组', rules: '确认订阅参数' };
type Step = keyof typeof stepTitle;

function LiveAnimeEditor({ api, onSave, onClose }: { api: LiveApi; onSave: (item: SavedAnimeSubscription) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(emptyAnimeDraft);
  const [customRSS, setCustomRSS] = useState({ url: '', bangumiId: '' });
  const [step, setStep] = useState<Step>('source');
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState(currentAnimeSeason);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<MikanItem[]>([]);
  const [weekday, setWeekday] = useState('');
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
  const catalogList = useRef<HTMLDivElement>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (step !== 'match') heading.current?.focus(); }, [step]);

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
  function browse(source: AnimeDraft['source'], nextSeason: string, keyword: string, refresh = false) {
    if (source === 'other' || active.current) return;
    go('catalog');
    setCatalog([]);
    setSelected(undefined); setGroups([]); setGroup(undefined);
    setLimit(24);
    void run('正在读取番剧…', async signal => {
      const data = await api.animeCatalog(source, keyword.trim(), nextSeason, refresh, signal);
      if (signal.aborted) return;
      const items = data.items ?? [];
      const today = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' }).format(new Date());
      const days = [...new Set(items.map(item => item.week || '其他'))];
      setWeekday(current => days.includes(current) ? current : days.includes(today) ? today : days[0] ?? '');
      setCatalog(items); setSeasons(data.seasons ?? []);
    });
  }
  function openSource(source: BrowseSource) {
    if (active.current) return;
    const nextSeason = source === 'mikan' ? currentAnimeSeason() : '';
    setDraft({ ...emptyAnimeDraft(), source });
    setSeason(nextSeason); setSeasons([]); setQuery(''); setWeekday('');
    browse(source, nextSeason, '');
  }
  function selectAnime(item: MikanItem) {
    if (draft.source === 'other' || active.current) return;
    setGroups([]);
    if (selected?.id === item.id) { setSelected(undefined); return; }
    const source = draft.source;
    setSelected(item);
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
  const chosenSource = browseSources.find(source => source.value === draft.source)?.label;
  const days = [...new Set(catalog.map(item => item.week || '其他'))];
  const visible = catalog.filter(item => (item.week || '其他') === weekday);
  const quarters = [...new Set(draft.source === 'mikan' ? [currentAnimeSeason(), ...seasons, ...animeSeasonOptions()] : [season, ...seasons])].filter(Boolean);
  const browsing = step === 'catalog' || step === 'match';
  return <Dialog open onOpenChange={open => { if (!open && busy !== '正在保存订阅…') onClose(); }}>
    <DialogContent className={`anime-editor-dialog${browsing ? ' anime-browse-dialog' : step === 'rules' ? ' anime-rules-dialog' : ''}`} title="添加动漫订阅" aria-describedby={undefined}>
      <div className="stack anime-editor-content">
        <p ref={heading} tabIndex={-1} className="anime-step">{stepTitle[step]}</p>
        {step === 'source' && <>
          <div className="row anime-source-options" role="group" aria-label="浏览番剧来源">
            {browseSources.map(source => <Button key={source.value} type="button" variant="secondary" disabled={Boolean(busy)}
              onClick={() => openSource(source.value)}><Search size={16} aria-hidden="true" />浏览 {source.label}</Button>)}
          </div>
          <form className="stack anime-custom-rss" onSubmit={event => {
            event.preventDefault();
            if (active.current || !customRSS.url.trim() || !customRSS.bangumiId.trim()) return;
            setGroup(undefined);
            resolve({ ...emptyAnimeDraft(), source: 'other', url: customRSS.url.trim(), bangumiId: customRSS.bangumiId.trim() });
          }}>
            <h3>自定义 RSS</h3>
            <div className="anime-custom-rss-fields">
              <Input label="RSS 地址" type="url" value={customRSS.url}
                onChange={event => setCustomRSS(previous => ({ ...previous, url: event.target.value }))} required placeholder="https://…/rss" />
              <Input label="Bangumi ID" value={customRSS.bangumiId} inputMode="numeric"
                onChange={event => setCustomRSS(previous => ({ ...previous, bangumiId: event.target.value }))} required />
            </div>
            <div className="row form-actions">
              <Button type="submit" disabled={Boolean(busy) || !customRSS.url.trim() || !customRSS.bangumiId.trim()}>下一步</Button>
            </div>
          </form>
        </>}
        {browsing && <>
          <form className="row anime-browse-form" onSubmit={event => { event.preventDefault(); browse(draft.source, season, query); }}>
            {!!quarters.length && <div className="anime-browse-season"><Select label="播出季度" options={[
              ...(draft.source !== 'mikan' ? [{ value: 'current', label: '当前季度' }] : []), ...options(quarters),
            ]} value={season || 'current'} disabled={Boolean(busy)} onValueChange={value => {
              const next = value === 'current' ? '' : value; setSeason(next); browse(draft.source, next, query);
            }} /></div>}
            <SearchField label="搜索番剧" value={query} onValueChange={setQuery} placeholder="输入作品名称" />
            <div className="row anime-browse-actions">
              <Button size="sm" type="submit" variant="secondary" disabled={Boolean(busy)}><Search size={15} aria-hidden="true" />搜索</Button>
              <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => browse(draft.source, season, query, true)}><RefreshCw size={15} aria-hidden="true" />刷新来源</Button>
            </div>
          </form>
          {!!days.length && <div className="anime-browse-filters">
            <span className="muted">播出分类</span>
            <Tabs value={weekday} onValueChange={day => {
              setWeekday(day); setSelected(undefined); setGroups([]); setLimit(24);
              catalogList.current?.scrollTo(0, 0);
            }}><TabsList aria-label="播出分类" appearance="underline" wrap>{days.map(day => <TabsTrigger key={day} value={day} disabled={Boolean(busy)}>{day}</TabsTrigger>)}</TabsList></Tabs>
          </div>}
          <div ref={catalogList} className="anime-catalog-list" role="region" aria-label="番剧列表" tabIndex={0}>
            {busy && !catalog.length && <p className="muted" role="status">{busy}</p>}
            {!busy && !error && !visible.length && <p className="muted">没有找到番剧，请更换季度或搜索标题。</p>}
            {step === 'catalog' && error && <p className="anime-error" role="alert">{error}</p>}
            {visible.slice(0, limit).map(item => <div className="anime-catalog-entry" key={item.id}>
              <button type="button" className="anime-catalog-title" aria-expanded={selected?.id === item.id} disabled={Boolean(busy)} onClick={() => selectAnime(item)}>
                <span className="anime-catalog-cover">{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <Clapperboard size={18} aria-hidden="true" />}</span>
                <span>{item.title}</span>
                {selected?.id === item.id ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
              </button>
              {selected?.id === item.id && <div className="anime-group-list">
                {step === 'catalog' && busy && <p className="muted" role="status">{busy}</p>}
                {!busy && !error && !groups.length && <p className="muted">暂无字幕组，可刷新来源或选择其他番剧。</p>}
                {groups.map(entry => <section className="anime-release-group" key={entry.url}>
                  <div className="anime-group-heading">
                    <div><strong>{entry.label}</strong>{entry.items?.[0]?.publishedAt && <small className="muted">{new Date(entry.items[0].publishedAt).toLocaleDateString('zh-CN')}</small>}</div>
                    {!!entry.groupRegex?.tags?.length && <div className="row anime-group-tags">{entry.groupRegex.tags.map(tag => <span className="anime-release-tag" key={tag}>{tag}</span>)}</div>}
                    <Button size="sm" variant="secondary" aria-label={`添加 ${entry.label}`} disabled={Boolean(busy)} onClick={() => {
                      setGroup(entry); setVersion('0'); go('match');
                    }}><Plus size={14} aria-hidden="true" />添加</Button>
                  </div>
                  <details className="rule-disclosure">
                    <summary>发布记录（{entry.items?.length ?? 0}）</summary>
                    {entry.items?.length ? <ul className="anime-resources">{entry.items.map((release, index) => <li key={release.url + ':' + index}>
                      <span>{release.title}</span>
                      <small>{animeResourceSize(release.contentLength)}{release.publishedAt && ' · ' + new Date(release.publishedAt).toLocaleString('zh-CN')}</small>
                    </li>)}</ul> : <p className="muted">暂无发布记录。</p>}
                  </details>
                </section>)}
              </div>}
            </div>)}
            {visible.length > limit && <Button size="sm" variant="secondary" onClick={() => setLimit(value => value + 24)}>显示更多</Button>}
          </div>
          <div className="row anime-browse-footer">
            <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => go('source')}>返回来源</Button>
            {!!catalog.length && <small className="muted">{[chosenSource, season, catalog.length + ' 部番剧'].filter(Boolean).join(' · ')}</small>}
          </div>
        </>}
        {step === 'match' && group && selected && <Dialog open onOpenChange={open => { if (!open && !busy) go('catalog'); }}>
          <DialogContent className="anime-match-dialog" overlayClassName="anime-match-overlay" staticHeading title="匹配版本" description={selected.title + ' · ' + group.label}>
            <div className="stack anime-editor-content">
              <p className="muted">所选版本的全部匹配条件都需要命中。选择全部版本时，仅应用排除规则。</p>
              <fieldset className="anime-version-options" aria-label="匹配版本" disabled={Boolean(busy)}>
                {matches.map((rules, index) => <label className="anime-version" key={index}>
                  <input type="radio" name="anime-version" value={index} checked={version === String(index)} onChange={event => setVersion(event.target.value)} />
                  <span className="row">{rules.length ? rules.map(rule => <span className="anime-release-tag" key={rule.regex} title={rule.regex}>{rule.label}</span>) : '全部版本'}</span>
                </label>)}
              </fieldset>
              {busy && <p role="status">{busy}</p>}
              {error && <p className="anime-error" role="alert">{error}</p>}
              <div className="row anime-browse-footer">
                <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => go('catalog')}>返回字幕组</Button>
                <Button size="sm" disabled={Boolean(busy)} onClick={() => resolve({
                  ...draft, title: selected.title, poster: selected.poster, url: group.url, bangumiId: group.bangumiId,
                  mikanId: draft.source === 'mikan' ? selected.id : '', subgroup: group.label,
                  week: weekdays.indexOf((selected.week || '').replace(/^星期/, '周')) + 1,
                  match: matches[Number(version)].map(rule => rule.regex),
                })}>确定</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>}
        {step === 'rules' && <form className="stack anime-rules-form" onSubmit={event => {
          event.preventDefault();
          void run('正在保存订阅…', async signal => { const item = await api.animeCreate(configured, signal); if (!signal.aborted) onSave(item); });
        }}>
          <div className="anime-rules-fields">
            <div className="anime-rule-pair">
              <Input label="作品名称" value={draft.title} onChange={event => update({ title: event.target.value })} required />
              <Input label="原名" value={draft.originalTitle} onChange={event => update({ originalTitle: event.target.value })} />
            </div>
            <div className="anime-rule-addresses">
              <Input label="主 RSS" type="url" value={draft.url} onChange={event => update({ url: event.target.value })} required />
              <Input label="海报地址" value={draft.poster} onChange={event => update({ poster: event.target.value })} />
              <Input label="首播日期" type="date" value={draft.releaseDate} onChange={event => update({ releaseDate: event.target.value })} />
            </div>
            <div className="anime-rule-compact">
              <Input label="Bangumi ID" value={draft.bangumiId} onChange={event => update({ bangumiId: event.target.value })} />
              <Input label="蜜柑 ID" value={draft.mikanId} onChange={event => update({ mikanId: event.target.value })} />
              <Input label="字幕组" value={draft.subgroup} onChange={event => update({ subgroup: event.target.value })} />
              <Input label="评分" value={draft.rating} onChange={event => update({ rating: event.target.value })} />
              <Input label="追踪季" type="number" min={1} max={100} value={draft.season} onChange={event => update({ season: Number(event.target.value) })} required />
              <Input label="总集数（未知填 0）" type="number" min={0} max={10000} value={draft.totalEpisodes} onChange={event => update({ totalEpisodes: Number(event.target.value) })} />
              <Input label="集数偏移" type="number" min={-10000} max={10000} value={draft.offset} onChange={event => update({ offset: Number(event.target.value) })} />
              <Select label="更新日" options={[{ value: '0', label: '未设置' }, ...weekdays.map((label, index) => ({ label, value: String(index + 1) }))]}
                value={String(draft.week)} onValueChange={value => update({ week: Number(value) })} />
            </div>
            <div className="anime-rule-text">
              <Textarea label="简介" rows={3} value={draft.description} onChange={event => update({ description: event.target.value })} />
              <Textarea label="匹配规则" rows={3} placeholder="每行一条规则" value={matchText} onChange={event => { setMatchText(event.target.value); setPreview(undefined); }} />
              <Textarea label="排除规则" rows={3} placeholder="每行一条规则" value={excludeText} onChange={event => { setExcludeText(event.target.value); setPreview(undefined); }} />
            </div>
          </div>
          <div className="row anime-standby-heading">
            <h3>备用 RSS</h3>
            <Button size="sm" variant="secondary" disabled={Boolean(busy) || draft.standby.length >= 5}
              onClick={() => update({ standby: [...draft.standby, { label: '', url: '', offset: 0 }] })}>添加备用源</Button>
            <Switch label="启用订阅" checked={draft.enabled} onCheckedChange={enabled => update({ enabled })} />
          </div>
          {draft.standby.map((feed, index) => <div key={index} className="panel stack">
            <div className="field-grid">
              {([['label', '字幕组'], ['url', 'RSS 地址'], ['offset', '集数偏移']] as const).map(([field, label]) => <Input
                key={field} label={label} value={feed[field]} type={field === 'offset' ? 'number' : field === 'url' ? 'url' : 'text'}
                onChange={event => update({ standby: draft.standby.map((entry, i) => i === index
                  ? { ...entry, [field]: field === 'offset' ? Number(event.target.value) : event.target.value } : entry) })} />)}
            </div>
            <div><Button variant="ghost" disabled={Boolean(busy)} onClick={() => update({ standby: draft.standby.filter((_, i) => i !== index) })}>移除备用源</Button></div>
          </div>)}
          {preview && <div className="stack workflow-preview" role="status">
            <strong>匹配 {preview.accepted} 条资源</strong>
            {preview.warnings?.map((message, index) => <p key={index}>{message}</p>)}
            {preview.items?.map((item, index) => <small key={index}>{item.accepted ? '匹配' : '排除'} · {item.title || item.fileName} · 第 {item.episode ?? '?'} 集 · {animeResourceSize(item.contentLength)}{item.reason ? ' · ' + item.reason : ''}</small>)}
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
        {!browsing && busy && <p className="muted" role="status">{busy}</p>}
        {!browsing && error && <p className="anime-error" role="alert">{error}</p>}
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
  const [removing, setRemoving] = useState<SavedAnimeSubscription>();
  const [removeError, setRemoveError] = useState('');
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
  async function remove() {
    if (!removing || updating) return;
    setUpdating(removing.id);
    setRemoveError('');
    try {
      await api.animeRemove(removing.id);
      setItems(current => current.filter(item => item.id !== removing.id));
      setRemoving(undefined);
      setRevision(value => value + 1);
    } catch (reason) { setRemoveError(requestError(reason)); }
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
            <Button variant="ghost" size="sm" disabled={loading || Boolean(updating)} aria-label={'删除《' + item.title + '》订阅'}
              onClick={() => { setRemoveError(''); setRemoving(item); }}>删除</Button>
          </div>
          {item.lastError && <p className="anime-error">{item.lastError}</p>}
        </div>
      </article>)}</div> : !error && <NoResults title="没有符合条件的动漫订阅" description="试试其他关键词、更新日或状态。"
        reset={() => { setQuery(''); setFilter('全部'); setWeekday('all'); }} />}
    {add && <LiveAnimeEditor api={api} onClose={() => setAdd(false)} onSave={item => { save(item); setAdd(false); }} />}
    {removing && <Dialog open onOpenChange={open => { if (!open && !updating) setRemoving(undefined); }}>
      <DialogContent title="删除动漫订阅" description={removing.title}>
        <div className="stack">
          <p>此操作会移除该订阅的规则、资源记录和它独占的下载记录，保留共用任务和 115 网盘文件。删除后无法恢复。</p>
          {removeError && <p className="anime-error" role="alert">{removeError}</p>}
          <div className="row form-actions">
            <Button variant="ghost" disabled={Boolean(updating)} onClick={() => setRemoving(undefined)}>取消</Button>
            <Button variant="danger" loading={Boolean(updating)} disabled={Boolean(updating)} onClick={() => void remove()}>确认删除</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>}
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
