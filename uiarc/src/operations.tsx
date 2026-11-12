import { useEffect, useState } from 'react';
import { Copy, Download, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import { Accordion } from './arc/accordion/accordion';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { Progress } from './arc/progress/progress';
import { SearchField } from './arc/search-field/search-field';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Select } from './arc/select/select';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { Switch } from './arc/switch/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './arc/tabs/tabs';
import { PageHeading, SectionHeading, Status, WorkspaceTabs } from './ui';
import { includes, options, resources, uid } from './model';
import type { DemoState, Notify, Task, Update } from './model';
import { requestError } from './live-api';
import type { LiveApi, ServerLog } from './live-api';

const providers = ['115 网盘', '夸克网盘', '百度网盘', '磁力链接'];
const directories = ['自动归类', '电影 / 科幻', '剧集', '动画', '待整理'];
const states = ['所有状态', '下载中', '排队中', '已暂停', '已完成', '失败'];
const levelTone = { 信息: 'info', 警告: 'warning', 错误: 'danger' } as const;
const taskTone = { 下载中: 'info', 已暂停: 'neutral', 已完成: 'success', 失败: 'danger', 排队中: 'warning' } as const;

export function ResourceSearch({ state, initialQuery, remember, onDownload, notify }: {
  state: DemoState; initialQuery: string; remember: (value: string) => void; onDownload: (title: string, source: string) => void; notify: Notify;
}) {
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [provider, setProvider] = useState('全部网盘');
  const [detected, setDetected] = useState(false);
  const [copyError, setCopyError] = useState('');
  const results = resources.filter(item => Boolean(query) && includes(item.title, query) &&
    state.settings[`search.drive.${item.provider}`] !== false &&
    (item.plugin !== '演示索引' || state.settings['search.index'] !== false) &&
    (item.plugin !== '动画资源' || state.settings['search.animation'] !== false));
  const shown = results.filter(item => provider === '全部网盘' || item.provider === provider);
  const checked = detected || state.settings['search.detect'] === true || state.settings['rules.detect'] === true;
  function search(value: string) { setDraft(value); setQuery(value.trim()); setProvider('全部网盘'); setDetected(false); remember(value); }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); notify('已复制提取码'); setCopyError(''); }
    catch { setCopyError(`提取码 ${value}，可手动复制。`); }
  }
  return <>
    <PageHeading title="搜索历史" description="搜索示例资源、切换网盘来源，并将结果加入下载管理。" />
    <section className="panel stack">
      <form className="inline-form" onSubmit={event => { event.preventDefault(); search(draft); }}>
        <SearchField label="资源关键词" value={draft} onValueChange={value => { setDraft(value); if (!value) search(''); }} placeholder="搜索片名、清晰度或集数" />
        <Button type="submit">搜索资源</Button>
      </form>
      {!!state.history.length && <div className="row"><span className="muted">最近搜索</span>{state.history.slice(0, 6).map(item => <Button key={item} size="sm" variant="secondary" onClick={() => search(item)}>{item}</Button>)}</div>}
    </section>
    <div className="section stack">
      <SectionHeading title="资源结果" description={`${results.length} 条示例资源`}
        action={<Button variant="secondary" disabled={!shown.length} onClick={() => { setDetected(true); notify(`已检查 ${shown.length} 条本地样例`); }}>检查可见结果</Button>} />
      <Tabs value={provider} onValueChange={value => { setProvider(value); setDetected(false); }}>
        <TabsList aria-label="网盘来源" appearance="underline">
          {['全部网盘', ...providers].map(value => <TabsTrigger key={value} value={value}>
            {value === '全部网盘' ? `全部 (${results.length})` : `${value} (${results.filter(item => item.provider === value).length})`}
          </TabsTrigger>)}
        </TabsList>
        <TabsContent value={provider} forceMount>
          {copyError && <p role="status">{copyError}</p>}
          <div className="table-panel"><SortableDataTable rows={shown} rowKey="id" caption="资源搜索结果" emptyMessage="没有匹配的示例资源" columns={[
            { key: 'title', label: '资源名称', sortable: true, render: (_, row) => <span className="table-main"><strong>{row.title}</strong><small>{row.plugin}</small></span> },
            { key: 'provider', label: '网盘', render: (_, row) => <Status tone={checked ? 'success' : 'neutral'}>{row.provider}</Status> },
            { key: 'size', label: '大小' },
            { key: 'code', label: '提取码', render: (_, row) => row.code ? <Button size="sm" variant="ghost" onClick={() => void copy(row.code!)}><Copy size={14} aria-hidden="true" />{row.code}</Button> : '—' },
            { key: 'action', label: '操作', render: (_, row) => <Button variant="secondary" size="sm" aria-label={`下载${row.title}`} onClick={() => onDownload(row.title, row.provider)}>下载</Button> },
          ]} /></div>
        </TabsContent>
      </Tabs>
    </div>
  </>;
}

