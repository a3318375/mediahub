import dune from './posters/dune.jpg';
import interstellar from './posters/interstellar.jpg';
import blade from './posters/blade.jpg';
import oppenheimer from './posters/oppenheimer.jpg';
import batman from './posters/batman.jpg';
import arrival from './posters/arrival.jpg';
import breaking from './posters/breaking.jpg';
import stranger from './posters/stranger.jpg';
import spirited from './posters/spirited.jpg';
import yourname from './posters/yourname.jpg';
import inception from './posters/inception.jpg';
import matrix from './posters/matrix.jpg';
import parasite from './posters/parasite.jpg';
import rings from './posters/rings.jpg';
import coco from './posters/coco.jpg';
import spider from './posters/spider.jpg';
import fury from './posters/fury.jpg';
import darkknight from './posters/darkknight.jpg';
import everything from './posters/everything.jpg';
import frieren from './posters/frieren.jpg';
import duneWide from './posters/dune-wide.jpg';
import interstellarWide from './posters/interstellar-wide.jpg';
import bladeWide from './posters/blade-wide.jpg';
import strangerWide from './posters/stranger-wide.jpg';
import inceptionWide from './posters/inception-wide.jpg';
import matrixWide from './posters/matrix-wide.jpg';
import matthewPortrait from './posters/cast-matthew.jpg';
import annePortrait from './posters/cast-anne.jpg';
import jessicaPortrait from './posters/cast-jessica.jpg';

export type Media = {
  id: string; title: string; original: string; year: number; genre: string; region: string;
  kind: '电影' | '剧集' | '动画'; poster: string; score: number; duration: string; summary: string; cast: string[]; backdrop?: string;
  detail?: {
    releaseDate?: string; status?: string; tagline?: string; imdb?: string; ratingsMessage?: string;
    ratings?: { source: string; value: number }[];
    credits?: { name: string; role: string; photo: string; personId?: string }[];
  };
};

