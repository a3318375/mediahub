export const rankingSources = [
  { id: 'tmdb', label: 'TMDB', url: 'https://www.themoviedb.org/', charts: [
    { key: 'movie_day', label: '电影 · 今日趋势' },
    { key: 'tv_day', label: '剧集 · 今日趋势' },
    { key: 'movie_week', label: '电影 · 本周趋势' },
    { key: 'tv_week', label: '剧集 · 本周趋势' },
    { key: 'movie_popular', label: '热门电影' },
    { key: 'tv_popular', label: '热门剧集' },
    { key: 'movie_top', label: '高分电影' },
    { key: 'tv_top', label: '高分剧集' },
    { key: 'movie_now', label: '正在上映' },
    { key: 'movie_upcoming', label: '即将上映' },
    { key: 'tv_airing', label: '今日播出' },
    { key: 'tv_on_air', label: '近期播出' },
  ] },
  { id: 'douban', label: '豆瓣', url: 'https://movie.douban.com/', charts: [
    { key: 'movie_top250', label: '电影 Top 250' },
    { key: 'tv_hot', label: '热门剧集' },
  ] },
  { id: 'anilist', label: 'AniList', url: 'https://anilist.co/', charts: [
    { key: 'popularity', label: '人气动画' },
    { key: 'trending', label: '趋势动画' },
    { key: 'score', label: '高分动画' },
  ] },
  { id: 'bangumi', label: 'Bangumi', url: 'https://bgm.tv/', charts: [
    { key: 'rank', label: '动画排名' },
    { key: 'airing', label: '今日放送' },
  ] },
];

export const rankingRegions = [
  { value: 'US', label: '美国' }, { value: 'CN', label: '中国大陆' },
  { value: 'HK', label: '香港' }, { value: 'TW', label: '台湾' }, { value: 'JP', label: '日本' },
  { value: 'KR', label: '韩国' }, { value: 'GB', label: '英国' }, { value: 'CA', label: '加拿大' },
  { value: 'AU', label: '澳大利亚' }, { value: 'DE', label: '德国' }, { value: 'FR', label: '法国' },
  { value: 'IN', label: '印度' }, { value: 'SG', label: '新加坡' },
];

