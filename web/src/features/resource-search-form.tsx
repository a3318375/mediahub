import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { SearchHistoryEntry } from '@/lib/resource-search';
import { Button, SearchField } from './controls';
import { PageHeading } from './ui';

export function ResourceSearchForm({ draft, onDraft, search, backLabel, onBack }: {
  draft: string; onDraft: (value: string) => void; search: (value: string) => void;
  backLabel: string; onBack: () => void;
}) {
  return <>
    <PageHeading title="搜索历史" action={
      <Button variant="ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />{backLabel}</Button>
    } />
    <form role="search" aria-label="搜索网盘分享和磁力资源" className="inline-form resource-search-form"
      onSubmit={event => { event.preventDefault(); if (draft.trim()) search(draft); }}>
      <SearchField aria-label="资源关键词" value={draft} maxLength={120} placeholder="输入电影、剧集或资源关键词"
        onValueChange={value => { if (value) onDraft(value); else search(''); }} />
      <Button type="submit" disabled={!draft.trim()}>搜索资源</Button>
    </form>
  </>;
}

const providerNames: Record<string, string> = { tmdb: 'TMDB', anilist: 'AniList', bangumi: 'Bangumi', douban: '豆瓣' };

export function SearchHistory({ entries, searching, repeat, clear }: {
  entries: SearchHistoryEntry[]; searching: boolean; repeat: (keyword: string) => void; clear: () => void;
}) {
  if (!entries.length) return searching ? null : <p className="muted resource-history-empty">暂无搜索记录</p>;
  return <div className="resource-history">
    <details key={searching ? 'results' : 'idle'} open={!searching}>
      <summary><ChevronRight size={15} aria-hidden="true" />最近搜索 <small>{entries.length}</small></summary>
      <ol>{entries.map(item => {
        const fromMedia = item.kind === 'media';
        const content = <>
          <span className="history-keyword">{item.keyword}</span>
          <span className="history-source">{fromMedia ? ['影视探索', providerNames[item.source] ?? item.source].filter(Boolean).join(' · ') : '资源搜索'}</span>
          <span className="history-time">{new Date(item.at).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
          })}</span>
        </>;
        return <li key={`${item.kind ?? 'resource'}:${item.keyword}`}>{fromMedia ? <div className="history-row">{content}</div> :
          <button type="button" className="history-row" aria-label={'重新搜索资源 ' + item.keyword}
            onClick={() => repeat(item.keyword)}>{content}</button>}</li>;
      })}</ol>
    </details>
    <Button variant="ghost" size="sm" className="history-clear" onClick={clear}>清空历史</Button>
  </div>;
}
