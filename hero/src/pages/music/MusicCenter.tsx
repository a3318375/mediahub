import { useEffect, useState } from "react";
import { Button, Chip, Input } from "@heroui/react";
import { ArrowLeft, ArrowUpRight, Heart, Headphones, ListMusic, Music2, Pause, Play, Search, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { AppSlider } from "../../components/ui/AppControls";
import { FilterTabs } from "../../components/media/MediaUI";
import { artists, playlists, songs, musicTime, type Song } from "./music-demo";
import { MusicLibrary } from "./MusicLibrary";
import type { Session } from "../../lib/media-service";

type View = { kind: "song"; id: number } | { kind: "artist"; name: string } | { kind: "playlist"; id: string } | null;
function Artwork({ art, title, className = "" }: { art: string; title?: string; className?: string }) {
  return <div aria-hidden="true" className={`music-art music-art-${art} ${className}`}><span className="music-art-orbit" /><span className="music-art-horizon" /><span className="music-art-type">{title || "SIDE A"}</span><span className="music-art-label">MEDIAHUB / ORIGINAL DEMO</span></div>;
}
export function MusicCenter({ session }: { session: Session }) {
  return session.mode === "live" ? <section className="music-center" aria-label="音乐中心"><MusicLibrary session={session} /></section> : <DemoMusicCenter />;
}
function DemoMusicCenter() {
  const [tab, setTab] = useState("songs");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(null);
  const [likes, setLikes] = useState<number[]>([1, 3]);
  const [likedOnly, setLikedOnly] = useState(false);
  const [current, setCurrent] = useState(songs[0]);
  const [queue, setQueue] = useState(songs.map((s) => s.id));
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(65);
  const [showQueue, setShowQueue] = useState(false);
  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  function toggleLike(id: number) { setLikes((old) => old.includes(id) ? old.filter((n) => n !== id) : [...old, id]); }
  function play(song: Song, list = songs) { setCurrent(song); setQueue(list.map((s) => s.id)); setPosition(0); setPlaying(true); }
  function skip(direction: number) {
    const index = queue.indexOf(current.id);
    const next = songs.find((s) => s.id === queue[(index + direction + queue.length) % queue.length]);
    if (next) { setCurrent(next); setPosition(0); }
  }
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPosition((old) => Math.min(old + 1, current.duration)), 1000);
    return () => window.clearInterval(timer);
  }, [playing, current.id, current.duration]);
  useEffect(() => { if (position >= current.duration && playing) setPlaying(false); }, [position, current.duration, playing]);
  function renderSongs(list: Song[]) {
    return <div className="music-track-list">
      <div className="music-track-header"><span>#</span><span>歌曲 / 歌手</span><span>专辑</span><span>时长</span><span /></div>
      {list.map((song, i) => <div className={`music-track ${current.id === song.id && playing ? "is-playing" : ""}`} key={song.id}>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`模拟播放 ${song.title}`} onPress={() => play(song, list)}>{current.id === song.id && playing ? <Headphones size={15} /> : <><span className="music-track-number">{String(i + 1).padStart(2, "0")}</span><Play className="music-track-play" size={14} /></>}</Button>
        <div className="music-track-main"><Button variant="ghost" className="music-track-cover" aria-label={`查看歌曲 ${song.title}`} onPress={() => setView({kind:"song",id:song.id})}><Artwork art={song.art} /></Button><div><Button variant="ghost" className="music-text-link" onPress={() => setView({kind:"song",id:song.id})}>{song.title}</Button><Button variant="ghost" className="music-artist-link" onPress={() => setView({kind:"artist",name:song.artist})}>{song.artist}</Button></div></div>
        <span className="music-track-album">{song.album}</span><span className="music-track-duration">{musicTime(song.duration)}</span>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`${likes.includes(song.id) ? "取消收藏" : "收藏"} ${song.title}`} aria-pressed={likes.includes(song.id)} onPress={() => toggleLike(song.id)}><Heart size={16} fill={likes.includes(song.id) ? "currentColor" : "none"} className={likes.includes(song.id) ? "music-liked" : ""} /></Button>
      </div>)}
      {!list.length && <div className="music-empty"><Music2 size={28} /><p>没有找到歌曲</p><Button size="sm" variant="secondary" onPress={() => { setQuery(""); setLikedOnly(false); }}>查看全部歌曲</Button></div>}
    </div>;
  }
  const detailSong = view?.kind === "song" ? songs.find((s) => s.id === view.id) : undefined;
  const detailArtist = view?.kind === "artist" ? artists.find((a) => a.name === view.name) : undefined;
  const detailPlaylist = view?.kind === "playlist" ? playlists.find((p) => p.id === view.id) : undefined;
  const collection = detailArtist ? songs.filter((s) => s.artist === detailArtist.name) : detailPlaylist ? detailPlaylist.ids.map((id) => songs.find((s) => s.id === id)!) : [];
  const filteredSongs = songs.filter((s) => match(`${s.title} ${s.artist} ${s.album}`) && (!likedOnly || likes.includes(s.id)));
  return <section className="music-center" aria-label="音乐中心 Demo">
    <header className="music-page-heading"><div className="music-page-title"><h1>音乐中心</h1><Chip size="sm" variant="soft">DEMO</Chip></div><span>示例曲库 · 虚构歌手与作品 · 播放仅演示交互</span></header>
    {view ? <>
      <Button className="music-back" size="sm" variant="ghost" onPress={() => setView(null)}><ArrowLeft size={15} />返回{tab === "artists" ? "歌手" : tab === "playlists" ? "歌单" : "歌曲"}</Button>
      {detailSong ? <div className="music-song-detail">
        <div className="music-song-cover"><Artwork art={detailSong.art} title={detailSong.album} /><div className="music-detail-actions"><Button onPress={() => play(detailSong)}><Play size={16} />模拟播放</Button><Button variant="secondary" aria-pressed={likes.includes(detailSong.id)} onPress={() => toggleLike(detailSong.id)}><Heart size={16} fill={likes.includes(detailSong.id) ? "currentColor" : "none"} />{likes.includes(detailSong.id) ? "已收藏" : "收藏"}</Button></div></div>
        <div className="music-song-info"><span className="music-kicker">SONG / 歌曲详情</span><h2>{detailSong.title}</h2><Button variant="ghost" className="music-detail-artist" onPress={() => setView({kind:"artist",name:detailSong.artist})}>{detailSong.artist}<ArrowUpRight size={15} /></Button><div className="music-detail-chips"><Chip size="sm" variant="soft">{detailSong.genre}</Chip><span>{detailSong.year} · {musicTime(detailSong.duration)}</span></div><dl><div><dt>专辑</dt><dd>{detailSong.album}</dd></div><div><dt>词 / 曲</dt><dd>{detailSong.artist}</dd></div><div><dt>音源</dt><dd>Demo 示例，暂未接入音频</dd></div></dl><div className="music-lyrics"><h3>歌词片段 <small>原创示例文案</small></h3>{detailSong.lyric.map((line, n) => <p className={n === Math.floor(position / 15) % 4 && current.id === detailSong.id && playing ? "active" : ""} key={line}>{line}</p>)}</div></div>
      </div> : <>
        <div className="music-collection-hero"><Artwork art={detailArtist?.art || detailPlaylist!.art} title={detailArtist?.initial || detailPlaylist!.title} className={detailArtist ? "music-artist-round" : ""} /><div><span className="music-kicker">{detailArtist ? "ARTIST / 歌手" : "PLAYLIST / 精选歌单"}</span><h2>{detailArtist?.name || detailPlaylist?.title}</h2><p>{detailArtist?.bio || detailPlaylist?.description}</p><small>{collection.length} 首歌曲 · {detailArtist?.tag || `${Math.round(collection.reduce((n,s) => n+s.duration,0)/60)} 分钟`}</small><Button onPress={() => play(collection[0],collection)}><Play size={16} />模拟播放全部</Button></div></div>
        {renderSongs(collection)}
      </>}
    </> : <>
      <div className="music-feature"><Artwork art="ocean" title="蓝色时刻" /><div className="music-feature-copy"><span className="music-kicker">DAILY SOUNDTRACK / 今日聆听</span><h2>让旋律，<br />接住每一种心情。</h2><p>从一首歌开始，给日常留一点空白。</p><Button onPress={() => setView({kind:"playlist",id:"sea"})}>探索今日歌单<ArrowUpRight size={16} /></Button></div><div className="music-feature-aside"><Headphones size={23} /><span>你的私人音乐角落</span><small>{songs.length} 首歌曲 · {artists.length} 位歌手<br />{playlists.length} 张精选歌单</small></div></div>
      <div className="music-library-toolbar"><FilterTabs label="曲库" value={tab} onChange={(value) => { setTab(value); setQuery(""); }} options={[["songs","歌曲"],["artists","歌手"],["playlists","歌单"]]} /><div className="music-library-search"><Search size={16} /><Input aria-label="搜索音乐" placeholder={tab === "artists" ? "搜索歌手…" : tab === "playlists" ? "搜索歌单…" : "搜索歌曲、歌手、专辑…"} value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
      {tab === "songs" && <><div className="music-section-label"><span>{likedOnly ? "我喜欢的歌曲" : "全部歌曲"}<small>{filteredSongs.length} 首</small></span><Button size="sm" variant={likedOnly ? "secondary" : "ghost"} aria-pressed={likedOnly} onPress={() => setLikedOnly(!likedOnly)}><Heart size={14} />我喜欢 <small>{likes.length}</small></Button></div>{renderSongs(filteredSongs)}</>}
      {tab === "artists" && <div className="music-artists-grid">{artists.filter((a) => match(a.name)).map((artist) => <Button variant="ghost" className="music-artist-card" key={artist.name} onPress={() => setView({kind:"artist",name:artist.name})}><Artwork art={artist.art} title={artist.initial} className="music-artist-round" /><h3>{artist.name}</h3><p>{artist.tag} · {songs.filter((s) => s.artist === artist.name).length} 首歌曲</p></Button>)}{!artists.some((a) => match(a.name)) && <p className="music-empty">没有找到歌手，试试其他名字。</p>}</div>}
      {tab === "playlists" && <div className="music-playlists-grid">{playlists.filter((p) => match(p.title + p.caption)).map((list) => <Button variant="ghost" className="music-playlist-card" key={list.id} onPress={() => setView({kind:"playlist",id:list.id})}><Artwork art={list.art} title={list.title} /><span className="music-playlist-count"><ListMusic size={13} />{list.ids.length} 首</span><h3>{list.title}</h3><p>{list.caption}</p></Button>)}{!playlists.some((p) => match(p.title+p.caption)) && <p className="music-empty">没有找到歌单，试试其他关键词。</p>}</div>}
    </>}
    {showQueue && <div className="music-queue"><div><h3>演示播放队列 <small>{queue.length} 首</small></h3><Button size="sm" variant="ghost" onPress={() => setShowQueue(false)}>收起</Button></div>{queue.map((id) => { const s = songs.find((item) => item.id === id)!; return <Button variant="ghost" key={id} onPress={() => { setCurrent(s); setPosition(0); setPlaying(true); }} className={current.id === id ? "active" : ""}>{s.title}<span>{s.artist}</span><small>{musicTime(s.duration)}</small></Button>; })}</div>}
    <div className="music-player" aria-label="模拟音乐播放器"><div className="music-player-track"><Button variant="ghost" aria-label={`查看歌曲 ${current.title}`} onPress={() => setView({kind:"song",id:current.id})}><Artwork art={current.art} /></Button><div><Button variant="ghost" className="music-text-link" onPress={() => setView({kind:"song",id:current.id})}>{current.title}</Button><small>{current.artist} · 模拟播放，无音源</small></div><Button size="sm" isIconOnly variant="ghost" aria-label={`${likes.includes(current.id) ? "取消收藏" : "收藏"}当前歌曲`} onPress={() => toggleLike(current.id)}><Heart size={16} fill={likes.includes(current.id) ? "currentColor" : "none"} /></Button></div><div className="music-player-center"><div className="music-player-buttons"><Button isIconOnly size="sm" variant="ghost" aria-label="上一首" onPress={() => skip(-1)}><SkipBack size={17} /></Button><Button isIconOnly size="sm" aria-label={playing ? "暂停模拟播放" : "开始模拟播放"} onPress={() => { if(position>=current.duration) setPosition(0); setPlaying(!playing); }}>{playing ? <Pause size={17} /> : <Play size={17} />}</Button><Button isIconOnly size="sm" variant="ghost" aria-label="下一首" onPress={() => skip(1)}><SkipForward size={17} /></Button></div><div className="music-player-seek"><span>{musicTime(position)}</span><AppSlider label="播放进度" max={current.duration} value={position} onChange={setPosition} /><span>{musicTime(current.duration)}</span></div></div><div className="music-player-options"><Volume2 size={16} /><AppSlider label="模拟音量" value={volume} onChange={setVolume} /><Button isIconOnly size="sm" variant="ghost" aria-label="播放队列" aria-expanded={showQueue} onPress={() => setShowQueue(!showQueue)}><ListMusic size={19} /></Button></div></div>
  </section>;
}


