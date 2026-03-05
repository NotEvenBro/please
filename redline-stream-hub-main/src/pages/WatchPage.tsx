import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import { ExternalLink, Loader2, AlertCircle, Play, Pause, Maximize, Minimize, RotateCcw, RotateCw, Volume2, VolumeX, Settings, ListVideo, SkipForward, Captions, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItem, useSeriesSeasons, useSeasonEpisodes } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";

async function tryRequestFullscreen(target: HTMLElement) {
  const v = target as HTMLElement & {
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
  const ua = navigator.userAgent || "";
  // Hisense TVs vary across firmware/user-agent strings (VIDAA, VIDDA_EDGE, Hisense).
  return /vidaa|vidda_edge|hisense/i.test(ua);
}

const REMOTE_BACK_KEYS = new Set(["Escape", "BrowserBack", "Backspace", "GoBack", "XF86Back"]);
const REMOTE_BACK_CODES = new Set([8, 27, 461, 10009, 166]);
const REMOTE_PLAY_PAUSE_CODES = new Set([13, 23, 66, 179, 415, 19]);
const REMOTE_PAUSE_CODES = new Set([19]);
const REMOTE_SEEK_FORWARD_CODES = new Set([417, 228]);
const REMOTE_SEEK_BACK_CODES = new Set([412, 227]);
const REMOTE_VOLUME_UP_CODES = new Set([447, 175]);
const REMOTE_VOLUME_DOWN_CODES = new Set([448, 174]);

export default function WatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  const autoFallbackRef = useRef({ manifestToDirectDone: false, directToTranscodeDone: false });
  const hideChromeTimerRef = useRef<number | null>(null);
  const fragErrorTimesRef = useRef<number[]>([]);
  const bufferErrorTimesRef = useRef<number[]>([]);
  const fragFallbackTriggeredRef = useRef(false);
  const mediaRecoveryAttemptedRef = useRef(false);
  const lastPlaybackProgressRef = useRef({ time: 0, at: Date.now() });
  const playPauseButtonRef = useRef<HTMLButtonElement | null>(null);

  const { data: itemDetails, isLoading, isError } = useItem(id);

  const media = useMemo(
    () => (itemDetails ? jellyfinToMediaUI(itemDetails, { posterWidth: 640, backdropWidth: 1400 }) : null),
    [itemDetails]
  );

  const kind = media?.kind ?? "Movie";
  const [subtitleMode, setSubtitleMode] = useState<"auto" | "off">("auto");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [showSeasonPanel, setShowSeasonPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  const directStreamUrl = useMemo(() => {
    if (!id) return "";
    const subtitle = subtitleMode === "off" ? "&subtitle=off" : "";
    return `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}${subtitle}`;
  }, [id, kind, subtitleMode]);

  const transcodeStreamUrl = useMemo(() => {
    if (!id) return "";
    const subtitle = subtitleMode === "off" ? "&subtitle=off" : "";
    return `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}&preferTranscode=1${subtitle}`;
  }, [id, kind, subtitleMode]);

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
  const currentEpisodeIndex = episodes.findIndex((ep) => ep.Id === id);
  const nextEpisode = currentEpisodeIndex >= 0 ? episodes[currentEpisodeIndex + 1] : null;

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
      await tryRequestFullscreen(playerShellRef.current ?? v);
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


  const tryAutoPlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
      setVideoError(null);
    } catch {
      // Some browsers require explicit user gesture. Keep controls visible for retry.
      setShowControls(true);
    }
  };
  useEffect(() => {
    setStreamUrl(isLikelyTvDevice() && !isViddaEdge ? transcodeStreamUrl || directStreamUrl : directStreamUrl);
    setVideoError(null);
    setHlsDebug(null);
  }, [directStreamUrl, transcodeStreamUrl, isViddaEdge]);


  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
  }, [playbackRate]);

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
      const shouldPreferNativeHls = isViddaEdge || /vidaa|hisense/i.test(navigator.userAgent || "");
      if (!shouldUseHls) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        v.src = streamUrl;
        void tryAutoPlay();
        return;
      }

      try {
        const mod = await import("hls.js");
        const Hls = mod.default;
        if (cancelled) return;

        if (shouldPreferNativeHls && v.canPlayType("application/vnd.apple.mpegurl")) {
          v.src = streamUrl;
          setHlsDebug("Using native HLS path for VIDAA/Hisense device");
          void tryAutoPlay();
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: !shouldPreferNativeHls,
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
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void tryAutoPlay();
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
      void tryRequestFullscreen(playerShellRef.current ?? v);
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
  }, [isPlaying, isFullscreen]);

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
    const onRemoteControls = (e: KeyboardEvent) => {
      const code = typeof e.keyCode === "number" ? e.keyCode : -1;
      const key = String(e.key || "");
      const active = document.activeElement as HTMLElement | null;
      const inEpisodeRail = Boolean(active?.closest("[data-tv-group='watch-episodes'], [data-tv-group='watch-episode-row']"));
      const inPlayerContext = Boolean(
        active?.closest(
          "[data-tv-group='watch-controls'], [data-tv-group='watch-controls-extra'], [data-tv-group='watch-settings'], [data-tv-group='watch-season-panel'], [data-watch-seek='true']"
        )
      );
      const canHijackPlayerKeys = isFullscreen || inPlayerContext;

      const isPlayPause = REMOTE_PLAY_PAUSE_CODES.has(code) || ["Enter", "OK", "Select", "MediaPlayPause", "Center"].includes(key);
      const isPause = REMOTE_PAUSE_CODES.has(code) || key === "MediaPause";
      const isSeekForward = REMOTE_SEEK_FORWARD_CODES.has(code) || ["MediaFastForward", "FastForward"].includes(key);
      const isSeekBack = REMOTE_SEEK_BACK_CODES.has(code) || ["MediaRewind", "Rewind"].includes(key);
      const isArrowSeek = (key === "ArrowLeft" || key === "ArrowRight") && canHijackPlayerKeys && !inEpisodeRail;
      const isVolumeUp = REMOTE_VOLUME_UP_CODES.has(code) || key === "AudioVolumeUp";
      const isVolumeDown = REMOTE_VOLUME_DOWN_CODES.has(code) || key === "AudioVolumeDown";

      const shouldHandle = isVolumeUp || isVolumeDown || (canHijackPlayerKeys && (isPlayPause || isPause || isSeekForward || isSeekBack || isArrowSeek));
      if (!shouldHandle) return;

      e.preventDefault();
      e.stopPropagation();
      showControlsNow();

      if (isVolumeUp) {
        setVolume((v) => Math.min(1, Number((v + 0.1).toFixed(2))));
        return;
      }

      if (isVolumeDown) {
        setVolume((v) => Math.max(0, Number((v - 0.1).toFixed(2))));
        return;
      }

      if (isPause) {
        const v = videoRef.current;
        if (v && !v.paused) v.pause();
        return;
      }

      if (isPlayPause) {
        void togglePlayPause();
        return;
      }

      if (isSeekForward || key === "ArrowRight") {
        seekBy(10);
        return;
      }

      if (isSeekBack || key === "ArrowLeft") {
        seekBy(-10);
      }
    };

    window.addEventListener("keydown", onRemoteControls, true);
    return () => window.removeEventListener("keydown", onRemoteControls, true);
  }, [isPlaying, isFullscreen]);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      playPauseButtonRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(focusTimer);
  }, [id]);

  useEffect(() => {
    return () => {
      clearHideControlsTimer();
    };
  }, []);

  return (
    <Layout>
      <div className="page-container tv-safe pt-[calc(var(--nav-height)+1rem)] space-y-6" data-tv-group="watch-page">
        <div className="flex items-center justify-between gap-3" data-tv-group="watch-controls">
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
              ref={playerShellRef}
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
                    tabIndex={-1}
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
                    data-watch-seek="true"
                    aria-label="Seek"
                  />
                  <div className="flex items-center justify-between gap-3" data-tv-group="watch-controls">
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => seekBy(-10)}>
                        <RotateCcw className="w-5 h-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" data-tv-autofocus="true" ref={playPauseButtonRef} onClick={() => void togglePlayPause()}>
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => seekBy(10)}>
                        <RotateCw className="w-5 h-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}>
                        {volume > 0 ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </Button>
                      <input
                        tabIndex={-1}
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="w-20 accent-red-500"
                        aria-label="Volume"
                      />
                      <span className="text-xs md:text-sm text-white/90 tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2" data-tv-group="watch-controls-extra">
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => nextEpisode?.Id && navigate(`/watch/${nextEpisode.Id}`)} disabled={!nextEpisode}>
                        <SkipForward className="w-5 h-5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => setShowSeasonPanel((x) => !x)}>
                        <ListVideo className="w-5 h-5" />
                      </Button>
                      <Select value={String(playbackRate)} onValueChange={(v) => setPlaybackRate(Number(v))}>
                        <SelectTrigger className="focusable h-8 w-20 text-xs bg-black/30 border-white/20">
                          <SelectValue placeholder="Speed" />
                        </SelectTrigger>
                        <SelectContent>
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                            <SelectItem key={rate} value={String(rate)}>{rate}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" onClick={() => setShowSettingsPanel((x) => !x)}>
                        <Settings className="w-5 h-5" />
                      </Button>
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
                            void tryRequestFullscreen(playerShellRef.current ?? v);
                          }
                        }}
                      >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                      </Button>
                    </div>

                  {showSettingsPanel ? (
                    <div className="absolute right-4 bottom-24 w-64 rounded-xl border border-white/20 bg-black/90 p-3 space-y-3" data-tv-group="watch-settings">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><AudioLines className="w-4 h-4" /> Audio</div>
                      <div className="text-xs text-white/70">Default track (server selected)</div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><Captions className="w-4 h-4" /> Subtitles</div>
                      <div className="flex gap-2">
                        <Button size="sm" variant={subtitleMode === "auto" ? "default" : "secondary"} className="focusable" onClick={() => setSubtitleMode("auto")}>Auto</Button>
                        <Button size="sm" variant={subtitleMode === "off" ? "default" : "secondary"} className="focusable" onClick={() => setSubtitleMode("off")}>Off</Button>
                      </div>
                    </div>
                  ) : null}

                  {showSeasonPanel ? (
                    <div className="absolute right-4 bottom-24 w-80 max-h-[45vh] overflow-auto rounded-xl border border-white/20 bg-black/90 p-3 space-y-2" data-tv-group="watch-season-panel">
                      <div className="text-sm font-semibold text-white">Season & Episodes</div>
                      {episodes.map((ep) => (
                        <button key={ep.Id} className="focusable w-full text-left text-sm rounded px-2 py-2 hover:bg-white/10" onClick={() => navigate(`/watch/${ep.Id}`)}>
                          {ep.IndexNumber != null ? `E${ep.IndexNumber}: ` : ""}{ep.Name || "Episode"}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
