import type { MediaSummary } from '@/lib/media-contract';
import type { LiveApi } from '../live-api';

function normalizedTitle(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function lookupResourceMedia(api: Pick<LiveApi, 'discover'>, keyword: string, signal: AbortSignal) {
  const input = keyword.trim();
  const dated = /^(.+?)\s*[（(]((?:19|20)\d{2})[)）]$/.exec(input);
  const title = dated ? dated[1].trim() : input;
  const year = dated?.[2];
  const expected = normalizedTitle(title);
  // Both searches use the discovery service's query cache. A partial response
  // cannot establish uniqueness across movies and TV.
  const pages = await Promise.all((['movie', 'tv'] as const).map(mediaType => {
    const params: Record<string, string> = { source: 'tmdb', mediaType, query: title, page: '1', pageSize: '20' };
    if (year) params.year = year;
    return api.discover(params, signal);
  }));
  const matches = new Map<string, MediaSummary>();
  for (const page of pages) {
    for (const item of page.items) {
      if (year && item.year !== Number(year)) continue;
      if (![item.title, item.originalTitle].some(name => name && normalizedTitle(name) === expected)) continue;
      matches.set(item.mediaId, item);
    }
  }
  const complete = pages.every(page =>
    !page.hasMore && !page.totalCapped && (page.total == null || page.items.length >= page.total));
  return { items: [...matches.values()], complete };
}
