export type TVDraft = {
  sources?: string[];
  source: "tg" | "pansou";
  tmdbId: string;
  title: string;
  season: number;
  enabled: boolean;
  channels: string[];
  match: string;
  exclude: string;
};

export type TV = TVDraft & {
	  rating?: number;
  id: string;
  poster: string;
  episodes: { season?: number; number: number; name: string; airDate: string }[];
  resources: {
    season?: number;
    source?: string;
    title: string;
    url: string;
    cloud: string;
    channel: string;
    episode: number;
    password?: string;
    size?: number;
    collectionEnd?: number;
  }[];
  lastCheckedAt: string;
  nextCheckAt: string;
  lastError: string;
  metadataError: string;
};

export type Resource = {
  cloud: string;
  url: string;
  password?: string;
  note?: string;
  source?: string;
};

export type Resources = {
  total: number;
  items: { title: string; links?: Resource[] }[];
  linksByCloud: Record<string, Resource[]>;
};
export function normalizeResources(data: Partial<Resources> | null | undefined): Resources {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('资源搜索返回了无效响应');
  const linksByCloud: Resources['linksByCloud'] = {};
  if (data.linksByCloud && typeof data.linksByCloud === 'object' && !Array.isArray(data.linksByCloud)) {
    for (const [cloud, links] of Object.entries(data.linksByCloud)) {
      if (Array.isArray(links)) linksByCloud[cloud] = links.filter(link => link && typeof link.url === 'string');
    }
  }
  return { total: Number.isFinite(data.total) ? data.total! : 0, items: Array.isArray(data.items) ? data.items : [], linksByCloud };
}
