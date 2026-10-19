// Explicit opt-in UI preview. Never persists example books or scans files.
const titles = {
  comics: ["海风邮局 · 第一卷", "月球背面的旅人", "森林便利店", "雨夜侦探社 · 01", "星际列车", "小镇日记", "云端图书馆", "最后一个夏天", "山海来信"],
  novels: ["长夜灯塔", "时间的藏书室", "远山有回声", "第七封来信", "春日慢行", "银河拾荒者", "旧城新梦", "风从海上来"],
};
const state = {
  comics: { completedAt: "2026-10-19T02:00:00Z", running: false },
  novels: { completedAt: "2026-10-19T02:05:00Z", running: false },
};
export async function readingPreview(path: string, method: string) {
  const url = new URL(path, "http://localhost");
  const kind = url.pathname.includes("/comics") ? "comics" : "novels";
  const scan = state[kind];
  if (method === "POST") {
    scan.running = true;
    setTimeout(() => { scan.running = false; scan.completedAt = new Date().toISOString(); }, 1800);
    return { running: true };
  }
  if (url.pathname.endsWith("/status")) return { configured: true, error: "", found: titles[kind].length, ...scan };
  const formats = kind === "comics" ? ["CBZ", "CBR"] : ["EPUB", "TXT"];
  let items = titles[kind].map((title, i) => ({
    id: `${kind}-${i}`, title, kind, format: formats[i % 2],
    path: `${title}.${formats[i % 2].toLowerCase()}`,
    size: kind === "comics" ? (48 + i * 17) * 1048576 : (800 + i * 350) * 1024,
    modifiedAt: `2026-10-${String(18 - i).padStart(2, "0")}T08:00:00Z`,
    importedAt: "2026-10-19T02:00:00Z", available: i !== 7,
  }));
  const query = (url.searchParams.get("query") || "").toLowerCase();
  const format = url.searchParams.get("format");
  items = items.filter((item) => (!query || item.title.toLowerCase().includes(query) || item.path.toLowerCase().includes(query)) && (!format || item.format === format));
  if (url.searchParams.get("sort") === "title") items.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  return { items, total: items.length, page: 1, pageSize: 36 };
}
