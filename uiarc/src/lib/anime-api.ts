export type AnimeFeed = { label: string; url: string; offset: number };

export type AnimeDraft = {
  title: string;
  originalTitle: string;
  bangumiId: string;
  mikanId: string;
  source: "mikan" | "ani-bt" | "anime-garden" | "other";
  url: string;
  subgroup: string;
  season: number;
  offset: number;
  totalEpisodes: number;
  week: number;
  releaseDate: string;
  poster: string;
  description: string;
  rating: string;
  enabled: boolean;
  match: string[];
  exclude: string[];
  standby: AnimeFeed[];
};

export type SavedAnimeSubscription = AnimeDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
  latestEpisode: number;
  knownEpisodes: number[];
  completed: boolean;
  lastCheckedAt: string;
  lastError: string;
  lastMetadataAt: string;
  metadataError: string;
  resources: AnimeEntry[];
};

export type AnimeEntry = {
  contentLength?: number;
  title: string;
  url: string;
  publishedAt: string;
  episode: number | null;
  accepted: boolean;
  reason: string;
  fileName: string;
  feed: string;
};

export type AnimePreview = {
  items: AnimeEntry[];
  accepted: number;
  warnings: string[];
};

export type MikanItem = {
  id: string;
  title: string;
  poster: string;
  week: string;
};

export type GroupRegexItem = { label: string; regex: string };

export type MikanGroup = {
  groupRegex: { regexList: GroupRegexItem[][]; tags: string[] };
  label: string;
  url: string;
  bangumiId: string;
  items: AnimeEntry[];
};
export function emptyAnimeDraft(): AnimeDraft {
  return { title: '', originalTitle: '', bangumiId: '', mikanId: '', source: 'mikan', url: '', subgroup: '',
    season: 1, offset: 0, totalEpisodes: 0, week: 0, releaseDate: '', poster: '', description: '', rating: '',
    enabled: true, match: [], exclude: [], standby: [] };
}

export function animeResourceSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '大小未知';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes, unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${Number(size.toFixed(unit > 1 ? 1 : 0))} ${units[unit]}`;
}
