import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Disc3, Heart, ListMusic, Music2, Play, Plus, RefreshCw, SkipBack, SkipForward } from 'lucide-react';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { requestError, type LibraryPage, type LiveApi, type MusicPlaylist, type MusicSong } from './live-api';
import { PageHeading, WorkspaceTabs } from './ui';
import './library.css';

type MusicTab = 'songs' | 'artists' | 'albums' | 'playlists';
type SongFilter = { id: string; name: string; kind: 'artist' | 'album' };
const matches = (value: string, query: string) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
function formatDuration(duration?: number) {
  return duration && duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '—';
}

function MusicCover({ api, cover, className = 'music-cover' }: { api: LiveApi; cover?: string; className?: string }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [image, setImage] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!cover || visible || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { rootMargin: '120px' });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [cover, visible]);
  useEffect(() => {
    if (!cover || !visible) return;
    const controller = new AbortController();
    let url = '';
    api.image('/api/v1/music/songs/' + encodeURIComponent(cover) + '/cover', controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setImage({ id: cover, url });
    }).catch(() => {});
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, cover, visible]);
  return <span className={className} ref={frame} aria-hidden="true">
    {image && image.id === cover ? <img src={image.url} alt="" onError={() => setImage(undefined)} /> : <Disc3 size={18} />}
  </span>;
}

