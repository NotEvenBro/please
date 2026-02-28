import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import { ExternalLink, Loader2, AlertCircle, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useItem } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";

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
  const streamUrl = id ? `/api/jellyfin/stream/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}` : "";

  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("error", onError);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("error", onError);
    };
  }, [streamUrl]);

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
              className="focusable inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
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
              <div>
                <h1 className="text-2xl font-black text-foreground">{media.title}</h1>
                {media.description ? (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{media.description}</p>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl overflow-hidden border border-border/50 bg-black">
              <video
                ref={videoRef}
                className="w-full max-h-[70vh] bg-black"
                src={streamUrl}
                controls
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
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
            <div className="flex items-center gap-2">
              <Button
                className="focusable gap-2"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) v.play();
                  else v.pause();
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