export const media: Media[] = [
  { id: 'dune', title: '沙丘：第二部', original: 'Dune: Part Two', year: 2024, genre: '科幻', region: '欧美', kind: '电影', poster: dune, score: 8.2, duration: '166 分钟', summary: '保罗与契妮并肩作战，在厄拉科斯的沙海中寻找属于自己的道路。', cast: ['提莫西·查拉梅', '赞达亚', '丽贝卡·弗格森'] },
  { id: 'interstellar', title: '星际穿越', original: 'Interstellar', year: 2014, genre: '科幻', region: '欧美', kind: '电影', poster: interstellar, score: 8.5, duration: '169 分钟', summary: '一支探险队穿越虫洞，为逐渐失去生机的地球寻找新的家园。', cast: ['马修·麦康纳', '安妮·海瑟薇', '杰西卡·查斯坦'] },
  { id: 'blade', title: '银翼杀手 2049', original: 'Blade Runner 2049', year: 2017, genre: '科幻', region: '欧美', kind: '电影', poster: blade, score: 7.6, duration: '164 分钟', summary: '一位银翼杀手发现被埋藏多年的秘密，循着线索寻找消失已久的前辈。', cast: ['瑞恩·高斯林', '哈里森·福特', '安娜·德·阿玛斯'] },
  { id: 'oppenheimer', title: '奥本海默', original: 'Oppenheimer', year: 2023, genre: '剧情', region: '英国', kind: '电影', poster: oppenheimer, score: 8.1, duration: '180 分钟', summary: '物理学家奥本海默带领团队完成一项改变世界的计划，并面对它带来的后果。', cast: ['基里安·墨菲', '艾米莉·布朗特', '马特·达蒙'] },
  { id: 'batman', title: '新蝙蝠侠', original: 'The Batman', year: 2022, genre: '动作', region: '欧美', kind: '电影', poster: batman, score: 7.7, duration: '176 分钟', summary: '连环案件将年轻的蝙蝠侠引向哥谭深处，城市的秘密逐渐显露。', cast: ['罗伯特·帕丁森', '佐伊·克罗维兹'] },
  { id: 'arrival', title: '降临', original: 'Arrival', year: 2016, genre: '科幻', region: '欧美', kind: '电影', poster: arrival, score: 7.6, duration: '116 分钟', summary: '语言学家路易丝受命与来访的外星生命交流，发现一种理解时间的方式。', cast: ['艾米·亚当斯', '杰瑞米·雷纳'] },
  { id: 'breaking', title: '绝命毒师', original: 'Breaking Bad', year: 2008, genre: '犯罪', region: '欧美', kind: '剧集', poster: breaking, score: 8.9, duration: '5 季', summary: '一位高中化学教师的诊断结果改变了他的生活，也影响了身边的每个人。', cast: ['布莱恩·科兰斯顿', '亚伦·保尔'] },
  { id: 'stranger', title: '怪奇物语', original: 'Stranger Things', year: 2016, genre: '悬疑', region: '欧美', kind: '剧集', poster: stranger, score: 8.6, duration: '剧集', summary: '小镇里一个男孩突然失踪，朋友们在寻找途中遇到一位有特殊能力的女孩。', cast: ['米莉·波比·布朗', '菲恩·伍法德'] },
  { id: 'spirited', title: '千与千寻', original: 'Spirited Away', year: 2001, genre: '奇幻', region: '日本', kind: '动画', poster: spirited, score: 8.5, duration: '125 分钟', summary: '千寻误入神灵的世界，为救出父母，在汤屋开始了陌生的工作。', cast: ['柊瑠美', '入野自由'] },
  { id: 'yourname', title: '你的名字。', original: 'Your Name.', year: 2016, genre: '爱情', region: '日本', kind: '动画', poster: yourname, score: 8.5, duration: '106 分钟', summary: '来自东京与乡间的两位少年在梦里交换身体，试图找到彼此。', cast: ['神木隆之介', '上白石萌音'] },
  { id: 'inception', title: '盗梦空间', original: 'Inception', year: 2010, genre: '科幻', region: '欧美', kind: '电影', poster: inception, score: 8.4, duration: '148 分钟', summary: '一支团队潜入层层梦境，试图在目标心里植入一个念头。', cast: ['莱昂纳多·迪卡普里奥', '渡边谦', '约瑟夫·高登-莱维特'] },
  { id: 'matrix', title: '黑客帝国', original: 'The Matrix', year: 1999, genre: '科幻', region: '欧美', kind: '电影', poster: matrix, score: 8.2, duration: '136 分钟', summary: '程序员尼奥循着陌生讯息醒来，发现熟悉的世界背后另有一套规则。', cast: ['基努·里维斯', '劳伦斯·菲什伯恩', '凯瑞-安·莫斯'] },
  { id: 'parasite', title: '寄生虫', original: 'Parasite', year: 2019, genre: '剧情', region: '韩国', kind: '电影', poster: parasite, score: 8.5, duration: '132 分钟', summary: '一家人接连进入富裕家庭工作，两家的日常由此纠缠在一起。', cast: ['宋康昊', '李善均', '崔宇植'] },
  { id: 'rings', title: '指环王：护戒使者', original: 'The Lord of the Rings: The Fellowship of the Ring', year: 2001, genre: '奇幻', region: '欧美', kind: '电影', poster: rings, score: 8.4, duration: '179 分钟', summary: '佛罗多带着至尊魔戒离开夏尔，与同伴踏上通往魔多的道路。', cast: ['伊利亚·伍德', '伊恩·麦克莱恩', '维果·莫腾森'] },
  { id: 'coco', title: '寻梦环游记', original: 'Coco', year: 2017, genre: '奇幻', region: '欧美', kind: '动画', poster: coco, score: 8.2, duration: '105 分钟', summary: '热爱音乐的米格走进亡灵世界，循着一首歌寻找家族的来处。', cast: ['安东尼·冈萨雷斯', '盖尔·加西亚·贝纳尔'] },
  { id: 'spider', title: '蜘蛛侠：纵横宇宙', original: 'Spider-Man: Across the Spider-Verse', year: 2023, genre: '冒险', region: '欧美', kind: '动画', poster: spider, score: 8.3, duration: '140 分钟', summary: '迈尔斯遇到来自不同宇宙的蜘蛛侠，并试着自己决定故事的走向。', cast: ['沙梅克·摩尔', '海莉·斯坦菲尔德', '奥斯卡·伊萨克'] },
  { id: 'fury', title: '疯狂的麦克斯：狂暴之路', original: 'Mad Max: Fury Road', year: 2015, genre: '动作', region: '欧美', kind: '电影', poster: fury, score: 7.6, duration: '121 分钟', summary: '弗瑞奥萨驾驶战车逃离堡垒，和麦克斯在荒原上寻找生路。', cast: ['查理兹·塞隆', '汤姆·哈迪', '尼古拉斯·霍尔特'] },
  { id: 'darkknight', title: '蝙蝠侠：黑暗骑士', original: 'The Dark Knight', year: 2008, genre: '动作', region: '欧美', kind: '电影', poster: darkknight, score: 8.5, duration: '152 分钟', summary: '小丑的出现打破了哥谭的平衡，蝙蝠侠和盟友不得不面对一连串抉择。', cast: ['克里斯蒂安·贝尔', '希斯·莱杰', '艾伦·艾克哈特'] },
  { id: 'everything', title: '瞬息全宇宙', original: 'Everything Everywhere All at Once', year: 2022, genre: '科幻', region: '欧美', kind: '电影', poster: everything, score: 7.8, duration: '140 分钟', summary: '一位洗衣店老板在报税途中发现了无数种可能的人生。', cast: ['杨紫琼', '许玮伦', '关继威'] },
  { id: 'frieren', title: '葬送的芙莉莲', original: '葬送のフリーレン', year: 2023, genre: '奇幻', region: '日本', kind: '动画', poster: frieren, score: 9.1, duration: '28 集', summary: '击败魔王多年后，精灵魔法使芙莉莲与新的同伴踏上旅程，试着理解曾并肩冒险的人们。', cast: ['种崎敦美', '市之濑加那', '小林千晃'] },
];

