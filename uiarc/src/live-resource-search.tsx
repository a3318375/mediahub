import { useEffect, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { cloudLabels } from '../../hero/src/lib/parity';
import {
  chooseSearchSource, readMediaSearchHistory, readResourceSearchHistory, saveResourceSearchHistory,
} from '../../hero/src/lib/resource-search';
import { Button } from './arc/button/button';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { requestError } from './live-api';
import type { LiveApi } from './live-api';
import { NoResults, PageHeading, SectionHeading } from './ui';

export function LiveResourceSearch({ api, initialQuery }: { api: LiveApi; initialQuery: string }) {
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [history, setHistory] = useState(() => readResourceSearchHistory(localStorage));
  const [mediaHistory] = useState(() => readMediaSearchHistory(localStorage));
  const [result, setResult] = useState<Awaited<ReturnType<LiveApi['searchResources']>>['data']>();
  const [revision, setRevision] = useState(0);
  const [cloud, setCloud] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(Boolean(initialQuery.trim()));

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([api.searchResources(query, signal), api.resourceMeta(signal).catch(() => undefined)]).then(([response, meta]) => {
      if (signal.aborted) return;
      setResult(response.data);
      const selection = meta?.data.selection;
      setHistory(saveResourceSearchHistory(localStorage, {
        keyword: query, source: chooseSearchSource(selection?.channels ?? [], selection?.plugins ?? []), mode: 'merge',
        cloudTypes: selection?.cloudTypes ?? [], channels: selection?.channels ?? [], plugins: selection?.plugins ?? [], at: Date.now(),
      }));
    }).catch(reason => {
      if (!signal.aborted) setError(requestError(reason));
    }).finally(() => { if (!signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [api, query, revision]);

  function search(value: string) {
    const keyword = value.trim();
    setDraft(value); setQuery(keyword); setCloud('all'); setResult(undefined); setError(''); setBusy(Boolean(keyword));
    setRevision(current => current + 1);
  }

  const merged = Object.values(result?.linksByCloud ?? {}).flat();
  const links = merged.length ? merged : result?.items?.flatMap(item => (item.links ?? []).map(link => ({ ...link, title: item.title }))) ?? [];
  const unique = [...new Map(links.filter(link => /^(https?:\/\/|magnet:\?)/i.test(link.url)).map(link => [link.url, link])).values()];
  const clouds = [...new Set(unique.map(link => link.cloud))].filter(Boolean);
  const rows = unique.filter(link => cloud === 'all' || cloud === link.cloud);
  return <>
    <PageHeading title="搜索历史" description="搜索网盘分享和磁力资源。" />
    <section className="panel stack resource-search-panel">
      <span className="resource-search-icon"><Search size={23} aria-hidden="true" /></span>
      <h2>搜索资源</h2>
      <form className="inline-form resource-search-form" onSubmit={event => { event.preventDefault(); if (draft.trim()) search(draft); }}>
        <SearchField label="资源关键词" value={draft} maxLength={120} placeholder="输入电影、剧集或资源关键词"
          onValueChange={value => { if (value) setDraft(value); else search(''); }} />
        <Button type="submit" disabled={!draft.trim()}><Search size={16} aria-hidden="true" />搜索资源</Button>
      </form>
      {!!history.length && <div className="row resource-search-recent"><span className="muted">最近搜索</span>
        {history.slice(0, 8).map(item => <Button key={item.keyword} variant="secondary" size="sm" onClick={() => search(item.keyword)}>{item.keyword}</Button>)}
      </div>}
    </section>
    <section className="section panel stack">
      <SectionHeading title="影视探索搜索记录" />
      {mediaHistory.length ? <ul className="resource-media-history">{mediaHistory.map(item => <li key={item.keyword + ':' + item.source}>
        <strong>{item.keyword}</strong><small className="muted">{item.source.toUpperCase()} · {new Date(item.at).toLocaleString('zh-CN', { hour12: false })}</small>
      </li>)}</ul> : <p className="muted">暂无搜索记录</p>}
    </section>
    <section className="section stack" aria-label="资源结果">
      {!query ? <NoResults title="等待搜索" description="输入关键词，或从作品卡片和详情页进入资源搜索。" />
        : busy ? <p role="status" className="muted">正在搜索「{query}」…</p>
        : error ? <div className="row"><p role="alert">{error}</p><Button variant="secondary" onClick={() => search(query)}>重试</Button></div>
        : result && <>
          <SectionHeading title="资源结果" description={`「${query}」 · ${unique.length} 条链接`}
            action={clouds.length > 1 && <Select label="网盘来源" value={cloud}
              options={[{ value: 'all', label: '全部来源' }, ...clouds.map(value => ({ value, label: cloudLabels[value] ?? value }))]} onValueChange={setCloud} />} />
          {rows.length ? <div className="table-panel"><SortableDataTable rows={rows} rowKey="url" caption="资源搜索结果" columns={[
            { key: 'title', label: '资源名称', render: (_, row) => <span className="table-main"><strong>{row.title || row.note || query}</strong>{row.source && <small>{row.source}</small>}</span> },
            { key: 'cloud', label: '来源', render: (_, row) => cloudLabels[row.cloud] ?? row.cloud },
            { key: 'password', label: '提取码', render: (_, row) => row.password || '—' },
            { key: 'link', label: '操作', render: (_, row) => <a className="row catalog-source-link" href={row.url} target="_blank" rel="noopener noreferrer">打开资源<ArrowUpRight size={15} aria-hidden="true" /></a> },
          ]} /></div> : <NoResults title="没有找到资源" description="试试原名、其他译名或缩短关键词。" />}
        </>}
    </section>
  </>;
}
