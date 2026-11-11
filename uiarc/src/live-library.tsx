import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Disc3, ListMusic, Music2, Play, Plus, RefreshCw } from 'lucide-react';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SearchField } from './arc/search-field/search-field';
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

export function LiveMusic({ api }: { api: LiveApi }) {
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
  const [playError, setPlayError] = useState('');
  const [current, setCurrent] = useState<{ song: MusicSong; url: string }>();
  const [pending, setPending] = useState('');
  const [lists, setLists] = useState<MusicPlaylist[]>();
  const [playlistId, setPlaylistId] = useState('');
  const [playlist, setPlaylist] = useState<MusicPlaylist>();
  const [playlistError, setPlaylistError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const playRequest = useRef<AbortController | null>(null);
  const showSongs = tab === 'songs' || (tab === 'playlists' && !!playlistId);
  const artistId = filter?.kind === 'artist' ? filter.id : '';
  const albumId = filter?.kind === 'album' ? filter.id : '';

  useEffect(() => {
    const controller = new AbortController();
    setCatalogueError('');
    Promise.allSettled([api.musicCatalogue(controller.signal), api.musicStatus(controller.signal)]).then(([list, state]) => {
      if (controller.signal.aborted) return;
      if (list.status === 'fulfilled') setCatalogue(list.value);
      if (state.status === 'fulfilled') setStatus(state.value);
      setCatalogueError([list, state].map(item => item.status === 'rejected' ? requestError(item.reason) : '').filter(Boolean).join(' · '));
    });
    return () => controller.abort();
  }, [api, revision]);
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
    if (tab !== 'playlists') return;
    const controller = new AbortController();
    setPlaylistError('');
    const load = playlistId ? api.musicPlaylist(playlistId, controller.signal).then(data => {
      if (!controller.signal.aborted) setPlaylist(data.playlist);
    }) : api.musicPlaylists(controller.signal).then(data => {
      if (!controller.signal.aborted) setLists(data ?? []);
    });
    load.catch(reason => { if (!controller.signal.aborted) setPlaylistError(requestError(reason)); });
    return () => controller.abort();
  }, [api, tab, playlistId, revision]);
  useEffect(() => () => playRequest.current?.abort(), [api]);

  async function play(song: MusicSong) {
    playRequest.current?.abort();
    const controller = new AbortController();
    playRequest.current = controller;
    setPlayError(''); setPending(song.id);
    try {
      const { url } = await api.musicPlay(song.id, controller.signal);
      if (!controller.signal.aborted) setCurrent({ song, url });
    } catch (reason) {
      if (!controller.signal.aborted) setPlayError(requestError(reason));
    } finally {
      if (!controller.signal.aborted) setPending('');
    }
  }
  function chooseTab(next: MusicTab, nextFilter?: SongFilter) {
    setTab(next); setQuery(''); setPage(1); setFilter(nextFilter);
    setPlaylistId(''); setPlaylist(undefined); setSaveError('');
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

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize || 1)));
  const firstSong = tab === 'songs' ? result?.items[0] : playlist?.entry?.[0];
  function renderSongs(adding = false) {
    if (error) return <p role="alert" className="comic-feedback">{error}</p>;
    if (!result) return <p role="status" className="panel comic-empty">正在读取曲库…</p>;
    if (!result.items.length) return <div className="panel music-empty"><Music2 size={22} aria-hidden="true" /><p>{query || filter ? '没有找到匹配的曲目' : '曲库还没有歌曲'}</p></div>;
    return <>
      <div className="table-panel"><SortableDataTable rows={result.items} rowKey="id" caption="音乐曲目" columns={[
        { key: 'title', label: '歌曲 / 歌手', render: (_, song) => <div className="music-song-name"><strong title={song.title}>{song.title}</strong><small>{song.artist || '未知歌手'}</small></div> },
        { key: 'album', label: '专辑' },
        { key: 'duration', label: '时长', width: '5rem', numeric: false, render: (_, song) => formatDuration(song.duration) },
        { key: 'action', label: '操作', width: adding ? '7rem' : '5rem', sortable: false, render: (_, song) => adding
          ? <Button size="sm" variant="ghost" disabled={saving || playlist?.entry?.some(item => item.id === song.id)} onClick={() => void savePlaylist(song)}>加入歌单</Button>
          : <Button variant="ghost" size="sm" aria-label={'播放 ' + song.title} disabled={pending === song.id} onClick={() => void play(song)}><Play size={15} aria-hidden="true" /></Button> },
      ]} /></div>
      {pageCount > 1 && <nav className="row comic-pager" aria-label="曲库分页">
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
      <div className="row music-section-heading"><h2>{filter?.name || '全部歌曲'}</h2>{result && <span className="muted">{result.total} 首</span>}</div>
      {renderSongs()}
    </div> },
    ...(['artists', 'albums'] as const).map(id => {
      const artist = id === 'artists';
      const items = artist ? (catalogue?.artists ?? []).map(item => ({ id: item.id, name: item.name, label: `${item.albumCount} 张专辑` }))
        : (catalogue?.albums ?? []).map(item => ({ id: item.id, name: item.name, label: [item.artist, `${item.songCount} 首`].filter(Boolean).join(' · ') }));
      const visible = items.filter(item => matches(`${item.name} ${item.label}`, query));
      const label = artist ? '歌手' : '专辑';
      return { id, label, content: <div className="music-pane">{search(`搜索${label}`)}
        {visible.length ? <div className="music-directory">{visible.map(item => <Button key={item.id} className="music-directory-item" variant="secondary"
          onClick={() => chooseTab('songs', { id: item.id, name: item.name, kind: artist ? 'artist' : 'album' })}><Disc3 size={18} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.label}</small></span></Button>)}</div>
          : <p className="panel comic-empty">{catalogue ? `没有找到${label}` : '正在读取曲库…'}</p>}
      </div> };
    }),
    { id: 'playlists', label: '歌单', content: <div className="music-pane">
      {search(playlistId ? '搜索要加入的歌曲' : '搜索歌单', playlistId
        ? <Button size="sm" variant="ghost" onClick={() => openPlaylist('')}><ArrowLeft size={15} aria-hidden="true" />返回歌单</Button>
        : <Button size="sm" onClick={() => { setSaveError(''); setCreating(true); }}><Plus size={16} aria-hidden="true" />创建歌单</Button>)}
      {playlistError && <div className="row comic-feedback" role="alert">{playlistError}<Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>重试</Button></div>}
      {playlistId ? playlist ? <>
        <div className="row music-section-heading"><h2>{playlist.name}</h2><span className="muted">{playlist.songCount} 首</span></div>
        {playlist.entry?.length ? <div className="panel music-playlist-tracks">{playlist.entry.map(song => <Button key={song.id} variant="ghost" size="sm" onClick={() => void play(song)}><Play size={15} aria-hidden="true" />{song.title} · {song.artist}</Button>)}</div>
          : <p className="muted">这张歌单还是空的，可以从下方曲库加入歌曲。</p>}
        <h2>从曲库加入</h2>{saveError && <p role="alert" className="comic-feedback">{saveError}</p>}{renderSongs(true)}
      </> : !playlistError && <p role="status" className="panel comic-empty">正在读取歌单…</p>
        : lists?.some(item => matches(item.name, query)) ? <div className="music-directory">{lists.filter(item => matches(item.name, query)).map(item =>
          <Button key={item.id} className="music-directory-item" variant="secondary" onClick={() => openPlaylist(item.id)}><ListMusic size={18} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.songCount} 首</small></span></Button>)}</div>
          : !playlistError && <p className="panel comic-empty">{lists ? query ? '没有找到匹配的歌单' : '还没有歌单' : '正在读取歌单…'}</p>}
    </div> },
  ];

  return <section className="music-page">
    <PageHeading title="音乐中心" action={<Button size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />重新加载</Button>} />
    <div className="panel music-library-summary">
      <span className="music-library-art" aria-hidden="true"><Disc3 size={46} strokeWidth={1.25} /></span>
      <div><h2>本地曲库</h2><p className="muted">{catalogue ? `${catalogue.songCount} 首歌曲 · ${catalogue.artists?.length ?? 0} 位歌手 · ${catalogue.albums?.length ?? 0} 张专辑` : '正在读取曲库…'}</p></div>
      {firstSong && <Button size="sm" variant="secondary" disabled={pending === firstSong.id} onClick={() => void play(firstSong)}><Play size={15} aria-hidden="true" />开始播放</Button>}
    </div>
    {(catalogueError || status?.error) && <p role="alert" className="comic-feedback">{[catalogueError, status?.error].filter(Boolean).join(' · ')}</p>}
    {status?.scanning && <p role="status" className="muted">正在扫描曲库…</p>}
    <WorkspaceTabs label="音乐曲库" items={tabs} value={tab} onChange={value => chooseTab(value as MusicTab)} />
    <section className="panel music-player" aria-label="音乐播放器">
      <span className="music-player-icon"><Music2 size={20} aria-hidden="true" /></span>
      <div className="music-song-name"><strong title={current?.song.title}>{current?.song.title || '尚未播放'}</strong>
        <small>{current ? [current.song.artist, current.song.album].filter(Boolean).join(' · ') : '从曲库或歌单选择歌曲'}</small></div>
      {current && <audio key={current.url} aria-label={current.song.title} src={current.url} controls autoPlay onError={() => setPlayError('音频暂不可用，可从曲库重新选择播放。')} />}
    </section>
    {playError && <p role="alert" className="comic-feedback">{playError}</p>}
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
