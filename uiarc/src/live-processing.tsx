import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Clapperboard, RefreshCw } from 'lucide-react';
import type { DownloadTask } from '../../hero/src/lib/download-api';
import type { OrganizeMediaItem } from '../../hero/src/lib/organize-api';
import type { OutputJob } from '../../hero/src/lib/media-output-api';
import { Button } from './arc/button/button';
import { Dialog, DialogContent, DialogTrigger } from './arc/dialog/dialog';
import { Progress } from './arc/progress/progress';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { requestError, type LiveApi } from './live-api';
import { processingTabs } from './operations';
import { PageHeading, Status, WorkspaceTabs } from './ui';
import './processing.css';

type Mode = (typeof processingTabs)[number][0];
type Tone = ComponentProps<typeof Status>['tone'];
const runLabels = { downloads: '立即下载', organize: '立即整理', strm: '生成 STRM', scraping: '开始刮削' };
const mediaTypes: Record<string, string> = { anime: '番剧', tv: '电视剧', movie: '电影', program: '节目' };
const states: Record<string, [string, Tone]> = {
  queued: ['排队中', 'neutral'], preparing: ['准备中', 'info'], submitting: ['提交中', 'info'],
  submitted: ['已提交', 'info'], downloading: ['下载中', 'info'], awaiting_files: ['等待文件', 'warning'],
  completed: ['已完成', 'success'], failed: ['失败', 'danger'], cancelled: ['已取消', 'neutral'],
  unknown: ['待确认', 'warning'], running: ['执行中', 'info'], interrupted: ['已中断', 'warning'],
  completed_with_issues: ['部分完成', 'warning'],
};
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' });
function formatTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? dateTime.format(time) : '—';
}

function TaskState({ state }: { state: string }) {
  const [label, tone] = states[state] ?? ['未知状态', 'neutral'];
  return <Status tone={tone}>{label}</Status>;
}

function DownloadProgress({ task }: { task: DownloadTask }) {
  const measured = Number.isFinite(task.progress) && (task.progress > 0 || ['downloading', 'completed'].includes(task.state));
  return measured ? <Progress className="processing-progress" data-state={task.state} value={task.progress} showValue aria-label="下载进度" /> : <span className="muted">—</span>;
}

function taskTitle(task: DownloadTask) {
  return task.references?.find(ref => ref.media?.title)?.media.title || task.artifacts?.[0]?.name || `任务 ${task.id.slice(0, 8)}`;
}

function DownloadQueue({ tasks }: { tasks: DownloadTask[] }) {
  return <section className="processing-section">
    <div className="row processing-count"><h2>下载任务</h2><span className="muted">{tasks.length} 项</span></div>
    <div className="table-panel"><SortableDataTable rows={tasks} rowKey="id" caption="下载任务" columns={[
      { key: 'name', label: '任务', sortable: false, render: (_, task) => {
        const title = taskTitle(task);
        return <div className="table-main"><strong title={title}>{title}</strong><small>{task.kind === 'share_transfer' ? '115 分享转存' : '115 离线下载'}</small></div>;
      } },
      { key: 'state', label: '状态', width: '7rem', render: (_, task) => <TaskState state={task.state} /> },
      { key: 'progress', label: '进度', width: '10rem', sortable: true, numeric: false, render: (_, task) => <DownloadProgress task={task} /> },
      { key: 'updatedAt', label: '最近更新', width: '11rem', render: (_, task) => <time>{formatTime(task.updatedAt || task.createdAt)}</time> },
      { key: 'details', label: '操作', sortable: false, width: '5rem', render: (_, task) => <Dialog>
        <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label={`查看${taskTitle(task)}的下载详情`}>详情</Button></DialogTrigger>
        <DialogContent title={taskTitle(task)} description={`最近更新 ${formatTime(task.updatedAt || task.createdAt)}`}>
          <div className="stack"><div><TaskState state={task.state} /></div><DownloadProgress task={task} />
            {task.directoryId && <p>115 目标目录 ID · {task.directoryId}</p>}
            {task.error && <p role="status">{task.error}</p>}
            {!!task.artifacts?.length && <ul>{task.artifacts.map(file => <li key={file.id}>{file.name}</li>)}</ul>}
          </div>
        </DialogContent>
      </Dialog> },
    ]} /></div>
  </section>;
}

function ProcessingRecords({ mode, items, emptyMessage }: { mode: Mode; items: OrganizeMediaItem[]; emptyMessage: string }) {
  const counts = mode === 'strm' ? [
    { key: 'strmCount', label: '已生成' },
  ] : mode === 'scraping' ? [
    { key: 'scrapedCount', label: '已刮削' }, { key: 'incompleteScrapeCount', label: '未完全刮削' },
  ] : [{ key: 'organized', label: '已整理' }, { key: 'pending', label: '未整理' }];
  return <div className="table-panel"><SortableDataTable rows={items} rowKey="id" caption="最近作品记录" emptyMessage={emptyMessage} columns={[
    { key: 'work', label: '作品', sortable: false, render: (_, item) => <div className="row no-wrap processing-work">
      <span className="processing-work-icon"><Clapperboard size={18} aria-hidden="true" /></span>
      <div className="processing-work-name">
        <strong title={item.media.title}>{item.media.title || '未命名作品'}</strong>
        <small>{[mediaTypes[item.media.type ?? ''], item.media.season ? `第 ${item.media.season} 季` : ''].filter(Boolean).join(' · ')}</small>
      </div>
      {item.active && <Status tone="info">处理中</Status>}
    </div> },
    { key: 'lastActivityAt', label: '最近活动', width: '11rem', render: (_, item) => <time>{formatTime(item.lastActivityAt || item.createdAt)}</time> },
    ...[{ key: 'downloaded', label: '资源数' }, ...counts].map(({ key, label }) => ({
      key, label, sortable: true, numeric: true, width: '7rem', render: (value: unknown) => typeof value === 'number' ? value : '—',
    })),
  ]} /></div>;
}

