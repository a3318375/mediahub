import { useRef, useState } from 'react';
import { Headphones, ListMusic, Music2, Pause, Play, Plus, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';

import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { Slider } from './arc/slider/slider';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { PageHeading, SectionHeading, WorkspaceTabs } from './ui';
import { includes, uid } from './model';
import type { DemoState, Notify, Update } from './model';
import orbit from './audio/orbit.wav';
import dawn from './audio/dawn.wav';
import rain from './audio/rain.wav';


const tracks = [
  { id: 'orbit', title: '轨道回声', album: '夜间放映', genre: '环境音乐', audio: orbit, tone: 'orbit' },
  { id: 'dawn', title: '晨光折射', album: '夜间放映', genre: '氛围合成', audio: dawn, tone: 'dawn' },
  { id: 'rain', title: '雨落之前', album: '窗边录音', genre: '环境音乐', audio: rain, tone: 'rain' },
];
type Track = (typeof tracks)[number];
const duration = 12;
const time = (value: number) => `0:${String(Math.floor(value)).padStart(2, '0')}`;

export function Music({ state, update, notify }: { state: DemoState; update: Update; notify: Notify }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(70);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [add, setAdd] = useState<Track | null>(null);
  const [playlist, setPlaylist] = useState(state.playlists[0]?.id ?? '');
  const [audioError, setAudioError] = useState('');
  const selected = tracks[index];
  function playTrack(next: number) {
    const target = audio.current;
    if (!target) return;
    setAudioError('');
    if (next !== index) {
      target.src = tracks[next].audio;
      setIndex(next); setPosition(0);
    }
    target.volume = volume / 100;
    void target.play().catch(() => setAudioError('暂时无法播放这段音频。'));
  }
  function toggle() {
    if (playing) audio.current?.pause();
    else playTrack(index);
  }
  function renderTracks(rows: Track[]) {
    return <div className="table-panel"><SortableDataTable rows={rows} rowKey="id" caption="音乐曲目" emptyMessage="没有曲目" columns={[
      { key: 'title', label: '曲目', sortable: true, render: (_, track) => <span className="row"><Music2 size={16} aria-hidden="true" />{track.title}</span> },
      { key: 'album', label: '专辑' }, { key: 'genre', label: '类型' }, { key: 'duration', label: '时长', render: () => '0:12' },
      { key: 'action', label: '操作', render: (_, track) => <div className="row no-wrap">
        <Button size="sm" variant="secondary" aria-label={`播放${track.title}`} onClick={() => playTrack(tracks.indexOf(track))}><Play size={14} aria-hidden="true" />播放</Button>
        <Button size="sm" variant="ghost" aria-label={`将${track.title}加入歌单`} onClick={() => { setPlaylist(state.playlists[0]?.id ?? ''); setAdd(track); }}><Plus size={14} aria-hidden="true" />歌单</Button>
      </div> },
    ]} /></div>;
  }
  return <>
    <PageHeading title="音乐中心" description="试听本地合成音轨，创建和管理播放列表。" />
    <audio ref={audio} src={tracks[0].audio} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)} />
    <section className="panel player">
      <div className={`album-art ${selected.tone}`} aria-hidden="true"><Headphones size={44} /></div>
      <div className="player-body stack">
        <div><h2>{selected.title}</h2><p className="muted">{selected.album} · 原创演示音轨</p></div>
        <Slider label="播放进度" value={position} min={0} max={duration} step={0.1} format={time} onValueChange={value => { if (audio.current) audio.current.currentTime = value; setPosition(value); }} />
        <div className="row player-actions">
          <Button variant="ghost" className="icon-button" aria-label="上一首" onClick={() => playTrack((index + tracks.length - 1) % tracks.length)}><SkipBack size={17} aria-hidden="true" /></Button>
          <Button className="icon-button" aria-label={playing ? '暂停播放' : '播放音乐'} onClick={toggle}>{playing ? <Pause size={17} /> : <Play size={17} />}</Button>
          <Button variant="ghost" className="icon-button" aria-label="下一首" onClick={() => playTrack((index + 1) % tracks.length)}><SkipForward size={17} aria-hidden="true" /></Button>
          <div className="row player-volume"><Volume2 size={16} aria-hidden="true" /><Slider label="音量" min={0} max={100} value={volume} showValue={false} onValueChange={value => { setVolume(value); if (audio.current) audio.current.volume = value / 100; }} /></div>
        </div>
        {audioError && <p role="status">{audioError}</p>}
      </div>
    </section>
    <div className="section"><WorkspaceTabs label="音乐功能" items={[
      { id: 'library', label: '音乐库', content: <div className="stack"><div className="narrow"><SearchField label="搜索曲目" value={query} onValueChange={setQuery} placeholder="输入曲目或专辑" /></div>{renderTracks(tracks.filter(track => includes(track.title, query) || includes(track.album, query)))}</div> },
      { id: 'playlists', label: '我的歌单', content: <div className="stack"><SectionHeading title="播放列表" action={<Button onClick={() => { setName(''); setCreating(true); }}><Plus size={16} aria-hidden="true" />新建歌单</Button>} />
        {state.playlists.map(item => <section key={item.id} className="playlist-group"><h3 className="row"><ListMusic size={16} aria-hidden="true" />{item.name}</h3>{renderTracks(tracks.filter(track => item.tracks.includes(track.id)))}</section>)}
      </div> },
    ]} /></div>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent title="新建歌单" description="为播放列表起个名字。"><form className="stack" onSubmit={event => {
      event.preventDefault(); if (!name.trim()) return;
      update(current => ({ ...current, playlists: [...current.playlists, { id: uid(), name: name.trim(), tracks: [] }] }));
      setCreating(false); notify('已创建演示歌单', '音乐');
    }}><Input label="歌单名称" value={name} onChange={event => setName(event.target.value)} /><Button type="submit" disabled={!name.trim()}>创建歌单</Button></form></DialogContent></Dialog>
    <Dialog open={Boolean(add)} onOpenChange={open => { if (!open) setAdd(null); }}>
      {add && <DialogContent title="添加到歌单" description={add.title}><form className="stack" onSubmit={event => {
        event.preventDefault();
        update(current => ({ ...current, playlists: current.playlists.map(item => item.id === playlist ? { ...item, tracks: [...new Set([...item.tracks, add.id])] } : item) }));
        setAdd(null); notify('曲目已加入歌单', '音乐');
      }}>
        <Select label="选择歌单" value={playlist} options={state.playlists.map(item => ({ label: item.name, value: item.id }))} onValueChange={setPlaylist} />
        <Button type="submit" disabled={!playlist}>添加曲目</Button>
      </form></DialogContent>}
    </Dialog>
  </>;
}
