export function currentAnimeSeason(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric" }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return `${year} ${["冬", "春", "夏", "秋"][Math.floor((month - 1) / 3)]}`;
}
export function animeSeasonOptions(current = currentAnimeSeason()) {
  const [year, season] = current.split(" ");
  const quarters = ["冬", "春", "夏", "秋"];
  const latest = Number(year) * 4 + quarters.indexOf(season);
  return Array.from({ length: latest - 2000 * 4 + 1 }, (_, n) => {
    const value = latest - n;
    return `${Math.floor(value / 4)} ${quarters[value % 4]}`;
  });
}
