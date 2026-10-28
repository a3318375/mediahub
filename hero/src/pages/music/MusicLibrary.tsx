import { MusicPlaylists } from "./MusicPlaylists";
import { AddToPlaylist } from "./AddToPlaylist";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Checkbox, Chip, Input } from "@heroui/react";
import { ArrowLeft, ArrowUpRight, Heart, Headphones, ListMusic, Music2, Play, RefreshCw, Search } from "lucide-react";
import { Notice } from "../../components/ui/ManagementUI";
import { FilterTabs, errorText } from "../../components/media/MediaUI";
import { read, request, save, type Session } from "../../lib/media-service";
import { MusicPlayback, type PlayableSong as Song } from "./MusicPlayback";
import { MusicArtwork } from "./MusicArtwork";

type Status = { root: string; scanning: boolean; count: number; error: string; completedAt: string };
type Page = { items: Song[]; total: number; page: number; pageSize: number };
type Album = { id: string; name: string; artist: string; artistId: string; coverArt?: string; songCount: number; year?: number };
type Artist = { id: string; name: string; albumCount: number };
type Catalogue = { albums: Album[]; artists: Artist[]; songCount: number };
type View = { kind: "song"; song: Song } | { kind: "artist"; artist: Artist } | { kind: "album"; album: Album } | null;
const duration = (seconds?: number) => seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "—";