function ProcessingPanel({ api, mode }: { api: LiveApi; mode: Mode }) {
  const [items, setItems] = useState<OrganizeMediaItem[]>();
  const [tasks, setTasks] = useState<DownloadTask[]>();
  const [job, setJob] = useState<OutputJob>();
  const [configured, setConfigured] = useState<boolean>();
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [runError, setRunError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const running = job?.status.state === 'running' || job?.status.state === 'queued';
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    async function load() {
      const [records, downloads, output, organize] = await Promise.allSettled([
        api.processingItems(signal), mode === 'downloads' ? api.downloadTasks(signal) : undefined,
        mode === 'strm' || mode === 'scraping' ? api.outputConfig(mode, signal) : undefined,
        mode === 'organize' ? api.organizeConfig(signal) : undefined,
      ]);
      if (signal.aborted) return;
      if (records.status === 'fulfilled') setItems(records.value.items ?? []);
      if (downloads.status === 'fulfilled' && downloads.value) setTasks(downloads.value.items ?? []);
      if (output.status === 'fulfilled') setJob(output.value);
      const rule = organize.status === 'fulfilled' ? organize.value : undefined;
      setConfigured(mode === 'downloads' ? true : rule ? Boolean(rule.sourceId && rule.targetId) : output.status === 'fulfilled' ? output.value?.configured : undefined);
      setErrors([records, downloads, output, organize].flatMap((result, index) => result.status === 'rejected'
        ? [`${['作品记录', '下载任务', '执行状态', '整理配置'][index]}读取失败。${requestError(result.reason)}`] : []));
      setLoading(false);
      timer = setTimeout(load, 10_000);
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api, mode, revision]);

  async function run() {
    setBusy(true);
    setRunError('');
    setNotice('');
    try {
      setNotice((await api.runProcessing(mode)).message);
      refresh();
    } catch (error) { setRunError(requestError(error)); }
    finally { setBusy(false); }
  }

  const visible = items?.filter(item => (kind === 'all' || item.media.type === kind)
    && (item.media.title ?? '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const status = job?.status;
  return <div className="processing-content">
    <div className="row processing-toolbar">
      <div className="row processing-count"><h2>最近记录</h2>{items && <span className="muted">{visible.length} 部作品</span>}</div>
      <div className="processing-search"><SearchField label="搜索作品" placeholder="按作品名称搜索" value={query} onValueChange={setQuery} /></div>
      <div className="processing-kind"><Select label="作品类型" options={[
        { value: 'all', label: '全部类型' }, ...Object.entries(mediaTypes).map(([value, label]) => ({ value, label })),
      ]} value={kind} onValueChange={setKind} /></div>
      <div className="row processing-actions">
        <Button variant="ghost" size="sm" aria-label="刷新状态" title="刷新状态" disabled={loading || busy} onClick={refresh}><RefreshCw size={16} aria-hidden="true" /></Button>
        <Button size="sm" disabled={!configured || loading || busy || running} onClick={() => void run()}>{busy ? '正在触发…' : running ? '执行中…' : runLabels[mode]}</Button>
      </div>
    </div>
    {errors.map(error => <p key={error} role="alert" className="processing-error">{error}</p>)}
    {runError && <p role="alert" className="processing-error">{runError}</p>}
    {notice && <p role="status" className="muted">{notice}</p>}
    {configured === false && <p className="muted">请先在全局设置中配置{processingTabs.find(([id]) => id === mode)?.[1]}。</p>}
    {status && status.state !== 'idle' && <div className="panel processing-job">
      <div className="row"><TaskState state={status.state} /><span className="muted">{formatTime(status.finishedAt || status.startedAt)}</span></div>
      <div className="row processing-job-counts"><span>扫描 {status.scanned}</span><span>完成 {status.completed}</span><span>跳过 {status.skipped}</span><span>失败 {status.failed}</span></div>
      {status.error && <p className="processing-error">{status.error}</p>}
      {!!status.issues?.length && <details><summary>查看未完成原因</summary><ul>{status.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details>}
    </div>}
    <ProcessingRecords mode={mode} items={visible} emptyMessage={items ? (kind !== 'all' || query.trim() ? '没有符合条件的作品' : '暂无作品处理记录') : loading ? '正在读取最近记录…' : '暂时无法读取作品记录'} />
    {tasks && (tasks.length ? <DownloadQueue tasks={tasks} /> : <p className="muted processing-no-tasks">暂无下载任务</p>)}
  </div>;
}

export function LiveProcessing({ api }: { api: LiveApi }) {
  return <section className="processing-page">
    <PageHeading title="媒体处理" description="管理下载、媒体整理、STRM 生成与元数据刮削。" />
    <WorkspaceTabs label="媒体处理功能" items={processingTabs.map(([id, label]) => ({
      id, label, content: <ProcessingPanel api={api} mode={id} />,
    }))} />
  </section>;
}
