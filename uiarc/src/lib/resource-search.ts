export type ResourceSearchHistoryEntry = {
  kind?: "resource";
  keyword: string;
  source: string;
  mode: string;
  cloudTypes: string[];
  plugins: string[];
  channels: string[];
  at: number;
};

export type MediaSearchHistoryEntry = {
  kind: "media";
  keyword: string;
  source: string;
  at: number;
};

type SearchHistoryEntry = ResourceSearchHistoryEntry | MediaSearchHistoryEntry;

export type ResourceSearchPreferences = {
  channels: string[];
  plugins: string[];
  cloudTypes: string[];
  customChannels: string[];
  detectionEnabled: boolean;
};

export type ResourceSearchMeta = {
  defaults: ResourceSearchPreferences;
  selection: ResourceSearchPreferences;
  channels: string[];
  plugins: { name: string }[];
  cloudTypes: string[];
};
// Preserve existing search history when switching between frontends.
export const RESOURCE_SEARCH_HISTORY_KEY = 'mediahub-search-history';
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

function readHistory(storage: Pick<Storage, 'getItem'>): SearchHistoryEntry[] {
  try {
    const entries: unknown = JSON.parse(storage.getItem(RESOURCE_SEARCH_HISTORY_KEY) ?? storage.getItem('media-center-search-history') ?? '[]');
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry): entry is SearchHistoryEntry => {
      if (!entry || typeof entry !== 'object' || typeof entry.keyword !== 'string' || !entry.keyword.trim() ||
        typeof entry.source !== 'string' || !Number.isFinite(entry.at)) return false;
      if (entry.kind === 'media') return true;
      return (entry.kind === undefined || entry.kind === 'resource') && typeof entry.mode === 'string' &&
        [entry.cloudTypes, entry.plugins, entry.channels].every(list => Array.isArray(list) && list.every(value => typeof value === 'string'));
    });
  } catch { return []; }
}

export function readResourceSearchHistory(storage: Pick<Storage, 'getItem'>): ResourceSearchHistoryEntry[] {
  return readHistory(storage).filter((entry): entry is ResourceSearchHistoryEntry => entry.kind !== 'media');
}
export function readMediaSearchHistory(storage: Pick<Storage, 'getItem'>): MediaSearchHistoryEntry[] {
  return readHistory(storage).filter((entry): entry is MediaSearchHistoryEntry => entry.kind === 'media');
}
function saveHistory(storage: HistoryStorage, entry: SearchHistoryEntry): SearchHistoryEntry[] {
  const next = [entry, ...readHistory(storage).filter(old => old.keyword !== entry.keyword || (old.kind === 'media') !== (entry.kind === 'media'))].slice(0, 20);
  try { storage.setItem(RESOURCE_SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch { /* Search works without storage. */ }
  return next;
}
export function saveResourceSearchHistory(storage: HistoryStorage, entry: ResourceSearchHistoryEntry): ResourceSearchHistoryEntry[] {
  return saveHistory(storage, { ...entry, kind: 'resource' }).filter((item): item is ResourceSearchHistoryEntry => item.kind !== 'media');
}
export function saveMediaSearchHistory(storage: HistoryStorage, entry: MediaSearchHistoryEntry): MediaSearchHistoryEntry[] {
  return saveHistory(storage, entry).filter((item): item is MediaSearchHistoryEntry => item.kind === 'media');
}

export function resourceSearchPlan(selection: ResourceSearchPreferences) {
  const channels = selection.channels.length > 0, plugins = selection.plugins.length > 0;
  return { firstSource: channels ? 'tg' : plugins ? 'plugin' : 'all',
    fullSource: channels && plugins ? 'all' : channels ? 'tg' : plugins ? 'plugin' : 'all',
    warmup: channels && plugins, collect: plugins, disabled: !channels && !plugins };
}
export function normalizeResourceChannel(input: string): string | null {
  let name = input.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(name)) {
    try {
      const link = new URL(name);
      if (link.host !== 't.me' || link.username || link.password) return null;
      name = link.pathname.replace(/^\/(?:s\/)?/, '').replace(/\/$/, '');
    } catch { return null; }
  }
  return /^[a-z0-9_]{1,24}$/i.test(name) ? name : null;
}
export function safeResourceURL(value: string): string | undefined {
  try { if (['https:', 'http:', 'magnet:', 'ed2k:'].includes(new URL(value).protocol)) return value; }
  catch { /* Reject malformed links. */ }
  return undefined;
}
