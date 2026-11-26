import type { ReactNode } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from './arc/button/button';
import { SearchField } from './arc/search-field/search-field';
import { PageHeading } from './ui';

export function ResourceSearchForm({ draft, onDraft, search, backLabel, onBack, children, maxLength }: {
  draft: string; onDraft: (value: string) => void; search: (value: string) => void;
  backLabel: string; onBack: () => void; children?: ReactNode; maxLength?: number;
}) {
  return <>
    <PageHeading title="搜索历史" description="搜索网盘分享和磁力资源。" action={
      <Button variant="secondary" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />{backLabel}</Button>
    } />
    <section className="panel stack resource-search-panel">
      <span className="resource-search-icon"><Search size={23} aria-hidden="true" /></span>
      <h2>搜索资源</h2>
      <form className="inline-form resource-search-form" onSubmit={event => { event.preventDefault(); if (draft.trim()) search(draft); }}>
        <SearchField label="资源关键词" value={draft} maxLength={maxLength} placeholder="输入电影、剧集或资源关键词"
          onValueChange={value => { if (value) onDraft(value); else search(''); }} />
        <Button type="submit" disabled={!draft.trim()}><Search size={16} aria-hidden="true" />搜索资源</Button>
      </form>
      {children}
    </section>
  </>;
}
