import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  AudioLines,
  Captions,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePlaybackProgress, useItem, useSeasonEpisodes, useSeriesSeasons } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import { mapRemoteAction } from "@/lib/remoteActions";

async function tryRequestFullscreen(target: HTMLElement) {
  const el = target as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  try {
    if (typeof el.requestFullscreen === "function") await el.requestFullscreen();
    else if (typeof el.webkitRequestFullscreen === "function") await el.webkitRequestFullscreen();
    else if (typeof el.msRequestFullscreen === "function") await el.msRequestFullscreen();
  } catch {
    // ignore gesture restrictions
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
    if (typeof doc.msExitFullscreen === "function") await doc.msExitFullscreen();
  } catch {
    // ignore
  }
}

function isLikelyTvDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /smart-tv|smarttv|tizen|webos|appletv|hbbtv|aft|googletv|bravia|viera|roku|crkey|tv/.test(ua);
}

function isViddaEdgeDevice() {
  if (typeof navigator === "undefined") return false;
  return /vidaa|vidda_edge|hisense/i.test(navigator.userAgent || "");
}


export default function WatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const playerShellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const playPauseButtonRef = useRef<HTMLButtonElement>(null);
  const seasonButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const hlsRef = useRef<any>(null);
  const hideChromeTimerRef = useRef<number | null>(null);
  const lastProgressSaveSecRef = useRef(0);
  const autoNextTriggeredRef = useRef(false);
  const progressInFlightRef = useRef(false);
  const lastProgressSentAtMsRef = useRef(0);
  const lastProgressSentTicksRef = useRef(0);
  const hlsFatalCountRef = useRef(0);
  const hlsRecoveredNetworkRef = useRef(false);
  const hlsRecoveredMediaRef = useRef(false);
  const didFallbackToDirectRef = useRef(false);

  const { data: itemDetails, isLoading, isError } = useItem(id);
  const media = useMemo(
    () => (itemDetails ? jellyfinToMediaUI(itemDetails, { posterWidth: 640, backdropWidth: 1400 }) : null),
    [itemDetails]
  );

  const kind = media?.kind ?? "Movie";
  const [subtitleMode, setSubtitleMode] = useState<"auto" | "off">("off");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [showSeasonPanel, setShowSeasonPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [hlsDebug, setHlsDebug] = useState<string | null>(null);
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

  const clearHideControlsTimer = () => {
    if (hideChromeTimerRef.current != null) {
      window.clearTimeout(hideChromeTimerRef.current);
      hideChromeTimerRef.current = null;
    }
  };

  const scheduleControlsHide = () => {
    clearHideControlsTimer();
    if (!isPlaying) return;
    if (showSeasonPanel || showSettingsPanel) return;
    hideChromeTimerRef.current = window.setTimeout(() => setShowControls(false), 2000);
  };

  const showControlsNow = () => {
    setShowControls(true);
    scheduleControlsHide();
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

  const seekBy = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max = Number.isFinite(v.duration) ? v.duration : Number.MAX_SAFE_INTEGER;
    v.currentTime = Math.max(0, Math.min(max, v.currentTime + seconds));
    showControlsNow();
  };

  const togglePlayPause = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      showControlsNow();
      await v.play().catch(() => setVideoError("Playback was blocked by the browser. Try pressing play again."));
      return;
    }
    v.pause();
    showControlsNow();
  };

  const persistProgress = async (played = false) => {
    if (!id) return;
    const v = videoRef.current;
    if (!v) return;
    const positionTicks = Math.round((v.currentTime || 0) * 10_000_000);

    const now = Date.now();
    const minGapMs = 4000;
    const minDeltaTicks = 20_000_000; // 2s
    if (!played) {
      if (progressInFlightRef.current) return;
      if (now - lastProgressSentAtMsRef.current < minGapMs) return;
      if (Math.abs(positionTicks - lastProgressSentTicksRef.current) < minDeltaTicks) return;
    }

    progressInFlightRef.current = true;
    try {
      await savePlaybackProgress(id, positionTicks, played);
      lastProgressSentAtMsRef.current = now;
      lastProgressSentTicksRef.current = positionTicks;
    } catch {
      // best-effort persistence
    } finally {
      progressInFlightRef.current = false;
    }
  };

  const focusFirstInPanel = (panelGroup: "watch-settings" | "watch-season-panel") => {
    window.setTimeout(() => {
      const first = document.querySelector<HTMLElement>(`[data-tv-group='${panelGroup}'] .focusable`);
      first?.focus();
    }, 0);
  };

  const openSeasonPanel = () => {
    setShowSeasonPanel(true);
    setShowSettingsPanel(false);
    focusFirstInPanel("watch-season-panel");
  };

  const openSettingsPanel = () => {
    setShowSettingsPanel(true);
    setShowSeasonPanel(false);
    focusFirstInPanel("watch-settings");
  };

  useEffect(() => {
    if (!showSeasonPanel) return;
    setShowControls(true);
    clearHideControlsTimer();
    focusFirstInPanel("watch-season-panel");
  }, [showSeasonPanel]);

  useEffect(() => {
    if (!showSettingsPanel) return;
    setShowControls(true);
    clearHideControlsTimer();
    focusFirstInPanel("watch-settings");
  }, [showSettingsPanel]);

  useEffect(() => {
    if (showSeasonPanel || showSettingsPanel) {
      clearHideControlsTimer();
      return;
    }
    scheduleControlsHide();
  }, [showSeasonPanel, showSettingsPanel]);

  const goBackToBrowse = () => {
    if (typeof window !== "undefined") {
      const target = window.sessionStorage.getItem("redline:last-browse-path");
      if (target) {
        navigate(target, { replace: true });
        return;
      }
    }
    navigate(-1);
  };

  useEffect(() => {
    const isVidda = isViddaEdgeDevice();
    const next = isLikelyTvDevice() && !isVidda ? transcodeStreamUrl || directStreamUrl : directStreamUrl;
    setStreamUrl(next);
    setVideoError(null);
    setHlsDebug(null);
  }, [directStreamUrl, transcodeStreamUrl]);

  useEffect(() => {
    if (!videoError) return;
    const t = window.setTimeout(() => setVideoError(null), 5000);
    return () => window.clearTimeout(t);
  }, [videoError]);

  useEffect(() => {
    if (!hlsDebug) return;
    const t = window.setTimeout(() => setHlsDebug(null), 5000);
    return () => window.clearTimeout(t);
  }, [hlsDebug]);

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
    autoNextTriggeredRef.current = false;
    lastProgressSaveSecRef.current = 0;
    progressInFlightRef.current = false;
    lastProgressSentAtMsRef.current = 0;
    lastProgressSentTicksRef.current = 0;
    hlsFatalCountRef.current = 0;
    hlsRecoveredNetworkRef.current = false;
    hlsRecoveredMediaRef.current = false;
    didFallbackToDirectRef.current = false;
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
    if (seasons[0]?.Id) setSelectedSeasonId(seasons[0].Id);
  }, [detailsMeta?.SeasonId, isSeriesLike, seasons]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !streamUrl) return;

    let cancelled = false;

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      v.src = "";
      v.load();
    };

    const setup = async () => {
      const shouldUseHls = streamUrl.includes("preferTranscode=1");
      const shouldPreferNativeHls = isViddaEdgeDevice();

      if (!shouldUseHls) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        v.src = streamUrl;
        await v.play().catch(() => setShowControls(true));
        return;
      }

      try {
        const mod = await import("hls.js");
        const Hls = mod.default;
        if (cancelled) return;

        if (shouldPreferNativeHls && v.canPlayType("application/vnd.apple.mpegurl")) {
          v.src = streamUrl;
          setHlsDebug("Using native HLS path for VIDAA/Hisense device");
          await v.play().catch(() => setShowControls(true));
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: !shouldPreferNativeHls, lowLatencyMode: false });
          hlsRef.current = hls;
          hls.attachMedia(v);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(streamUrl));
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void v.play().catch(() => setShowControls(true));
          });
          hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string; details?: string }) => {
            setHlsDebug([data.type, data.details].filter(Boolean).join(" | "));
            if (data.fatal) {
              hlsFatalCountRef.current += 1;

              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !hlsRecoveredNetworkRef.current) {
                hlsRecoveredNetworkRef.current = true;
                setHlsDebug("HLS network error: retrying load");
                hls.startLoad();
                return;
              }

              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !hlsRecoveredMediaRef.current) {
                hlsRecoveredMediaRef.current = true;
                setHlsDebug("HLS media error: recovering media pipeline");
                hls.recoverMediaError();
                return;
              }

              if (!didFallbackToDirectRef.current && streamUrl !== directStreamUrl) {
                didFallbackToDirectRef.current = true;
                setVideoError("Compatibility stream failed to load. Falling back to direct playback.");
                setStreamUrl(directStreamUrl);
                return;
              }

              setVideoError("Playback failed after multiple recovery attempts. Please restart the stream.");
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
  }, [streamUrl, directStreamUrl]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => {
      setIsPlaying(true);
      scheduleControlsHide();
    };
    const onPause = () => {
      setIsPlaying(false);
      setShowControls(true);
      clearHideControlsTimer();
      void persistProgress(false);
    };
    const onTime = () => {
      const nowTime = v.currentTime || 0;
      const nowDuration = Number.isFinite(v.duration) ? v.duration : 0;
      setCurrentTime(nowTime);
      setDuration(nowDuration);

      const sec = Math.floor(nowTime);
      if (sec - lastProgressSaveSecRef.current >= 5) {
        lastProgressSaveSecRef.current = sec;
        void persistProgress(false);
      }

      const remaining = nowDuration > 0 ? nowDuration - nowTime : Number.POSITIVE_INFINITY;
      if (!autoNextTriggeredRef.current && nextEpisode?.Id && remaining <= 30) {
        autoNextTriggeredRef.current = true;
        void persistProgress(true);
        navigate(`/watch/${nextEpisode.Id}`, { replace: true });
      }
    };

    const onLoadedMetadata = () => {
      onTime();
      const resumeTicks = itemDetails?.UserData?.PlaybackPositionTicks ?? 0;
      if (resumeTicks > 0) {
        const resumeSec = Math.max(0, Math.floor(resumeTicks / 10_000_000));
        const maxSeek = Number.isFinite(v.duration) ? Math.max(0, v.duration - 31) : resumeSec;
        v.currentTime = Math.min(resumeSec, maxSeek);
      }
    };

    const onEnded = () => {
      void persistProgress(true);
      if (nextEpisode?.Id) {
        navigate(`/watch/${nextEpisode.Id}`, { replace: true });
      }
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("ended", onEnded);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("ended", onEnded);
    };
  }, [isPlaying, itemDetails?.UserData?.PlaybackPositionTicks, navigate, nextEpisode?.Id]);

  useEffect(() => {
    const shell = playerShellRef.current;
    if (!shell) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isSeekFocused = active === seekRef.current;
      const action = mapRemoteAction({ key: e.key, code: e.code, keyCode: e.keyCode });

      if (action === "BACK") {
        e.preventDefault();
        goBackToBrowse();
        return;
      }

      if (action === "SELECT" || action === "PLAY_PAUSE") {
        e.preventDefault();
        if (active?.classList.contains("focusable")) {
          active.click();
        } else {
          void togglePlayPause();
        }
        return;
      }

      if (action === "PAUSE") {
        e.preventDefault();
        videoRef.current?.pause();
        return;
      }

      if (action === "SEEK_FORWARD") {
        e.preventDefault();
        seekBy(10);
        return;
      }

      if (action === "SEEK_BACK") {
        e.preventDefault();
        seekBy(-10);
        return;
      }

      if (action === "VOLUME_UP") {
        e.preventDefault();
        setVolume((prev) => Math.min(1, prev + 0.05));
        return;
      }

      if (action === "VOLUME_DOWN") {
        e.preventDefault();
        setVolume((prev) => Math.max(0, prev - 0.05));
        return;
      }

      if (action === "UP") {
        if (isSeekFocused) {
          e.preventDefault();
          setShowControls(false);
          return;
        }
        showControlsNow();
        if (active === seasonButtonRef.current) {
          e.preventDefault();
          openSeasonPanel();
          return;
        }
        if (active === settingsButtonRef.current) {
          e.preventDefault();
          openSettingsPanel();
          return;
        }
        if (active?.dataset.watchControl === "row") {
          e.preventDefault();
          seekRef.current?.focus();
        }
        return;
      }

      if (action === "DOWN") {
        showControlsNow();
        if (isSeekFocused) {
          e.preventDefault();
          playPauseButtonRef.current?.focus();
        }
        return;
      }

      if ((action === "LEFT" || action === "RIGHT") && isSeekFocused) {
        e.preventDefault();
        seekBy(action === "LEFT" ? -10 : 10);
        return;
      }

      if ((action === "LEFT" || action === "RIGHT") && active?.dataset.watchControl === "row") {
        const rowControls = Array.from(document.querySelectorAll<HTMLElement>("[data-watch-control='row'].focusable")).filter((el) => !(el as HTMLButtonElement).disabled);
        const idx = rowControls.indexOf(active);
        if (idx >= 0) {
          e.preventDefault();
          const nextIdx = action === "LEFT" ? Math.max(0, idx - 1) : Math.min(rowControls.length - 1, idx + 1);
          rowControls[nextIdx]?.focus();
        }
      }
    };

    shell.addEventListener("keydown", onKeyDown);
    return () => shell.removeEventListener("keydown", onKeyDown);
  }, [navigate, goBackToBrowse]);

  useEffect(() => {
    const t = window.setTimeout(() => playPauseButtonRef.current?.focus(), 250);
    return () => window.clearTimeout(t);
  }, [id]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void persistProgress(false);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void persistProgress(false);
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white" data-tv-group="watch-page">
      <div
        ref={playerShellRef}
        className="relative h-full w-full overflow-hidden bg-black"
        onMouseMove={showControlsNow}
        onPointerMove={showControlsNow}
        onTouchStart={showControlsNow}
      >
        {isLoading ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center gap-2 text-white/80">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : null}

        {isError ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span className="font-semibold">Couldn’t load this item.</span>
            </div>
            <Button className="focusable" onClick={goBackToBrowse}>
              Go back
            </Button>
          </div>
        ) : null}

        <video
          ref={videoRef}
          className="h-full w-full bg-black object-contain"
          playsInline
          controls={false}
          onError={() => {
            setVideoError("Video playback failed. Tried direct and transcoded playback.");
          }}
        />

        <div className={`absolute inset-0 transition-opacity duration-200 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          <div className="absolute left-4 top-4 z-20">
            <Button
              variant="ghost"
              className="focusable h-12 w-12 rounded-full border border-white/25 bg-black/45 p-0 hover:bg-black/70"
              onClick={goBackToBrowse}
              aria-label="Back"
              data-watch-control="row"
            >
              <img src="/back-button.svg" alt="Back" className="h-8 w-8" />
            </Button>
          </div>

          <div className="absolute bottom-5 left-0 right-0 z-20 space-y-3 px-4 md:px-6">
            <input
              ref={seekRef}
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
              className="focusable w-full cursor-pointer accent-red-600"
              aria-label="Seek"
            />

            {media ? (
              <div className="pointer-events-none flex justify-center px-2 text-center text-sm text-white/90">
                <span className="rounded bg-black/35 px-3 py-1">{media.title}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" data-watch-control="row" onClick={() => seekBy(-10)}>
                  <RotateCcw className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="focusable text-white hover:bg-white/20"
                  data-watch-control="row"
                  ref={playPauseButtonRef}
                  onClick={() => void togglePlayPause()}
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                </Button>
                <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" data-watch-control="row" onClick={() => seekBy(10)}>
                  <RotateCw className="h-5 w-5" />
                </Button>
                <Button size="icon" variant="ghost" className="focusable text-white hover:bg-white/20" data-watch-control="row" onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}>
                  {volume > 0 ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </Button>
                <span className="tabular-nums text-xs text-white/90 md:text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="focusable text-white hover:bg-white/20"
                  data-watch-control="row"
                  onClick={() => nextEpisode?.Id && navigate(`/watch/${nextEpisode.Id}`, { replace: true })}
                  disabled={!nextEpisode}
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
                <Button
                  ref={seasonButtonRef}
                  size="icon"
                  variant="ghost"
                  className="focusable text-white hover:bg-white/20"
                  data-watch-control="row"
                  onClick={() => {
                    if (showSeasonPanel) {
                      setShowSeasonPanel(false);
                      return;
                    }
                    openSeasonPanel();
                  }}
                  onMouseEnter={() => {
                    setShowSeasonPanel(true);
                    setShowSettingsPanel(false);
                  }}
                >
                  <ListVideo className="h-5 w-5" />
                </Button>
                <Button
                  ref={settingsButtonRef}
                  size="icon"
                  variant="ghost"
                  className="focusable text-white hover:bg-white/20"
                  data-watch-control="row"
                  onClick={() => {
                    if (showSettingsPanel) {
                      setShowSettingsPanel(false);
                      return;
                    }
                    openSettingsPanel();
                  }}
                >
                  <Settings className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="focusable text-white hover:bg-white/20"
                  data-watch-control="row"
                  onClick={() => {
                    const shell = playerShellRef.current;
                    const v = videoRef.current;
                    if (isFullscreen) {
                      void tryExitFullscreen();
                    } else if (shell) {
                      void tryRequestFullscreen(shell);
                    } else if (v) {
                      void tryRequestFullscreen(v);
                    }
                  }}
                >
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </div>

          {showSettingsPanel ? (
            <div className="absolute bottom-24 right-4 z-20 w-64 space-y-3 rounded-xl border border-white/20 bg-black/90 p-3" data-tv-group="watch-settings">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <AudioLines className="h-4 w-4" /> Audio
              </div>
              <div className="text-xs text-white/70">Default track (server selected)</div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Captions className="h-4 w-4" /> Subtitles
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={subtitleMode === "auto" ? "default" : "secondary"} className="focusable" onClick={() => setSubtitleMode("auto")}>
                  Auto
                </Button>
                <Button size="sm" variant={subtitleMode === "off" ? "default" : "secondary"} className="focusable" onClick={() => setSubtitleMode("off")}>
                  Off
                </Button>
              </div>
              <div className="text-xs text-white/70">Playback speed</div>
              <div className="grid grid-cols-4 gap-1">
                {[0.5, 0.75, 1, 1.25].map((speed) => (
                  <Button key={speed} size="sm" variant={playbackRate === speed ? "default" : "secondary"} className="focusable" onClick={() => setPlaybackRate(speed)}>
                    {speed}x
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {showSeasonPanel ? (
            <div
              className="absolute bottom-24 right-4 z-20 max-h-[45vh] w-[26rem] space-y-2 overflow-auto rounded-xl border border-white/20 bg-black/65 backdrop-blur-md p-3"
              data-tv-group="watch-season-panel"
              onMouseLeave={() => setShowSeasonPanel(false)}
            >
              <div className="text-sm font-semibold text-white">Season & Episodes</div>
              {episodes.map((ep) => {
                const ui = jellyfinToMediaUI(ep, { posterWidth: 360, backdropWidth: 800 });
                const isCurrent = ep.Id === id;
                return (
                  <button
                    key={ep.Id}
                    className={`focusable w-full rounded-md border px-2 py-2 text-left text-sm transition-colors ${isCurrent ? "border-primary/60 bg-primary/15" : "border-white/10 bg-black/20 hover:bg-white/10"}`}
                    onClick={() => navigate(`/watch/${ep.Id}`, { replace: true })}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-12 w-20 overflow-hidden rounded bg-black/30">
                        <img src={ui.backdropUrl ?? ui.posterUrl ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white/95">
                          {ep.IndexNumber != null ? `E${ep.IndexNumber}: ` : ""}
                          {ep.Name || "Episode"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>


        {videoError ? (
          <div className="absolute left-4 top-20 z-30 max-w-md rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-100">{videoError}</div>
        ) : null}

        {hlsDebug ? (
          <div className="absolute left-4 top-36 z-30 max-w-md rounded-lg border border-yellow-500/30 bg-yellow-950/30 p-2 text-xs text-yellow-200">HLS debug: {hlsDebug}</div>
        ) : null}
      </div>
    </div>
  );
}
