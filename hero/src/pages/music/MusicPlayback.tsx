import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Heart, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { AppSlider } from "../../components/ui/AppControls";
import { Notice } from "../../components/ui/ManagementUI";
import { errorText } from "../../components/media/MediaUI";
import { request, type Session } from "../../lib/media-service";
import { MusicArtwork } from "./MusicArtwork";

export type PlayableSong = { id: string; title: string; artist: string; album: string; artistId: string; albumId: string; coverArt?: string; suffix: string; duration?: number; size: number; genre?: string; year?: number };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function MusicPlayback({ session, song, preview, revision, onDuration, onStart, onPrevious, onNext, onQueue, onPlaybackState, liked, onLike, onDetails }: {
  session: Session; song?: PlayableSong; revision: number; onDuration: (id: string, seconds: number) => void;
  preview?: PlayableSong; onStart: () => void; onPrevious: () => void; onNext: () => void; onQueue: () => void;
  onPlaybackState: (playing: boolean) => void; liked: boolean; onLike: () => void; onDetails: () => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [total, setTotal] = useState(0);
  const [volume, setVolume] = useState(75);
  const [error, setError] = useState("");
  useEffect(() => {
    const player = audio.current;
    if (!song || !player || session.mode !== "live") return;
    const controller = new AbortController();
    setError(""); setLoading(true); setPosition(0); setTotal(0); setPlaying(false);
    request<{ url: string }>(`/api/v1/music/songs/${encodeURIComponent(song.id)}/play`, session, "POST", undefined, 30000, controller.signal)
      .then(async ({ url }) => {
        if (controller.signal.aborted) return;
        if (!url.startsWith("/api/stream/music/")) throw new Error("播放地址无效");
        player.src = url;
        await player.play();
      })
      .catch((e) => { if (!controller.signal.aborted) { setError(`播放失败：${errorText(e)}`); setLoading(false); } });
    return () => { controller.abort(); player.pause(); player.removeAttribute("src"); player.load(); };
  }, [session, song, revision]);
  useEffect(() => { if (audio.current) audio.current.volume = volume / 100; }, [volume]);

  const display = song || preview;
  return <>
    <audio ref={audio} preload="metadata"
      onLoadedMetadata={(e) => {
        const seconds = e.currentTarget.duration;
        if (Number.isFinite(seconds) && seconds > 0) { setTotal(seconds); if (song) onDuration(song.id, seconds); }
      }}
      onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration)) setTotal(e.currentTarget.duration); }}
      onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
      onPlaying={() => { setPlaying(true); setLoading(false); onPlaybackState(true); }}
      onPause={() => { setPlaying(false); setLoading(false); onPlaybackState(false); }}
      onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)}
      onEnded={() => { setPlaying(false); setLoading(false); onPlaybackState(false); }}
      onError={(e) => { setPlaying(false); setLoading(false); setError(e.currentTarget.error?.code === 4 ? "浏览器无法解码此音频格式，请使用支持该格式的浏览器或 Subsonic 客户端。" : "音频读取失败，请重新选择歌曲播放。"); }}
    />
    <Notice error={error} />
    <div className="music-player" aria-label="音乐播放器">
      <div className="music-player-track">
        <Button variant="ghost" isDisabled={!display} aria-label={`查看歌曲 ${display?.title || ""}`} onPress={onDetails}><MusicArtwork session={session} cover={display?.coverArt} title={display?.album || "YOUR MUSIC"} /></Button>
        <div><Button variant="ghost" isDisabled={!display} className="music-text-link" onPress={onDetails}>{display?.title || "选择一首音乐"}</Button><small role="status">{display?.artist || "你的私人音乐空间"}{loading ? " · 加载中…" : playing ? " · 正在播放" : ""}</small></div>
        <Button isIconOnly size="sm" variant="ghost" isDisabled={!display} aria-label={liked ? "取消收藏当前歌曲" : "收藏当前歌曲"} aria-pressed={liked} onPress={onLike}><Heart size={16} fill={liked ? "currentColor" : "none"} className={liked ? "music-liked" : ""} /></Button>
      </div>
      <div className="music-player-center">
        <div className="music-player-buttons">
          <Button isIconOnly size="sm" variant="ghost" isDisabled={!display || loading} aria-label="上一首" onPress={onPrevious}><SkipBack size={17} /></Button>
          <Button isIconOnly size="sm" isDisabled={!display || loading} isPending={loading} aria-label={playing ? "暂停播放" : "播放当前歌曲"} onPress={async () => {
          const player = audio.current; if (!player) return;
          if (!song || !player.getAttribute("src") || error) { onStart(); return; }
          try { if (player.paused) await player.play(); else player.pause(); }
          catch (e) { setError(`播放失败：${errorText(e)}`); }
          }}>{playing ? <Pause size={17} /> : <Play size={17} />}</Button>
          <Button isIconOnly size="sm" variant="ghost" isDisabled={!display || loading} aria-label="下一首" onPress={onNext}><SkipForward size={17} /></Button>
        </div>
        <div className="music-player-seek"><span>{clock(position)}</span><AppSlider label="音乐播放进度" disabled={!song || total <= 0} value={Math.min(position, total)} max={total || 1} onChange={(next) => { if (audio.current && total > 0) audio.current.currentTime = Math.min(next, total); }} /><span>{clock(total || display?.duration || 0)}</span></div>
      </div>
      <div className="music-player-options"><Volume2 size={16} aria-hidden="true" /><AppSlider label="音乐音量" value={volume} onChange={setVolume} /><Button isIconOnly size="sm" variant="ghost" aria-label="播放队列" onPress={onQueue}><ListMusic size={19} /></Button></div>
    </div>
  </>;
}
