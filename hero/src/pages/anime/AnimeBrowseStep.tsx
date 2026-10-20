import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { ChevronDown, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { Empty } from "../../components/media/MediaUI";
import { Field, SelectField } from "../../components/ui/ManagementUI";
import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import { type SavedAnimeSubscription } from "../../lib/anime-api";
import { animeSeasonOptions, currentAnimeSeason } from "../../lib/anime-season";
import { type Session } from "../../lib/media-service";

export function AnimeBrowseStep({ selectAnime, setStep, setSelectedGroup, setSelectedRule, draft,
  query, setQuery, season, setSeason, seasons, catalog, groups, setGroups, selected, setSelected, busy, browse, session,
}: ReturnType<typeof useAnimeEditor> & { session: Session; close: () => void; created: (a: SavedAnimeSubscription) => void }) {
  const [weekday, setWeekday] = useState("");
  const labels = Array.from(new Set(catalog.map((item) => item.week || "其他")));
  const today = `星期${"日一二三四五六"[new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" })).getDay()]}`;
  useEffect(() => {
    if (!labels.includes(weekday)) setWeekday(labels.includes(today) ? today : labels[0] || "");
  }, [catalog, weekday, today]);
  const visible = catalog.filter((item) => (item.week || "其他") === weekday);
  const options = draft.source === "mikan"
    ? Array.from(new Set([currentAnimeSeason(), ...seasons, ...animeSeasonOptions()]))
    : Array.from(new Set([season, ...seasons])).filter(Boolean);
  if (session.mode !== "live" || draft.source === "other") return null;
  return <div className="anime-mikan-browser">
    <form className="anime-mikan-search" onSubmit={(e) => { e.preventDefault(); void browse(); }}>
      <Field label="搜索番剧" value={query} onChange={setQuery} placeholder="输入番剧标题" />
      <Button type="submit" variant="secondary" isDisabled={busy}><Search size={16} />搜索</Button>
    </form>
    <div className="anime-mikan-tools">
      <SelectField label="播出季度" value={season} options={options.map((s) => [s, s])} onChange={(value) => { setSeason(value); void browse(false, value); }} />
      <Button variant="ghost" isDisabled={busy} onPress={() => void browse(true)}><RefreshCw size={15} />刷新来源</Button>
    </div>
    {!!labels.length && <div className="anime-week-tabs" role="tablist" aria-label="播出分类">
      {labels.map((label) => <button type="button" role="tab" aria-selected={weekday === label} key={label} onClick={() => { setWeekday(label); setSelected(null); setGroups([]); }}>{label}</button>)}
    </div>}
    <div className="anime-mikan-list">
      {!busy && !visible.length && <Empty>没有找到番剧，请更换季度或搜索标题。</Empty>}
      {visible.map((item) => <div className="anime-mikan-entry" key={item.id}>
        <button type="button" className="anime-mikan-title" aria-expanded={selected?.id === item.id} onClick={() => {
          if (selected?.id === item.id) { setSelected(null); setGroups([]); } else void selectAnime(item);
        }}>
          {item.poster && <img src={item.poster} alt="" loading="lazy" />}
          <span>{item.title}</span>{selected?.id === item.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {selected?.id === item.id && <div className="anime-mikan-groups">
          {busy && <p role="status">正在读取字幕组…</p>}
          {!busy && !groups.length && <p>暂无字幕组，请刷新来源或选择其他番剧。</p>}
          {groups.map((group) => <div className="anime-mikan-group" key={group.url}>
            <div className="anime-mikan-group-line"><div className="anime-mikan-group-name"><strong>{group.label}</strong><small>{group.items[0]?.publishedAt ? new Date(group.items[0].publishedAt).toLocaleDateString("zh-CN") : ""}</small></div>
              <div className="anime-mikan-tags">{group.groupRegex?.tags?.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <Button size="sm" variant="secondary" aria-label={`添加 ${group.label}`} onPress={() => { setSelectedGroup(group); setSelectedRule(-1); setStep("match"); }}><Plus size={14} />添加</Button>
            </div>
            <details><summary>发布记录（{group.items.length}）</summary>{group.items.map((entry, n) => <p key={n}>{entry.title}</p>)}</details>
          </div>)}
        </div>}
      </div>)}
    </div>
    <div className="anime-step-actions"><Button variant="secondary" onPress={() => setStep("source")}>返回来源</Button><span className="anime-step-hint">{season} · {catalog.length} 部番剧</span></div>
  </div>;
}
