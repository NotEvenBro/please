import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import { ExternalLink, Loader2, AlertCircle, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useItem } from "@/hooks/use-jellyfin";
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

  const { data: item, isLoading, isError } = useItem(id);

  const media = useMemo(
    () => (item ? jellyfinToMediaUI(item, { posterWidth: 640, backdropWidth: 1400 }) : null),
    [item]
  );

  const kind = media?.kind ?? "Movie";
  const directStreamUrl = id ? `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}` : "";
  const transcodeStreamUrl = id
    ? `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}&preferTranscode=1`
    : "";

  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamUrl, setStreamUrl] = useState(directStreamUrl);

  useEffect(() => {
    setStreamUrl(directStreamUrl);
    setVideoError(null);
  }, [directStreamUrl]);

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
                className="w-full max-h-[70vh] bg-black"
                src={streamUrl}
                controls
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
            </div>

            {videoError ? (
              <div className="rounded-lg border border-border/50 bg-card p-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">{videoError}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  If this is an HEVC/H.265 file, Chrome may show a black screen unless HEVC support is installed. Try Edge,
                  install HEVC Video Extensions, or enable Jellyfin transcoding.
                </div>
              </div>
            ) : null}

            {/* Simple TV-friendly play/pause */}
            <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-black/35 p-3">
              <Button
                className="focusable gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold"
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
              <div className="text-xs text-red-100/75">TV mode: press Play to auto-enter fullscreen</div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