export function MusicLibrary({ session, showSongs = true }: { session: Session; showSongs?: boolean }) {
  const [checkedSongs, setCheckedSongs] = useState<string[]>([]);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<Page | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue>({ albums: [], artists: [], songCount: 0 });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [listError, setListError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<{ song: Song; revision: number } | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [tab, setTab] = useState("songs");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(null);
  const [likedOnly, setLikedOnly] = useState(false);
  const [favorites, setFavorites] = useState<Song[]>(() => {
    const stored = read<unknown>(`mediahub.music.likes.${session.name}`, []);
    return Array.isArray(stored) ? stored.filter((song): song is Song => !!song && typeof song.id === "string" && typeof song.title === "string") : [];
  });
  const [queue, setQueue] = useState<Song[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const rememberDuration = useCallback((id: string, seconds: number) => setDurations((old) => ({ ...old, [id]: seconds })), []);
  const previous = useRef<Status | null>(null);
  const refreshRequest = useRef<AbortController | null>(null);
  const artistId = view?.kind === "artist" ? view.artist.id : "";
  const albumId = view?.kind === "album" ? view.album.id : "";
  useEffect(() => () => { refreshRequest.current?.abort(); refreshRequest.current = null; }, [session]);
  useEffect(() => {
    if (session.mode !== "live") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<Status>("/api/v1/music/status", session, "GET", undefined, 30000, controller.signal);
        if (controller.signal.aborted) return;
        if (previous.current && previous.current.completedAt !== next.completedAt) setRevision((n) => n + 1);
        previous.current = next; setStatus(next); setStatusError("");
      } catch (e) { if (!controller.signal.aborted) setStatusError(errorText(e)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void poll(); }, 3000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [session]);
  useEffect(() => {
    if (!showSongs || session.mode !== "live") return;
    const controller = new AbortController();
    request<Catalogue>("/api/v1/music/catalogue", session, "GET", undefined, 30000, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setCatalogue(next); })
      .catch((e) => { if (!controller.signal.aborted) setListError(errorText(e)); });
    return () => controller.abort();
  }, [session, showSongs, revision]);
  useEffect(() => {
    if (!showSongs || session.mode !== "live") return;
    const controller = new AbortController();
    setLoading(true); setListError("");
    const params = new URLSearchParams({ page: String(page), query, artistId, albumId });
    request<Page>(`/api/v1/music/songs?${params}`, session, "GET", undefined, 30000, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        const last = Math.max(1, Math.ceil(next.total / next.pageSize));
        if (page > last) { setPage(last); return; }
        setResult(next);
      })
      .catch((e) => { if (!controller.signal.aborted) setListError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session, showSongs, page, revision, query, artistId, albumId]);

  async function refresh() {
    if (session.mode !== "live" || refreshRequest.current || status?.scanning) return;
    const controller = new AbortController(); refreshRequest.current = controller;
    setRefreshing(true); setRefreshError(""); setNotice("");
    try {
      const next = await request<{ count: number; completedAt: string }>("/api/v1/music/scan", session, "POST", undefined, 600000, controller.signal);
      if (controller.signal.aborted) return;
      setNotice(`刷新完成，共 ${next.count} 首歌曲。`);
      setStatus((old) => old ? { ...old, count: next.count, scanning: false, error: "", completedAt: next.completedAt } : old);
      setPage(1); setRevision((n) => n + 1);
    } catch (e) { if (!controller.signal.aborted) setRefreshError(`刷新失败：${errorText(e)}，原曲库保持不变。`); }
    finally {
      if (refreshRequest.current === controller) refreshRequest.current = null;
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }
  const busy = refreshing || Boolean(status?.scanning);
  const refreshButton = <Button size="sm" variant="secondary" isDisabled={session.mode !== "live" || busy} isPending={busy} onPress={refresh}><RefreshCw size={15} aria-hidden="true" className={busy ? "motion-safe:animate-spin" : ""} />{busy ? "刷新中…" : "刷新库"}</Button>;
  const feedback = <Notice error={refreshError || statusError || status?.error || listError}>{notice}</Notice>;
  if (!showSongs) return <Card className="management-card management-stack" aria-label="本地音乐库"><div className="music-page-heading"><h2>本地音乐库</h2>{refreshButton}</div><p className="media-note break-all">音乐目录：<code>{status?.root || "读取中…"}</code></p><p role="status">{status ? `${status.count} 首歌曲${busy ? " · 刷新中…" : ""}` : "正在读取曲库状态…"}{status?.completedAt && <> · 上次刷新：{new Date(status.completedAt).toLocaleString("zh-CN", { hour12: false })}</>}</p>{feedback}</Card>;

  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const items = likedOnly && !view ? favorites.filter((song) => matches(`${song.title} ${song.artist} ${song.album}`)) : result?.items || [];
  const displaySong = selected?.song || items[0];
  const hasLike = (song?: Song) => !!song && favorites.some((item) => item.id === song.id);
  function toggleLike(song: Song) {
    const next = hasLike(song) ? favorites.filter((item) => item.id !== song.id) : [...favorites, song];
    setFavorites(next); save(`mediahub.music.likes.${session.name}`, next);
  }
  function play(song: Song | undefined, list = items) { if (!song) return; setQueue(list.some((item) => item.id === song.id) ? list : [song, ...list]); setSelected((old) => ({ song, revision: (old?.revision || 0) + 1 })); }
  function skip(direction: number) { const list = queue.length ? queue : items; if (!list.length) return; const index = Math.max(0, list.findIndex((song) => song.id === selected?.song.id)); play(list[(index + direction + list.length) % list.length], list); }
  function open(next: View) { setView(next); setQuery(""); setPage(1); setLikedOnly(false); }
  const art = (title: string, cover?: string, className?: string) => <MusicArtwork session={session} title={title} cover={cover} className={className} />;
  const renderSongs = (list: Song[]) => <><div className="management-actions music-selection-toolbar">
    <Checkbox aria-label="全选当前列表歌曲" isSelected={list.length > 0 && list.every(song => checkedSongs.includes(song.id))} isIndeterminate={list.some(song => checkedSongs.includes(song.id)) && !list.every(song => checkedSongs.includes(song.id))} onChange={checked => setCheckedSongs(old => checked ? [...new Set([...old, ...list.map(song => song.id)])] : old.filter(id => !list.some(song => song.id === id)))}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>全选当前列表</Checkbox.Content></Checkbox>
    <span>已选 {checkedSongs.length} 首</span><Button size="sm" variant="secondary" isDisabled={!checkedSongs.length} onPress={() => setAddingToPlaylist(true)}><ListMusic size={15} />加入歌单</Button>
    {!!checkedSongs.length && <Button size="sm" variant="ghost" onPress={() => setCheckedSongs([])}>取消选择</Button>}
  </div><div className="music-track-list" role="list" aria-label="真实音乐曲库" aria-busy={loading}>
    <div className="music-track-header"><span>#</span><span>歌曲 / 歌手</span><span>专辑</span><span>时长</span><span /></div>
    {list.map((song, i) => <div role="listitem" className={`music-track ${selected?.song.id === song.id && isPlaying ? "is-playing" : ""}`} key={song.id}>
      <div className="music-track-select"><Checkbox aria-label={`选择 ${song.title}`} isSelected={checkedSongs.includes(song.id)} onChange={checked => setCheckedSongs(old => checked ? [...new Set([...old, song.id])] : old.filter(id => id !== song.id))}><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox><Button isIconOnly size="sm" variant="ghost" aria-label={`播放 ${song.title}`} onPress={() => play(song, list)}>{selected?.song.id === song.id && isPlaying ? <Headphones size={15} /> : <><span className="music-track-number">{String(i + 1).padStart(2, "0")}</span><Play className="music-track-play" size={14} /></>}</Button></div>
      <div className="music-track-main"><Button variant="ghost" className="music-track-cover" aria-label={`查看歌曲 ${song.title}`} onPress={() => open({ kind: "song", song })}>{art(song.album, song.coverArt)}</Button><div><Button variant="ghost" className="music-text-link" onPress={() => open({ kind: "song", song })}>{song.title}</Button><Button variant="ghost" className="music-artist-link" onPress={() => { const artist = catalogue.artists.find((item) => item.id === song.artistId); if (artist) open({ kind: "artist", artist }); }}>{song.artist}</Button></div></div>
      <Button variant="ghost" className="music-text-link music-track-album" onPress={() => { const album = catalogue.albums.find((item) => item.id === song.albumId); if (album) open({ kind: "album", album }); }}>{song.album}</Button><span className="music-track-duration">{duration(durations[song.id] || song.duration)}</span>
      <Button isIconOnly size="sm" variant="ghost" aria-label={`${hasLike(song) ? "取消收藏" : "收藏"} ${song.title}`} aria-pressed={hasLike(song)} onPress={() => toggleLike(song)}><Heart size={16} fill={hasLike(song) ? "currentColor" : "none"} className={hasLike(song) ? "music-liked" : ""} /></Button>
    </div>)}
    {!list.length && <div className="music-empty"><Music2 size={28} /><p>{loading ? "正在读取音乐…" : query ? "没有找到音乐，试试其他关键词。" : "这里还没有歌曲，放入音乐后刷新曲库。"}</p></div>}
  </div></>;
  const pagination = !likedOnly && result && result.total > result.pageSize && <div className="management-actions"><Button size="sm" variant="ghost" isDisabled={loading || page <= 1} onPress={() => setPage((n) => n - 1)}>上一页</Button><span>第 {result.page} / {Math.ceil(result.total / result.pageSize)} 页</span><Button size="sm" variant="ghost" isDisabled={loading || page * result.pageSize >= result.total} onPress={() => setPage((n) => n + 1)}>下一页</Button></div>;
  return <>
    <header className="music-page-heading"><div className="music-page-title"><h1>音乐中心</h1><span className="music-library-caption">你的私人音乐角落</span></div>{refreshButton}</header>
    {feedback}
    {addingToPlaylist && <AddToPlaylist session={session} songIds={checkedSongs} close={() => setAddingToPlaylist(false)} done={() => { setAddingToPlaylist(false); setCheckedSongs([]); setNotice("已加入歌单。"); }} />}
    {view ? <>
      <Button className="music-back" size="sm" variant="ghost" onPress={() => open(null)}><ArrowLeft size={15} />返回曲库</Button>
      {view.kind === "song" ? <div className="music-song-detail"><div className="music-song-cover">{art(view.song.album, view.song.coverArt)}<div className="music-detail-actions"><Button onPress={() => play(view.song)}><Play size={16} />播放</Button><Button variant="secondary" aria-pressed={hasLike(view.song)} onPress={() => toggleLike(view.song)}><Heart size={16} fill={hasLike(view.song) ? "currentColor" : "none"} />{hasLike(view.song) ? "已收藏" : "收藏"}</Button></div></div><div className="music-song-info"><span className="music-kicker">SONG / 歌曲详情</span><h2>{view.song.title}</h2><p className="music-detail-artist">{view.song.artist}</p><div className="music-detail-chips"><Chip size="sm" variant="soft">{view.song.suffix.toUpperCase()}</Chip><span>{view.song.year || ""} · {duration(durations[view.song.id] || view.song.duration)}</span></div><dl><div><dt>专辑</dt><dd>{view.song.album}</dd></div><div><dt>歌手</dt><dd>{view.song.artist}</dd></div><div><dt>音源</dt><dd>本地曲库 · 原音播放</dd></div></dl><div className="music-lyrics"><h3>歌词</h3><p>此歌曲暂无可展示的歌词。</p></div></div></div> : <>
        <div className="music-collection-hero">{view.kind === "album" ? art(view.album.name, view.album.coverArt) : art(view.artist.name, catalogue.albums.find((album) => album.artistId === view.artist.id)?.coverArt, "music-artist-round")}<div><span className="music-kicker">{view.kind === "artist" ? "ARTIST / 歌手" : "ALBUM / 专辑"}</span><h2>{view.kind === "artist" ? view.artist.name : view.album.name}</h2><p>{view.kind === "artist" ? `${view.artist.albumCount} 张专辑` : view.album.artist}</p><small>{result?.total || 0} 首歌曲</small><Button isDisabled={!items.length || loading} onPress={() => play(items[0])}><Play size={16} />开始聆听</Button></div></div>
        {renderSongs(items)}{pagination}
      </>}
    </> : <>
      <div className="music-feature">{art(catalogue.albums[0]?.name || "YOUR MUSIC", catalogue.albums[0]?.coverArt)}<div className="music-feature-copy"><span className="music-kicker">DAILY SOUNDTRACK / 今日聆听</span><h2>让旋律，<br />接住每一种心情。</h2><p>从一首歌开始，给日常留一点空白。</p><Button isDisabled={!items.length || loading} onPress={() => play(items[0])}>开始聆听<ArrowUpRight size={16} /></Button></div><div className="music-feature-aside"><Headphones size={23} /><span>你的私人音乐角落</span><small>{catalogue.songCount} 首歌曲 · {catalogue.artists.length} 位歌手<br />{catalogue.albums.length} 张专辑</small></div></div>
      <div className="music-library-toolbar"><FilterTabs label="曲库" value={tab} onChange={(value) => { setTab(value); setQuery(""); setPage(1); }} options={[["songs", "歌曲"], ["artists", "歌手"], ["albums", "专辑"], ["playlists", "歌单"]]} /><div className="music-toolbar-actions"><div className="music-library-search"><Search size={16} aria-hidden="true" /><Input aria-label="搜索音乐" placeholder={tab === "artists" ? "搜索歌手…" : tab === "albums" ? "搜索专辑…" : "搜索歌曲、歌手、专辑…"} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>{tab === "playlists" && <Button size="sm" onPress={() => setCreatingPlaylist(true)}>创建歌单</Button>}</div></div>
      {tab === "songs" && <><div className="music-section-label"><span>{likedOnly ? "我喜欢的歌曲" : "全部歌曲"}<small>{likedOnly ? items.length : result?.total || 0} 首</small></span><Button size="sm" variant={likedOnly ? "secondary" : "ghost"} aria-pressed={likedOnly} onPress={() => setLikedOnly(!likedOnly)}><Heart size={14} />我喜欢 <small>{favorites.length}</small></Button></div>{likedOnly && <p className="media-note">收藏保存在此浏览器。</p>}{renderSongs(items)}{pagination}</>}
      {tab === "artists" && <div className="music-artists-grid">{catalogue.artists.filter((artist) => matches(artist.name)).map((artist) => <Button variant="ghost" className="music-artist-card" key={artist.id} onPress={() => open({ kind: "artist", artist })}>{art(artist.name, catalogue.albums.find((album) => album.artistId === artist.id)?.coverArt, "music-artist-round")}<h3>{artist.name}</h3><p>{artist.albumCount} 张专辑</p></Button>)}{!catalogue.artists.some((artist) => matches(artist.name)) && <p className="music-empty">没有找到歌手。</p>}</div>}
      {tab === "albums" && <div className="music-playlists-grid">{catalogue.albums.filter((album) => matches(`${album.name} ${album.artist}`)).map((album) => <Button variant="ghost" className="music-playlist-card" key={album.id} onPress={() => open({ kind: "album", album })}>{art(album.name, album.coverArt)}<span className="music-playlist-count"><ListMusic size={13} />{album.songCount} 首</span><h3>{album.name}</h3><p>{album.artist}</p></Button>)}{!catalogue.albums.some((album) => matches(`${album.name} ${album.artist}`)) && <p className="music-empty">没有找到专辑。</p>}</div>}
      {tab === "playlists" && <MusicPlaylists session={session} play={play} creating={creatingPlaylist} closeCreate={() => setCreatingPlaylist(false)} filter={query} />}
    </>}
    {showQueue && <div className="music-queue"><div><h3>播放队列 <small>{queue.length} 首</small></h3><Button size="sm" variant="ghost" onPress={() => setShowQueue(false)}>收起</Button></div>{queue.length ? queue.map((song) => <Button variant="ghost" key={song.id} onPress={() => play(song, queue)} className={selected?.song.id === song.id ? "active" : ""}>{song.title}<span>{song.artist}</span><small>{duration(durations[song.id] || song.duration)}</small></Button>) : <p className="media-note">播放歌曲后会在这里显示。</p>}</div>}
    <MusicPlayback session={session} song={selected?.song} preview={items[0]} revision={selected?.revision || 0} onDuration={rememberDuration} onStart={() => play(displaySong, queue.length ? queue : items)} onPrevious={() => skip(-1)} onNext={() => skip(1)} onQueue={() => setShowQueue(!showQueue)} onPlaybackState={setIsPlaying} liked={hasLike(displaySong)} onLike={() => { if (displaySong) toggleLike(displaySong); }} onDetails={() => { if (displaySong) open({ kind: "song", song: displaySong }); }} />
  </>;
}