export function DownloadEditor({ seed, onClose, onSave }: { seed: { title: string; source: string } | null; onClose: () => void; onSave: (task: Task) => void }) {
  const [title, setTitle] = useState(seed?.title ?? '');
  const [source, setSource] = useState(seed?.source || providers[0]);
  const [link, setLink] = useState('');
  const [directory, setDirectory] = useState(directories[0]);
  const [mode, setMode] = useState('整份转存');
  const [files, setFiles] = useState(['正片.mkv']);
  const [error, setError] = useState('');
  const isShare = source === '115 网盘';
  const choosingFiles = isShare && mode === '选择文件';
  return <Dialog open={Boolean(seed)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent title="新建下载任务" description="演示任务会加入本地队列。">
      <form className="stack" noValidate onSubmit={event => {
        event.preventDefault();
        if (!title.trim() || (!seed?.title && !link.trim()) || (choosingFiles && !files.length)) {
          setError('请输入任务名称和资源链接，并确认要转存的文件。'); return;
        }
        onSave({ id: uid(), title: title.trim(), source, directory, mode: isShare ? mode : undefined, files: choosingFiles ? files : undefined, status: '排队中', progress: 0 });
      }}>
        <Input label="任务名称" value={title} onChange={event => setTitle(event.target.value)} error={error} />
        <Select label="来源" options={options(providers)} value={source} onValueChange={setSource} />
        {!seed?.title && <Input label="磁力或分享链接" value={link} onChange={event => setLink(event.target.value)} placeholder="请输入用于演示的资源链接" />}
        {isShare && <div className="stack">
          <Input label="提取码（可选）" maxLength={12} />
          <SegmentedControl label="转存方式" options={options(['整份转存', '选择文件'])} value={mode} onValueChange={setMode} />
          {choosingFiles && ['正片.mkv', '字幕.srt'].map(file => <label className="switch-row" key={file}><span>{file}</span><Switch checked={files.includes(file)} onCheckedChange={value => setFiles(items => value ? [...items, file] : items.filter(item => item !== file))} /></label>)}
        </div>}
        <Select label="目标目录" options={options(directories)} value={directory} onValueChange={setDirectory} />
        <div className="row form-actions"><Button type="submit">加入队列</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function Downloads({ state, update, notify, onNew }: { state: DemoState; update: Update; notify: Notify; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(states[0]);
  const [selected, setSelected] = useState('');
  const detail = state.tasks.find(task => task.id === selected);
  const shown = state.tasks.filter(task => (status === states[0] || task.status === status) && includes(task.title, query));
  function transition(task: Task, status: Task['status']) {
    update(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, status, progress: status === '已完成' ? 100 : item.progress } : item) }));
    notify(`${task.title} · ${status}`, '下载');
  }
  return <div className="stack">
    <SectionHeading title="下载任务" description={`${shown.length} 项任务`} action={<Button onClick={onNew}><Plus size={16} aria-hidden="true" />新建下载</Button>} />
    <div className="row processing-toolbar"><div className="processing-search"><SearchField label="搜索任务" value={query} onValueChange={setQuery} placeholder="按任务名称搜索" /></div>
      <div className="processing-kind"><Select label="下载状态" options={options(states)} value={status} onValueChange={setStatus} /></div></div>
    <div className="table-panel"><SortableDataTable rows={shown} rowKey="id" caption="下载任务列表" emptyMessage="没有符合条件的任务" columns={[
      { key: 'title', label: '名称', sortable: true, render: (_, row) => <span className="table-main"><strong>{row.title}</strong><small>{row.source}</small></span> },
      { key: 'status', label: '状态', render: (_, row) => <Status tone={taskTone[row.status]}>{row.status}</Status> },
      { key: 'progress', label: '进度', sortable: true, numeric: false, render: (_, row) => <Progress className="table-progress" value={row.progress} showValue aria-label={`${row.title}进度`} /> },
      { key: 'directory', label: '目标目录' },
      { key: 'action', label: '操作', render: (_, row) => <div className="row no-wrap">
        {row.status !== '已完成' && <Button variant="secondary" size="sm" onClick={() => transition(row, row.status === '下载中' || row.status === '排队中' ? '已暂停' : '下载中')}>{row.status === '失败' ? '重试' : row.status === '已暂停' ? '恢复' : '暂停'}</Button>}
        <Button variant="ghost" size="sm" onClick={() => setSelected(row.id)}>详情</Button>
      </div> },
    ]} /></div>
    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setSelected(''); }}>
      {detail && <DialogContent title={detail.title} description={`${detail.source} · ${detail.directory}`}>
        <div className="stack"><Status tone={taskTone[detail.status]}>{detail.status}</Status>
          <Progress label="任务进度" value={detail.progress} showValue />
          {detail.files && <p>{detail.files.join('、')}</p>}
          {detail.status === '失败' && <p>本地样例资源暂不可用，可从列表重试。</p>}
          {detail.status === '下载中' && <Button onClick={() => transition(detail, '已完成')}>模拟完成下载</Button>}
        </div>
      </DialogContent>}
    </Dialog>
  </div>;
}

