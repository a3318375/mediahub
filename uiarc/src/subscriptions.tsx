import { useState } from 'react';
import { CalendarDays, Plus, RefreshCw, Tv } from 'lucide-react';
import { Button } from './arc/button/button';
import { Calendar } from './arc/calendar/calendar';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { Switch } from './arc/switch/switch';
import { MediaGrid, NoResults, PageHeading, SectionHeading, Status, WorkspaceTabs } from './ui';
import { dayKey, includes, media, options, uid } from './model';
import type { DemoState, Media, Notify, Subscription, Update } from './model';

type Kind = '动漫' | '追剧';
type Download = (title: string, source: string) => void;
const animeSources = ['Bangumi', '蜜柑计划', '动漫花园', '自定义 RSS'];
const tvSources = ['TMDB', '自定义 RSS'];

function SubscriptionEditor({ seed, onSave, onClose }: {
  seed: Subscription; onSave: (entry: Subscription) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(seed);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  function change<K extends keyof Subscription>(key: K, value: Subscription[K]) {
    setDraft(current => ({ ...current, [key]: value })); setPreview(false); setError('');
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="wide-dialog" title={seed.id ? '编辑订阅' : '新建订阅'} description="使用示例来源配置规则和自动下载。">
      <form className="stack" onSubmit={event => {
        event.preventDefault();
        if (!draft.title.trim()) { setError('请输入作品名称。'); return; }
        onSave({ ...draft, title: draft.title.trim(), id: draft.id || uid() });
      }}>
        <div className="field-grid">
          <Input label="作品名称" value={draft.title} error={error} onChange={event => change('title', event.target.value)} />
          <Select label="来源" options={options(draft.kind === '动漫' ? animeSources : tvSources)} value={draft.source} onValueChange={value => change('source', value)} />
          <Input label={draft.source === '自定义 RSS' ? 'RSS 地址' : '字幕组 / 清晰度规则'} value={draft.rule} onChange={event => change('rule', event.target.value)} />
          <Input label="起始集数" value={draft.episode} onChange={event => change('episode', event.target.value)} />
          {draft.kind === '追剧' && <Select label="追踪季" options={options(['第 1 季', '第 2 季', '第 3 季', '第 4 季', '第 5 季'])} value={draft.season ?? '第 1 季'} onValueChange={value => change('season', value)} />}
          <Input label="备用 RSS（可选）" value={draft.backup ?? ''} onChange={event => change('backup', event.target.value)} />
          <Input label="目标目录" value={draft.directory ?? ''} placeholder="自动归类" onChange={event => change('directory', event.target.value)} />
        </div>
        <div className="field-grid">
          <label className="switch-row"><span>启用订阅</span><Switch checked={draft.active} onCheckedChange={value => change('active', value)} /></label>
          <label className="switch-row"><span>自动下载</span><Switch checked={draft.auto} onCheckedChange={value => change('auto', value)} /></label>
        </div>
        {preview && <div className="workflow-preview"><strong>示例匹配结果</strong><p>{draft.title} · {draft.episode || '第 1 集'} · {draft.source} · {draft.rule || '默认规则'}</p></div>}
        <div className="row form-actions">
          <Button type="button" variant="secondary" disabled={!draft.title.trim()} onClick={() => setPreview(value => !value)}>预览规则</Button>
          <Button type="submit">保存订阅</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function SubscriptionList({ kind, state, update, notify, onDownload }: {
  kind: Kind; state: DemoState; update: Update; notify: Notify; onDownload: Download;
}) {
  const [draft, setDraft] = useState<Subscription | null>(null);
  const [query, setQuery] = useState('');
  const rows = state.subscriptions.filter(item => item.kind === kind && includes(item.title, query));
  function save(entry: Subscription) {
    update(current => ({ ...current, subscriptions: current.subscriptions.some(item => item.id === entry.id)
      ? current.subscriptions.map(item => item.id === entry.id ? entry : item) : [...current.subscriptions, entry] }));
    setDraft(null);
    notify(`已保存${entry.title}的示例订阅`, '订阅');
  }
  function newSubscription() {
    setDraft({ id: '', title: '', kind, source: kind === '动漫' ? animeSources[0] : tvSources[0], rule: '1080p', active: true, auto: false, episode: '第 1 集' });
  }
  return <div className="stack">
    <SectionHeading title={kind === '动漫' ? '我的动漫订阅' : '我的追剧'} description={`${rows.length} 项订阅`}
      action={<div className="row">
        <Button variant="secondary" onClick={() => notify(`已核对 ${rows.length} 项示例订阅`, '订阅')}><RefreshCw size={15} aria-hidden="true" />刷新</Button>
        <Button onClick={newSubscription}><Plus size={16} aria-hidden="true" />新建订阅</Button>
      </div>} />
    <div className="narrow"><SearchField label="查找订阅" value={query} onValueChange={setQuery} placeholder="按片名筛选" /></div>
    <div className="table-panel"><SortableDataTable rows={rows} rowKey="id" caption={`${kind}订阅列表`} emptyMessage="没有符合条件的订阅" columns={[
      { key: 'title', label: '作品', sortable: true, render: (_, row) => <span className="table-main"><strong>{row.title}</strong><small>{row.season ? `${row.season} · ` : ''}{row.episode}</small></span> },
      { key: 'source', label: '来源' }, { key: 'rule', label: '匹配规则' },
      { key: 'active', label: '追踪状态', render: (_, row) => <div className="row no-wrap"><Switch aria-label={`追踪${row.title}`} checked={row.active} onCheckedChange={active => {
        update(current => ({ ...current, subscriptions: current.subscriptions.map(item => item.id === row.id ? { ...item, active } : item) }));
        notify(`${row.title} · ${active ? '已恢复' : '已暂停'}`, '订阅');
      }} /><Status tone={row.active ? 'success' : 'neutral'}>{row.active ? '追踪中' : '已暂停'}</Status></div> },
      { key: 'action', label: '操作', render: (_, row) => <div className="row no-wrap">
        <Button variant="secondary" size="sm" onClick={() => setDraft(row)}>编辑</Button>
        <Button variant="ghost" size="sm" onClick={() => onDownload(`${row.title} · ${row.episode}`, '115 网盘')}>下载资源</Button>
        <Button variant="ghost" size="sm" onClick={() => {
          update(current => ({ ...current, subscriptions: current.subscriptions.filter(item => item.id !== row.id) }));
          notify(`已移除${row.title}的示例订阅`, '订阅');
        }}>移除</Button>
      </div> },
    ]} /></div>
    {draft && <SubscriptionEditor seed={draft} onClose={() => setDraft(null)} onSave={save} />}
  </div>;
}

export function Anime({ state, update, notify, onOpen, onDownload }: {
  state: DemoState; update: Update; notify: Notify; onOpen: (item: Media) => void; onDownload: Download;
}) {
  const [source, setSource] = useState(animeSources[0]);
  const [query, setQuery] = useState('');
  const found = media.filter(item => item.kind === '动画' && item.region === '日本' &&
    (source === 'Bangumi' || item.id === (source === '蜜柑计划' ? 'yourname' : 'spirited')) &&
    (includes(item.title, query) || includes(item.original, query)));
  const automation = state.subscriptions.filter(item => item.kind === '动漫');
  const candidate = (row: Subscription) => state.tasks.find(task => task.title === row.title && task.status !== '失败');
  return <>
    <PageHeading title="动漫订阅" description="发现动画，按来源和字幕规则追踪更新。" />
    <WorkspaceTabs label="动漫订阅功能" items={[
      { id: 'list', label: '订阅管理', content: <SubscriptionList kind="动漫" state={state} update={update} notify={notify} onDownload={onDownload} /> },
      { id: 'browse', label: '动画片库', content: <div className="stack">
        <div className="row fields">
          <Select label="片库来源" value={source} options={options(animeSources.slice(0, 3))} onValueChange={setSource} />
          <SearchField label="搜索动画" value={query} onValueChange={setQuery} placeholder="查找动画作品" />
        </div>
        <SectionHeading title={source} description={`${found.length} 部示例动画`} />
        {found.length ? <MediaGrid items={found} onOpen={onOpen} /> : <NoResults reset={() => setQuery('')} />}
      </div> },
      { id: 'automation', label: '自动下载', content: <div className="stack">
        <SectionHeading title="自动下载规则" description="追踪候选、起始集数和目标目录。" />
        <div className="table-panel"><SortableDataTable rows={automation} rowKey="id" caption="动漫自动下载" columns={[
          { key: 'title', label: '作品' }, { key: 'episode', label: '起始集数' },
          { key: 'directory', label: '目标目录', render: (_, row) => row.directory || '自动归类' },
          { key: 'status', label: '候选状态', render: (_, row) => <Status tone={row.auto && !candidate(row) ? 'warning' : 'neutral'}>{row.auto ? candidate(row)?.status ?? '待检查' : '已关闭'}</Status> },
          { key: 'auto', label: '自动下载', render: (_, row) => <Switch aria-label={`${row.title}自动下载`} checked={row.auto} onCheckedChange={auto => update(current => ({ ...current, subscriptions: current.subscriptions.map(item => item.id === row.id ? { ...item, auto } : item) }))} /> },
          { key: 'retry', label: '操作', render: (_, row) => <Button variant="secondary" size="sm" disabled={!row.auto || Boolean(candidate(row))} onClick={() => onDownload(row.title, '115 网盘')}>重试候选</Button> },
        ]} /></div>
      </div> },
    ]} />
  </>;
}

function beijingToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const part = (name: string) => Number(parts.find(entry => entry.type === name)?.value);
  return new Date(part('year'), part('month') - 1, part('day'), 12);
}

export function SeriesCalendar({ state, update, notify, onDownload }: {
  state: DemoState; update: Update; notify: Notify; onDownload: Download;
}) {
  const [base] = useState(beijingToday);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selected, setSelected] = useState(base);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [draft, setDraft] = useState<Subscription | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const subscriptions = state.subscriptions.filter(item => item.kind === '追剧');
  const rows = subscriptions.filter(item => includes(item.title, query) &&
    (filter === 'all' || (filter === 'active') === item.active));
  const inspected = subscriptions.find(item => item.id === detail);
  const events = subscriptions.flatMap((item, index) => {
    const season = Number((item.season ?? item.rule).match(/第\s*(\d+)\s*季/)?.[1]) || 1;
    const first = Number(item.episode.match(/\d+/)?.[0]) || 1;
    return [0, 1].map(episodeIndex => {
      const offset = index + episodeIndex * 5;
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 12);
      const episode = `S${String(season).padStart(2, '0')}E${String(first + episodeIndex).padStart(2, '0')}`;
      const available = episodeIndex === 0 && item.active;
      return { date, episode, item, available, status: item.active ? available ? '资源已找到' : '待播出' : '订阅暂停' };
    });
  });
  const eventsFor = (date: Date) => events.filter(event => dayKey(event.date) === dayKey(date));
  const selectedEvents = eventDate ? eventsFor(eventDate) : [];

  function edit(item: Subscription) { setEventDate(null); setDetail(null); setDraft(item); }
  function save(item: Subscription) {
    update(current => ({ ...current, subscriptions: current.subscriptions.some(entry => entry.id === item.id)
      ? current.subscriptions.map(entry => entry.id === item.id ? item : entry) : [...current.subscriptions, item] }));
    setDraft(null);
    notify(`已保存${item.title}的示例订阅`, '订阅');
  }
  function toggle(item: Subscription) {
    update(current => ({ ...current, subscriptions: current.subscriptions.map(entry => entry.id === item.id ? { ...entry, active: !entry.active } : entry) }));
    notify(`${item.title} · ${item.active ? '已暂停' : '已恢复'}`, '订阅');
  }
  function create() {
    setDraft({ id: '', title: '', kind: '追剧', source: 'TMDB', rule: '1080p', active: true, auto: false, episode: '第 1 集', season: '第 1 季' });
  }

  return <>
    <PageHeading title="追剧日历" description="管理剧集订阅、播出计划与资源更新。"
      action={<div className="row">
        <Button variant="secondary" aria-pressed={showCalendar} onClick={() => setShowCalendar(value => !value)}><CalendarDays size={17} aria-hidden="true" />{showCalendar ? '订阅列表' : '播出日历'}</Button>
        <Button variant="secondary" onClick={() => notify(`已核对 ${subscriptions.length} 项示例订阅`, '订阅')}><RefreshCw size={16} aria-hidden="true" />刷新</Button>
        <Button onClick={create}><Plus size={16} aria-hidden="true" />添加追剧</Button>
      </div>} />
    {showCalendar && <section className="panel series-calendar">
        <Calendar value={selected} locale="zh-CN" weekStartsOn={1} todayDate={base} showToday
          onChange={date => { setSelected(date); if (eventsFor(date).length) setEventDate(date); }}
          dayDetails={date => {
            const items = eventsFor(date);
            if (!items.length) return;
            return { label: items.map(event => `${event.item.title} ${event.episode} ${event.status}`).join('、'),
              content: items.map(event => <span key={event.item.id} className="schedule-event" data-available={event.available}><strong>{event.item.title}</strong><small>{event.episode} · {event.status}</small></span>) };
          }} />
      <p className="muted">播出日期按北京时间展示 · 本页使用示例播出计划</p>
    </section>}
    <section className="stack series-library" aria-label="我的追剧">
      <div className="section-heading">
        <div><h2>我的追剧</h2><p>{subscriptions.length} 部剧集</p></div>
        <div className="series-search"><SearchField label="搜索追剧" value={query} onValueChange={setQuery} placeholder="搜索订阅…" /></div>
      </div>
      <div className="row"><SegmentedControl label="订阅状态" options={[
        { value: 'all', label: `全部 ${subscriptions.length}` }, { value: 'active', label: '追踪中' }, { value: 'paused', label: '已暂停' },
      ]} value={filter} onValueChange={setFilter} /></div>
      {rows.length ? <div className="series-grid">{rows.map(item => {
        const work = media.find(entry => entry.title === item.title);
        return <article className="panel series-card" key={item.id}>
          <Button variant="ghost" className="series-cover" aria-label={`查看《${item.title}》订阅详情`} onClick={() => setDetail(item.id)}>
            {work ? <img src={work.poster} alt="" /> : <Tv size={28} aria-hidden="true" />}
          </Button>
          <div className="series-card-body">
            <div className="row"><Status tone={item.active ? 'success' : 'neutral'}>{item.active ? '追踪中' : '已暂停'}</Status><span className="muted">{item.source}</span></div>
            <h3>{item.title}</h3><p className="muted">{item.season ?? '全部季度'} · {item.episode}</p>
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => edit(item)}>编辑</Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(item)}>{item.active ? '暂停' : '恢复'}</Button>
              <Button size="sm" variant="ghost" className="icon-button" aria-label={`检查《${item.title}》更新`} onClick={() => notify(`已检查${item.title}的示例更新`, '订阅')}><RefreshCw size={15} aria-hidden="true" /></Button>
            </div>
          </div>
        </article>;
      })}</div> : <NoResults title="没有符合条件的追剧订阅" description="试试其他关键词或订阅状态。" reset={() => { setQuery(''); setFilter('all'); }} />}
    </section>
    {draft && <SubscriptionEditor seed={draft} onSave={save} onClose={() => setDraft(null)} />}
    <Dialog open={Boolean(eventDate)} onOpenChange={open => { if (!open) setEventDate(null); }}>
      {eventDate && <DialogContent title={eventDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} description="当日示例更新">
        <div className="stack">{selectedEvents.map(({ item, episode, available, status }) => <div className="panel stack" key={item.id}>
          <div className="row"><strong>{item.title} · {episode}</strong><Status tone={available ? 'success' : 'neutral'}>{status}</Status></div>
          <div className="row">
            <Button variant="secondary" onClick={() => edit(item)}>编辑订阅规则</Button>
            {available && <Button onClick={() => { setEventDate(null); onDownload(`${item.title} · ${episode}`, '115 网盘'); }}>下载 / 转存</Button>}
          </div>
        </div>)}</div>
      </DialogContent>}
    </Dialog>
    <Dialog open={Boolean(inspected)} onOpenChange={open => { if (!open) setDetail(null); }}>
      {inspected && <DialogContent title={inspected.title} description={`${inspected.season ?? '全部季度'} · ${inspected.source}`}>
        <div className="stack">
          <p>{inspected.episode} · {inspected.rule}</p>
          <div className="row">
            <Button variant="secondary" onClick={() => edit(inspected)}>编辑订阅规则</Button>
            <Button onClick={() => { setDetail(null); onDownload(`${inspected.title} · ${inspected.episode}`, '115 网盘'); }}>下载资源</Button>
          </div>
        </div>
      </DialogContent>}
    </Dialog>
  </>;
}
