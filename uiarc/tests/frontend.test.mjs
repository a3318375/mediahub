import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { directoryIdFromInput, is115ShareURL } from '../src/lib/download-api.ts';
import { resourceSearchPlan, normalizeResourceChannel, safeResourceURL, readMediaSearchHistory, readResourceSearchHistory, saveMediaSearchHistory, saveResourceSearchHistory } from '../src/lib/resource-search.ts';
import { normalizeResources } from '../src/lib/media-service.ts';
import { mergeResourceResults } from '../src/lib/resource-workflow.ts';
import { currentAnimeSeason, animeSeasonOptions } from '../src/lib/anime-season.ts';

test('UIArc TypeScript dependency graph stays inside its frontend and dependencies', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const configFile = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const program = ts.createProgram(config.fileNames, config.options);
  for (const source of program.getSourceFiles()) {
    const relative = path.relative(root, source.fileName);
    assert.ok(!relative.startsWith('..'), `External source dependency: ${source.fileName}`);
  }
});

test('115 input rejects lookalike hosts, embedded credentials and root folders', () => {
  assert.equal(is115ShareURL('https://115cdn.com/s/abcd1234?password=1234'), true);
  for (const url of ['https://115.com.evil.test/s/abcd1234', 'https://user@115.com/s/abcd1234', 'javascript:alert(1)', 'https://115.com/s/…']) {
    assert.equal(is115ShareURL(url), false, url);
  }
  assert.equal(directoryIdFromInput('https://115.com/?cid=123456'), '123456');
  assert.equal(directoryIdFromInput(' 123456 '), '123456');
  for (const value of ['0', '000', '-1', 'https://115.com.evil.test/?cid=123']) assert.throws(() => directoryIdFromInput(value));
});

test('search history preserves media and resource searches with the same title', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  saveMediaSearchHistory(storage, { kind: 'media', keyword: 'Show', source: 'tmdb', at: 1 });
  const entry = { keyword: 'Show', source: 'all', mode: 'merge', channels: [], plugins: [], cloudTypes: ['115'], at: 2 };
  saveResourceSearchHistory(storage, entry);
  saveResourceSearchHistory(storage, { ...entry, at: 3 });
  assert.equal(readMediaSearchHistory(storage).length, 1);
  assert.equal(readResourceSearchHistory(storage).length, 1);
  assert.equal(readResourceSearchHistory(storage)[0].at, 3);
  data.set('mediahub-search-history', '{broken');
  assert.deepEqual(readResourceSearchHistory(storage), []);
});

test('slow search snapshots retain earlier results and refresh duplicate metadata', () => {
  const link = { cloud: '115', url: 'https://115.com/s/abcd1234', password: 'keep' };
  const earlier = normalizeResources({ linksByCloud: { '115': [link] }, items: [{ title: 'old', links: [link] }] });
  const later = normalizeResources({ linksByCloud: { '115': [{ cloud: '115', url: link.url, note: 'updated' }], magnet: [{ cloud: 'magnet', url: 'magnet:?xt=urn:btih:abc' }] }, items: [{ title: 'new', links: [link] }] });
  const merged = mergeResourceResults(earlier, later);
  assert.equal(merged.total, 2);
  assert.equal(merged.linksByCloud['115'][0].password, 'keep');
  assert.equal(merged.linksByCloud['115'][0].note, 'updated');
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].title, 'new');
  assert.throws(() => normalizeResources(null));
});

test('source plans and channel validation respect enabled sources', () => {
  const base = { channels: [], plugins: [], cloudTypes: [], customChannels: [], detectionEnabled: false };
  assert.equal(resourceSearchPlan(base).disabled, true);
  assert.equal(resourceSearchPlan({ ...base, channels: ['channel'] }).collect, false);
  assert.equal(resourceSearchPlan({ ...base, plugins: ['plugin'] }).firstSource, 'plugin');
  assert.equal(resourceSearchPlan({ ...base, channels: ['channel'], plugins: ['plugin'] }).warmup, true);
  assert.equal(normalizeResourceChannel('https://t.me/s/channel/'), 'channel');
  assert.equal(normalizeResourceChannel('https://t.me.evil.test/channel'), null);
  assert.equal(safeResourceURL('javascript:alert(1)'), undefined);
});

test('anime quarters use Beijing time across a UTC quarter boundary', () => {
  assert.equal(currentAnimeSeason(new Date('2026-03-31T16:00:00Z')), '2026 春');
  assert.equal(currentAnimeSeason(new Date('2026-03-31T15:59:59Z')), '2026 冬');
  const seasons = animeSeasonOptions('2026 春');
  assert.deepEqual(seasons.slice(0, 3), ['2026 春', '2026 冬', '2025 秋']);
  assert.equal(seasons.at(-1), '2000 冬');
});
