import { useEffect, useRef, useState } from "react";
import { X, Play, Plus, Star, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MediaCard from "./MediaCard";
import type { MediaItemUI } from "@/types/media";
import { useRecentMovies, useSeries, useItem, useSeriesSeasons, useSeasonEpisodes, rateItem, clearItemRating } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

interface DetailsModalProps {
  item: MediaItemUI | null;
  onClose: () => void;
}


function StarRating({ rating }: { rating?: number }) {
  if (rating == null) return null;

  const stars = Math.round((rating / 10) * 5 * 2) / 2;
  const full = Math.floor(stars);
  const half = stars % 1 !== 0;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f-${i}`} className="w-4 h-4 fill-primary text-primary" />
      ))}
      {half && <Star className="w-4 h-4 fill-primary/50 text-primary" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e-${i}`} className="w-4 h-4 text-muted-foreground/40" />
      ))}
    </div>
  );
}

function formatDuration(minutes?: number) {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function DetailsModal({ item, onClose }: DetailsModalProps) {
  const qc = useQueryClient();
  const [ratingDraft, setRatingDraft] = useState<number>(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const rememberBrowsePath = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("redline:last-browse-path", `${window.location.pathname}${window.location.search}`);
  };

  const { data: itemDetails } = useItem(item?.id);
  const effective = itemDetails ? jellyfinToMediaUI(itemDetails, { posterWidth: 640, backdropWidth: 1400 }) : item;
  const seasonsQ = useSeriesSeasons(effective?.kind === "Series" ? effective.id : undefined);
  const seasons = seasonsQ.data?.Items ?? [];

  useEffect(() => {
    if (effective?.kind !== "Series") {
      setSelectedSeasonId(null);
      return;
    }
    // default to first season
    const first = seasons[0]?.Id;
    if (first && !selectedSeasonId) setSelectedSeasonId(first);
  }, [effective?.id, effective?.kind, seasons.length]);

  const episodesQ = useSeasonEpisodes(selectedSeasonId ?? undefined);
  const episodes = episodesQ.data?.Items ?? [];


  useEffect(() => {
    if (!effective) return;
    setRatingDraft(typeof effective.rating === "number" ? Math.round(effective.rating / 2) : 0);
    setRatingError(null);
    setRatingOpen(false);
  }, [effective?.id]);

  const { data: recentMovies } = useRecentMovies(12);
  const { data: series } = useSeries(0, 12, "");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Enter" && e.target === modalRef.current) {
        if (!effective?.id) return;
        if (effective.kind === "MusicAlbum") { rememberBrowsePath(); navigate(`/music/album/${effective.id}`); }
        else { rememberBrowsePath(); navigate(`/watch/${effective.id}`); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, navigate, effective?.id, effective?.kind]);

  useEffect(() => {
    if (!item) return;
    setTimeout(() => {
      primaryActionRef.current?.focus();
      if (document.activeElement !== primaryActionRef.current) {
        modalRef.current?.focus();
      }
    }, 0);
  }, [item?.id]);

  if (!item || !effective) return null;

  const showRelated = effective.kind === "Movie" || effective.kind === "Series" || effective.kind === "Episode";
  const relatedCandidates = effective.kind === "Series" ? (series?.Items ?? []) : (recentMovies ?? []);
  const related = showRelated
    ? relatedCandidates
        .filter((x) => x.Id !== effective.id)
        .slice(0, 10)
        .map((x) => jellyfinToMediaUI(x))
    : [];

  const primaryAction =
    effective.kind === "MusicAlbum"
      ? { label: "Tracks", onClick: () => { rememberBrowsePath(); navigate(`/music/album/${effective.id}`); }, icon: Music2 }
      : { label: "Play", onClick: () => { rememberBrowsePath(); navigate(`/watch/${effective.id}`); }, icon: Play };

  const duration = formatDuration(effective.durationMinutes);

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`${effective.title} details`}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-4xl bg-card rounded-lg overflow-hidden shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary max-h-[calc(100vh-4rem)] flex flex-col"
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex-none w-full h-[38vh] max-h-[420px] min-h-[220px]">
          <img src={effective.backdropUrl ?? effective.posterUrl ?? ""} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent pointer-events-none" />

          <Button
            variant="ghost"
            size="icon"
            className="focusable absolute top-4 right-4 bg-background/50 hover:bg-background/70"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>

          <div className="absolute bottom-0 left-0 right-0 p-6 space-y-4">
            <h2 className="text-3xl font-black text-foreground">{effective.title}</h2>            <StarRating rating={effective.rating} />

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {effective.year && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">{effective.year}</span>
              )}
              {effective.kind !== "Other" && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">{effective.kind}</span>
              )}
              {effective.artist && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">{effective.artist}</span>
              )}
              {effective.album && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">{effective.album}</span>
              )}
              {duration && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">{duration}</span>
              )}
              {effective.seriesTitle && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">{effective.seriesTitle}</span>
              )}
              {effective.season && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">S{effective.season}</span>
              )}
              {effective.episode && (
                <span className="px-2 py-0.5 border border-muted-foreground/30 rounded">E{effective.episode}</span>
              )}
            </div>

            <div className="flex items-center gap-3" data-tv-group="details-actions">
              <Button
                ref={primaryActionRef}
                className="focusable gap-2 bg-foreground text-background hover:bg-foreground/90 font-bold px-6 py-5 rounded-md"
                onClick={primaryAction.onClick}
                aria-label={`${primaryAction.label} ${effective.title}`}
                data-tv-autofocus="true"
              >
                <primaryAction.icon className="w-4 h-4 fill-current" />
                {primaryAction.label}
              </Button>
              <div className="relative">
                <Button
                  type="button"
                  variant="secondary"
                  className="focusable gap-2 px-6 py-5 rounded-md"
                  aria-label="Rate"
                  aria-expanded={ratingOpen}
                  onClick={() => setRatingOpen((v) => !v)}
                >
                    <Star className="w-4 h-4" />
                    Rate
                </Button>

                {ratingOpen && (
                  <div className="absolute left-0 top-full mt-2 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md z-[80]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Your rating</div>
                      <div className="text-sm text-muted-foreground">
                        {ratingDraft > 0 ? `${ratingDraft} / 5` : "Not rated"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const v = i + 1;
                        const filled = v <= ratingDraft;
                        return (
                          <button
                            key={v}
                            type="button"
                            className="focusable rounded-md p-2 hover:bg-accent/50"
                            aria-label={`Rate ${v} stars`}
                            onClick={async () => {
                              if (!effective) return;
                              try {
                                setRatingSaving(true);
                                setRatingError(null);
                                setRatingDraft(v);
                                await rateItem(effective.id, v * 2);
                                await qc.invalidateQueries({ queryKey: ["jellyfin"] });
                              } catch (e: any) {
                                setRatingError(e?.message ?? "Failed to save rating");
                              } finally {
                                setRatingSaving(false);
                              }
                            }}
                          >
                            <Star className={filled ? "w-6 h-6 fill-primary text-primary" : "w-6 h-6 text-muted-foreground/50"} />
                          </button>
                        );
                      })}

                      {ratingDraft > 0 ? (
                        <Button
                          variant="ghost"
                          className="focusable ml-auto"
                          onClick={async () => {
                            if (!effective) return;
                            try {
                              setRatingSaving(true);
                              setRatingError(null);
                              setRatingDraft(0);
                              await clearItemRating(effective.id);
                              await qc.invalidateQueries({ queryKey: ["jellyfin"] });
                            } catch (e: any) {
                              setRatingError(e?.message ?? "Failed to clear rating");
                            } finally {
                              setRatingSaving(false);
                            }
                          }}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>

                    {ratingError && <div className="text-sm text-destructive">{ratingError}</div>}
                    <div className="text-xs text-muted-foreground">
                      Ratings are synced through Jellyfin for your account.
                    </div>
                  </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-6 space-y-6 overflow-y-auto">
          {effective.description && (
            <p className="text-base text-secondary-foreground/90 leading-relaxed">{effective.description}</p>
          )}

          
          {effective.kind === "Series" && (
            <div className="space-y-3" data-tv-group="details-episodes">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-foreground">Episodes</h3>
                  <p className="text-xs text-muted-foreground">Choose an episode and press Enter/OK to play</p>
                </div>
                <div className="w-44">
                  <Select value={selectedSeasonId ?? undefined} onValueChange={(v) => setSelectedSeasonId(v)}>
                    <SelectTrigger
                      className="focusable border-primary/40 bg-background/70 text-foreground"
                      data-tv-season-trigger="true"
                    >
                      <SelectValue placeholder="Season" />
                    </SelectTrigger>
                    <SelectContent>
                      {seasons.map((s, idx) => (
                        <SelectItem key={s.Id} value={s.Id}>
                          {s.Name || `Season ${idx + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1" data-tv-episode-column="true">
                {episodes.map((ep, idx) => {
                  const ui = jellyfinToMediaUI(ep, { posterWidth: 420, backdropWidth: 900 });
                  const epNum = ep.IndexNumber != null ? ep.IndexNumber : idx + 1;
                  const dur = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10_000_000 / 60) : undefined;
                  return (
                    <button
                      key={ep.Id}
                      className="relative w-full text-left focusable rounded-md border border-transparent bg-background/30 p-3 flex gap-3 items-center transition-all hover:bg-background/40 focus-visible:outline-none focus-visible:border-primary/70 focus-visible:bg-background/60 focus-visible:z-20 focus-visible:-translate-y-0.5 focus-visible:scale-[1.01] focus-visible:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
                      onClick={() => navigate(`/watch/${ep.Id}`)}
                      data-episode-id={ep.Id}
                      data-tv-episode-column-item="true"
                      onKeyDown={(e) => {
                        const key = e.key;
                        if (key === "Enter" || key === " " || key === "Select" || key === "OK") {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/watch/${ep.Id}`);
                        }
                      }}
                      onKeyUp={(e) => {
                        if (e.code === "NumpadEnter") {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/watch/${ep.Id}`);
                        }
                      }}
                      onFocus={(e) => {
                        e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                      }}
                      aria-label={`Play ${ui.title}`}
                    >
                      <div className="grid grid-cols-[2rem_8.75rem_1fr_auto] items-center gap-3 md:grid-cols-[2.5rem_10rem_1fr_auto]">
                        <div className="text-center text-xl font-bold text-muted-foreground/90">{epNum}</div>

                        <div className="overflow-hidden rounded bg-muted" style={{ aspectRatio: "16/9" }}>
                          <img
                            src={ui.backdropUrl ?? ui.posterUrl ?? ""}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-base font-bold text-foreground">
                            {ep.IndexNumber != null ? `E${ep.IndexNumber}: ` : ""}
                            {ui.title}
                          </div>
                          {ui.description ? (
                            <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ui.description}</div>
                          ) : null}
                        </div>

                        <div className="pl-2 text-sm font-semibold text-muted-foreground">{dur != null ? `${dur}m` : "—"}</div>
                      </div>
                    </button>
                  );
                })}
                {episodes.length === 0 && (
                  <div className="rounded-md border border-dashed border-white/15 bg-background/30 px-4 py-6 text-sm text-muted-foreground">
                    No episodes found for this season.
                  </div>
                )}
              </div>
            </div>
          )}


          {related.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xl font-black text-foreground">More like this</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {related.map((r) => (
                  <MediaCard key={r.id} item={r} onClick={() => { rememberBrowsePath(); navigate(`/watch/${r.id}`); }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
