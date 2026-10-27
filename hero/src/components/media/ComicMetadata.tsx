import type { ReactNode } from "react";
import { Button, Chip } from "@heroui/react";
import { languageLabel, namespaceLabel, tagLabel } from "../../lib/ehentai-tags";

export type GalleryMetadata = { id: string; token: string; site: string; title: string; japaneseTitle: string; cover: string; category: string; uploader: string; posted: string; language: string; rating: string; pages: number; tags: Record<string, string[]>; fetchedAt?: string };

/** The same gallery fields and namespace labels for remote and local comics. */
export function ComicMetadataDetails({ metadata, cover, onTag }: { metadata: GalleryMetadata; cover: ReactNode; onTag?: (namespace: string, tag: string) => void }) {
  return <><div className="eh-detail">{cover}<dl className="reading-details"><dt>日文标题</dt><dd>{metadata.japaneseTitle || "—"}</dd><dt>分类</dt><dd>{metadata.category || "—"}</dd><dt>页数</dt><dd>{metadata.pages || "未知"}</dd><dt>语言</dt><dd>{languageLabel(metadata.language) || "—"}</dd><dt>上传者</dt><dd>{metadata.uploader || "—"}</dd><dt>发布</dt><dd>{metadata.posted || "—"}</dd><dt>评分</dt><dd>{metadata.rating || "—"}</dd></dl></div><div className="eh-tags">{Object.entries(metadata.tags || {}).map(([namespace, tags]) => <div key={namespace}><strong>{namespaceLabel(namespace)}</strong><p>{tags.map(tag => onTag ? <Button variant="ghost" type="button" key={tag} className="eh-tag" aria-label={`搜索${namespaceLabel(namespace)}：${tagLabel(namespace, tag)}`} onPress={() => onTag(namespace, tag)}>{tagLabel(namespace, tag)}</Button> : <Chip key={tag} variant="soft">{tagLabel(namespace, tag)}</Chip>)}</p></div>)}</div></>;
}
