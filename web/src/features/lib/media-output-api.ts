export type OutputKind = "strm" | "scraping";

export type OutputConfig = {sourceId: string; outputDir: string; baseUrl: string; cron: string};

export type OutputStatus = {state: string; startedAt: string; finishedAt: string; scanned: number; completed: number; skipped: number; failed: number; error?: string; issues: string[]};

export type OutputJob = {config: OutputConfig; status: OutputStatus; configured: boolean};
