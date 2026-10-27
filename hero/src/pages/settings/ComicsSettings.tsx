import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Input } from "@heroui/react";
import { errorText } from "../../components/media/MediaUI";
import { request, type Session } from "../../lib/media-service";

const endpoint = "/api/v1/comics/ehentai/settings";

export function ComicsSettings({ session }: { session: Session }) {
  const [cookie, setCookie] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (session.mode !== "live") return;
    const controller = new AbortController();
    request<{ configured: boolean }>(endpoint, session, "GET", undefined, 30000, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setConfigured(value.configured); })
      .catch((e) => { if (!controller.signal.aborted) setError(errorText(e)); });
    return () => controller.abort();
  }, [session]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !cookie.trim() || session.mode !== "live") return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(endpoint, session, "PUT", { cookie });
      setCookie(""); setConfigured(true);
      setNotice("Cookie 已保存，刷新页面后漫画来源中将显示 ExHentai。");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <Card className="management-card">
    <h2>E-Hentai / ExHentai</h2>
    <form className="eh-settings" onSubmit={submit}>
      <p>{session.mode !== "live" ? "连接服务后配置漫画 Cookie。" : configured === null ? error ? "保存状态暂时读取失败，仍可填写并保存 Cookie。" : "正在读取 Cookie 保存状态…" : configured ? "已保存 Cookie，留空保留现有凭据。" : "未配置 Cookie，E-Hentai 可使用游客模式，ExHentai 暂不显示。"}</p>
      <label>Cookie<Input aria-label="E-Hentai Cookie" type="password" autoComplete="off" value={cookie} onChange={(event) => setCookie(event.target.value)} placeholder="ipb_member_id=…; ipb_pass_hash=…; igneous=…" disabled={session.mode !== "live" || busy} /></label>
      <p className="media-note">填写已登录浏览器中的 ipb_member_id、ipb_pass_hash 和 igneous。Cookie 加密保存在服务端；保存后刷新页面显示 ExHentai，访问仍取决于账号权限和 Cookie 有效性。</p>
      {error && <p role="alert" className="media-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Button type="submit" isDisabled={session.mode !== "live" || busy || !cookie.trim()}>{busy ? "保存中…" : "保存 Cookie"}</Button>
    </form>
  </Card>;
}