export const backdrops: Record<string, string> = {
  dune: duneWide, interstellar: interstellarWide, blade: bladeWide, stranger: strangerWide,
  inception: inceptionWide, matrix: matrixWide,
};
export const castProfiles: Partial<Record<string, Record<string, { photo: string; character: string }>>> = {
  interstellar: {
    '马修·麦康纳': { photo: matthewPortrait, character: '库珀' },
    '安妮·海瑟薇': { photo: annePortrait, character: '阿米莉亚·布兰德' },
    '杰西卡·查斯坦': { photo: jessicaPortrait, character: '墨菲·库珀' },
  },
};
export const workPath = (page: string, id: string) => page + '/work/' + encodeURIComponent(id);

export type AnimeSubscription = {
  mediaId?: string; rss?: string; bangumiId?: string; group?: string; exclude?: string;
  weekday?: number; start?: number; total?: number; knownEpisodes?: number[]; checkedAt?: string;
};
export type Subscription = { id: string; title: string; kind: '动漫' | '追剧' | '电影'; source: string; rule: string; active: boolean; auto: boolean; episode: string; season?: string; backup?: string; directory?: string; anime?: AnimeSubscription };
export type Task = { id: string; title: string; source: string; status: '下载中' | '已暂停' | '已完成' | '失败' | '排队中'; progress: number; directory: string; mode?: string; files?: string[] };
export type Log = { id: string; time: string; level: '信息' | '警告' | '错误'; source: string; message: string };
export type Resource = { id: string; title: string; provider: string; plugin: string; size: string; code?: string };
export type Playlist = { id: string; name: string; tracks: string[] };
export type ApiKey = { id: string; label: string; value: string };

