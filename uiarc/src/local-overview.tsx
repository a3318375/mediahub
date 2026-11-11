import { useEffect, useState } from 'react';
import { Clapperboard, Download, Files, RefreshCw, Sparkles } from 'lucide-react';
import type { DownloadTask } from '../../hero/src/lib/download-api';
import type { OrganizeMediaItem } from '../../hero/src/lib/organize-api';
import { Button } from './arc/button/button';
import { MetricCard } from './arc/metric-card/metric-card';
import type { LiveApi } from './live-api';
import { requestError } from './live-api';
import { PageHeading, SectionHeading, Status } from './ui';

type Job = Awaited<ReturnType<LiveApi['outputConfig']>>['status'];
const timeFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
function formatTime(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? timeFormat.format(time) : '';
}

const jobState: Record<string, string> = {
  queued: '等待执行', running: '运行中', completed: '已完成', failed: '失败',
  completed_with_issues: '完成，有问题', interrupted: '已中断',
};
function JobCard({ title, status }: { title: string; status?: Job }) {
  const ran = status && status.state !== 'idle';
  return <section className="panel stack">
    <div className="section-heading"><h2 className="row">
      {title === '元数据刮削' ? <Sparkles size={18} aria-hidden="true" /> : <Files size={18} aria-hidden="true" />}{title}
    </h2>{ran && status && <Status tone={status.state === 'failed' ? 'danger' : status.state === 'running' ? 'info' : 'neutral'}>
      {jobState[status.state] || '已有运行记录'}
    </Status>}</div>
    {ran && status ? <>
      <p className="muted">{formatTime(status.finishedAt || status.startedAt)}</p>
      <dl className="overview-job-stats">
        <div><dt>已扫描</dt><dd>{status.scanned}</dd></div>
        <div><dt>成功</dt><dd>{status.completed}</dd></div>
        <div><dt>跳过</dt><dd>{status.skipped}</dd></div>
        <div><dt>失败</dt><dd>{status.failed}</dd></div>
      </dl>
      {status.error && <p role="status">{status.error}</p>}
    </> : <p className="muted">{status ? '暂无运行记录' : '暂未读取到任务状态'}</p>}
  </section>;
}

export function LocalOverview({ api }: { api: LiveApi }) {
  const [data, setData] = useState<{ downloads?: DownloadTask[]; items?: OrganizeMediaItem[]; scraping?: Job; strm?: Job }>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    Promise.allSettled([
      api.downloadTasks(signal), api.processingItems(signal), api.outputConfig('scraping', signal), api.outputConfig('strm', signal),
    ]).then(([downloads, organize, scraping, strm]) => {
      if (signal.aborted) return;
      setData({
        downloads: downloads.status === 'fulfilled' ? downloads.value.items ?? [] : undefined,
        items: organize.status === 'fulfilled' ? organize.value.items ?? [] : undefined,
        scraping: scraping.status === 'fulfilled' ? scraping.value.status : undefined,
        strm: strm.status === 'fulfilled' ? strm.value.status : undefined,
      });
      setErrors([downloads, organize, scraping, strm].flatMap((result, index) =>
        result.status === 'rejected' ? [['下载记录', '整理记录', '刮削状态', 'STRM 状态'][index] + '读取失败。' + requestError(result.reason)] : []));
      setLoading(false);
    });
    return () => controller.abort();
  }, [api, revision]);

  const downloads = data.downloads?.filter(task => task.state === 'completed')
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  const organized = data.items?.filter(item => item.organized > 0)
    .sort((a, b) => (b.lastActivityAt || b.createdAt).localeCompare(a.lastActivityAt || a.createdAt));
  const didScrape = Boolean(data.scraping?.finishedAt || data.scraping?.startedAt);
  return <section className="local-overview">
    <PageHeading title="系统本地概览" description="查看下载、整理和元数据处理进度。"
      action={<Button variant="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>
        <RefreshCw size={16} aria-hidden="true" />{loading ? '正在刷新…' : '刷新概览'}
      </Button>} />
    {errors.map(error => <p key={error} role="alert">{error}</p>)}
    <div className="metrics">
      <MetricCard compact label="完成下载" value={downloads?.length} suffix=" 项" context="近期下载任务" />
      <MetricCard compact label="已整理" value={organized?.reduce((count, item) => count + item.organized, 0)} suffix=" 个" context="已整理的媒体文件" />
      <MetricCard compact label="最近刮削成功" value={didScrape ? data.scraping?.completed : undefined} suffix=" 个" context={formatTime(data.scraping?.finishedAt || data.scraping?.startedAt) || '刮削任务'} />
    </div>
    <div className="section overview-columns">
      <section className="panel stack">
        <SectionHeading title="最近下载" />
        {downloads?.length ? <ul className="overview-activity">
          {downloads.slice(0, 6).map(task => {
            const title = task.references?.find(ref => ref.media?.title)?.media.title || task.artifacts?.[0]?.name || '下载任务 ' + task.id.slice(0, 8);
            return <li key={task.id}><Download size={17} aria-hidden="true" /><div><strong title={title}>{title}</strong>
              <small>{formatTime(task.updatedAt || task.createdAt)}</small></div><Status tone="success">已完成</Status></li>;
          })}
        </ul> : <p className="muted">{loading ? '正在读取下载记录…' : downloads ? '暂无已完成的下载' : '下载记录暂不可用'}</p>}
      </section>
      <section className="panel stack">
        <SectionHeading title="最近整理" />
        {organized?.length ? <ul className="overview-activity">
          {organized.slice(0, 6).map(item => <li key={item.id}><Clapperboard size={17} aria-hidden="true" /><div>
            <strong title={item.media.title}>{item.media.title}</strong>
            <small>{[item.media.season ? '第 ' + item.media.season + ' 季' : '', formatTime(item.lastActivityAt || item.createdAt)].filter(Boolean).join(' · ')}</small>
          </div><span className="muted">{item.organized} 个文件</span></li>)}
        </ul> : <p className="muted">{loading ? '正在读取整理记录…' : organized ? '暂无已整理的媒体' : '整理记录暂不可用'}</p>}
      </section>
    </div>
    <div className="section overview-columns">
      <JobCard title="元数据刮削" status={data.scraping} />
      <JobCard title="STRM 生成" status={data.strm} />
    </div>
  </section>;
}
