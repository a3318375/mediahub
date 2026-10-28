import { useEffect, useState } from "react";
import { formatRegion, presentTitle } from "../../lib/media-presentation";

import { Button, Card, Chip, Link } from "@heroui/react";

import { ChevronLeft, Film, Plus, Popcorn, Search } from "lucide-react";

import { image } from "../../lib/media-service";



import type { MediaDetail, MediaSummary } from "../../lib/media-contract";

import {
  errorText,
  kindLabels,
  MediaImage,
  type API,
} from "../../components/media/MediaUI";

export function Detail({
  media,
  api,
  close,
  search,
  subscribe,
}: {
  media: MediaSummary;
  api: API;
  close: () => void;
  search: (q: string) => void;
  subscribe: (m: MediaSummary, season: number) => void;
}) {
  const [data, setData] = useState<MediaDetail>(media);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setData(media);
    setBusy(true);
    setError("");
    api
      .detail(media)
      .then((v) => {
        if (active) {
          setData(v);

        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, media]);
  const { title, subtitle } = presentTitle(data);
  const region = formatRegion(data.originCountries, data.region);
  return (
    <section className="detail-page" aria-label={`${data.title}的作品详情`}>
      <Button variant="ghost" onPress={close}>
        <ChevronLeft size={16} />
        返回列表
      </Button>
      <section className="detail-hero">
        {image(data.backdropPath || data.posterPath) && (
          <MediaImage
            className="detail-backdrop"
            src={image(data.backdropPath || data.posterPath)!}
            alt=""
          />
        )}

        <div className="media-detail">
          <div className="media-detail-poster">
            {image(data.posterPath) ? (
              <MediaImage src={image(data.posterPath)!} alt={data.title} />
            ) : (
              <div className="poster-placeholder">{data.title}</div>
            )}
          </div>
          <div className="detail-copy">
        <h1>
          {title}
          {data.year && <small> ({data.year})</small>}
        </h1>
            <p>{subtitle}</p>
            <p>
              {data.year} · {data.genres.join(" / ")}
            </p>
            <p className="media-note">
              {data.status}{" "}
              {data.runtimeMinutes ? `· ${data.runtimeMinutes} 分钟` : ""}{" "}
              {region}
            </p>
            {data.tagline && <p>{data.tagline}</p>}
            {data.provider === "anilist" && !!data.titles?.synonyms?.length && (
              <p>别名：{data.titles.synonyms.slice(0, 5).join("、")}</p>
            )}
            {data.externalIds?.imdb &&
              /^tt\d+$/.test(data.externalIds.imdb) && (
                <Link
                  className="detail-imdb-link"
                  href={`https://www.imdb.com/title/${data.externalIds.imdb}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看 IMDb 条目
                </Link>
              )}
            <div className="media-ratings">
              {data.ratings.map((r) => (
                <Chip key={r.source} variant="soft">
                  <span className="detail-rating-icon" aria-hidden="true">
                    {r.source === "tmdb" && <img src={`${import.meta.env.BASE_URL}icons/tmdb.svg`} alt="" />}
                    {r.source === "tomatoes" && <svg viewBox="0 0 24 24" fill="none"><path d="M12 7C7 3 2 7 2 13c0 5 5 9 10 8 5 1 10-3 10-8 0-6-5-10-10-6Z" fill="#fa5555"/><path d="m12 8-5-3 4 1 1-4 2 4 4-1-4 4-2-1Z" fill="#71d48b"/><path d="M7 10c-2 1-2 3-2 4" stroke="#ffb3ab" strokeWidth="2" strokeLinecap="round"/></svg>}
                    {r.source === "popcorn" && <Popcorn size={18} color="#ffe08a" />}
                  </span>
                  {r.source === "tomatoes" ? "烂番茄" : r.source === "popcorn" ? "爆米花" : r.source.toUpperCase()} · {r.value}{(r.source === "tomatoes" || r.source === "popcorn") ? "%" : ""}
                </Chip>
              ))}
            </div>
            {data.ratingsMessage && <p className="media-note" role="status">{data.ratingsMessage}</p>}
            <p>{busy ? "正在加载详情…" : data.overview || "暂无简介"}</p>
            {error && (
              <p role="alert" className="media-error">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="management-actions">
          <Button variant="secondary" onPress={() => search(title)}>
            <Search size={15} />
            搜索资源
          </Button>
          {(data.source === "tmdb" || data.externalIds?.tmdb) &&
            data.mediaType === "tv" && (
              <Button
                onPress={() =>
                  subscribe(
                    {
                      ...data,
                      source: "tmdb",
                      provider: "tmdb",
                      sourceId: data.externalIds?.tmdb || data.sourceId,
                      providerId: data.externalIds?.tmdb || data.providerId,
                    },
                    0,
                  )
                }
              >
                <Plus size={15} />
                订阅此剧
              </Button>
            )}
        </div>
      </section>
      <div className="detail-columns">
        <Card className="detail-profile">
          <h2>作品资料</h2>
          <dl>
            {[
              ["类型", kindLabels[data.mediaType]],
              ["原名", subtitle],
              ["发布时间", data.releaseDate],
              ["年份", data.year],
              ["地区", region],
              ["来源", data.provider],
              ["状态", data.status],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {!!data.seasons?.length && <div className="detail-season-summary"><h3>季与集</h3><dl>{data.seasons.map((season) => <div key={season.seasonNumber}><dt>{season.name || `第 ${season.seasonNumber} 季`}</dt><dd>{season.episodeCount ? `${season.episodeCount} 集` : "待公布"}</dd></div>)}</dl></div>}
          {data.externalIds?.imdb && (
            <Link
              href={`https://www.imdb.com/title/${encodeURIComponent(data.externalIds.imdb)}/`}
              target="_blank"
              rel="noreferrer"
            >
              IMDb · {data.externalIds.imdb}
            </Link>
          )}
          <div className="management-actions">
            {(data.genres.length ? data.genres : ["暂无标签"]).map((g) => (
              <Chip key={g} size="sm">
                {g}
              </Chip>
            ))}
          </div>
        </Card>
        <div className="detail-content">
          {(!!data.credits?.length || busy || error) && (
            <section className="detail-credits">
              <h2>演职员</h2>
              {!data.credits?.length && (
                <p role="status">
                  {busy ? "正在加载演职员信息…" : "暂无演职员信息。"}
                </p>
              )}
              <div>
                {data.credits?.map((credit, index) => (
                  <article key={`${credit.name}-${index}`}>
                    {credit.profilePath ? (
                      <MediaImage
                        src={image(credit.profilePath)!}
                        alt={credit.name}
                      />
                    ) : (
                      <div className="credit-placeholder">
                        <Film size={24} />
                      </div>
                    )}
                    <strong>{credit.name}</strong>
                    <small>{credit.role}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </section>
  );
}