export function LiveMusic({ api, account }: { api: LiveApi; account: string }) {
  const [tab, setTab] = useState<MusicTab>('songs');
  const [catalogue, setCatalogue] = useState<Awaited<ReturnType<LiveApi['musicCatalogue']>>>();
  const [status, setStatus] = useState<Awaited<ReturnType<LiveApi['musicStatus']>>>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SongFilter>();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<LibraryPage<MusicSong>>();
  const [error, setError] = useState('');
  const [catalogueError, setCatalogueError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [playError, setPlayError] = useState('');
  const [current, setCurrent] = useState<{ song: MusicSong; url: string; queue: MusicSong[]; index: number }>();
  const [pending, setPending] = useState('');
  const [lists, setLists] = useState<MusicPlaylist[]>();
  const [playlistId, setPlaylistId] = useState('');
  const [playlist, setPlaylist] = useState<MusicPlaylist>();
  const [playlistError, setPlaylistError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const favoriteKey = 'mediahub.music.likes.' + account;
  const [favorites, setFavorites] = useState<MusicSong[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
      return Array.isArray(saved) ? saved.filter(song => typeof song?.id === 'string' && typeof song.title === 'string') : [];
    } catch { return []; }
  });
  const [likedOnly, setLikedOnly] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState('');
  const [targetName, setTargetName] = useState('');
  const playRequest = useRef<AbortController | null>(null);
  const scanRequest = useRef<AbortController | null>(null);
  const showSongs = (tab === 'songs' && !likedOnly) || (tab === 'playlists' && !!playlistId);
  const artistId = filter?.kind === 'artist' ? filter.id : '';
  const albumId = filter?.kind === 'album' ? filter.id : '';

  useEffect(() => {
    const controller = new AbortController();
    setCatalogueError('');
    api.musicCatalogue(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalogue(data);
    }).catch(reason => { if (!controller.signal.aborted) setCatalogueError(requestError(reason)); });
    return () => controller.abort();
  }, [api, revision]);
  useEffect(() => {
    const controller = new AbortController();
    let previous: Awaited<ReturnType<LiveApi['musicStatus']>> | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.musicStatus(controller.signal);
        if (controller.signal.aborted) return;
        if (previous && previous.completedAt !== next.completedAt) setRevision(value => value + 1);
        previous = next;
        setStatus(next); setStatusError('');
      } catch (reason) {
        if (!controller.signal.aborted) setStatusError(requestError(reason));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [api]);
  useEffect(() => {
    if (!showSongs) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.musicSongs({ query: query.trim(), artistId, albumId, page: String(page) }, controller.signal).then(data => {
        if (controller.signal.aborted) return;
        const last = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (page > last) setPage(last);
        else setResult(data);
      }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    }, query ? 180 : 0);
    setResult(undefined); setError('');
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, artistId, albumId, page, revision, showSongs]);
  useEffect(() => {
    if (tab !== 'playlists' && !adding) return;
    const controller = new AbortController();
    setPlaylistError('');
    const load = playlistId ? api.musicPlaylist(playlistId, controller.signal).then(data => {
      if (!controller.signal.aborted) setPlaylist(data.playlist);
    }) : api.musicPlaylists(controller.signal).then(data => {
      if (!controller.signal.aborted) setLists(data ?? []);
    });
    load.catch(reason => { if (!controller.signal.aborted) setPlaylistError(requestError(reason)); });
    return () => controller.abort();
  }, [api, adding, tab, playlistId, revision]);
  useEffect(() => () => { playRequest.current?.abort(); scanRequest.current?.abort(); }, [api]);

  async function play(queue: MusicSong[], index: number) {
    const song = queue[index];
    if (!song) return;
    playRequest.current?.abort();
    const controller = new AbortController();
    playRequest.current = controller;
    setPlayError(''); setPending(song.id);
    try {
      const { url } = await api.musicPlay(song.id, controller.signal);
      if (!controller.signal.aborted) setCurrent({ song, url, queue, index });
    } catch (reason) {
      if (!controller.signal.aborted) setPlayError(requestError(reason));
    } finally {
      if (!controller.signal.aborted) setPending('');
    }
  }
  function skip(direction: number) {
    if (!current || pending) return;
    const { queue, index } = current;
    void play(queue, (index + direction + queue.length) % queue.length);
  }
  function toggleFavorite(song: MusicSong) {
    const next = favorites.some(item => item.id === song.id) ? favorites.filter(item => item.id !== song.id) : [...favorites, song];
    try { localStorage.setItem(favoriteKey, JSON.stringify(next)); }
    catch { setNotice('当前浏览器无法保存收藏。'); }
    setFavorites(next);
  }
  async function scan() {
    if (scanRequest.current || status?.scanning) return;
    const controller = new AbortController();
    scanRequest.current = controller;
    setScanning(true); setScanError(''); setNotice('');
    try {
      const result = await api.scanMusic(controller.signal);
      if (controller.signal.aborted) return;
      setNotice(`曲库扫描完成，共 ${result.count} 首歌曲。`);
      setPage(1); setRevision(value => value + 1);
    } catch (reason) {
      if (!controller.signal.aborted) setScanError(requestError(reason));
    } finally {
      if (scanRequest.current === controller) scanRequest.current = null;
      if (!controller.signal.aborted) setScanning(false);
    }
  }
  function chooseTab(next: MusicTab, nextFilter?: SongFilter) {
    setTab(next); setQuery(''); setPage(1); setFilter(nextFilter);
    setPlaylistId(''); setPlaylist(undefined); setSaveError(''); setLikedOnly(false); setChecked([]);
  }
  function openPlaylist(id: string) { setPlaylist(undefined); setPlaylistId(id); setQuery(''); setPage(1); setSaveError(''); }
  async function savePlaylist(song?: MusicSong) {
    if (saving || (!song && !name.trim()) || (song && !playlistId)) return;
    setSaving(true); setSaveError('');
    try {
      const data = await api.saveMusicPlaylist(song ? { id: playlistId, songIds: [song.id], append: true } : { name: name.trim(), songIds: [] });
      if (song) setPlaylist(current => current?.id === data.playlist.id ? data.playlist : current);
      else { openPlaylist(data.playlist.id); setPlaylist(data.playlist); setCreating(false); setName(''); }
    } catch (reason) { setSaveError(requestError(reason)); }
    finally { setSaving(false); }
  }
  async function addSelected(create: boolean) {
    if (saving || !checked.length || (create ? !targetName.trim() : !target)) return;
    setSaving(true); setSaveError('');
    try {
      await api.saveMusicPlaylist(create
        ? { name: targetName.trim(), songIds: checked }
        : { id: target, songIds: checked, append: true });
      setAdding(false); setChecked([]); setLists(undefined);
      setNotice('已将所选歌曲加入歌单。');
    } catch (reason) { setSaveError(requestError(reason)); }
    finally { setSaving(false); }
  }

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize || 1)));
  const songs = likedOnly ? favorites.filter(song => matches([song.title, song.artist, song.album].join(' '), query)) : result?.items;
  const firstQueue = tab === 'songs' ? songs : playlist?.entry;
  function renderSongs(addingToOpenPlaylist = false) {
    if (error && !likedOnly) return <p role="alert" className="comic-feedback">{error}</p>;
    if (!songs) return <p role="status" className="panel comic-empty">正在读取曲库…</p>;
    if (!songs.length) return <div className="panel music-empty"><Music2 size={22} aria-hidden="true" /><p>{query || filter ? '没有找到匹配的曲目' : likedOnly ? '还没有收藏的歌曲' : '曲库还没有歌曲'}</p></div>;
    const selectable = !addingToOpenPlaylist;
    const allChecked = songs.every(song => checked.includes(song.id));
    return <>
      {selectable && <div className="row">
        <label className="row"><input type="checkbox" checked={allChecked} onChange={event => {
          const ids = songs.map(song => song.id);
          const checkedNow = event.target.checked;
          setChecked(current => checkedNow ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)));
        }} />全选当前页</label>
        <Button size="sm" variant="secondary" disabled={!checked.length} onClick={() => {
          setTarget(''); setTargetName(''); setSaveError(''); setAdding(true);
        }}>加入歌单{checked.length ? `（${checked.length}）` : ''}</Button>
        {!!checked.length && <Button size="sm" variant="ghost" onClick={() => setChecked([])}>取消选择</Button>}
      </div>}
      <div className="table-panel"><SortableDataTable rows={songs} rowKey="id" caption="音乐曲目" columns={[
        ...(selectable ? [{ key: 'select', label: '选择', width: '3.5rem', sortable: false, render: (_: unknown, song: MusicSong) =>
          <input type="checkbox" aria-label={'选择 ' + song.title} checked={checked.includes(song.id)} onChange={event => {
            const checkedNow = event.target.checked;
            setChecked(current => checkedNow ? [...current, song.id] : current.filter(id => id !== song.id));
          }} /> }] : []),
        { key: 'title', label: '歌曲 / 歌手', render: (_, song) => <div className="music-track-title">
          <MusicCover api={api} cover={song.coverArt} />
          <div className="music-song-name"><strong title={song.title}>{song.title}</strong><small>{song.artist || '未知歌手'}</small></div>
        </div> },
        { key: 'album', label: '专辑' },
        { key: 'duration', label: '时长', width: '5rem', numeric: false, render: (_, song) => formatDuration(song.duration) },
        { key: 'action', label: '操作', width: '7rem', sortable: false, render: (_, song) => addingToOpenPlaylist
          ? <Button size="sm" variant="ghost" disabled={saving || playlist?.entry?.some(item => item.id === song.id)} onClick={() => void savePlaylist(song)}>加入歌单</Button>
          : <div className="row no-wrap">
            <Button variant="ghost" size="sm" aria-label={'播放 ' + song.title} disabled={pending === song.id}
              onClick={() => void play(songs, songs.findIndex(item => item.id === song.id))}><Play size={15} aria-hidden="true" /></Button>
            <Button variant="ghost" size="sm" aria-label={'收藏 ' + song.title} aria-pressed={favorites.some(item => item.id === song.id)}
              onClick={() => toggleFavorite(song)}><Heart size={15} fill={favorites.some(item => item.id === song.id) ? 'currentColor' : 'none'} aria-hidden="true" /></Button>
          </div> },
      ]} /></div>
      {!likedOnly && pageCount > 1 && <nav className="row comic-pager" aria-label="曲库分页">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} aria-hidden="true" />上一页</Button>
        <span className="muted">第 {page} / {pageCount} 页</span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一页<ChevronRight size={15} aria-hidden="true" /></Button>
      </nav>}
    </>;
  }
  function search(placeholder: string, action?: ReactNode) {
    return <div className="panel music-tools"><SearchField label="搜索音乐" placeholder={placeholder} value={query} maxLength={170}
      onValueChange={value => { setQuery(value); setPage(1); }} />{action}</div>;
  }
  const tabs = [
    { id: 'songs', label: '歌曲', content: <div className="music-pane">
      {search('搜索歌曲、歌手或专辑', filter && <Button size="sm" variant="ghost" onClick={() => chooseTab(filter.kind === 'artist' ? 'artists' : 'albums')}><ArrowLeft size={15} aria-hidden="true" />{filter.kind === 'artist' ? '返回歌手' : '返回专辑'}</Button>)}
      <div className="row music-section-heading"><h2>{likedOnly ? '我喜欢的歌曲' : filter?.name || '全部歌曲'}</h2>
        {(likedOnly || result) && <span className="muted">{likedOnly ? songs?.length : result?.total} 首</span>}
        {!filter && <Button variant="secondary" size="sm" aria-pressed={likedOnly} onClick={() => {
          setLikedOnly(value => !value); setPage(1); setChecked([]);
        }}><Heart size={15} aria-hidden="true" />{likedOnly ? '查看全部歌曲' : '我喜欢'}（{favorites.length}）</Button>}
      </div>
      {renderSongs()}
    </div> },
    ...(['artists', 'albums'] as const).map(id => {
      const artist = id === 'artists';
      const items = artist ? (catalogue?.artists ?? []).map(item => ({ id: item.id, name: item.name, label: `${item.albumCount} 张专辑`, cover: undefined }))
        : (catalogue?.albums ?? []).map(item => ({ id: item.id, name: item.name, label: [item.artist, `${item.songCount} 首`].filter(Boolean).join(' · '), cover: item.coverArt }));
      const visible = items.filter(item => matches(`${item.name} ${item.label}`, query));
      const label = artist ? '歌手' : '专辑';
      return { id, label, content: <div className="music-pane">{search(`搜索${label}`)}
        {visible.length ? <div className="music-directory">{visible.map(item => <Button key={item.id} className="music-directory-item" variant="secondary"
          onClick={() => chooseTab('songs', { id: item.id, name: item.name, kind: artist ? 'artist' : 'album' })}>
          <MusicCover api={api} cover={item.cover} /><span><strong>{item.name}</strong><small>{item.label}</small></span></Button>)}</div>
          : <p className="panel comic-empty">{catalogue ? `没有找到${label}` : '正在读取曲库…'}</p>}
      </div> };
    }),
    { id: 'playlists', label: '歌单', content: <div className="music-pane">
      {search(playlistId ? '搜索要加入的歌曲' : '搜索歌单', playlistId
        ? <Button size="sm" variant="ghost" onClick={() => openPlaylist('')}><ArrowLeft size={15} aria-hidden="true" />返回歌单</Button>
        : <Button size="sm" onClick={() => { setSaveError(''); setCreating(true); }}><Plus size={16} aria-hidden="true" />创建歌单</Button>)}
      {playlistError && <div className="row comic-feedback" role="alert">{playlistError}<Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>重试</Button></div>}
      {playlistId ? playlist ? <>
        <div className="row music-section-heading"><h2>{playlist.name}</h2><span className="muted">{playlist.songCount} 首</span>
          <Button size="sm" variant="secondary" disabled={!playlist.entry?.length || Boolean(pending)}
            onClick={() => void play(playlist.entry ?? [], 0)}><Play size={15} aria-hidden="true" />播放全部</Button></div>
        {playlist.entry?.length ? <div className="panel music-playlist-tracks">{playlist.entry.map((song, i) => <Button key={song.id} variant="ghost" size="sm"
          onClick={() => void play(playlist.entry ?? [], i)}><Play size={15} aria-hidden="true" />{song.title} · {song.artist}</Button>)}</div>
          : <p className="muted">这张歌单还是空的，可以从下方曲库加入歌曲。</p>}
        <h2>从曲库加入</h2>{saveError && <p role="alert" className="comic-feedback">{saveError}</p>}{renderSongs(true)}
      </> : !playlistError && <p role="status" className="panel comic-empty">正在读取歌单…</p>
        : lists?.some(item => matches(item.name, query)) ? <div className="music-directory">{lists.filter(item => matches(item.name, query)).map(item =>
          <Button key={item.id} className="music-directory-item" variant="secondary" onClick={() => openPlaylist(item.id)}><ListMusic size={18} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.songCount} 首</small></span></Button>)}</div>
          : !playlistError && <p className="panel comic-empty">{lists ? query ? '没有找到匹配的歌单' : '还没有歌单' : '正在读取歌单…'}</p>}
    </div> },
  ];

  return <section className="music-page">
    <PageHeading title="音乐中心" action={<Button size="sm" variant="secondary" disabled={scanning || status?.scanning}
      onClick={() => void scan()}><RefreshCw size={16} aria-hidden="true" />{scanning || status?.scanning ? '正在扫描…' : '刷新曲库'}</Button>} />
    <div className="panel music-library-summary">
      <MusicCover api={api} cover={catalogue?.albums?.find(album => album.coverArt)?.coverArt} className="music-library-art" />
      <div><h2>本地曲库</h2><p className="muted">{catalogue ? `${catalogue.songCount} 首歌曲 · ${catalogue.artists?.length ?? 0} 位歌手 · ${catalogue.albums?.length ?? 0} 张专辑` : '正在读取曲库…'}</p>
        {status?.completedAt && <small className="muted">上次扫描 · {new Date(status.completedAt).toLocaleString('zh-CN', { hour12: false })}</small>}</div>
      {!!firstQueue?.length && <Button size="sm" variant="secondary" disabled={Boolean(pending)} onClick={() => void play(firstQueue, 0)}><Play size={15} aria-hidden="true" />开始播放</Button>}
    </div>
    {(catalogueError || statusError || status?.error || scanError) && <p role="alert" className="comic-feedback">{[catalogueError, statusError, status?.error, scanError].filter(Boolean).join(' · ')}</p>}
    {notice && <p role="status" className="muted">{notice}</p>}
    {status?.scanning && <p role="status" className="muted">正在扫描曲库…</p>}
    <WorkspaceTabs label="音乐曲库" items={tabs} value={tab} onChange={value => chooseTab(value as MusicTab)} />
    <section className="panel music-player" aria-label="音乐播放器">
      <MusicCover api={api} cover={current?.song.coverArt} className="music-player-icon" />
      <div className="music-song-name"><strong title={current?.song.title}>{current?.song.title || '尚未播放'}</strong>
        <small>{current ? [current.song.artist, current.song.album].filter(Boolean).join(' · ') : '从曲库或歌单选择歌曲'}</small></div>
      {current && <>
        <audio key={current.url} aria-label={current.song.title} src={current.url} controls autoPlay
          onEnded={() => { if (!pending && current.index + 1 < current.queue.length) void play(current.queue, current.index + 1); }}
          onError={() => setPlayError('音频暂不可用，可从曲库重新选择播放。')} />
        <div className="row music-player-controls">
          <Button variant="ghost" size="sm" aria-label="上一首" disabled={!!pending || current.queue.length < 2} onClick={() => skip(-1)}><SkipBack size={16} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" aria-label="下一首" disabled={!!pending || current.queue.length < 2} onClick={() => skip(1)}><SkipForward size={16} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" aria-expanded={showQueue} onClick={() => setShowQueue(value => !value)}><ListMusic size={16} aria-hidden="true" />队列（{current.queue.length}）</Button>
        </div>
      </>}
    </section>
    {showQueue && current && <section className="panel music-playlist-tracks" aria-label="播放队列">
      {current.queue.map((song, i) => <Button key={i + ':' + song.id} variant="ghost" size="sm" aria-current={current.index === i}
        onClick={() => void play(current.queue, i)}>{current.index === i && <Play size={15} aria-hidden="true" />}{song.title} · {song.artist}</Button>)}
    </section>}
    {playError && <p role="alert" className="comic-feedback">{playError}</p>}
    {adding && <Dialog open onOpenChange={open => { if (!open && !saving) setAdding(false); }}>
      <DialogContent title="加入歌单" description={`已选择 ${checked.length} 首歌曲`}>
        <div className="stack">
          {playlistError ? <div className="row"><p role="alert">{playlistError}</p>
            <Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重新加载歌单</Button></div>
            : lists === undefined ? <p role="status">正在读取歌单…</p>
            : lists.length ? <Select label="目标歌单" placeholder="选择歌单" value={target} onValueChange={setTarget} disabled={saving}
              options={lists.map(list => ({ value: list.id, label: list.name }))} /> : <p className="muted">还没有歌单，可以在下方新建。</p>}
          <form className="row fields" onSubmit={event => { event.preventDefault(); void addSelected(true); }}>
            <Input label="新歌单名称" value={targetName} maxLength={100} disabled={saving} onChange={event => setTargetName(event.target.value)} />
            <Button type="submit" variant="secondary" disabled={saving || !targetName.trim()}>新建并加入</Button>
          </form>
          {saveError && <p role="alert" className="comic-feedback">{saveError}</p>}
          <div className="row form-actions"><Button variant="ghost" disabled={saving} onClick={() => setAdding(false)}>取消</Button>
            <Button disabled={saving || !target} onClick={() => void addSelected(false)}>确认加入</Button></div>
        </div>
      </DialogContent>
    </Dialog>}
    <Dialog open={creating} onOpenChange={open => { if (!open && !saving) { setCreating(false); setName(''); setSaveError(''); } }}>
      <DialogContent title="创建歌单">
        <form className="stack" onSubmit={event => { event.preventDefault(); void savePlaylist(); }}>
          <Input label="歌单名称" placeholder="例如：通勤路上" value={name} onChange={event => setName(event.target.value)} maxLength={100} disabled={saving} />
          {saveError && <p role="alert" className="comic-feedback">{saveError}</p>}
          <div className="row comic-dialog-actions"><Button variant="ghost" disabled={saving} onClick={() => { setCreating(false); setName(''); }}>取消</Button>
            <Button type="submit" loading={saving} disabled={saving || !name.trim()}>创建</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}
