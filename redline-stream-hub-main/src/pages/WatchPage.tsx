import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import { ExternalLink, Loader2, AlertCircle, Play, Pause, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItem, useSeriesSeasons, useSeasonEpisodes } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";

async function tryRequestFullscreen(video: HTMLVideoElement) {
  const v = video as HTMLVideoElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  if (document.fullscreenElement) return;

  try {
    if (typeof v.requestFullscreen === "function") {
      await v.requestFullscreen();
    } else if (typeof v.webkitRequestFullscreen === "function") {
      await v.webkitRequestFullscreen();
    } else if (typeof v.msRequestFullscreen === "function") {
      await v.msRequestFullscreen();
    }
  } catch {
    // Browsers can reject this if there was no user gesture; ignore safely.
  }
}

function isLikelyTvDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /smart-tv|smarttv|tizen|webos|appletv|hbbtv|aft|googletv|bravia|viera|roku|crkey|tv/.test(ua);
}

export default function WatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  const { data: itemDetails, isLoading, isError } = useItem(id);

  const media = useMemo(
    () => (itemDetails ? jellyfinToMediaUI(itemDetails, { posterWidth: 640, backdropWidth: 1400 }) : null),
    [itemDetails]
  );

  const kind = media?.kind ?? "Movie";
  const directStreamUrl = id ? `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}` : "";
  const transcodeStreamUrl = id
    ? `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}&preferTranscode=1`
    : "";

  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamUrl, setStreamUrl] = useState(() => (isLikelyTvDevice() ? transcodeStreamUrl || directStreamUrl : directStreamUrl));
  const detailsMeta = itemDetails as ({ SeriesId?: string; SeasonId?: string; Id?: string } & typeof itemDetails) | undefined;
  const sourceSeriesId = detailsMeta?.SeriesId ?? detailsMeta?.Id;
  const isSeriesLike = kind === "Series" || kind === "Episode";
  const seasonsQ = useSeriesSeasons(isSeriesLike ? sourceSeriesId : undefined);
  const seasons = seasonsQ.data?.Items ?? [];
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const episodesQ = useSeasonEpisodes(selectedSeasonId ?? undefined);
  const episodes = episodesQ.data?.Items ?? [];

  useEffect(() => {
    setStreamUrl(isLikelyTvDevice() ? transcodeStreamUrl || directStreamUrl : directStreamUrl);
    setVideoError(null);
  }, [directStreamUrl, transcodeStreamUrl]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      playButtonRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [id]);

  useEffect(() => {
    if (!isSeriesLike) {
      setSelectedSeasonId(null);
      return;
    }

    const initialSeasonId = detailsMeta?.SeasonId;
    if (initialSeasonId && seasons.some((s) => s.Id === initialSeasonId)) {
      setSelectedSeasonId(initialSeasonId);
      return;
    }

    const first = seasons[0]?.Id;
    if (first) setSelectedSeasonId(first);
  }, [detailsMeta?.SeasonId, isSeriesLike, seasons]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => {
      setIsPlaying(true);
      void tryRequestFullscreen(v);
    };
    v.onplay = onPlay;
    v.onpause = () => setIsPlaying(false);

    return () => {
      v.onplay = null;
      v.onpause = null;
    };
  }, [streamUrl]);

  return (
    <Layout>
      <div className="page-container tv-safe pt-[calc(var(--nav-height)+1rem)] space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="focusable h-14 w-14 p-0 rounded-full bg-black/45 hover:bg-black/70 border border-primary/50 shadow-[0_0_20px_rgba(239,68,68,0.28)]"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            <img src="/back-button.svg" alt="Back" className="h-10 w-10" />
          </Button>

          {id ? (
            <a
              className="focusable inline-flex items-center gap-2 text-sm text-red-200/85 hover:text-red-100"
              href={streamUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open stream
              <ExternalLink className="w-4 h-4" />
            </a>
          ) : null}
        </div>

        {isLoading && (
          <div className="mt-10 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}

        {isError && (
          <div className="mt-10">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">Couldn’t load this item.</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Go back to <Link className="underline" to="/">Home</Link>.
            </p>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {media ? (
              <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-red-950/30 to-background p-5">
                <h1 className="text-3xl font-black text-red-100 tracking-tight">{media.title}</h1>
                {media.description ? (
                  <p className="text-sm text-red-50/80 mt-2 line-clamp-3 max-w-4xl">{media.description}</p>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl overflow-hidden border border-primary/35 bg-black shadow-[0_0_50px_rgba(220,38,38,0.28)]">
              <video
                ref={videoRef}
                className="focusable w-full max-h-[70vh] bg-black outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
                src={streamUrl}
                controls={false}
                tabIndex={0}
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                onKeyDown={async (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const v = videoRef.current;
                    if (!v) return;
                    if (v.paused) {
                      await tryRequestFullscreen(v);
                      await v.play().catch(() => setVideoError("Playback was blocked by the browser. Try pressing play again."));
                    } else {
                      v.pause();
                    }
                  }
                }}
                onError={() => {
                  if (streamUrl !== transcodeStreamUrl && transcodeStreamUrl) {
                    setStreamUrl(transcodeStreamUrl);
                    return;
                  }
                  setVideoError("Video/audio format isn't supported by this browser. Tried direct and transcoded playback.");
                }}
              />
            </div>

            {videoError ? (
              <div className="rounded-lg border border-border/50 bg-card p-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">{videoError}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  If this is an HEVC/H.265 source, browser-side playback may fail. Compatibility mode forces server transcoding for both video and audio, which is recommended on TV devices.
                </div>
              </div>
            ) : null}

            {/* Simple TV-friendly play/pause */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-black/35 p-3" data-tv-group="watch-controls">
              <Button
                ref={playButtonRef}
                className="focusable gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold"
                data-tv-autofocus="true"
                onClick={async () => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) {
                    // Request fullscreen from the direct user interaction path.
                    await tryRequestFullscreen(v);
                    await v.play().catch(() => {
                      setVideoError("Playback was blocked by the browser. Try pressing play again.");
                    });
                  } else {
                    v.pause();
                  }
                }}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              {streamUrl !== transcodeStreamUrl && transcodeStreamUrl ? (
                <Button
                  variant="secondary"
                  className="focusable bg-red-900/60 hover:bg-red-800/70 text-red-100"
                  onClick={() => {
                    setStreamUrl(transcodeStreamUrl);
                    setVideoError(null);
                  }}
                >
                  Audio issues? Compatibility mode
                </Button>
              ) : null}
              {streamUrl !== directStreamUrl ? (
                <Button
                  variant="outline"
                  className="focusable border-red-400/40 bg-black/40 text-red-100 hover:bg-red-950/50"
                  onClick={() => {
                    setStreamUrl(directStreamUrl);
                    setVideoError(null);
                  }}
                >
                  Use direct stream
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="focusable border-red-500/40 bg-black/40 text-red-100 hover:bg-red-950/50"
                onClick={async () => {
                  const v = videoRef.current;
                  if (!v) return;
                  await tryRequestFullscreen(v);
                }}
              >
                <Maximize className="w-4 h-4 mr-2" />
                Fullscreen
              </Button>
              <div className="text-xs text-red-100/75">TV mode: Enter toggles play on the video, Back returns to previous page</div>
            </div>

            {isSeriesLike ? (
              <section className="space-y-3 rounded-2xl border border-primary/20 bg-black/25 p-4" data-tv-group="watch-episodes">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-red-100">Episodes</h2>
                  <div className="w-48">
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

                <div className="flex gap-3 overflow-x-auto pb-2" data-tv-group="watch-episode-row">
                  {episodes.map((ep) => {
                    const epUi = jellyfinToMediaUI(ep, { posterWidth: 420, backdropWidth: 900 });
                    const epNum = ep.IndexNumber != null ? ep.IndexNumber : undefined;
                    return (
                      <button
                        key={ep.Id}
                        className="focusable min-w-[260px] max-w-[260px] rounded-xl border border-white/10 bg-black/40 hover:bg-black/60 transition-colors text-left"
                        data-episode-id={ep.Id}
                        onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })}
                        onClick={() => navigate(`/watch/${ep.Id}`)}
                        aria-label={`Play ${epUi.title}`}
                      >
                        <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                          <img src={epUi.backdropUrl ?? epUi.posterUrl ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-semibold text-red-50 line-clamp-1">{epNum != null ? `E${epNum}: ` : ""}{epUi.title}</div>
                          {epUi.description ? <p className="mt-1 text-xs text-red-100/75 line-clamp-2">{epUi.description}</p> : null}
                        </div>
                      </button>
                    );
                  })}
                  {episodes.length === 0 ? <div className="text-sm text-red-100/70">No episodes found for this season.</div> : null}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </Layout>
  );
}
