export type Media = {
  id: string; title: string; original: string; year: number; genre: string; region: string;
  kind: '电影' | '剧集' | '动画'; poster: string; score: number; duration: string; summary: string; cast: string[]; backdrop?: string;
  detail?: {
    releaseDate?: string; status?: string; tagline?: string; imdb?: string; tmdbId?: string; ratingsMessage?: string;
    seasons?: { seasonNumber: number; name?: string; episodeCount?: number }[];
    ratings?: { source: string; value: number }[];
    credits?: { name: string; role: string; photo: string; personId?: string }[];
  };
};

export const options = (values: readonly string[]) => values.map(value => ({ label: value, value }));
export const includes = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());

export const dayKey = (date: Date) => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'),
].join('-');
export function beijingToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const part = (name: string) => Number(parts.find(entry => entry.type === name)?.value);
  return new Date(part('year'), part('month') - 1, part('day'), 12);
}
