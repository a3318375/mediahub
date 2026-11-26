import type { Resource, Resources } from './media-service';

// Each response is a snapshot: keep earlier sources while taking newer metadata.
export function mergeResourceResults(previous: Resources, next: Resources): Resources {
  const linksByCloud: Resources['linksByCloud'] = {};
  const items = new Map<string, Resources['items'][number]>();
  for (const result of [previous, next]) {
    for (const [cloud, links] of Object.entries(result.linksByCloud)) {
      const distinct = new Map<string, Resource>();
      for (const link of [...(linksByCloud[cloud] ?? []), ...links]) {
        const url = link.url.trim();
        if (url) distinct.set(url, { ...distinct.get(url), ...link });
      }
      if (distinct.size) linksByCloud[cloud] = Array.from(distinct.values());
    }
    for (const item of result.items) {
      const urls = item.links?.map(link => link.url.trim()).sort();
      const key = urls?.length ? JSON.stringify(urls) : item.title.trim().toLowerCase();
      items.set(key, item);
    }
  }
  return { total: Object.values(linksByCloud).reduce((sum, links) => sum + links.length, 0), linksByCloud, items: Array.from(items.values()) };
}
