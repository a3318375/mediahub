import { Card } from "@heroui/react";
import { SettingsForm } from "../../components/settings/SettingsForm";
import { MusicLibrary } from "../music/MusicLibrary";
import type { Session } from "../../lib/media-service";

export function SubsonicSettings({ session }: { session: Session }) {
  return <div className="management-stack">
    <Card className="management-card management-stack">
      <h2>连接音乐播放器</h2>
      <p>客户端服务器地址填写当前 MediaHub 的访问地址：<code>{window.location.origin}</code>。使用下方用户名与专用密码连接。</p>
      <p className="media-note">支持曲库浏览、搜索、内嵌封面和原格式播放。转码、歌单和收藏暂未开放。音乐中心可查看真实曲库并刷新。</p>
    </Card>
    <MusicLibrary session={session} showSongs={false} />
    <SettingsForm sections={["subsonic"]} session={session} />
  </div>;
}
