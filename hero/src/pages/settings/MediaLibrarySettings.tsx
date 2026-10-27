import { Button, Card } from "@heroui/react";
import { useEffect, useState } from "react";
import { errorText } from "../../components/media/MediaUI";
import {
  DirectoryField,
  Field,
  Notice,
} from "../../components/ui/ManagementUI";
import { directoryIdFromInput } from "../../lib/download-api";
import {
  read,
  save,
  type Session,
} from "../../lib/media-service";
import { organizeApi } from "../../lib/organize-api";

// Global configuration only owns directory and scheduling settings.
export function MediaLibrarySettings({ session }: { session: Session }) {
  const [config, setConfig] = useState({
    id: "",
    sourceId: "",
    targetId: "",
    cron: "",
    enabled: false,
    scheduleError: "",
  });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    if (session.mode === "demo") {
      setConfig(read("mediahub.hero.organize.config", config));
      setLoaded(true);
      return;
    }
    organizeApi
      .config(c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setConfig({
            ...r,
            id: r.id || "",
            scheduleError: r.scheduleError || "",
          });
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [session]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="management-stack">
      <Card className="management-card">
        <Notice error={error}>{notice}</Notice>
        <form
          className="management-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const value = {
                ...config,
                sourceId: directoryIdFromInput(config.sourceId),
                targetId: directoryIdFromInput(config.targetId),
              };
              if (session.mode === "demo") {
                save("mediahub.hero.organize.config", value);
                setNotice("演示目录已保存，不执行文件整理。");
                return;
              }
              const r = await organizeApi.saveConfig(value);
              setConfig({
                ...r,
                id: r.id,
                scheduleError: r.scheduleError || "",
              });
              setNotice(
                r.enabled
                  ? "已保存，Cron 有效，定时整理已启用。"
                  : r.scheduleError
                    ? `目录已保存，Cron 无效，定时整理已停用：${r.scheduleError}`
                    : "目录已保存，未填写 Cron，定时整理已停用。",
              );
            });
          }}
        >
          <DirectoryField
            session={session}
            label="未整理目录"
            value={config.sourceId}
            onChange={(v) => setConfig({ ...config, sourceId: v })}
          />
          <p className="media-note">下载时自动创建动漫、电影等分类目录。</p>
          <DirectoryField
            session={session}
            label="已整理目录"
            value={config.targetId}
            onChange={(v) => setConfig({ ...config, targetId: v })}
          />
          <p className="media-note">
            归档到媒体库，电影和剧集按作品及季集命名。
          </p>
          <Field
            label="Cron 表达式"
            value={config.cron}
            onChange={(v) => setConfig({ ...config, cron: v })}
            placeholder="例如 0 3 * * *"
          />
          <p className="media-note">
            使用 5 段格式：分钟 小时 日 月 星期，按北京时间执行。例如 0 3 * * *
            表示每天 03:00；*/30 * * * * 表示每 30
            分钟。留空或填写错误不启用定时；有效表达式保存后自动启用。
          </p>
          <p className="media-note">
            已保存的定时状态：{config.enabled ? "已启用" : "未启用"}
          </p>
          <Notice error={config.scheduleError} />
          <div className="management-actions">
            <Button type="submit" isDisabled={busy || !loaded}>
              保存
            </Button>
          </div>
        </form>
        <p className="media-note">
          整理规则负责归档和重命名。NFO、图片及 Emby 刮削在对应设置中配置。
        </p>
      </Card>
    </div>
  );
}
