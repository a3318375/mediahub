export type MediaSource = "tmdb" | "douban" | "bangumi" | "anilist" | "emby";

export type MediaType = "movie" | "tv" | "anime" | "documentary" | "person";

export type MediaIdentity = {
  provider: MediaSource;
  providerId: string;
  mediaId: string;
  source: MediaSource;
  sourceId: string;
  mediaType: MediaType;
};

export type ProviderRating = {
  source: MediaSource | "tomatoes" | "popcorn";
  value: number;
  voteCount?: number;
};

export type MediaSummary = MediaIdentity & {
  title: string;
  titles?: {
    native?: string;
    english?: string;
    romaji?: string;
    synonyms?: string[];
  };
  originalTitle?: string;
  year?: number;
  releaseDate?: string;
  region?: string;
  overview?: string;
  genres: string[];
  originalLanguage?: string;
  originCountries?: string[];
  posterPath?: string | null;
  backdropPath?: string | null;
  ratings: ProviderRating[];
  /** UI-only presentation fields; never persist these in the metadata cache. */
  palette?: string;
  artwork?: string;
};

export type MediaDetail = MediaSummary & {
  ratingsMessage?: string;
  runtimeMinutes?: number;
  status?: string;
  tagline?: string;
  externalIds?: { imdb?: string; tmdb?: string };
  credits?: Array<{
    name: string;
    role: string;
    personId?: string;
    profilePath?: string | null;
  }>;
  seasons?: Array<{
    seasonNumber: number;
    episodeCount?: number;
    name?: string;
  }>;
};

export type MediaPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
  totalCapped: boolean;
  people: Array<{ name: string; role: string; personId?: string }>;
  message?: string;
  hasMore: boolean;
  source: MediaSource;
  fetchedAt: string;
  stale: boolean;
};

export type ProviderCapabilities = {
  source: MediaSource;
  label: string;
  mediaTypes: MediaType[];
  filters: {
    genre: string[];
    region: string[];
    year: { min: number; max: number } | null;
    month: boolean;
    season: string[];
    status: string[];
    sort: string[];
  };
  supportsSearch: boolean;
  supportsRanking: boolean;
  pageSizeMax: number;
  totalCap: number | null;
  available: boolean;
  unavailableReason?: string;
};

export type MediaProvidersResponse = { providers: ProviderCapabilities[] };

export type MediaDiscoverQuery = {
  source: MediaSource;
  mediaType: MediaType;
  genre?: string;
  region?: string;
  year?: number;
  month?: number;
  season?: string;
  status?: string;
  sort?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

export type CachePolicy = {
  detailTtlSeconds: number;
  discoveryTtlSeconds: number;
  staleWhileRevalidateSeconds: number;
  detailCacheKey: "metadata:provider:mediaType:providerId:locale";
  discoveryCacheKey: "discover:source:filters:page:locale";
  negativeCacheSeconds: number;
};
