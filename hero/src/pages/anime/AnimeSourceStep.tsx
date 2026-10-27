import { Button, TextArea } from "@heroui/react";
import { FilterTabs } from "../../components/media/MediaUI";
import { ChevronRight, Flower2, Info, Leaf, Radio, Search } from "lucide-react";
import { Field } from "../../components/ui/ManagementUI";
import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import { emptyAnimeDraft, type AnimeDraft, type SavedAnimeSubscription } from "../../lib/anime-api";
import { type Session } from "../../lib/media-service";
import { currentAnimeSeason } from "../../lib/anime-season";

const sources = [
  { id: "mikan", label: "Mikan", icon: Leaf, placeholder: "https://mikanani.me/RSS/Bangumi?bangumiId=xxx&subgroupid=xxx" },
  { id: "ani-bt", label: "AniBT", icon: Radio, placeholder: "粘贴 AniBT 的单个番剧与字幕组 RSS 地址" },
  { id: "anime-garden", label: "AnimeGarden", icon: Flower2, placeholder: "https://api.animes.garden/feed.xml?subject=xxx&fansub=xxx" },
  { id: "other", label: "其他", icon: Radio, placeholder: "https://…/rss" },
] as const;
export function AnimeSourceStep({ setSelectedGroup, setSelectedRule, draft, setDraft, setSeason,
  setSeasons, setCatalog, setGroups, setSelected, setPreview, change, resolve, browse, busy,
}: ReturnType<typeof useAnimeEditor> & { session: Session; close: () => void; created: (a: SavedAnimeSubscription) => void }) {
  const source = sources.find((item) => item.id === draft.source)!;
  const Icon = source.icon;
  function choose(value: AnimeDraft["source"]) {
    setDraft({ ...emptyAnimeDraft(), source: value });
    setSelectedGroup(null); setSelectedRule(-1); setPreview(null); setCatalog([]);
    setGroups([]); setSelected(null); setSeasons([]);
    setSeason(value === "mikan" ? currentAnimeSeason() : "");
  }
  return <div className="anime-source-picker">
    <FilterTabs label="订阅来源" value={draft.source} options={sources.map((item) => [item.id, item.label])} onChange={(value) => choose(value as AnimeDraft["source"])} />
    <div className="anime-source-panel">
      <div className="anime-source-heading">
        <Icon size={30} aria-hidden="true" />
        <div><h3>{source.label}</h3><p>RSS 订阅</p></div>
        {draft.source !== "other" && <Button variant="secondary" size="sm" isDisabled={busy} onPress={() => void browse()}><Search size={15} />浏览 {source.label}</Button>}
      </div>
      <label className="management-field"><span>RSS 地址</span><TextArea aria-label="RSS 地址" rows={3} value={draft.url} placeholder={source.placeholder} onChange={(event) => change("url", event.target.value)} /></label>
      {draft.source === "other" && <Field label="Bangumi ID" value={draft.bangumiId} onChange={(value) => change("bangumiId", value)} required />}
      <p className="anime-source-notice"><Info size={15} aria-hidden="true" /><span>请使用单个番剧与字幕组的 RSS，聚合订阅集中更新时可能出现遗漏。</span></p>
    </div>
    <div className="anime-step-actions anime-step-actions-end"><Button variant="secondary" isDisabled={busy || !draft.url.trim() || (draft.source === "other" && !draft.bangumiId.trim())} onPress={() => void resolve(draft)}>下一步<ChevronRight size={15} /></Button></div>
  </div>;
}
