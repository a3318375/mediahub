import type { ReactNode } from 'react';
import { ArrowUpRight, Film, Star } from 'lucide-react';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { EmptyState } from './arc/empty-state/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './arc/tabs/tabs';
import type { Media } from './model';

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function WorkspaceTabs({ label, items, value, onChange, appearance }: {
  label: string; items: { id: string; label: string; content: ReactNode }[]; value?: string; onChange?: (value: string) => void;
  appearance?: 'pill' | 'underline';
}) {
  return <Tabs value={value} defaultValue={items[0].id} onValueChange={onChange} className="workspace-tabs">
    <TabsList aria-label={label} appearance={appearance}>{items.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList>
    {items.map(item => <TabsContent key={item.id} value={item.id}>{item.content}</TabsContent>)}
  </Tabs>;
}

export function NoResults({ title = '没有找到作品', description = '试试更换关键词或清除筛选。', reset }: { title?: string; description?: string; reset?: () => void }) {
  return <EmptyState icon={<Film aria-hidden="true" />} title={title} description={description}
    action={reset && <Button variant="secondary" onClick={reset}>清除筛选</Button>} />;
}

export function MediaGrid({ items, onOpen, ranked = false }: { items: Media[]; onOpen: (item: Media) => void; ranked?: boolean }) {
  return <div className="media-grid">{items.map((item, index) => <button type="button" key={item.id} className="media-card" aria-label={`查看${item.title}详情`} onClick={() => onOpen(item)}>
    <span className="media-art">
      <img src={item.poster} alt="" loading="lazy" />
      {ranked && <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>}
      <span className="poster-score"><Star size={12} fill="currentColor" aria-hidden="true" />{item.score.toFixed(1)}</span>
      <span className="poster-open"><ArrowUpRight size={19} aria-hidden="true" /></span>
    </span>
    <span className="media-title">{item.title}</span>
    <span className="muted">{item.year} · {item.genre}</span>
  </button>)}</div>;
}

export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }) {
  return <Badge size="sm" dot tone={tone}>{children}</Badge>;
}
