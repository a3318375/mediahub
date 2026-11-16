import type { DownloadMediaContext } from './download-api';

export type OrganizeMediaItem = {
  id: string;
  media: DownloadMediaContext;
  poster: string;
  createdAt: string;
  subscribed: boolean;
  downloaded: number;
  organized: number;
  pending: number;
  processing: number;
  lastActivityAt: string;
  active: boolean;
  strmCount: number | null;
  scrapedCount: number | null;
  incompleteScrapeCount: number | null;
};
