import { useEffect, useRef, useState } from "react";
import { X, Play, Plus, Star, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MediaCard from "./MediaCard";
import type { MediaItemUI } from "@/types/media";
import { useRecentMovies, useSeries, useItem, useSeriesSeasons, useSeasonEpisodes } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { setLocalStars, useRatingsVersion } from "@/lib/localRating";

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
  const _ratingsVersion = useRatingsVersion();
  const qc = useQueryClient();
  const [ratingDraft, setRatingDraft] = useState<number>(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    setRatingDraft(effective.userStars ?? 0);
    setRatingError(null);
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
        if (effective.kind === "MusicAlbum") navigate(`/music/album/${effective.id}`);
        else navigate(`/watch/${effective.id}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, navigate, effective?.id, effective?.kind]);

  useEffect(() => {
    if (item) {
      setTimeout(() => modalRef.current?.focus(), 0);
    }
  }, [item]);

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
      ? { label: "Tracks", onClick: () => navigate(`/music/album/${effective.id}`), icon: Music2 }
      : { label: "Play", onClick: () => navigate(`/watch/${effective.id}`), icon: Play };

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

            <div className="flex items-center gap-3">
              <Button
                className="focusable gap-2 bg-foreground text-background hover:bg-foreground/90 font-bold px-6 py-5 rounded-md"
                onClick={primaryAction.onClick}
                aria-label={`${primaryAction.label} ${effective.title}`}
              >
                <primaryAction.icon className="w-4 h-4 fill-current" />
                {primaryAction.label}
              </Button>
<Popover modal>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="focusable gap-2 px-6 py-5 rounded-md" aria-label="Rate">
                    <Star className="w-4 h-4" />
                    Rate
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 z-[70] pointer-events-auto" align="start">
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
                                setLocalStars(effective.id, v);
                                // just to refresh any cached lists so UI updates immediately
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
                              setLocalStars(effective.id, null);
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
                      Ratings are saved locally on this device.
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-6 space-y-6 overflow-y-auto">
          {effective.description && (
            <p className="text-base text-secondary-foreground/90 leading-relaxed">{effective.description}</p>
          )}

          
          {effective.kind === "Series" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-black text-foreground">Episodes</h3>
                <div className="w-44">
                  <Select value={selectedSeasonId ?? undefined} onValueChange={(v) => setSelectedSeasonId(v)}>
                    <SelectTrigger className="focusable">
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

              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {episodes.map((ep) => {
                  const ui = jellyfinToMediaUI(ep, { posterWidth: 420, backdropWidth: 900 });
                  const epNum = ep.IndexNumber != null ? ep.IndexNumber : undefined;
                  const dur = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10_000_000 / 60) : undefined;
                  return (
                    <button
                      key={ep.Id}
                      className="w-full text-left focusable rounded-md bg-background/30 hover:bg-background/40 transition-colors p-3 flex gap-3 items-center"
                      onClick={() => navigate(`/watch/${ep.Id}`)}
                      aria-label={`Play ${ui.title}`}
                    >
                      <div className="w-36 flex-none rounded overflow-hidden bg-muted" style={{ aspectRatio: "16/9" }}>
                        <img src={ui.backdropUrl ?? ui.posterUrl ?? ""} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="font-bold text-foreground truncate">
                            {epNum != null ? `E${epNum}: ` : ""}{ui.title}
                          </div>
                          {dur != null && <div className="text-xs text-muted-foreground">{dur}m</div>}
                        </div>
                        {ui.description && <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{ui.description}</div>}
                      </div>
                    </button>
                  );
                })}
                {episodes.length === 0 && (
                  <div className="text-sm text-muted-foreground">No episodes found for this season.</div>
                )}
              </div>
            </div>
          )}


          {related.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xl font-black text-foreground">More like this</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {related.map((r) => (
                  <MediaCard key={r.id} item={r} onClick={() => navigate(`/watch/${r.id}`)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}