import { Button, Chip } from "@heroui/react";
import {
  CalendarDays,
  BookOpen,
  BookText,
  ChevronRight,
  Clapperboard,
  Library,
  LogOut,
  Menu,
  Moon,
  Music,
  Workflow,
  ScrollText,
  Search,
  Settings,
  Sun,
  Telescope,
  Trophy,
} from "lucide-react";
import { HeaderSearch } from "../components/navigation/HeaderSearch";
import { MediaUserMenu } from "../components/navigation/UserMenu";
import type { Session } from "../lib/media-service";
import { navigationItems } from "../lib/parity";
import { useEffect, useState } from "react";
import { settingsApi, type SettingValue } from "../lib/settings-api";
import { read } from "../lib/media-service";
import type { Page } from "./MediaApp";
const navIcons = {
  emby: Library,
  search: Search,
  discover: Telescope,
  comics: BookOpen,
  novels: BookText,
  music: Music,
  processing: Workflow,
  rankings: Trophy,
  anime: Clapperboard,
  calendar: CalendarDays,
  logs: ScrollText,
  settings: Settings,
};

export const navigation = navigationItems.map(
  ([id, label, section]) => [id, label, navIcons[id], section] as const,
);

type SharedProps = {
  session: Session;
  go: (page: Page) => void;
  logout: () => void;
};
export function WorkspaceSidebar({
  session,
  page,
  go,
  logout,
}: SharedProps & { page: Page }) {
  const [menus, setMenus] = useState<Record<string, SettingValue>>({});
  useEffect(() => {
    let active = true;
    if (session.mode === "demo") setMenus(read("mediahub.hero.settings.menus", {}));
    else settingsApi.get("menus").then(result => { if (active) setMenus(result.values); }).catch(() => {});
    return () => { active = false; };
  }, [session]);
  const visibleNavigation = navigation.filter(([id, , , section]) => section !== "功能模块" || menus[`menus.${id}`] !== false);
  return (
    <aside className="sidebar media-sidebar">
      <div className="media-brand">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <span>
          MediaHub<small>你的私人影视空间</small>
        </span>
      </div>
      <nav aria-label="主导航">
        {visibleNavigation.map(([id, label, Icon, section], index) => (
          <div key={id}>
            {(index === 0 || visibleNavigation[index - 1][3] !== section) && (
              <div className="media-nav-label">{section}</div>
            )}
            <Button variant="ghost"
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onPress={() => go(id)}
            >
              <Icon size={18} />
              {label}
            </Button>
          </div>
        ))}
      </nav>
      <div className="media-sidebar-bottom">
        <div className="media-mode">
          <span className="mode-dot" />
          {session.mode === "demo" ? "本地演示模式" : "服务已连接"}
          <small>
            {session.mode === "demo"
              ? "数据仅保存在当前浏览器"
              : "已连接 MediaHub 服务"}
          </small>
        </div>
        <Button variant="ghost" onPress={logout}>
          <LogOut size={17} />
          退出登录
        </Button>
      </div>
    </aside>
  );
}
export function WorkspaceHeader({
  session,
  title,
  go,
  logout,
  mobile,
  setMobile,
  dark,
  setDark,
}: SharedProps & {
  title?: string;
  mobile: boolean;
  setMobile: (value: boolean) => void;
  dark: boolean;
  setDark: (value: boolean) => void;
}) {
  return (
    <header className="media-topbar">
      <div>
        <Button
          variant="ghost"
          isIconOnly
          aria-label="展开导航"
          aria-expanded={mobile}
          className="media-mobile-toggle"
          onPress={() => setMobile(!mobile)}
        >
          <Menu size={19} />
        </Button>
        <span className="media-breadcrumb">工作空间</span>
        <ChevronRight size={14} />
        <strong>{title}</strong>
      </div>
      <div>
        <HeaderSearch navigate={(p) => go(p as Page)} />
        <Chip size="sm" variant="soft">
          {session.mode === "demo" ? "DEMO" : "LIVE"}
        </Chip>
        <Button
          variant="ghost"
          isIconOnly
          aria-label={dark ? "切换浅色" : "切换深色"}
          onPress={() => setDark(!dark)}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </Button>
        <MediaUserMenu
          session={session}
          settings={() => go("settings")}
          logout={logout}
        />
      </div>
    </header>
  );
}
