import { useEffect, useState } from "react";
import type { Session } from "../../lib/media-service";

export function MusicArtwork({ session, cover, title, className = "" }: { session: Session; cover?: string; title: string; className?: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    setSource("");
    if (!cover || session.mode !== "live") return;
    const controller = new AbortController(); let objectURL = "";
    fetch(`/api/v1/music/songs/${encodeURIComponent(cover)}/cover`, { signal: controller.signal, headers: { Authorization: `Bearer ${session.token}` } })
      .then(async (response) => { if (!response.ok) return; const blob = await response.blob(); if (controller.signal.aborted) return; objectURL = URL.createObjectURL(blob); setSource(objectURL); })
      .catch(() => {});
    return () => { controller.abort(); if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [session, cover]);
  return <div className={`music-art music-art-ocean ${className}`}>
    {source ? <img src={source} alt={`${title} 封面`} className="music-real-cover" onError={() => setSource("")} /> : <><span aria-hidden="true" className="music-art-orbit" /><span aria-hidden="true" className="music-art-horizon" /><span className="music-art-type">{title}</span><span className="music-art-label">MEDIAHUB / YOUR MUSIC</span></>}
  </div>;
}
