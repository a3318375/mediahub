import assert from "node:assert/strict"
import test from "node:test"
import { lookupResourceMedia } from "../src/features/lib/resource-media.ts"
import type { MediaPage, MediaSummary } from "../src/lib/media-contract.ts"

function work(kind: "movie" | "tv", title: string, year: number): MediaSummary {
  const id = kind === "tv" ? "7" : "8"
  return {
    provider: "tmdb",
    source: "tmdb",
    sourceId: id,
    providerId: id,
    mediaId: `tmdb:${kind}:${id}`,
    mediaType: kind,
    title,
    year,
    genres: [],
    ratings: [],
  }
}
function page(items: MediaSummary[], hasMore = false): MediaPage<MediaSummary> {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalCapped: false,
    people: [],
    hasMore,
    source: "tmdb",
    fetchedAt: "",
    stale: false,
  }
}

test("直接搜索保留同名电影和剧集，带年份时仅保留该年作品", async () => {
  const titles = {
    movie: work("movie", "同名作品", 2020),
    tv: work("tv", "同名作品", 2024),
  }
  const calls: Record<string, string>[] = []
  const api = {
    discover: async (params: Record<string, string>) => {
      calls.push(params)
      return page([titles[params.mediaType as keyof typeof titles]])
    },
  }
  const signal = new AbortController().signal
  const ambiguous = await lookupResourceMedia(api, "同名作品", signal)
  assert.deepEqual(ambiguous.items.map((m) => m.mediaType).sort(), [
    "movie",
    "tv",
  ])
  assert.equal(ambiguous.complete, true)
  const exact = await lookupResourceMedia(api, "同名作品（2024）", signal)
  assert.deepEqual(exact.items, [titles.tv])
  assert.deepEqual(
    calls.slice(-2).map((p) => [p.source, p.query, p.year, p.mediaType]),
    [
      ["tmdb", "同名作品", "2024", "movie"],
      ["tmdb", "同名作品", "2024", "tv"],
    ]
  )
})

test("结果未翻完时，单个精确命中也不能自动确定转存分类", async () => {
  const match = work("tv", "同名作品", 2024)
  const related = work("movie", "同名作品外传", 2023)
  const result = await lookupResourceMedia(
    {
      discover: async (p) =>
        p.mediaType === "tv" ? page([match]) : page([related], true),
    },
    "同名作品",
    new AbortController().signal
  )
  assert.deepEqual(result.items, [match])
  assert.equal(result.complete, false)
})
