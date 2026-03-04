import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import { ExternalLink, Loader2, AlertCircle, Play, Pause } from "lucide-react";
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
  const [streamUrl, setStreamUrl] = useState(directStreamUrl);

  useEffect(() => {
    setStreamUrl(directStreamUrl);
    setVideoError(null);
  }, [directStreamUrl]);

  const requestFullscreen = async () => {
    const v = videoRef.current as HTMLVideoElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    if (!v) return;
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
  };

  const requestFullscreen = async () => {
    const v = videoRef.current as HTMLVideoElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    if (!v) return;
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
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => {
      setIsPlaying(true);
      requestFullscreen();
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      // Browser often doesn't expose much detail; surface the basic state.
      setVideoError("Video failed to load or is not supported by this browser/codec.");
    };
    const onPause = () => setIsPlaying(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
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
      <div className="page-container tv-safe pt-[calc(var(--nav-height)+1rem)] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="focusable h-14 w-14 p-0 rounded-full bg-background/55 hover:bg-background/75 border border-border/60"
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
                onError={() => {
                  if (streamUrl !== transcodeStreamUrl && transcodeStreamUrl) {
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

            {/* Simple TV-friendly play/pause */}
            <div className="flex items-center gap-2">
              <Button
                className="focusable gap-2"
                onClick={async () => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) {
                    // Request fullscreen from the direct user interaction path.
                    await requestFullscreen();
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
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