export const resources: Resource[] = [
  { id: 'r1', title: '沙丘：第二部 · 2160p HDR', provider: '115 网盘', plugin: '精选片单', size: '38.2 GB', code: 'MH24' },
  { id: 'r2', title: '沙丘：第二部 · 1080p', provider: '夸克网盘', plugin: '影视资源', size: '8.4 GB', code: 'DK24' },
  { id: 'r3', title: '星际穿越 · 4K UHD', provider: '磁力链接', plugin: '演示索引', size: '42.1 GB' },
  { id: 'r4', title: '怪奇物语 · 第四季合集', provider: '115 网盘', plugin: '剧集索引', size: '27.6 GB', code: 'ST04' },
  { id: 'r5', title: '千与千寻 · 日语中字', provider: '夸克网盘', plugin: '动画资源', size: '5.8 GB' },
  { id: 'r6', title: '奥本海默 · 2160p', provider: '百度网盘', plugin: '影视资源', size: '46.0 GB', code: 'DEMO' },
  { id: 'r7', title: '绝命毒师 · 第五季', provider: '磁力链接', plugin: '演示索引', size: '22.0 GB' },
  { id: 'r8', title: '降临 · 蓝光原盘', provider: '115 网盘', plugin: '精选片单', size: '9.0 GB' },
];
const indexedTitles = resources.map(item => item.title);
resources.push(...media.filter(item => !indexedTitles.some(title => title.startsWith(`${item.title} ·`))).map(item => ({
  id: `preview-${item.id}`, title: `${item.title} · 1080p`, provider: '115 网盘', plugin: '演示索引', size: '示例',
})));

const initialSubscriptions: Subscription[] = [
  { id: 'a1', title: '千与千寻', kind: '动漫', source: 'Bangumi', rule: '日语中字 · 1080p', active: true, auto: false, episode: '正片', anime: { mediaId: 'spirited', total: 1, knownEpisodes: [1] } },
  { id: 'a2', title: '你的名字。', kind: '动漫', source: '自定义 RSS', rule: '简体字幕 · 1080p', active: true, auto: true, episode: '正片' },
  { id: 'a3', title: '葬送的芙莉莲', kind: '动漫', source: 'Mikan', rule: '简体字幕 · 1080p', active: true, auto: false, episode: '第 1 集', anime: { mediaId: 'frieren', group: '示例字幕组 A', weekday: 5, total: 28, knownEpisodes: [1, 2, 3, 4] } },
  { id: 's1', title: '怪奇物语', kind: '追剧', source: 'TMDB', rule: '第 5 季 · 1080p', active: true, auto: false, episode: '第 2 集' },
  { id: 's2', title: '绝命毒师', kind: '追剧', source: 'TMDB', rule: '第 5 季 · 1080p', active: false, auto: false, episode: '第 16 集' },
];

const initialTasks: Task[] = [
  { id: 'd1', title: '沙丘：第二部', source: '115 网盘', status: '下载中', progress: 72, directory: '电影 / 科幻' },
  { id: 'd2', title: '怪奇物语 · 第四季合集', source: '115 网盘', status: '已暂停', progress: 38, directory: '剧集' },
  { id: 'd3', title: '星际穿越', source: '磁力链接', status: '已完成', progress: 100, directory: '电影 / 科幻' },
  { id: 'd4', title: '千与千寻', source: '夸克网盘', status: '失败', progress: 0, directory: '动画' },
];

const initialLogs: Log[] = [
  { id: 'l1', time: '09:42:18', level: '信息', source: '媒体库', message: `示例媒体库已载入，共 ${media.length} 部作品。` },
  { id: 'l2', time: '09:41:32', level: '信息', source: '下载', message: '星际穿越已完成，归类至电影 / 科幻。' },
  { id: 'l3', time: '09:38:55', level: '警告', source: '订阅', message: '绝命毒师的自动追踪已暂停。' },
  { id: 'l4', time: '09:37:21', level: '错误', source: '下载', message: '千与千寻的示例资源暂不可用。' },
];

export const initialState = {
  subscriptions: initialSubscriptions,
  tasks: initialTasks,
  logs: initialLogs,
  history: [] as string[],
  favorites: [] as string[],
  settings: {} as Record<string, string | boolean>,
  apiKeys: [] as ApiKey[],
  playlists: [{ id: 'mix', name: '夜间放映', tracks: ['orbit', 'dawn'] }] as Playlist[],
  reading: {} as Record<string, number>,
  readingShelf: [] as string[],
};
export type DemoState = typeof initialState;
export type Update = (change: (current: DemoState) => DemoState) => void;
export type Notify = (message: string, source?: string, level?: Log['level']) => void;

export const options = (values: readonly string[]) => values.map(value => ({ label: value, value }));
export const includes = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());
export const uid = () => crypto.randomUUID();
export const dayKey = (date: Date) => [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
