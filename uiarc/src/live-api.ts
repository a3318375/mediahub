import type { MediaDetail, MediaPage, MediaProvidersResponse, MediaSummary } from '../../hero/src/lib/media-contract';
import type { AnimeDraft, AnimePreview, MikanGroup, MikanItem, SavedAnimeSubscription } from '../../hero/src/lib/anime-api';
import type { SettingsResponse, SettingsSection, SettingValue } from '../../hero/src/lib/settings-api';
import type { AnimeDownloadCandidate, AnimeDownloadRule, DownloadTask } from '../../hero/src/lib/download-api';
import type { APIKeyInfo } from '../../hero/src/lib/api-keys-api';
import type { OutputConfig, OutputJob, OutputKind } from '../../hero/src/lib/media-output-api';
import type { ResourceSearchMeta } from '../../hero/src/lib/resource-search';
import type { Resource, Resources } from '../../hero/src/lib/media-service';
import type { OrganizeMediaItem } from '../../hero/src/lib/organize-api';
import type { Media } from './model';

export type LiveUser = { account: string; name: string };
export type LiveSession = { accessToken: string; user: LiveUser };
export type Platform = { id: number; name: string; logo?: string };
export type ServerLog = { id: number; time: string; source: string; level: string; message: string };
export type LibraryPage<T> = { items: T[]; page: number; pageSize: number; total: number };
export type MusicSong = { id: string; title: string; artist: string; album: string; duration?: number };
export type ComicGallery = {
  id: string; token: string; site: string; title: string; japaneseTitle: string; cover: string;
  category: string; uploader: string; posted: string; language: string; rating: string; pages: number; tags?: Record<string, string[]>;
};
export type Comic = { id: string; title: string; path: string; format: string; size: number; modifiedAt: string; importedAt: string; available: boolean; metadata?: ComicGallery };
type ComicShelfStatus = { configured: boolean; running: boolean; error: string; directoryError: string; completedAt: string; found: number };
type ComicMetadataStatus = { running: boolean; total: number; done: number; updated: number; skipped: number; failed: number; error: string; completedAt: string };
type ComicCredentials = { configured: boolean; maskedCookie?: string };
export type MusicPlaylist = { id: string; name: string; songCount: number; entry?: MusicSong[] };
const comicShelfPath = '/api/v1/reading/comics';
const comicSourcePath = '/api/v1/comics/ehentai';
export const localComicPath = (id: string) => comicShelfPath + '/' + encodeURIComponent(id);
export const comicGalleryPath = ({ id, token }: ComicGallery) => `${comicSourcePath}/gallery/${encodeURIComponent(id)}/${encodeURIComponent(token)}`;
export const comicCoverPath = (url: string) => comicSourcePath + '/cover?' + new URLSearchParams({ url });
type ResourceSearchResult = Omit<Resources, 'linksByCloud'> & { linksByCloud?: Record<string, (Resource & { title?: string })[]> };
export type OrganizeConfig = { sourceId: string; targetId: string; cron: string; enabled: boolean; scheduleError?: string };
export type LiveMedia = Pick<MediaSummary, 'source' | 'sourceId' | 'mediaType'>;
export type EmbyLibrary = { id: string; title: string; url: string; count: number };
export type EmbyItem = { id: string; title: string; url: string; kind: string; year: number; rating: string };
export type EmbyResumeItem = EmbyItem & { progress: number; resumeLabel: string; remaining: string };
export type EmbyDashboardData = {
  warnings: string[];
  libraries: EmbyLibrary[];
  recentlyAdded: EmbyItem[];
  continueWatching: EmbyResumeItem[];
};

export function liveIdentity(id: string): LiveMedia | undefined {
  const [, source, mediaType, sourceId] = /^(tmdb|douban|bangumi|anilist|emby):(movie|tv|anime|documentary|person):(.+)$/.exec(id) ?? [];
  if (source && mediaType && sourceId) return { source, mediaType, sourceId } as LiveMedia;
}

function imageUrl(path?: string | null) {
  if (!path) return '';
  if (path.startsWith('/api/')) return path;
  if (/^https?:\/\//i.test(path)) {
    if (/^https?:\/\/img[1239]\.doubanio\.com\//i.test(path)) {
      return '/api/media/image?' + new URLSearchParams({ source: 'douban', url: path });
    }
    return path;
  }
  return path.startsWith('/') && !path.startsWith('//') ? 'https://image.tmdb.org/t/p/w780' + path : '';
}

