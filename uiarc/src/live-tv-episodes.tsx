import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { TV, Resource, Resources } from './lib/media-service';
import type { DownloadReference } from './lib/download-api';
import { normalizeResources } from './lib/media-service';
import { safeResourceURL } from './lib/resource-search';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { LiveTVEditor } from './live-calendar';
import { ResourceDownload } from './live-download';
import { requestError, type LiveApi, type TVFiles } from './live-api';
import { SectionHeading, Status } from './ui';

const label = (season: number, episode: number) => `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
const jobLabels: Record<string, string> = { downloading: '正在获取新资源', deleting: '新文件已到位，清理旧文件', completed: '替换完成', failed: '替换失败' };
const reference = (item: TV, season: number, episode: number): DownloadReference => ({ source: 'tv_subscription', sourceId: item.id,
  media: { type: 'tv', title: item.title, provider: 'tmdb', providerId: item.tmdbId, season, episodes: [episode] } });

export function LiveTVEpisodes({ api, tmdbId, notify }: { api: LiveApi; tmdbId: string; notify: (message: string) => void }) {
  const [items, setItems] = useState<TV[]>([]);
  const [files, setFiles] = useState<Record<string, TVFiles>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [season, setSeason] = useState('all');
  const [limit, setLimit] = useState(50);
  const [edit, setEdit] = useState<TV>();
  const [busy, setBusy] = useState('');
  const [replace, setReplace] = useState<{ item: TV; season: number; episode: number }>();
  const [download, setDownload] = useState<{ item: TV; season: number; episode: number; resource: TV['resources'][number] }>();
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.tvSubscriptions(controller.signal).then(async all => {
      if (controller.signal.aborted) return;
      const matches = all.filter(item => item.tmdbId === tmdbId);
      setItems(matches);
      await Promise.all(matches.map(async item => {
        try {
          const state = await api.tvFiles(item.id, controller.signal);
          if (!controller.signal.aborted) { setFiles(current => ({ ...current, [item.id]: state })); setFileErrors(current => ({ ...current, [item.id]: '' })); }
        } catch (reason) { if (!controller.signal.aborted) { setFiles(current => { const next = { ...current }; delete next[item.id]; return next; }); setFileErrors(current => ({ ...current, [item.id]: requestError(reason) })); } }
      }));
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, tmdbId, revision]);
  const active = Object.values(files).some(state => state.replacements?.some(job => !['completed', 'failed'].includes(job.state)));
  useEffect(() => { if (!active) return; const timer = window.setInterval(() => setRevision(n => n + 1), 10_000); return () => clearInterval(timer); }, [active]);
  const rows = items.flatMap(item => item.episodes.map(ep => ({ item, ep, season: ep.season || item.season || 1 })))
    .sort((a, b) => a.season - b.season || a.ep.number - b.ep.number);
  const seasons = [...new Set(rows.map(row => row.season))];
  const visible = rows.filter(row => season === 'all' || row.season === Number(season));
  async function refresh(item: TV) {
    if (busy) return; setBusy(item.id); setError('');
    try { await api.refreshTV(item.id); setRevision(n => n + 1); }
    catch (reason) { setError(requestError(reason)); }
    finally { setBusy(''); }
  }
  return <section className="section panel stack tv-episode-section">
    <SectionHeading title="逐集资源与整理" description="更新状态依据订阅匹配结果；整理状态依据下载与整理记录。" action={
      <Button variant="secondary" disabled={loading} onClick={() => setRevision(n => n + 1)}><RefreshCw size={15} />刷新状态</Button>} />
    {error && <p role="alert">{error}</p>}
    {items.map(item => <div className="row tv-subscription-actions" key={item.id}>
      <span className="muted">{item.season ? `第 ${item.season} 季` : '全部季度'} · {item.enabled ? '追踪中' : '已暂停'}{item.lastCheckedAt && ` · 上次检查 ${new Date(item.lastCheckedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`}</span>
      <Button size="sm" variant="secondary" onClick={() => setEdit(item)}>编辑订阅规则</Button>
      <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => void refresh(item)}>{busy === item.id ? '正在等待搜索完成…' : '检查更新'}</Button>
      {(item.lastError || item.metadataError) && <p role="alert">{[item.lastError, item.metadataError].filter(Boolean).join('；')}</p>}
      {fileErrors[item.id] && <p role="alert">文件状态暂不可用：{fileErrors[item.id]}</p>}
    </div>)}
    {seasons.length > 1 && <Select label="季度" value={season} options={[{ value: 'all', label: '全部季度' }, ...seasons.map(n => ({ value: String(n), label: `第 ${n} 季` }))]}
      onValueChange={value => { setSeason(value); setLimit(50); }} />}
    {loading ? <p role="status">正在读取逐集状态…</p> : !rows.length ? <p className="muted">暂无集数信息，可检查更新以同步播出计划。</p> : <div className="tv-episode-list">
      <div className="tv-episode-header" aria-hidden="true"><span>季集</span><span>更新状态</span><span>匹配资源</span><span>整理状态</span><span>操作</span></div>
      {visible.slice(0, limit).map(({ item, ep, season: s }) => {
        const state = files[item.id];
        const episodeFiles = state?.files.filter(f => f.season === s && f.episode === ep.number) ?? [];
        const jobs = state?.replacements?.filter(j => j.season === s && j.episode === ep.number) ?? [];
        const job = jobs.at(-1);
        const matched = item.resources.filter(r => (r.season || item.season || 1) === s && (r.episode === ep.number || Boolean(r.collectionEnd && ep.number <= r.collectionEnd)));
        const resource = job?.state === 'completed' ? job.resource : matched.find(r => !r.collectionEnd) ?? matched[0];
        const updating = job && !['completed', 'failed'].includes(job.state);
        const organized = episodeFiles.some(f => f.organized);
        const pending = episodeFiles.some(f => !f.organized);
        const organizedLabel = !state ? '状态未知' : organized && pending ? '已整理 / 未整理' : organized ? '已整理' : pending ? '未整理' : '尚未下载';
        const url = resource && safeResourceURL(resource.url);
        return <article className="tv-episode-row" key={item.id + ':' + s + ':' + ep.number}>
          <div><strong>{label(s, ep.number)}</strong><small className="muted">{ep.name || '剧集名称待公布'}{ep.airDate && ` · ${ep.airDate}`}</small></div>
          <div><Status tone={resource ? 'success' : 'neutral'}>{resource ? '已更新' : '未更新'}</Status>{resource?.collectionEnd ? <small className="muted">合集声明更新至 {resource.collectionEnd} 集</small> : null}</div>
          <div className="tv-episode-resource">{resource ? <>
            <strong title={resource.title}>{resource.title}</strong>
            <small className="muted">{resource.cloud || '资源'}{resource.source ? ` · ${resource.source}` : ''}</small>
            {url && !url.startsWith('magnet:') && <a href={url} target="_blank" rel="noopener noreferrer">打开资源</a>}
          </> : <span className="muted">尚未匹配到资源</span>}</div>
          <div><Status tone={organized ? 'success' : 'neutral'}>{organizedLabel}</Status>
            {episodeFiles.map(f => <small className="muted tv-file-name" title={f.file.name} key={f.file.id}>{f.file.name}</small>)}
            {job && <small role="status">{jobLabels[job.state] ?? job.state}</small>}{job?.error && <small className="tv-job-error">{job.error}</small>}
          </div>
          <div className="tv-episode-actions">
            {resource && !episodeFiles.length && <Button size="sm" variant="ghost" onClick={() => setDownload({ item, season: s, episode: ep.number, resource })}>下载 / 转存</Button>}
            <Button size="sm" variant="secondary" disabled={!state || Boolean(updating) || job?.state === 'failed'} onClick={() => setReplace({ item, season: s, episode: ep.number })}>{updating ? '替换中…' : '替换资源'}</Button>
            {job?.state === 'failed' && <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => {
              setBusy(job.id); void api.retryTVReplacement(item.id, job.id).then(() => setRevision(n => n + 1)).catch(reason => setError(requestError(reason))).finally(() => setBusy(''));
            }}>重试替换</Button>}
          </div>
        </article>;
      })}
    </div>}
    {visible.length > limit && <Button variant="secondary" onClick={() => setLimit(n => n + 50)}>显示更多集数（剩余 {visible.length - limit} 集）</Button>}
    {edit && <LiveTVEditor api={api} value={edit} close={() => setEdit(undefined)} saved={() => { setEdit(undefined); setRevision(n => n + 1); notify('已保存订阅规则。'); }} />}
    {replace && <ReplacementSearch api={api} {...replace} close={() => setReplace(undefined)} done={message => { notify(message); setRevision(n => n + 1); }} />}
    {download && <ResourceDownload api={api} close={() => setDownload(undefined)} done={message => { notify(message); setRevision(n => n + 1); }}
      resource={{ ...download.resource, reference: reference(download.item, download.season, download.episode) }} />}
  </section>;
}

function ReplacementSearch({ api, item, season, episode, close, done }: {
  api: LiveApi; item: TV; season: number; episode: number; close: () => void; done: (message: string) => void;
}) {
  const [query, setQuery] = useState(item.title);
  const [submitted, setSubmitted] = useState(item.title);
  const [revision, setRevision] = useState(0);
  const [cloud, setCloud] = useState('115');
  const [resultLimit, setResultLimit] = useState(50);
  const [results, setResults] = useState<Resources>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Resource>();
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setResults(undefined); setError(''); setResultLimit(50);
    api.searchReplacementResources(submitted, controller.signal).then(response => {
      if (!controller.signal.aborted) { setResults(normalizeResources(response.data)); setError(response.warning); }
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [api, submitted, revision]);
  const links = results?.linksByCloud[cloud] ?? [];
  if (selected) return <ResourceDownload api={api} resource={{ title: selected.note || item.title, url: selected.url, password: selected.password, reference: reference(item, season, episode) }}
    close={() => setSelected(undefined)} done={message => { done(message); close(); }} replace={async request => {
      await api.replaceTV(item.id, { season, episode, resource: { title: selected.note || item.title, url: selected.url, password: selected.password }, download: request });
    }} />;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="wide-dialog" title={`替换 ${label(season, episode)}`} description={item.title}>
    <div className="stack">
      <form className="row tv-replacement-search" onSubmit={event => { event.preventDefault(); if (query.trim()) { setSubmitted(query.trim()); setRevision(n => n + 1); } }}>
        <SearchField label="PanSou 搜索" value={query} onValueChange={setQuery} placeholder="剧名、季集或版本关键词" />
        <Button type="submit" disabled={!query.trim()}><Search size={16} />搜索</Button>
      </form>
      <SegmentedControl label="网盘类型" value={cloud} onValueChange={value => { setCloud(value); setResultLimit(50); }} options={[
        { value: '115', label: `115 · ${results?.linksByCloud['115']?.length ?? 0}` },
        { value: 'quark', label: `夸克 · ${results?.linksByCloud.quark?.length ?? 0}` },
        { value: 'magnet', label: `磁力 · ${results?.linksByCloud.magnet?.length ?? 0}` },
      ]} />
      {cloud === 'quark' && <p className="muted">夸克仅展示搜索结果和数量，暂不支持转存或替换。</p>}
      {busy && <p role="status">正在等待各来源返回结果，慢来源可能需要约一分钟…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !links.length && <p className="muted">本轮未找到此类型的资源，可调整关键词重试。</p>}
      <ul className="anime-resources tv-replacement-results">{links.slice(0, resultLimit).map(link => {
        const url = safeResourceURL(link.url);
        return <li key={link.url} className="stack"><strong>{link.note || '未提供标题的资源'}</strong>
          <small className="muted">{link.source || cloud}</small><div className="row">
            {url && !url.startsWith('magnet:') && <a href={url} target="_blank" rel="noopener noreferrer">打开分享</a>}
            {cloud !== 'quark' && <Button size="sm" variant="secondary" onClick={() => setSelected(link)}>选择此资源</Button>}
          </div></li>;
      })}</ul>
      {links.length > resultLimit && <Button variant="secondary" onClick={() => setResultLimit(n => n + 50)}>显示更多资源（剩余 {links.length - resultLimit} 个）</Button>}
      <div className="row form-actions"><Button variant="ghost" onClick={close}>关闭</Button></div>
    </div>
  </DialogContent></Dialog>;
}
