import { Play, Info } from "lucide-react";
import type { MediaItemUI } from "@/types/media";
import { Button } from "@/components/ui/button";

interface HeroProps {
  item: MediaItemUI;
  onPlay?: () => void;
  onDetails?: () => void;
}

export default function Hero({ item, onPlay, onDetails }: HeroProps) {
  const meta = [
    item.year ? String(item.year) : null,
    item.kind !== "Other" ? item.kind : null,
    item.seriesTitle ? item.seriesTitle : null,
  ].filter(Boolean);

  return (
    <section className="relative w-full" style={{ height: "clamp(400px, 70vh, 800px)" }} aria-label="Featured content">
      {/* Backdrop image */}
      <div className="absolute inset-0">
        <img
          src={item.backdropUrl ?? item.posterUrl ?? ""}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 pb-16 tv-safe animate-fade-in">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground leading-tight">
            {item.title}
          </h1>

          {meta.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {meta.map((m) => (
                <span key={m as string} className="px-2 py-0.5 rounded border border-muted-foreground/30">
                  {m}
                </span>
              ))}
            </div>
          )}

          {item.description && (
            <p className="text-sm sm:text-base text-secondary-foreground/80 line-clamp-3 max-w-lg">{item.description}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={onPlay}
              className="focusable gap-2 bg-foreground text-background hover:bg-foreground/90 font-bold text-base px-8 py-6 rounded-md"
              aria-label={`Play ${item.title}`}
            >
              <Play className="w-5 h-5 fill-current" />
              Play
            </Button>
            <Button
              onClick={onDetails}
              variant="secondary"
              className="focusable gap-2 bg-secondary/80 hover:bg-secondary text-foreground font-semibold text-base px-8 py-6 rounded-md"
              aria-label={`More info about ${item.title}`}
            >
              <Info className="w-5 h-5" />
              More Info
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