export function presentLiveMedia(item: MediaDetail): Media {
  const rating = item.ratings?.find(value => value.source === item.source) ?? item.ratings?.[0];
  return {
    id: item.mediaId,
    title: item.title,
    original: item.originalTitle || item.titles?.native || '',
    year: item.year || 0,
    genre: item.genres?.join('、') || '',
    region: item.region || '',
    kind: item.mediaType === 'anime' ? '动画' : item.mediaType === 'tv' ? '剧集' : '电影',
    poster: imageUrl(item.posterPath),
    backdrop: imageUrl(item.backdropPath),
    score: rating?.value || 0,
    duration: item.runtimeMinutes ? item.runtimeMinutes + ' 分钟' : '',
    summary: item.overview || '',
    cast: [...new Set(item.credits?.map(credit => credit.name) ?? [])],
    detail: {
      releaseDate: item.releaseDate,
      status: item.status,
      tagline: item.tagline,
      imdb: item.externalIds?.imdb,
      ratings: item.ratings,
      ratingsMessage: item.ratingsMessage,
      credits: item.credits?.map(credit => ({ ...credit, photo: imageUrl(credit.profilePath) })),
    },
  };
}

const sessionKey = 'mediahub.uiarc.live-token';

export function readLiveToken() {
  try { return sessionStorage.getItem(sessionKey) ?? ''; }
  catch { return ''; }
}

