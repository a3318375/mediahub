import { useEffect, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { Clapperboard, RefreshCw } from "lucide-react";
import { Empty, FilterTabs, errorText, time } from "../../components/media/MediaUI";
import { Notice } from "../../components/ui/ManagementUI";
import { AppDisclosure } from "../../components/ui/AppControls";
import { image, type Session } from "../../lib/media-service";
import { organizeApi, type OrganizeMediaItem } from "../../lib/organize-api";
import { downloadApi } from "../../lib/download-api";
import { mediaOutputApi, type OutputJob } from "../../lib/media-output-api";

const kinds: Record<string, string> = { anime: "番剧", tv: "电视剧", movie: "电影" };
type Mode = "downloads" | "organize" | "strm" | "scraping";
const actions = {downloads:"立即下载",organize:"立即整理",strm:"生成 STRM",scraping:"开始刮削"};

export function ProcessingOverview({ session, mode }: { session: Session; mode: Mode }) {
  const [items, setItems] = useState<OrganizeMediaItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [job,setJob]=useState<OutputJob|null>(null);
  const outputMode=mode==="strm"||mode==="scraping";
  const available=!outputMode||job?.configured;
  const running=job?.status.state==="running"||job?.status.state==="queued";

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);setJob(null);
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        if (session.mode === "demo") { setItems([]); return; }
        const [result,outputJob] = await Promise.all([organizeApi.items(c.signal),outputMode?mediaOutputApi.config(mode,c.signal):Promise.resolve(null)]);
        if (!c.signal.aborted) { setItems(result.items ?? []);setJob(outputJob); setError(""); }
      } catch (e) { if (!c.signal.aborted) setError(errorText(e)); }
      finally {
        if (!c.signal.aborted) {
          setLoading(false);
          if (session.mode === "live") timer = setTimeout(load, 10000);
        }
      }
    }
    void load();
    return () => { c.abort(); clearTimeout(timer); };
  }, [session, revision, mode]);

  async function run() {
    if (busy || !available) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = mode === "strm" || mode === "scraping" ? await mediaOutputApi.run(mode) : mode === "organize" ? await organizeApi.run() : await downloadApi.run();
      setNotice(result.message);
      setRevision((n) => n + 1);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const visible = items.filter((item) => !filter || item.media.type === filter);
  function counts(item: OrganizeMediaItem): [number | null, string][] {
    if (mode === "strm") return [[item.downloaded, "资源数"], [item.strmCount??0, "已生成"], [Math.max(0,item.downloaded-(item.strmCount??0)), "未生成"]];
    if (mode === "scraping") return [[item.downloaded, "资源数"], [item.scrapedCount, "已刮削"], [item.incompleteScrapeCount, "未完全刮削"]];
    return [[item.downloaded, "资源数"], [item.organized, "已整理"], [item.pending, "未整理"]];
  }
  return (
    <section className="management-stack organize-overview">
      <div className="processing-toolbar">
        <h2>最近记录 <small>{items.length} 部作品</small></h2>
        <FilterTabs label="作品类型" value={filter} onChange={setFilter} options={[["", "全部"], ["anime", "番剧"], ["tv", "电视剧"], ["movie", "电影"]]} />
        <div className="management-actions">
          <Button variant="secondary" isDisabled={loading || busy} onPress={() => setRevision((n) => n + 1)}>
            <RefreshCw size={16} />刷新状态
          </Button>
          {outputMode&&<Button variant="ghost" onPress={()=>{window.location.hash=`/settings/${mode}`;}}>配置</Button>}
          <Button isDisabled={busy || running || !available || session.mode !== "live"} onPress={() => void run()}>
            {busy ? "正在触发…" : running ? "执行中…" : actions[mode]}
          </Button>
        </div>
      </div>
      <Notice error={error}>{notice}</Notice>
      <p className="media-note">
        {outputMode?(!job?.configured?"请先在全局设置中配置此功能；未配置不触发任务。":mode==="strm"?(job.config.cron?`定时生成已启用：${job.config.cron}（北京时间），也可手动生成。`:"未启用定时生成，可手动生成；已有文件不会覆盖。"):"刮削仅手动执行，补充 NFO 与图片；未完成的文件可再次触发重试。"):mode === "organize" ? "立即整理使用全局设置中的目录与规则，统一处理未整理文件。" : "立即下载唤醒现有下载调度，处理订阅候选与下载队列。"}
      </p>
      {outputMode&&job&&job.status.state!=="idle"&&<div className="management-notice" role="status">
        {({queued:"排队中",running:"执行中",completed:"已完成",completed_with_issues:"完成，有待处理文件",failed:"执行失败",interrupted:"执行已中断"} as Record<string,string>)[job.status.state]||job.status.state} · 扫描 {job.status.scanned}，完成 {job.status.completed}，跳过 {job.status.skipped}，失败 {job.status.failed}
        <Notice error={job.status.error}/>
        {!!job.status.issues?.length&&<AppDisclosure title="查看未完成原因">{job.status.issues.map((issue,index)=><p key={index}>{issue}</p>)}</AppDisclosure>}
      </div>}
      {!visible.length ? <Empty>{loading ? "正在读取最近记录…" : error ? "暂时无法读取统计，请重试。" : "暂无相关作品，订阅或下载后会显示在这里。"}</Empty> : (
        <div className="organize-work-list">
          {visible.map((item) => (
            <Card className="organize-work-row" key={item.id}>
              <div className="organize-work-art" aria-hidden="true">
                {item.poster ? <img src={image(item.poster)} alt="" loading="lazy" /> : <Clapperboard size={26} />}
              </div>
              <div className="organize-work-title">
                <h3>{item.media.title}</h3>
                <div className="management-actions">
                  <Chip size="sm" variant="soft">{kinds[item.media.type || ""] || "作品"}</Chip>
                  {!!item.media.season && <span>第 {item.media.season} 季</span>}
                  {item.active && <Chip size="sm" variant="soft">处理中</Chip>}
                </div>
                <small>最近活动 {time(item.lastActivityAt || item.createdAt)}</small>
              </div>
              <div className="organize-work-counts">
                {counts(item).map(([value,label]) => <div key={label}><strong>{value ?? "—"}</strong><span>{label}</span></div>)}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="media-note">最近记录保留 14 天内最多 100 条；不足时保留最近 10 条，执行中的记录保留至任务结束。资源数按已确认的媒体文件去重统计。</p>
    </section>
  );
}