export const processingTabs = [['downloads', '下载管理'], ['organize', '媒体整理'], ['strm', 'STRM 生成'], ['scraping', '元数据刮削']] as const;
type WorkflowId = Exclude<(typeof processingTabs)[number][0], 'downloads'>;
const workflowInfo = {
  organize: { title: '媒体整理', input: '/演示/未整理', output: '/演示/媒体库', rows: ['沙丘：第二部.mkv → 电影/科幻', '怪奇物语 S04E02.mkv → 剧集/怪奇物语'] },
  strm: { title: 'STRM 生成', input: '/演示/网盘影视', output: '/演示/STRM', rows: ['沙丘：第二部.strm', '怪奇物语 S04E02.strm'] },
  scraping: { title: '元数据刮削', input: '/演示/媒体库', output: '/演示/元数据', rows: ['沙丘：第二部.nfo', 'poster.jpg'] },
};
export function Workflow({ id, state, update, notify }: { id: WorkflowId; state: DemoState; update: Update; notify: Notify }) {
  const spec = workflowInfo[id];
  const [input, setInput] = useState(String(state.settings[`${id}.input`] ?? spec.input));
  const [output, setOutput] = useState(String(state.settings[`${id}.output`] ?? spec.output));
  const [cron, setCron] = useState(String(state.settings[`${id}.cron`] ?? '0 3 * * *'));
  const [preview, setPreview] = useState(false);
  const [ran, setRan] = useState(false);
  return <section className="panel stack">
    <SectionHeading title={spec.title} description="编辑演示路径，预览本次任务的计划结果。" />
    <div className="field-grid">
      <Input label="来源目录" value={input} onChange={event => { setInput(event.target.value); setPreview(false); setRan(false); }} />
      <Input label="输出目录" value={output} onChange={event => { setOutput(event.target.value); setPreview(false); setRan(false); }} />
      <Input label="定时规则（北京时间）" value={cron} onChange={event => setCron(event.target.value)} />
    </div>
    <div className="row">
      <Button disabled={!input.trim() || !output.trim()} onClick={() => { setPreview(true); setRan(false); }}><FolderOpen size={16} aria-hidden="true" />预览计划</Button>
      <Button variant="secondary" onClick={() => {
        update(current => ({ ...current, settings: { ...current.settings, [`${id}.input`]: input, [`${id}.output`]: output, [`${id}.cron`]: cron } }));
        notify(`已保存${spec.title}的演示配置`, '设置');
      }}>保存配置</Button>
    </div>
    {preview && <div className="workflow-preview stack"><h3>计划处理 {spec.rows.length} 项</h3><ul>{spec.rows.map(row => <li key={row}>{row}</li>)}</ul>
      <div className="row"><Button disabled={ran} variant="secondary" onClick={() => { setRan(true); notify(`演示${spec.title}完成，共 ${spec.rows.length} 项`, '媒体处理'); }}>运行演示</Button>{ran && <Status tone="success">演示完成</Status>}</div>
    </div>}
  </section>;
}