export function saveLiveToken(token: string) {
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch { /* A blocked browser store still permits the current page session. */ }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request<T>(path: string, {
  token, method = 'GET', body, signal, authOrigin = false, image = false, timeoutMs = 30_000,
}: { token?: string; method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal; authOrigin?: boolean; image?: boolean; timeoutMs?: number } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(path, {
    method,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      // This UI is not the configured STRM playback origin.
      ...(authOrigin ? { 'X-MediaHub-Origin': 'null' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  if (response.ok && image) {
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('服务没有返回图片。');
    return blob as T;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.message || data?.error || '请求失败（' + response.status + '）');
  if (data === null) throw new Error('MediaHub 服务返回了无效响应。');
  return data as T;
}

export const loginLive = (account: string, password: string) =>
  request<LiveSession>('/api/auth/login', { method: 'POST', body: { account, password }, authOrigin: true });
export const readLiveUser = (token: string, signal: AbortSignal) =>
  request<LiveUser>('/api/auth/me', { token, signal, authOrigin: true });
export const readSetupStatus = (signal: AbortSignal) =>
  request<{ setupRequired: boolean }>('/api/auth/setup/status', { signal });
export const logoutLive = (token: string) =>
  request<void>('/api/auth/logout', { token, method: 'POST' });

export function requestError(error: unknown, fallback = '无法连接 MediaHub 服务。') {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'MediaHub 服务响应超时，请重试。';
  if (error instanceof TypeError) return fallback;
  return error instanceof Error ? error.message : fallback;
}

export function createLiveApi(token: string, onExpired: () => void) {
  async function call<T>(path: string, options: NonNullable<Parameters<typeof request<T>>[1]>) {
    try { return await request<T>(path, { ...options, token }); }
    catch (error) {
      if (!options.signal?.aborted && error instanceof ApiError && error.status === 401) onExpired();
      throw error;
    }
  }
  const get = <T>(path: string, signal: AbortSignal) => call<T>(path, { signal });
  return {
    image: (path: string, signal: AbortSignal) => call<Blob>(path, { signal, image: true }),
    embyDashboard: (signal: AbortSignal) => call<EmbyDashboardData>('/api/emby/dashboard', { signal, timeoutMs: 105_000 }),
    tvSubscriptions: (signal: AbortSignal) => get<{ enabled: boolean }[]>('/api/v1/subscriptions/tv', signal),
    downloadTasks: (signal: AbortSignal) => get<{ items: DownloadTask[] }>('/api/v1/downloads', signal),
    processingItems: (signal: AbortSignal) => get<{ items: OrganizeMediaItem[] }>('/api/v1/organize/items', signal),
    runProcessing: (mode: 'downloads' | 'organize' | OutputKind) => {
      const path = mode === 'downloads' || mode === 'organize' ? mode : 'processing/' + mode;
      return call<{ message: string }>('/api/v1/' + path + '/run', {
        method: 'POST', body: mode === 'strm' ? { baseUrl: window.location.origin } : undefined,
      });
    },
    providers: (signal: AbortSignal) => get<MediaProvidersResponse>('/api/media/providers', signal),
    discover: (query: Record<string, string>, signal: AbortSignal) =>
      get<MediaPage<MediaSummary>>('/api/media/discover?' + new URLSearchParams(query), signal),
    detail: ({ source, sourceId, mediaType }: LiveMedia, signal: AbortSignal) =>
      get<MediaDetail>('/api/media/' + source + '/' + encodeURIComponent(sourceId) + '?' + new URLSearchParams({ mediaType }), signal),
    ranking: async (source: string, name: string, signal: AbortSignal) => {
      const result = await get<{ rankings: { available: boolean; supported: boolean; message?: string; result?: MediaPage<MediaSummary> }[] }>(
        '/api/media/rankings?' + new URLSearchParams({ source, name }), signal);
      const chart = result.rankings[0];
      if (!chart?.available || !chart.supported) throw new Error(chart?.message || '当前榜单不可用。');
      return chart.result;
    },
    platforms: async (mediaType: string, region: string, signal: AbortSignal) => {
      const result = await get<{ items: Platform[] }>('/api/media/rankings/platforms?' + new URLSearchParams({ mediaType, region }), signal);
      return result.items;
    },
    logs: async (filters: Record<string, string>, signal: AbortSignal) => {
      const result = await get<{ items: ServerLog[] }>('/api/logs?' + new URLSearchParams(filters), signal);
      return result.items ?? [];
    },
    musicStatus: (signal: AbortSignal) => get<{ scanning: boolean; error: string }>('/api/v1/music/status', signal),
    musicCatalogue: (signal: AbortSignal) => get<{ songCount: number; albums: { id: string; name: string; artist: string; artistId: string; songCount: number }[]; artists: { id: string; name: string; albumCount: number }[] }>('/api/v1/music/catalogue', signal),
    musicSongs: (query: Record<string, string>, signal: AbortSignal) =>
      get<LibraryPage<MusicSong>>('/api/v1/music/songs?' + new URLSearchParams(query), signal),
    musicPlay: (id: string, signal: AbortSignal) =>
      call<{ url: string }>('/api/v1/music/songs/' + encodeURIComponent(id) + '/play', { method: 'POST', signal }),
    musicPlaylists: async (signal: AbortSignal) => (await get<{ playlists: { playlist: MusicPlaylist[] } }>('/api/v1/music/playlists', signal)).playlists.playlist,
    musicPlaylist: (id: string, signal: AbortSignal) => get<{ playlist: MusicPlaylist }>('/api/v1/music/playlists/' + encodeURIComponent(id), signal),
    saveMusicPlaylist: (body: { name: string; songIds: string[] } | { id: string; songIds: string[]; append: true }) =>
      call<{ playlist: MusicPlaylist }>('/api/v1/music/playlists', { method: 'POST', body }),
    comics: (query: Record<string, string>, signal: AbortSignal) =>
      get<LibraryPage<Comic>>(comicShelfPath + '?' + new URLSearchParams(query), signal),
    comicsStatus: (signal: AbortSignal) => get<ComicShelfStatus>(comicShelfPath + '/status', signal),
    comicMetadataStatus: (signal: AbortSignal) => get<ComicMetadataStatus>(comicShelfPath + '/metadata/status', signal),
    refreshComics: () => call<{ running: boolean }>(comicShelfPath + '/refresh', { method: 'POST' }),
    refreshComicMetadata: (mode: 'missing' | 'all') => call<{ running: boolean }>(comicShelfPath + '/metadata/refresh', { method: 'POST', body: { mode } }),
    deleteComic: (id: string) => call<{ deleted: boolean }>(localComicPath(id), { method: 'DELETE' }),
    comicBook: (id: string, signal: AbortSignal) => get<{ count: number }>(localComicPath(id) + '/book', signal),
    comicFavorites: (signal: AbortSignal) => get<{ items: ComicGallery[] }>(comicSourcePath + '/favorites', signal),
    comicGalleries: (query: Record<string, string>, signal: AbortSignal) => call<{ items: ComicGallery[]; next: string }>(comicSourcePath + '/search?' + new URLSearchParams(query), { signal, timeoutMs: 60_000 }),
    comicGallery: (gallery: ComicGallery, signal: AbortSignal) => call<ComicGallery>(comicGalleryPath(gallery) + '?' + new URLSearchParams({ site: gallery.site }), { signal, timeoutMs: 60_000 }),
    favoriteComic: (gallery: ComicGallery) => call<{ saved: boolean }>(comicGalleryPath(gallery) + '/favorite?' + new URLSearchParams({ site: gallery.site }), { method: 'POST', timeoutMs: 60_000 }),
    settings: (section: SettingsSection, signal: AbortSignal) => get<SettingsResponse>('/api/settings/' + section, signal),
    saveSettings: (section: SettingsSection, values: Record<string, SettingValue>) =>
      call<SettingsResponse>('/api/settings/' + section, { method: 'PUT', body: { values } }),
    revealSetting: (section: SettingsSection, key: string, signal: AbortSignal) =>
      call<{ value: string }>('/api/settings/' + section + '/secrets/reveal', { method: 'POST', body: { key }, signal }),
    libraryPath: (kind: 'comics' | 'novels', signal: AbortSignal) =>
      get<{ root: string; configured: boolean }>('/api/v1/reading/' + kind + '/status', signal),
    comicCredentials: (signal: AbortSignal) => get<ComicCredentials>('/api/v1/comics/ehentai/settings', signal),
    saveComicCredentials: (cookie: string) =>
      call<ComicCredentials>('/api/v1/comics/ehentai/settings', { method: 'PUT', body: { cookie } }),
    resourceMeta: (signal: AbortSignal) => get<{ data: ResourceSearchMeta }>('/api/v1/resources/meta', signal),
    searchResources: (query: string, signal: AbortSignal) =>
      call<{ data: ResourceSearchResult }>(
        '/api/v1/resources/search', { method: 'POST', body: { query, mode: 'merge' }, signal }),
    organizeConfig: (signal: AbortSignal) => get<OrganizeConfig>('/api/v1/organize/config', signal),
    saveOrganizeConfig: (body: Pick<OrganizeConfig, 'sourceId' | 'targetId' | 'cron'>) =>
      call<OrganizeConfig>('/api/v1/organize/config', { method: 'PUT', body }),
    outputConfig: (kind: OutputKind, signal: AbortSignal) => get<OutputJob>('/api/v1/processing/' + kind + '/config', signal),
    saveOutputConfig: (kind: OutputKind, body: OutputConfig) =>
      call<{ config: OutputConfig }>('/api/v1/processing/' + kind + '/config', { method: 'PUT', body }),
    // A rejected current password also returns 401 and leaves the session valid.
    updateAccount: (account: string, currentPassword: string) =>
      request<LiveUser>('/api/auth/account', { token, method: 'PATCH', body: { account, currentPassword } }),
    updatePassword: (newPassword: string, currentPassword: string) =>
      request<LiveSession>('/api/auth/password', { token, method: 'POST', body: { newPassword, currentPassword } }),
    apiKeys: async (signal: AbortSignal) => (await get<{ items: APIKeyInfo[] }>('/api/auth/api-keys', signal)).items,
    createKey: (name: string) => call<{ item: APIKeyInfo; key: string }>('/api/auth/api-keys', { method: 'POST', body: { name } }),
    revokeKey: (id: string) => call<void>('/api/auth/api-keys/' + encodeURIComponent(id), { method: 'DELETE' }),
    animeList: (signal: AbortSignal) => get<SavedAnimeSubscription[]>('/api/v1/subscriptions/anime', signal),
    animeCatalog: (source: Exclude<AnimeDraft['source'], 'other'>, query: string, season: string, signal: AbortSignal) => {
      const [year, quarter] = season.split(' ');
      const params = new URLSearchParams({
        query,
        ...(season ? source === 'mikan' ? { year, season: quarter } : { season } : {}),
      });
      return get<{ items: MikanItem[]; seasons: string[] }>('/api/v1/anime/sources/' + source + '/catalog?' + params, signal);
    },
    animeGroups: (source: Exclude<AnimeDraft['source'], 'other'>, id: string, signal: AbortSignal) =>
      get<MikanGroup[]>('/api/v1/anime/sources/' + source + '/' + encodeURIComponent(id) + '/groups', signal),
    animeResolve: (body: AnimeDraft, signal: AbortSignal) =>
      call<AnimeDraft>('/api/v1/subscriptions/anime/resolve', { signal, method: 'POST', body, timeoutMs: 35_000 }),
    animePreview: (body: AnimeDraft, signal: AbortSignal) =>
      call<AnimePreview>('/api/v1/subscriptions/anime/preview', { signal, method: 'POST', body, timeoutMs: 45_000 }),
    animeCreate: (body: AnimeDraft, signal: AbortSignal) =>
      call<SavedAnimeSubscription>('/api/v1/subscriptions/anime', { signal, method: 'POST', body, timeoutMs: 105_000 }),
    animeRefresh: (id: string, signal: AbortSignal) =>
      call<SavedAnimeSubscription>('/api/v1/subscriptions/anime/' + encodeURIComponent(id) + '/refresh', { signal, method: 'POST', timeoutMs: 105_000 }),
    animeEnable: (id: string, enabled: boolean, signal: AbortSignal) =>
      call<SavedAnimeSubscription>('/api/v1/subscriptions/anime/' + encodeURIComponent(id), { signal, method: 'PATCH', body: { enabled } }),
    animeDownloads: (id: string, signal: AbortSignal) =>
      get<{ rule: AnimeDownloadRule; items: AnimeDownloadCandidate[] }>('/api/v1/subscriptions/anime/' + encodeURIComponent(id) + '/downloads', signal),
    saveAnimeDownloads: (id: string, body: AnimeDownloadRule) =>
      call<AnimeDownloadRule>('/api/v1/subscriptions/anime/' + encodeURIComponent(id) + '/downloads', { method: 'PUT', body }),
    retryAnimeDownloads: (id: string) =>
      call<{ count: number }>('/api/v1/subscriptions/anime/' + encodeURIComponent(id) + '/downloads/retry', { method: 'POST' }),
  };
}

export type LiveApi = ReturnType<typeof createLiveApi>;
