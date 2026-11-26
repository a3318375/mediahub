import { useEffect, useRef, useState } from 'react';
import { requestError, type LiveApi, type ResourceHealth } from './live-api';
import type { Resource } from './lib/media-service';
import { safeResourceURL } from '@/lib/resource-search';

export const resourceHealthKey = (link: Resource) => JSON.stringify([link.cloud, link.url, link.password ?? '']);

export function useResourceHealth(api: LiveApi, links: Resource[], enabled: boolean, notify: (message: string) => void) {
  const [health, setHealth] = useState<Record<string, ResourceHealth>>({});
  const [checking, setChecking] = useState('');
  const cache = useRef<Record<string, ResourceHealth>>({});
  const manual = useRef<AbortController | null>(null);
  const [previousApi,setPreviousApi]=useState(api);
  if (api !== previousApi) {
    setPreviousApi(api);
    setHealth({});
    setChecking('');
  }
  const serialized = JSON.stringify(links);
  useEffect(() => {
    cache.current = {};
    return () => { manual.current?.abort(); };
  }, [api]);

  function remember(batch: Resource[], results: ResourceHealth[]) {
    const updates: Record<string, ResourceHealth> = {};
    for (const link of batch) {
      const result = results.find(item => item.url === link.url && (!item.disk_type || item.disk_type === link.cloud));
      if (result) updates[resourceHealthKey(link)] = result;
    }
    Object.assign(cache.current, updates);
    setHealth(current => ({ ...current, ...updates }));
  }

  useEffect(() => {
    if (!enabled || !window.IntersectionObserver) return;
    const snapshot: Resource[] = JSON.parse(serialized);
    const controller = new AbortController();
    const queued = new Map<string, Resource>();
    const visited = new Set<string>();
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function drain() {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        while (queued.size && !controller.signal.aborted) {
          const batch = Array.from(queued.values()).slice(0, 6);
          batch.forEach(link => queued.delete(resourceHealthKey(link)));
          try {
            const response = await api.checkResources(batch, controller.signal);
            if (!controller.signal.aborted) remember(batch, response.results);
          } catch {
            if (!controller.signal.aborted) remember(batch, batch.map(link => ({
              url: link.url, disk_type: link.cloud, state: 'uncertain', summary: '检测失败，可手动重试', expires_at: Date.now() + 30_000,
            })));
          }
        }
      } finally { running = false; }
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link = snapshot[Number((entry.target as HTMLElement).dataset.resourceIndex)];
        if (!link || !safeResourceURL(link.url)) continue;
        const key = resourceHealthKey(link);
        if (visited.has(key) || (cache.current[key]?.expires_at ?? 0) > Date.now()) continue;
        visited.add(key);
        queued.set(key, link);
      }
      if (!running && queued.size) {
        clearTimeout(timer);
        timer = setTimeout(() => void drain(), 220);
      }
    });
    document.querySelectorAll('[data-resource-index]').forEach(element => observer.observe(element));
    return () => { controller.abort(); observer.disconnect(); clearTimeout(timer); };
  }, [api, enabled, serialized]);

  async function check(link: Resource) {
    manual.current?.abort();
    const controller = new AbortController();
    manual.current = controller;
    setChecking(link.url);
    try {
      const response = await api.checkResources([link], controller.signal);
      if (!controller.signal.aborted) remember([link], response.results);
    } catch (error) { if (!controller.signal.aborted) notify(requestError(error)); }
    finally { if (!controller.signal.aborted) setChecking(''); }
  }
  return { health, checking, check };
}
