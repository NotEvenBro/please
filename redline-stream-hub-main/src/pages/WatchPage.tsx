import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import { ExternalLink, Loader2, AlertCircle, Play, Pause, Maximize, Minimize, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItem, useSeriesSeasons, useSeasonEpisodes } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";

async function tryRequestFullscreen(video: HTMLVideoElement) {
  const v = video as HTMLVideoElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  try {
    if (typeof v.requestFullscreen === "function") {
      await v.requestFullscreen();
    } else if (typeof v.webkitRequestFullscreen === "function") {
      await v.webkitRequestFullscreen();
    } else if (typeof v.msRequestFullscreen === "function") {
      await v.msRequestFullscreen();
    }
  } catch {
    // Ignore: browsers can reject fullscreen without a valid gesture.
  }
}

async function tryExitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };

  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return;
    }
    if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
      return;
    }
    if (typeof doc.msExitFullscreen === "function") {
      await doc.msExitFullscreen();
    }
  } catch {
    // Ignore fullscreen exit failures.
  }
}

function isLikelyTvDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /smart-tv|smarttv|tizen|webos|appletv|hbbtv|aft|googletv|bravia|viera|roku|crkey|tv/.test(ua);
}

function isViddaEdgeDevice() {
  if (typeof navigator === "undefined") return false;
  return /vidda_edge/i.test(navigator.userAgent || "");
}

const REMOTE_BACK_KEYS = new Set(["Escape", "BrowserBack", "Backspace", "GoBack", "XF86Back"]);
const REMOTE_BACK_CODES = new Set([8, 27, 461, 10009, 166]);

