import { getAccessToken } from "@/lib/auth-api"

export type DownloadMediaContext = {
  type?: "movie" | "tv" | "anime" | "program"
  title?: string
  year?: number
  provider?: string
  providerId?: string
  bangumiId?: string
  mikanId?: string
  season?: number
  episodes?: number[]
  originalEpisodes?: number[]
  offset?: number
  subgroup?: string
  ruleVersion?: string
}
export type DownloadReference = {
  source: string
  sourceId?: string
  media: DownloadMediaContext
}
export type DownloadFile = {
  id: string
  parentId: string
  name: string
  size: number
  sha1?: string
  directory: boolean
}
export type DownloadTask = {
  id: string
  kind: "offline" | "share_transfer"
  state: string
  resourceId: string
  directoryId: string
  remoteId?: string
  progress: number
  speed: number
  size: number
  error?: string
  errorCode?: string
  createdAt: string
  updatedAt: string
  lastCheckedAt?: string
  references: DownloadReference[]
  artifacts: DownloadFile[]
}
export type DownloadRequest = {
  wholeShare?: boolean
  kind: "offline" | "share_transfer"
  url: string
  directoryId: string
  reference: DownloadReference
  receiveCode?: string
  sourceDirectoryId?: string
  fileIds?: string[]
}

export type AnimeDownloadRule = {
  enabled: boolean
  directoryId: string
  fromEpisode: number
}
export type AnimeDownloadCandidate = {
  id: string
  episode: number
  title: string
  state: string
  taskId?: string
  error?: string
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const token = getAccessToken()
  const response = await fetch(`/api/v1/${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message ?? "下载服务请求失败")
  if (!result) throw new Error("下载服务返回了无效响应")
  return result as T
}
export const downloadApi = {
  directories: (parentId: string, signal?: AbortSignal) =>
    request<{ items: DownloadFile[] }>(
      `115/directories?parentId=${encodeURIComponent(parentId)}`,
      "GET",
      undefined,
      signal
    ),
  shareFiles: (
    url: string,
    receiveCode: string,
    directoryId: string,
    signal?: AbortSignal
  ) =>
    request<{ items: DownloadFile[] }>(
      "115/share/list",
      "POST",
      { url, receiveCode, directoryId },
      signal
    ),
  getAnime: (id: string, signal?: AbortSignal) =>
    request<{ rule: AnimeDownloadRule; items: AnimeDownloadCandidate[] }>(
      `subscriptions/anime/${encodeURIComponent(id)}/downloads`,
      "GET",
      undefined,
      signal
    ),
  saveAnime: (id: string, rule: AnimeDownloadRule) =>
    request<AnimeDownloadRule>(
      `subscriptions/anime/${encodeURIComponent(id)}/downloads`,
      "PUT",
      rule
    ),
  list: (signal?: AbortSignal) =>
    request<{ items: DownloadTask[]; limit: number }>(
      "downloads",
      "GET",
      undefined,
      signal
    ),
  create: (body: DownloadRequest) =>
    request<{ task: DownloadTask; created: boolean }>(
      "downloads",
      "POST",
      body
    ),
  cancel: (id: string) =>
    request<{ task: DownloadTask; message: string }>(
      `downloads/${encodeURIComponent(id)}/cancel`,
      "POST"
    ),
  retry: (id: string) =>
    request<DownloadTask>(`downloads/${encodeURIComponent(id)}/retry`, "POST"),
  resume: (id: string) =>
    request<DownloadTask>(`downloads/${encodeURIComponent(id)}/resume`, "POST"),
  retryAnime: (id: string) =>
    request<{ count: number }>(
      `subscriptions/anime/${encodeURIComponent(id)}/downloads/retry`,
      "POST"
    ),
}

export function is115ShareURL(raw: string): boolean {
  try {
    const url = new URL(raw.trim())
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["115.com", "115cdn.com", "anxia.com"].includes(url.host) &&
      /^\/s\/[A-Za-z0-9]{4,64}$/.test(url.pathname) &&
      !url.username && !url.password
    )
  } catch {
    return false
  }
}

export function mediaContextFromRecord(media: {
  title: string
  year?: number
  provider?: string
  source?: string
  providerId?: string
  sourceId?: string
  mediaType?: string
}): DownloadMediaContext {
  const type =
    media.mediaType === "movie" ||
    media.mediaType === "tv" ||
    media.mediaType === "anime"
      ? media.mediaType
      : undefined
  return {
    title: media.title,
    year: media.year,
    provider: media.provider ?? media.source,
    providerId: media.providerId ?? media.sourceId,
    type,
  }
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
