export type Song = { id: number; title: string; artist: string; album: string; duration: number; year: number; genre: string; art: string; lyric: string[] };
export const songs: Song[] = [
  { id: 1, title: "海风来信", artist: "林屿", album: "蓝色时刻", duration: 238, year: 2026, genre: "独立流行", art: "ocean", lyric: ["把远方折成一封信", "寄给窗边安静的你", "风翻过夏日的书页", "海在句尾轻轻停息"] },
  { id: 2, title: "晚班电车", artist: "陈末", album: "城市慢镜头", duration: 216, year: 2025, genre: "城市流行", art: "city", lyric: ["最后一班车穿过长街", "灯光把影子轻轻折叠", "今天的故事还没写完", "明天就在下一站见"] },
  { id: 3, title: "有光的地方", artist: "许知遥", album: "日光切片", duration: 254, year: 2026, genre: "民谣", art: "sun", lyric: ["沿着小路慢慢走", "把所有心事交给山丘", "有光的地方就有温柔", "和等你回家的路口"] },
  { id: 4, title: "雨落之前", artist: "林屿", album: "蓝色时刻", duration: 203, year: 2026, genre: "独立流行", art: "ocean", lyric: ["云在屋檐上停了一会", "你说雨来之前最美", "于是我记下此刻的风", "和没有说完的约会"] },
  { id: 5, title: "凌晨两点半", artist: "白噪音俱乐部", album: "夜航手记", duration: 287, year: 2025, genre: "电子", art: "night", lyric: ["城市缓缓闭上双眼", "留一盏灯陪我失眠", "星光是夜晚的回声", "等一个清晨的和弦"] },
  { id: 6, title: "山野之间", artist: "周远山", album: "向山而行", duration: 245, year: 2024, genre: "民谣", art: "hill", lyric: ["走过一片无名的山野", "听见树叶说起昨天", "风把答案藏进云里", "我把脚步交给时间"] },
  { id: 7, title: "慢一点喜欢", artist: "许知遥", album: "日光切片", duration: 225, year: 2026, genre: "民谣", art: "sun", lyric: ["让咖啡再慢一点冷却", "让黄昏再晚一点告别", "把喜欢留在小小日常", "一遍一遍轻声地念"] },
  { id: 8, title: "霓虹漫游", artist: "陈末", album: "城市慢镜头", duration: 231, year: 2025, genre: "城市流行", art: "city", lyric: ["路过亮起霓虹的橱窗", "晚风轻敲我的肩膀", "不用急着找到方向", "这座城正陪着我们游荡"] },
];
export const artists = [
  { name: "林屿", initial: "屿", art: "ocean", tag: "独立流行", bio: "用温柔的声线记录海边生活，把风、潮汐和日常写进旋律。" },
  { name: "陈末", initial: "末", art: "city", tag: "城市流行", bio: "收集城市里微小的声音，为每一个晚归的人写歌。" },
  { name: "许知遥", initial: "遥", art: "sun", tag: "民谣", bio: "一把木吉他，一些关于阳光与生活的小事。" },
  { name: "白噪音俱乐部", initial: "白", art: "night", tag: "电子", bio: "在合成器与鼓点之间，寻找夜晚的另一种温度。" },
  { name: "周远山", initial: "山", art: "hill", tag: "民谣", bio: "带着音乐走向山野，把路途里的风景唱给你听。" },
];
export const playlists = [
  { id: "slow", title: "把日子调成慢速", caption: "给不必赶路的午后", art: "sun", ids: [3, 7, 1, 6, 4], description: "让阳光穿过窗边，给自己留一段没有安排的时间。适合阅读、散步，或什么都不做的午后。" },
  { id: "night", title: "城市入夜以后", caption: "晚归路上的私人电台", art: "night", ids: [2, 5, 8, 4], description: "当街灯逐一亮起，戴上耳机，让旋律陪你走完今天的最后一段路。" },
  { id: "sea", title: "去海边的路上", caption: "让心情和海风一起出发", art: "ocean", ids: [1, 4, 8, 3], description: "不用等到假期才出发。打开音乐，把车窗外的风景想象成一片海。" },
  { id: "wild", title: "周末出逃计划", caption: "山野有风，自由有声", art: "hill", ids: [6, 3, 7, 1], description: "离开熟悉的街道，在山野之间重新听见自己的节奏。" },
];
export function musicTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
