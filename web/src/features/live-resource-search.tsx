import {copyText} from '@/lib/clipboard';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from './controls';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Copy, Download, RefreshCw } from 'lucide-react';
import { is115ShareURL } from '@/lib/download-api';
import type { DownloadMediaContext, DownloadReference } from '@/lib/download-api';
import { resourceHealthKey, useResourceHealth } from './use-resource-health';
import { normalizeResources } from './lib/media-service';
import type { Resource, Resources } from './lib/media-service';
import { cloudLabels } from './lib/parity';
import {
  readSearchHistory, RESOURCE_SEARCH_HISTORY_KEY, resourceSearchPlan, safeResourceURL, saveSearchHistory,
} from '@/lib/resource-search';
import { mergeResourceResults } from './lib/resource-workflow';
import { ResourceSearchForm, SearchHistory } from './resource-search-form';
import { ResourceDownload } from './live-download';
import { requestError } from './live-api';
import type { LiveApi } from './live-api';
import { NoResults, SectionHeading } from './ui';

const healthLabels: Record<string, string> = { ok: '有效', bad: '失效', locked: '需要提取码', unsupported: '暂不支持', uncertain: '待确认' };
type SavedSearch = { query: string; result: Resources; cloud: string; media?: DownloadMediaContext };

export function LiveResourceSearch({ api, account, active, initialQuery, media, backLabel, onBack, notify }: {
  api: LiveApi; account: string; active: boolean; initialQuery: string; media?: DownloadMediaContext;
  backLabel: string; onBack: () => void; notify: (message: string) => void;
}) {
  const cacheKey = 'mediahub.shadcn.resource-result.' + account;
  const [restored] = useState(() => {
    if (initialQuery) return undefined;
    try {
      const saved: SavedSearch | null = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (saved && typeof saved.query === 'string' && Array.isArray(saved.result?.items)) return saved;
    } catch { /* Search works without browser storage. */ }
  });
  const originQuery = initialQuery.trim() || restored?.query || '';
  const originMedia = initialQuery ? media : restored?.media;
  const [draft, setDraft] = useState(originQuery);
  const [query, setQuery] = useState(originQuery);
  const [history, setHistory] = useState(() => readSearchHistory(localStorage));
  const [result, setResult] = useState<Resources | undefined>(restored?.result);
  const [revision, setRevision] = useState(0);
  const [cloud, setCloud] = useState(restored?.cloud ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(Boolean(initialQuery.trim()));
  const [collecting, setCollecting] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [offlineResource, setOfflineResource] = useState<Resource>();
  const [transferringUrl, setTransferringUrl] = useState('');
  const transferLock = useRef(false);
  const [context, setContext] = useState(originMedia);

  const [wasActive,setWasActive]=useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setHistory(readSearchHistory(localStorage));
    else setOfflineResource(undefined);
  }

  useEffect(() => {
    if (!query || (restored && revision === 0)) return;
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      const { data: { selection } } = await api.resourceMeta(signal);
      if (signal.aborted) return;
      setAutoDetect(selection.detectionEnabled);
      const plan = resourceSearchPlan(selection);
      if (plan.disabled) throw new Error('请在全局设置中选择 TG 频道或搜索插件。');
      const call = async (source: string) => normalizeResources((await api.searchResources(query, source, selection, signal)).data);
      if (plan.warmup) void call(plan.fullSource).catch(() => {});
      const first = await call(plan.firstSource);
      if (signal.aborted) return;
      setResult(first);
      setHistory(saveSearchHistory(localStorage, {
        keyword: query, source: plan.fullSource, mode: 'merge',
        cloudTypes: selection.cloudTypes, channels: selection.channels, plugins: selection.plugins, at: Date.now(),
      }));
      setBusy(false);
      if (!plan.collect) return;
      setCollecting(true);
      for (const delay of [2000, 3000, 3000]) {
        await new Promise<void>(resolve => {
          const abort = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
          signal.addEventListener('abort', abort, { once: true });
        });
        if (signal.aborted) return;
        try {
          const incoming = await call(plan.fullSource);
          if (signal.aborted) return;
          setResult(current => current ? mergeResourceResults(current, incoming) : incoming);
          setError('');
        } catch (reason) {
          if (!signal.aborted) setError(requestError(reason));
        }
      }
    }
    void load().catch(reason => {
      if (!signal.aborted) setError(requestError(reason));
    }).finally(() => { if (!signal.aborted) { setBusy(false); setCollecting(false); } });
    return () => controller.abort();
  }, [api, query, restored, revision]);

  function search(value: string) {
    const keyword = value.trim();
    if (keyword !== query) setContext(undefined);
    setDraft(value); setQuery(keyword); setCloud(''); setResult(undefined); setError(''); setBusy(Boolean(keyword)); setCollecting(false);
    try { sessionStorage.removeItem(cacheKey); } catch { /* Storage unavailable. */ }
    setRevision(current => current + 1);
  }

  const merged = Object.entries(result?.linksByCloud ?? {}).flatMap(([source, links]) => links.map(link => ({ ...link, cloud: link.cloud || source })));
  const links = merged.length ? merged : result?.items.flatMap(item => item.links ?? []) ?? [];
  const unique = [...new Map(links.filter(link => safeResourceURL(link.url)).map(link => [resourceHealthKey(link), link])).values()];
  const clouds = [...new Set(unique.map(link => link.cloud))];
  const selectedCloud = clouds.includes(cloud) ? cloud : clouds[0];
  const rows = unique.filter(link => selectedCloud === link.cloud);
  const { health, checking, check } = useResourceHealth(api, rows, active && autoDetect, notify);
  useEffect(() => {
    if (!result || !query) return;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ query, result, cloud: selectedCloud ?? '', media: context } satisfies SavedSearch));
    } catch { /* Large results can exceed browser storage. */ }
  }, [cacheKey, context, query, result, selectedCloud]);
  const titleFor = (link: Resource) => result?.items.find(item => item.links?.some(entry => entry.url === link.url))?.title || query;
  function referenceFor(): DownloadReference {
    if (context?.provider && context.providerId && context.type) {
      return { source: 'media_search', sourceId: `${context.provider}:${context.type}:${context.providerId}`, media: context };
    }
    return { source: 'media_search', media: { title: query } };
  }
  async function transferShare(link: Resource) {
    if (transferLock.current) return;
    transferLock.current = true;
    setTransferringUrl(link.url);
    try {
      const result = await api.createDownload({
        kind: 'share_transfer',
        url: link.url,
        wholeShare: true,
        receiveCode: link.password?.trim() ?? '',
        directoryId: '',
        reference: referenceFor(),
      });
      notify(result.created ? '已加入下载队列，完成后按设置自动整理。' : '此资源已在下载队列中。');
    } catch (reason) {
      notify(requestError(reason));
    } finally {
      transferLock.current = false;
      setTransferringUrl('');
    }
  }
  function clearHistory() {
    try { localStorage.setItem(RESOURCE_SEARCH_HISTORY_KEY, '[]'); }
    catch { notify('无法清除浏览器里的历史记录。'); return; }
    setHistory([]);
  }
  async function copy(value: string, label: string) {
    try { await copyText(value); notify(label + '已复制'); }
    catch { notify('复制失败，请手动复制' + label); }
  }
  return <>
    <ResourceSearchForm draft={draft} onDraft={setDraft} search={keyword => { setContext(undefined); search(keyword); }} backLabel={backLabel} onBack={onBack} />
    <SearchHistory entries={history} searching={Boolean(query)} clear={clearHistory}
      repeat={keyword => { setContext(undefined); search(keyword); }} />
    {query && <section className="section stack" aria-label="资源结果">
      {error && <div className="row"><p role="alert">{error}</p>{!result && <Button variant="secondary" onClick={() => search(query)}>重试</Button>}</div>}
      {busy ? <p role="status" className="muted">正在搜索「{query}」…</p>
        : result && <>
          <SectionHeading title="资源结果" description={`「${query}」 · ${unique.length} 条链接`}
            action={<Button variant="secondary" onClick={() => search(query)}><RefreshCw size={15} aria-hidden="true" />重新搜索</Button>} />
          {collecting && <p className="muted" role="status">正在收集插件结果…</p>}
          {rows.length ? <Tabs value={selectedCloud || 'unknown'} onValueChange={value => setCloud(value === 'unknown' ? '' : value)}>
            <TabsList aria-label="网盘来源" appearance="underline">{clouds.map(value => <TabsTrigger key={value} value={value || 'unknown'}>
              {cloudLabels[value] || value || '其他'} ({unique.filter(link => link.cloud === value).length})
            </TabsTrigger>)}</TabsList>
            <TabsContent value={selectedCloud || 'unknown'} forceMount>
              <div className="resource-results">{rows.map((link, index) => {
                const status = health[resourceHealthKey(link)];
                const magnet = /^magnet:\?/i.test(link.url);
                return <article className="resource-result" key={resourceHealthKey(link)} data-resource-index={index}>
                  <div className="resource-result-content">
                    <h3>{link.note || titleFor(link)}</h3>
                    {link.source && <small className="muted">{link.source}</small>}
                    {magnet ? <details className="resource-address"><summary>磁力链接</summary><span className="resource-link">{link.url}</span></details>
                      : <a className="catalog-source-link resource-link" href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}><span>{link.url}</span><ArrowUpRight size={14} aria-hidden="true" /></a>}
                    {link.password && <div className="row"><small>提取码 {link.password}</small>
                      <Button size="sm" variant="ghost" onClick={() => void copy(link.password!, '提取码')}>复制提取码</Button></div>}
                    {status && <small className="muted">链接检测 · {healthLabels[status.state] || status.state}{status.summary ? ' · ' + status.summary : ''}</small>}
                  </div>
                  <div className="row resource-result-actions">
                    <Button size="sm" variant="ghost" disabled={Boolean(checking)} onClick={() => void check(link)}>{checking === link.url ? '检测中…' : '检测链接'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => void copy(link.url + (link.password ? ' 提取码：' + link.password : ''), '链接')}><Copy size={14} aria-hidden="true" />复制链接</Button>
                    {(magnet || is115ShareURL(link.url)) && <Button size="sm" loading={transferringUrl === link.url}
                      disabled={!magnet && Boolean(transferringUrl) && transferringUrl !== link.url}
                      onClick={() => magnet ? setOfflineResource(link) : void transferShare(link)}>
                      <Download size={14} aria-hidden="true" />{magnet ? '115 离线下载' : '转存到 115'}
                    </Button>}
                  </div>
                </article>;
              })}</div>
            </TabsContent>
          </Tabs> : !collecting && <NoResults title="没有找到资源" description="试试原名、其他译名或缩短关键词。" />}
        </>}
    </section>}
    {offlineResource && <ResourceDownload api={api} close={() => setOfflineResource(undefined)} done={notify} resource={{
      ...offlineResource, title: offlineResource.note || titleFor(offlineResource), reference: referenceFor(),
    }} />}
  </>;
}