export function Processing({ state, update, notify, onNew }: { state: DemoState; update: Update; notify: Notify; onNew: () => void }) {
  return <section className="processing-page">
    <PageHeading title="媒体处理" description="管理下载队列，预览整理、STRM 和元数据任务。" />
    <WorkspaceTabs label="媒体处理功能" items={processingTabs.map(([id, label]) => ({
      id, label, content: id === 'downloads'
        ? <><Downloads state={state} update={update} notify={notify} onNew={onNew} /><div className="section"><Accordion defaultOpen={-1} items={[{ title: '下载记录', content: <div className="stack">{state.tasks.filter(item => item.status === '已完成').map(item => <p key={item.id}>{item.title} · {item.directory}</p>)}</div> }]} /></div></>
        : <Workflow id={id} state={state} update={update} notify={notify} />,
    }))} />
  </section>;
}

export function Logs({ state, api }: { state: DemoState; api?: LiveApi }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('所有级别');
  const [source, setSource] = useState('所有来源');
  const [limit, setLimit] = useState(api ? '500' : '50');
  const [auto, setAuto] = useState(true);
  const [remoteRows, setRemoteRows] = useState<ServerLog[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(Boolean(api));
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    setRemoteRows([]);
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (!api) return;
      try {
        const items = await api.logs({
          limit, query: query.trim(),
          ...(level !== '所有级别' ? { level } : {}),
          ...(source !== '所有来源' ? { source } : {}),
        }, controller.signal);
        if (controller.signal.aborted) return;
        setError('');
        setRemoteRows(items);
        setSources(previous => [...new Set([...previous, ...items.map(item => item.source)])].sort());
      } catch (reason) {
        if (!controller.signal.aborted) setError(requestError(reason));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          if (auto) timer = setTimeout(load, 5000);
        }
      }
    }
    timer = setTimeout(load, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, auto, level, limit, query, source, revision]);
  const rows: Array<Omit<ServerLog, 'id'> & { id: string | number }> = api ? remoteRows : state.logs.filter(item =>
    (level === '所有级别' || item.level === level) &&
    (source === '所有来源' || item.source === source) && includes(item.message, query)).slice(0, Number(limit));
  const tones = { ...levelTone, INFO: 'info', WARN: 'warning', ERROR: 'danger', DEBUG: 'neutral' } as const;
  function exportLogs() {
    const blob = new Blob([rows.map(log => `[${log.time}] [${log.level}] [${log.source}] ${log.message}`).join('\n')], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = api ? 'mediahub-logs.txt' : 'uiarc-demo-logs.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <>
    <PageHeading title="日志中心" description={api ? '查询 MediaHub 服务日志。' : '查看这次演示的操作记录。'} />
    <div className="stack log-content">
      <div className="panel log-toolbar" role="group" aria-label="日志筛选与操作">
        <div className="log-keyword"><SearchField label="关键词" value={query} onValueChange={setQuery} placeholder="搜索日志内容" /></div>
        <div className="log-filters">
          <Select label="级别" options={options(api ? ['所有级别', 'INFO', 'WARN', 'ERROR', 'DEBUG'] : ['所有级别', '信息', '警告', '错误'])} value={level} onValueChange={setLevel} />
          <Select label="来源" options={options(['所有来源', ...(api ? sources : new Set(state.logs.map(item => item.source)))])} value={source} onValueChange={setSource} />
          <Select label="显示条数" options={options(api ? ['50', '100', '200', '500', '1000'] : ['20', '50', '100'])} value={limit} onValueChange={setLimit} />
        </div>
        <div className="row log-actions">
          {api && <Switch label="自动刷新" checked={auto} onCheckedChange={setAuto} />}
          {api && <Button size="sm" variant="ghost" aria-label="刷新" title="刷新" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} aria-hidden="true" /><span className="log-action-label">刷新</span></Button>}
          <Button size="sm" variant="ghost" aria-label="导出日志" title="导出日志" disabled={!rows.length} onClick={exportLogs}><Download size={15} aria-hidden="true" /><span className="log-action-label">导出</span></Button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <SortableDataTable rows={rows} rowKey="id" caption="日志列表" emptyMessage={busy ? '正在读取日志…' : '没有符合条件的日志'} columns={[
        { key: 'time', label: '时间', width: '11.5rem', sortable: true, render: (_, row) => <span className="log-time">{api ? new Date(row.time).toLocaleString('zh-CN') : row.time}</span> },
        { key: 'level', label: '级别', width: '5.5rem', render: (_, row) => <Status tone={tones[row.level as keyof typeof tones]}>{row.level}</Status> },
        { key: 'source', label: '来源', width: '6.5rem', sortable: true },
        { key: 'message', label: '内容', width: 'auto' },
      ]} />
    </div>
  </>;
}
