import { Avatar, Button, Popover } from "@heroui/react";
import { Bell, LogOut, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import { request, type Session } from "../../lib/media-service";
import { errorText } from "../media/MediaUI";
import { Overlay } from "../ui/Overlay";

export function MediaUserMenu({
  session,
  settings,
  logout,
}: {
  session: Session;
  settings: () => void;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState({
    name: session.name,
    account: session.name,
    email: "",
  });
  const [error, setError] = useState("");
  return (
    <>
      <Popover>
        <Button variant="ghost" isIconOnly aria-label="打开通知"><Bell size={18} /></Button>
        <Popover.Content placement="bottom end"><Popover.Dialog><Popover.Heading>通知</Popover.Heading><p>暂无新通知</p></Popover.Dialog></Popover.Content>
      </Popover>
      <Button variant="ghost" isIconOnly
        className="media-user"
        aria-label={`打开${session.name}的用户菜单`}
        onPress={() => {
          setOpen(true);
          setError("");
          if (session.mode === "live")
            void request<{ name: string; account: string; email?: string }>(
              "/api/auth/me",
              session,
            )
              .then((r) => setUser({ ...r, email: r.email || "" }))
              .catch((e) => setError(errorText(e)));
        }}
      >
        <Avatar size="sm"><Avatar.Fallback>{session.name.slice(0, 1).toUpperCase()}</Avatar.Fallback></Avatar>
      </Button>
      {open && (
        <Overlay
          title={user.name}
          onClose={() => setOpen(false)}
          footer={
            <Button
              variant="danger"
              onPress={() => {
                setOpen(false);
                logout();
              }}
            >
              <LogOut size={16} />
              退出登录
            </Button>
          }
        >
          <div className="management-stack">
            <p>{user.email || user.account}</p>
            <p>
              <UserRound size={16} />
              账号：{user.account}
            </p>
            <Button
              variant="secondary"
              onPress={() => {
                setOpen(false);
                settings();
              }}
            >
              <Settings size={16} />
              全局设置
            </Button>
            {error && (
              <p role="alert" className="media-error">
                {error}
              </p>
            )}
          </div>
        </Overlay>
      )}
    </>
  );
}
