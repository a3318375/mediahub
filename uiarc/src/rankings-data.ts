export const rankingSources = [
  { id: 'tmdb', label: 'TMDB', url: 'https://www.themoviedb.org/', charts: [
    { key: 'movie_day', label: '电影 · 今日趋势', ids: ['dune', 'batman', 'arrival', 'oppenheimer', 'everything'] },
    { key: 'tv_day', label: '剧集 · 今日趋势', ids: ['stranger', 'frieren', 'breaking'] },
    { key: 'movie_week', label: '电影 · 本周趋势', ids: ['oppenheimer', 'dune', 'spider', 'parasite', 'inception'] },
    { key: 'tv_week', label: '剧集 · 本周趋势', ids: ['breaking', 'stranger', 'frieren'] },
    { key: 'movie_popular', label: '热门电影', ids: ['dune', 'inception', 'spider', 'fury', 'darkknight', 'rings'] },
    { key: 'tv_popular', label: '热门剧集', ids: ['stranger', 'breaking', 'frieren'] },
    { key: 'movie_top', label: '高分电影', ids: ['interstellar', 'darkknight', 'parasite', 'spirited', 'inception'] },
    { key: 'tv_top', label: '高分剧集', ids: ['frieren', 'breaking', 'stranger'] },
    { key: 'movie_now', label: '正在上映', ids: ['dune', 'oppenheimer'] },
    { key: 'movie_upcoming', label: '即将上映', ids: ['arrival', 'spider'] },
    { key: 'tv_airing', label: '今日播出', ids: ['stranger'] },
    { key: 'tv_on_air', label: '近期播出', ids: ['frieren', 'stranger'] },
  ] },
  { id: 'douban', label: '豆瓣', url: 'https://movie.douban.com/', charts: [
    { key: 'movie_top250', label: '电影 Top 250', ids: ['spirited', 'interstellar', 'inception', 'coco', 'darkknight', 'matrix'] },
    { key: 'tv_hot', label: '热门剧集', ids: ['breaking', 'frieren', 'stranger'] },
  ] },
  { id: 'anilist', label: 'AniList', url: 'https://anilist.co/', charts: [
    { key: 'popularity', label: '人气动画', ids: ['yourname', 'frieren', 'spirited'] },
    { key: 'trending', label: '趋势动画', ids: ['frieren', 'yourname', 'spirited'] },
    { key: 'score', label: '高分动画', ids: ['frieren', 'spirited', 'yourname'] },
  ] },
  { id: 'bangumi', label: 'Bangumi', url: 'https://bgm.tv/', charts: [
    { key: 'rank', label: '动画排名', ids: ['frieren', 'spirited', 'yourname'] },
    { key: 'airing', label: '今日放送', ids: ['frieren'] },
  ] },
];

export const rankingRegions = [
  { value: 'US', label: '美国' }, { value: 'CN', label: '中国大陆' },
  { value: 'HK', label: '香港' }, { value: 'TW', label: '台湾' }, { value: 'JP', label: '日本' },
  { value: 'KR', label: '韩国' }, { value: 'GB', label: '英国' }, { value: 'CA', label: '加拿大' },
  { value: 'AU', label: '澳大利亚' }, { value: 'DE', label: '德国' }, { value: 'FR', label: '法国' },
  { value: 'IN', label: '印度' }, { value: 'SG', label: '新加坡' },
];

export const viewingOptions = ['订阅', '免费', '含广告', '租借', '购买'] as const;
type Offer = { id: string; kind: '电影' | '剧集'; regions: string[]; access: (typeof viewingOptions)[number][] };
const markets = rankingRegions.map(region => region.value).filter(region => region !== 'CN');
const west = ['US', 'GB', 'CA', 'AU', 'DE', 'FR'];
const asia = ['HK', 'TW', 'JP', 'KR', 'SG'];
const buyOrRent = ['租借', '购买'] as const;

export const platformCatalogs: { name: string; offers: Offer[] }[] = [
  { name: 'Netflix', offers: [
    { id: 'stranger', kind: '剧集', regions: markets, access: ['订阅'] },
    { id: 'breaking', kind: '剧集', regions: west, access: ['订阅'] },
    { id: 'frieren', kind: '剧集', regions: asia, access: ['订阅'] },
    { id: 'spirited', kind: '电影', regions: [...asia, 'GB', 'CA', 'AU'], access: ['订阅'] },
  ] },
  { name: 'Prime Video', offers: [
    { id: 'breaking', kind: '剧集', regions: west, access: ['购买'] },
    { id: 'dune', kind: '电影', regions: west, access: [...buyOrRent] },
    { id: 'arrival', kind: '电影', regions: [...west, 'JP'], access: ['订阅', ...buyOrRent] },
  ] },
  { name: 'Disney+', offers: [
    { id: 'coco', kind: '电影', regions: markets, access: ['订阅'] },
  ] },
  { name: 'Apple TV', offers: [
    { id: 'oppenheimer', kind: '电影', regions: markets, access: [...buyOrRent] },
    { id: 'interstellar', kind: '电影', regions: west, access: [...buyOrRent] },
    { id: 'stranger', kind: '剧集', regions: ['US'], access: ['购买'] },
  ] },
  { name: 'HBO Max', offers: [
    { id: 'batman', kind: '电影', regions: ['US', 'FR'], access: ['订阅'] },
    { id: 'dune', kind: '电影', regions: ['US', 'FR'], access: ['订阅'] },
  ] },
  { name: 'Crunchyroll', offers: [
    { id: 'frieren', kind: '剧集', regions: west, access: ['订阅', '含广告'] },
  ] },
  { name: 'Tubi', offers: [
    { id: 'fury', kind: '电影', regions: ['US', 'CA', 'AU'], access: ['免费', '含广告'] },
  ] },
  { name: '哔哩哔哩', offers: [
    { id: 'frieren', kind: '剧集', regions: ['CN'], access: ['免费', '订阅'] },
    { id: 'yourname', kind: '电影', regions: ['CN'], access: ['订阅'] },
  ] },
];
