export type DownloadMediaContext = {
  type?: "movie" | "tv" | "anime" | "program";
  title?: string;
  year?: number;
  provider?: string;
  providerId?: string;
  bangumiId?: string;
  mikanId?: string;
  season?: number;
  episodes?: number[];
  originalEpisodes?: number[];
  offset?: number;
  subgroup?: string;
  ruleVersion?: string;
};

export type DownloadReference = {
  source: string;
  sourceId?: string;
  media: DownloadMediaContext;
};

export type DownloadFile = {
  id: string;
  parentId: string;
  name: string;
  size: number;
  sha1?: string;
  directory: boolean;
};

export type DownloadTask = {
  id: string;
  kind: "offline" | "share_transfer";
  state: string;
  resourceId: string;
  directoryId: string;
  remoteId?: string;
  progress: number;
  speed: number;
  size: number;
  error?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  references: DownloadReference[];
  artifacts: DownloadFile[];
};

export type DownloadRequest = {
  wholeShare?: boolean;
  kind: "offline" | "share_transfer";
  url: string;
  directoryId: string;
  reference: DownloadReference;
  receiveCode?: string;
  sourceDirectoryId?: string;
  fileIds?: string[];
};

export type AnimeDownloadRule = {
  enabled: boolean;
  directoryId: string;
  fromEpisode: number;
};

export type AnimeDownloadCandidate = {
  id: string;
  episode: number;
  title: string;
  state: string;
  taskId?: string;
  error?: string;
};
// UIArc input helpers. Requests are sent through createLiveApi.
export function is115ShareURL(value: string): boolean {
  try {
    const link = new URL(value.trim());
    return ['https:', 'http:'].includes(link.protocol) && !link.username && !link.password &&
      ['115.com', '115cdn.com', 'anxia.com'].includes(link.host) && /^\/s\/[a-z0-9]{4,64}$/i.test(link.pathname);
  } catch { return false; }
}

export function directoryIdFromInput(value: string): string {
  let id = value.trim();
  if (!/^\d{1,30}$/.test(id)) {
    try {
      const link = new URL(id);
      id = link.protocol === 'https:' && ['115.com', 'www.115.com'].includes(link.host) && !link.username && !link.password
        ? link.searchParams.get('cid') ?? '' : '';
    } catch { id = ''; }
  }
  if (/^\d{1,30}$/.test(id) && /[1-9]/.test(id)) return id;
  throw new Error('请填写具体文件夹的数字 ID，或包含 cid 的 115 文件夹链接。');
}

export function mediaContextFromRecord(record: {
  title: string; year?: number; provider?: string; providerId?: string; source?: string; sourceId?: string; mediaType?: string;
}): DownloadMediaContext {
  const { title, year, provider, source, providerId, sourceId, mediaType } = record;
  return { title, year, provider: provider ?? source, providerId: providerId ?? sourceId,
    type: mediaType === 'movie' || mediaType === 'tv' || mediaType === 'anime' ? mediaType : undefined };
}