export default function WatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const autoFallbackRef = useRef({ manifestToDirectDone: false, directToTranscodeDone: false });
  const hideChromeTimerRef = useRef<number | null>(null);
  const fragErrorTimesRef = useRef<number[]>([]);
  const bufferErrorTimesRef = useRef<number[]>([]);
  const fragFallbackTriggeredRef = useRef(false);
  const mediaRecoveryAttemptedRef = useRef(false);
  const lastPlaybackProgressRef = useRef({ time: 0, at: Date.now() });

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
  const [hlsDebug, setHlsDebug] = useState<string | null>(null);
  const isViddaEdge = useMemo(() => isViddaEdgeDevice(), []);
  const [streamUrl, setStreamUrl] = useState(() => (isLikelyTvDevice() && !isViddaEdgeDevice() ? transcodeStreamUrl || directStreamUrl : directStreamUrl));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const detailsMeta = itemDetails as ({ SeriesId?: string; SeasonId?: string; Id?: string } & typeof itemDetails) | undefined;
  const sourceSeriesId = detailsMeta?.SeriesId ?? detailsMeta?.Id;
  const isSeriesLike = kind === "Series" || kind === "Episode";
  const seasonsQ = useSeriesSeasons(isSeriesLike ? sourceSeriesId : undefined);
  const seasons = seasonsQ.data?.Items ?? [];
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const episodesQ = useSeasonEpisodes(selectedSeasonId ?? undefined);
  const episodes = episodesQ.data?.Items ?? [];

  const clearHideControlsTimer = () => {
    if (hideChromeTimerRef.current != null) {
      window.clearTimeout(hideChromeTimerRef.current);
      hideChromeTimerRef.current = null;
    }
  };

  const scheduleControlsHide = () => {
    clearHideControlsTimer();
    if (!isPlaying) return;
    hideChromeTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 2800);
  };

  const showControlsNow = () => {
    setShowControls(true);
    scheduleControlsHide();
  };

  const togglePlayPause = async () => {
    const v = videoRef.current;
    if (!v) return;

    if (v.paused) {
      showControlsNow();
      await tryRequestFullscreen(v);
      await v.play().catch(() => {
        setVideoError("Playback was blocked by the browser. Try pressing play again.");
      });
      return;
    }

    v.pause();
    showControlsNow();
  };

  const seekBy = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    const safeDuration = Number.isFinite(v.duration) ? v.duration : 0;
    const nextTime = Math.max(0, Math.min(safeDuration || Number.MAX_SAFE_INTEGER, v.currentTime + seconds));
    v.currentTime = nextTime;
    showControlsNow();
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  useEffect(() => {
    setStreamUrl(isLikelyTvDevice() && !isViddaEdge ? transcodeStreamUrl || directStreamUrl : directStreamUrl);
    setVideoError(null);
    setHlsDebug(null);
  }, [directStreamUrl, transcodeStreamUrl, isViddaEdge]);

  useEffect(() => {
    autoFallbackRef.current = { manifestToDirectDone: false, directToTranscodeDone: false };
    fragErrorTimesRef.current = [];
    bufferErrorTimesRef.current = [];
    fragFallbackTriggeredRef.current = false;
    mediaRecoveryAttemptedRef.current = false;
    lastPlaybackProgressRef.current = { time: 0, at: Date.now() };
    setShowControls(true);
    setCurrentTime(0);
    setDuration(0);
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

    let cancelled = false;

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      v.src = "";
      v.load();
    };

    const FRAG_ERROR_WINDOW_MS = 12000;
    const FRAG_ERROR_THRESHOLD = 4;
    const BUFFER_ERROR_WINDOW_MS = 15000;
    const BUFFER_ERROR_THRESHOLD = 3;

    const setup = async () => {
      const shouldUseHls = streamUrl.includes("preferTranscode=1");
      if (!shouldUseHls) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        v.src = streamUrl;
        return;
      }

      try {
        const mod = await import("hls.js");
        const Hls = mod.default;
        if (cancelled) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 20,
            maxMaxBufferLength: 30,
            maxBufferSize: 30 * 1000 * 1000,
          });
          hlsRef.current = hls;
          hls.attachMedia(v);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            hls.loadSource(streamUrl);
          });
          hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string; details?: string; response?: { code?: number } }) => {
            const detail = [data?.type, data?.details, data?.response?.code ? `HTTP:${data.response.code}` : null]
              .filter(Boolean)
              .join(" | ");
            if (detail) setHlsDebug(detail);

            const httpCode = data?.response?.code;
            const details = String(data?.details || "");
            const isManifestNetworkFailure = data?.type === "networkError" && ["manifestLoadError", "manifestLoadTimeOut"].includes(details);
            const isFragNetworkFailure = data?.type === "networkError" && ["fragLoadError", "fragLoadTimeOut"].includes(details);
            const isBufferFailure = ["bufferStalledError", "bufferAppendError", "bufferFullError", "bufferNudgeOnStall"].includes(details);

            if (isBufferFailure && streamUrl !== directStreamUrl && !fragFallbackTriggeredRef.current) {
              const now = Date.now();
              bufferErrorTimesRef.current = [...bufferErrorTimesRef.current.filter((t) => now - t <= BUFFER_ERROR_WINDOW_MS), now];
              if (bufferErrorTimesRef.current.length >= BUFFER_ERROR_THRESHOLD) {
                fragFallbackTriggeredRef.current = true;
                setStreamUrl(directStreamUrl);
                setVideoError("Compatibility HLS buffer errors are repeating on this device. Falling back to direct stream.");
                return;
              }
            }

            if (isFragNetworkFailure && streamUrl !== directStreamUrl && !fragFallbackTriggeredRef.current) {
              const now = Date.now();
              fragErrorTimesRef.current = [...fragErrorTimesRef.current.filter((t) => now - t <= FRAG_ERROR_WINDOW_MS), now];
              if (fragErrorTimesRef.current.length >= FRAG_ERROR_THRESHOLD) {
                fragFallbackTriggeredRef.current = true;
                setStreamUrl(directStreamUrl);
                setVideoError("Compatibility HLS fragments are repeatedly failing on this device. Falling back to direct stream.");
                return;
              }
            }

            if (data?.fatal) {
              if (data?.type === "mediaError" && !mediaRecoveryAttemptedRef.current) {
                mediaRecoveryAttemptedRef.current = true;
                hls.recoverMediaError();
                setHlsDebug((prev) => (prev ? `${prev} | recoverMediaError` : "recoverMediaError"));
                return;
              }
              if ((httpCode === 504 || isManifestNetworkFailure) && streamUrl !== directStreamUrl && !autoFallbackRef.current.manifestToDirectDone) {
                autoFallbackRef.current.manifestToDirectDone = true;
                setStreamUrl(directStreamUrl);
                setVideoError(`Compatibility HLS manifest failed to load${isViddaEdge ? " on VIDAA Edge" : " on this device"}. Falling back to direct stream.`);
                return;
              }
              if (streamUrl !== directStreamUrl && !fragFallbackTriggeredRef.current) {
                fragFallbackTriggeredRef.current = true;
                setStreamUrl(directStreamUrl);
                setVideoError("Compatibility HLS hit a fatal playback error. Falling back to direct stream.");
                return;
              }
              setVideoError("Compatibility stream failed to load. Try switching stream mode.");
            }
          });
          return;
        }

        if (v.canPlayType("application/vnd.apple.mpegurl")) {
          v.src = streamUrl;
          return;
        }

        setVideoError("This browser cannot play HLS compatibility streams.");
      } catch {
        setVideoError("Failed to initialize HLS playback.");
      }
    };

    void setup();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [streamUrl, directStreamUrl, isViddaEdge]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const STALL_WINDOW_MS = 20000;
    const STALL_EPSILON_SECONDS = 0.35;
    const check = () => {
      if (streamUrl === directStreamUrl || fragFallbackTriggeredRef.current) return;
      if (v.paused || v.seeking || v.ended) {
        lastPlaybackProgressRef.current = { time: v.currentTime || 0, at: Date.now() };
        return;
      }

      const now = Date.now();
      const delta = Math.abs((v.currentTime || 0) - lastPlaybackProgressRef.current.time);
      if (delta > STALL_EPSILON_SECONDS) {
        lastPlaybackProgressRef.current = { time: v.currentTime || 0, at: now };
        return;
      }

      if (now - lastPlaybackProgressRef.current.at >= STALL_WINDOW_MS) {
        fragFallbackTriggeredRef.current = true;
        setStreamUrl(directStreamUrl);
        setVideoError("Playback appears stalled on compatibility HLS. Falling back to direct stream.");
      }
    };

    const timer = window.setInterval(check, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [streamUrl, directStreamUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => {
      setIsPlaying(true);
      void tryRequestFullscreen(v);
      scheduleControlsHide();
    };

    const onPause = () => {
      setIsPlaying(false);
      clearHideControlsTimer();
      setShowControls(true);
    };

    const onTimeUpdate = () => setCurrentTime(v.currentTime || 0);
    const onLoadedMetadata = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [streamUrl, isPlaying]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setShowControls(true);
      scheduleControlsHide();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [isPlaying]);

  useEffect(() => {
    const onBack = (e: KeyboardEvent) => {
      const code = typeof e.keyCode === "number" ? e.keyCode : undefined;
      const shouldHandleBack = REMOTE_BACK_KEYS.has(e.key) || (code != null && REMOTE_BACK_CODES.has(code));
      if (!shouldHandleBack) return;
      if (!document.fullscreenElement) return;

      e.preventDefault();
      e.stopPropagation();
      void tryExitFullscreen();
    };

    window.addEventListener("keydown", onBack, true);
    return () => window.removeEventListener("keydown", onBack, true);
  }, []);

  useEffect(() => {
    return () => {
      clearHideControlsTimer();
    };
  }, []);

  return (
    <Layout>
      <div className="page-container tv-safe pt-[calc(var(--nav-height)+1rem)] space-y-6" data-tv-group="watch-page">
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

            <div
              className="relative rounded-2xl overflow-hidden border border-primary/35 bg-black shadow-[0_0_50px_rgba(220,38,38,0.28)]"
              onMouseMove={showControlsNow}
              onPointerMove={showControlsNow}
              onTouchStart={showControlsNow}
            >
              <video
                ref={videoRef}
                className="w-full max-h-[72vh] bg-black"
                controls={false}
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                onClick={() => {
                  void togglePlayPause();
                }}
                onError={() => {
                  const cameFromManifestFallback = streamUrl === directStreamUrl && autoFallbackRef.current.manifestToDirectDone;
                  if (!cameFromManifestFallback && streamUrl !== transcodeStreamUrl && transcodeStreamUrl && !autoFallbackRef.current.directToTranscodeDone) {
                    autoFallbackRef.current.directToTranscodeDone = true;
                    setStreamUrl(transcodeStreamUrl);
                    return;
                  }
                  setVideoError("Video/audio format isn't supported by this browser. Tried direct and transcoded playback.");
                }}
              />

              <div
                className={`absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10 transition-opacity duration-200 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 space-y-3">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(duration, 0.1)}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(e) => {
                      const v = videoRef.current;
                      if (!v) return;
                      v.currentTime = Number(e.target.value);
                      showControlsNow();
                    }}
                    className="w-full accent-red-500 cursor-pointer"
                    aria-label="Seek"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => seekBy(-10)}>
                        <RotateCcw className="w-5 h-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => void togglePlayPause()}>
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => seekBy(10)}>
                        <RotateCw className="w-5 h-5" />
                      </Button>
                      <span className="text-xs md:text-sm text-white/90 tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="focusable text-white hover:bg-white/20"
                      onClick={() => {
                        if (isFullscreen) {
                          void tryExitFullscreen();
                        } else {
                          const v = videoRef.current;
                          if (!v) return;
                          void tryRequestFullscreen(v);
                        }
                      }}
                    >
                      {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </Button>
                  </div>
                </div>
              </div>
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

            {hlsDebug ? (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/20 p-3 text-xs text-yellow-200">
                HLS debug: {hlsDebug}
              </div>
            ) : null}

            {isViddaEdge ? (
              <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3 text-xs text-blue-100">
                VIDAA Edge detected: starting with direct stream first for better compatibility, then falling back to compatibility transcoding only if needed.
              </div>
            ) : null}

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
