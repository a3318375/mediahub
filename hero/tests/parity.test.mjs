import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
}
const { navigationItems, settingsTabs, resolvePage, routePath } = await load(
  "../src/lib/parity.ts",
);

test("settings subroutes stay in settings across hash formats and reloads", () => {
  for (const [tab] of settingsTabs) {
    for (const prefix of ["", "/", "#/", "#"]) {
      const path = `${prefix}settings/${tab}`;
      assert.equal(resolvePage(path), "settings", path);
      assert.equal(routePath(path).split("/")[1], tab, path);
    }
  }
  assert.equal(resolvePage("#/processing/strm"), "processing");
});

test("anime season follows Shanghai quarter boundaries and offers only dated seasons", async () => {
  const { currentAnimeSeason, animeSeasonOptions } = await load("../src/lib/anime-season.ts");
  assert.equal(currentAnimeSeason(new Date("2026-09-30T15:59:59Z")), "2026 夏");
  assert.equal(currentAnimeSeason(new Date("2026-09-30T16:00:00Z")), "2026 秋");
  assert.equal(currentAnimeSeason(new Date("2026-12-31T16:00:00Z")), "2027 冬");
  const options = animeSeasonOptions("2026 秋");
  assert.equal(options[0], "2026 秋");
  assert.equal(options.at(-1), "2000 冬");
  assert.ok(options.every((value) => /^\d{4} [春夏秋冬]$/.test(value)));
});

test("HeroUI preserves legacy navigation and adds the local reading library", async () => {
  const original = await readFile(
    new URL(
      "../../web/src/layouts/media-shell/navigation-data.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const labels = [...original.matchAll(/\{ title: "([^"]+)", path:/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    navigationItems.filter(([id]) => !["reading", "music", "processing"].includes(id)).map(([, label]) => label),
    labels,
  );
  assert.equal(resolvePage("downloads"), "processing");
  assert.equal(resolvePage("organize"), "processing");
  assert.equal(resolvePage("tools/downloads"), "processing");
  assert.equal(resolvePage("tools/organize"), "processing");
  for (const tab of ["downloads", "organize", "strm", "scraping"]) {
    assert.equal(resolvePage(`processing/${tab}`), "processing");
  }
  assert.equal(resolvePage("discover/explore"), "discover");
  assert.equal(resolvePage("discover/calendar"), "calendar");
  assert.equal(resolvePage("subscriptions"), "calendar");
  assert.equal(resolvePage(""), "emby");
  assert.equal(resolvePage("reading"), "reading");
  assert.equal(resolvePage("music"), "music");
  assert.deepEqual(navigationItems.slice(-6, -1).map(([, label]) => label), ["追剧日历", "音乐中心", "漫文书库", "媒体处理", "日志中心"]);
  assert.deepEqual(navigationItems.find(([id]) => id === "reading"), ["reading", "漫文书库", "功能模块"]);
});

test("settings categories and order follow the customized shadcn settings", async () => {
  const original = await readFile(
    new URL("../../web/src/components/settings-page.tsx", import.meta.url),
    "utf8",
  );
  const tabs = original.slice(
    original.indexOf("const tabs:"),
    original.indexOf("const defaults:"),
  );
  const categories = [
    ...tabs.matchAll(/\{ value: "([^"]+)", label: "([^"]+)" \}/g),
  ].map((match) => [match[1], match[2]]);
  assert.deepEqual(settingsTabs.filter(([id])=>id!=="strm"&&id!=="scraping"), categories);
});

test("resource history stays compatible with original media searches and preserves both kinds", async () => {
  const {
    readResourceSearchHistory,
    readMediaSearchHistory,
    saveResourceSearchHistory,
    RESOURCE_SEARCH_HISTORY_KEY,
  } = await load("../src/lib/resource-search.ts");
  const entries = [
    { kind: "media", keyword: "沙丘", source: "tmdb", at: 1 },
    {
      keyword: "旧资源",
      source: "tg",
      mode: "all",
      cloudTypes: ["115"],
      plugins: [],
      channels: ["test"],
      at: 2,
    },
  ];
  const values = new Map([
    [RESOURCE_SEARCH_HISTORY_KEY, JSON.stringify(entries)],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readResourceSearchHistory(storage)[0].keyword, "旧资源");
  saveResourceSearchHistory(storage, {
    keyword: "沙丘",
    source: "all",
    mode: "default",
    cloudTypes: [],
    plugins: [],
    channels: [],
    at: 3,
  });
  assert.equal(readResourceSearchHistory(storage).length, 2);
  assert.equal(readMediaSearchHistory(storage)[0].keyword, "沙丘");
  saveResourceSearchHistory(storage, {
    keyword: "沙丘",
    source: "tg",
    mode: "default",
    cloudTypes: [],
    plugins: [],
    channels: [],
    at: 4,
  });
  assert.equal(readResourceSearchHistory(storage).length, 2);
  assert.equal(readResourceSearchHistory(storage)[0].source, "tg");
});
