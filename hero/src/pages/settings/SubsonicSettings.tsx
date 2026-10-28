import { Card } from "@heroui/react";
import { MusicLibrary } from "../music/MusicLibrary";
import type { Session } from "../../lib/media-service";

export function SubsonicSettings({ session }: { session: Session }) {
  return <div className="management-stack">
    <Card className="management-card management-stack">
      <h2>连接音乐播放器</h2>
      <p>音乐服务默认开放。客户端服务器地址：<code>{window.location.origin}</code>。</p>
      <p>使用「API 密钥」页面创建的密钥连接，需要客户端支持 OpenSubsonic API Key 认证。</p>
      <p className="media-note">支持曲库浏览、搜索、内嵌封面和原格式播放。转码、歌单和收藏暂未开放。音乐中心可查看真实曲库并刷新。</p>
    </Card>
    <MusicLibrary session={session} showSongs={false} />
  </div>;
}
