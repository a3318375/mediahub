const quarters = ['冬', '春', '夏', '秋'];

export function currentAnimeSeason(date = new Date()): string {
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${fields.year} ${quarters[Math.floor((Number(fields.month) - 1) / 3)]}`;
}

export function animeSeasonOptions(current = currentAnimeSeason()): string[] {
  const [year, quarter] = current.split(' ');
  const last = Number(year) * 4 + quarters.indexOf(quarter);
  if (!Number.isInteger(last) || quarters.indexOf(quarter) < 0 || last < 8000) return [];
  return Array.from({ length: last - 8000 + 1 }, (_, offset) => {
    const index = last - offset;
    return `${Math.floor(index / 4)} ${quarters[index % 4]}`;
  });
}
