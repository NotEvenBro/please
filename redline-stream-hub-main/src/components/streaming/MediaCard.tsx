import React, { forwardRef } from "react";
import { Play, Star } from "lucide-react";
import type { MediaItemUI } from "@/types/media";

interface MediaCardProps {
  item: MediaItemUI;
  onClick?: (item: MediaItemUI) => void;
  showProgress?: boolean;
  showRating?: boolean;
  focused?: boolean;
  autofocus?: boolean;
  fluid?: boolean;
}

const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(
  ({ item, onClick, showProgress, showRating, focused, autofocus, fluid }, ref) => {
    const subtitle =
      item.kind === "Track"
        ? item.artist ?? item.album
        : item.kind === "MusicAlbum"
        ? item.artist
        : item.year
        ? String(item.year)
        : undefined;

    const starValue = item.rating == null ? null : Math.round((item.rating / 10) * 5 * 2) / 2;
    const userStars = item.userStars;

    return (
      <button
        ref={ref}
        type="button"
        className={[
          "focusable group relative rounded-2xl overflow-hidden bg-card shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          "transition-transform duration-150",
          focused ? "ring-4 ring-primary/70 scale-[1.03]" : "ring-0",
        ].join(" ")}
        style={fluid ? { width: "100%", aspectRatio: "16/9" } : { width: "clamp(220px, 24vw, 330px)", aspectRatio: "16/9" }}
        onClick={() => onClick?.(item)}
        aria-label={subtitle ? `${item.title} — ${subtitle}` : item.title}
        data-tv-autofocus={autofocus ? "true" : undefined}
      >
        <img
          src={item.backdropUrl ?? item.posterUrl ?? ""}
          alt={item.title}
          className="h-full w-full object-cover"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-85" />

        <div className="absolute left-0 right-0 bottom-0 p-3">
          <div className="text-sm font-semibold leading-tight text-white line-clamp-1">{item.title}</div>
          {subtitle ? <div className="mt-0.5 text-xs text-white/75 line-clamp-1">{subtitle}</div> : null}
        </div>

        {showRating && starValue != null ? (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
            <Star className="h-3 w-3" />
            <span>{starValue.toFixed(1)}</span>
          </div>
        ) : null}

        {userStars ? (
          <div className="absolute right-2 top-2 rounded bg-primary/90 px-2 py-1 text-xs font-bold text-primary-foreground">
            {"★".repeat(userStars)}
          </div>
        ) : null}

        {showProgress && typeof item.progress === "number" ? (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
          </div>
        ) : null}

        {/* Fallback background layer (always present) */}
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-muted/80" />

        {/* Title strip so card never looks empty */}
        <div className="absolute left-0 right-0 bottom-0 p-2.5 bg-gradient-to-t from-black/92 via-black/75 to-black/20 backdrop-blur-[1px]">
          <div className="text-[0.95rem] font-semibold tracking-tight leading-tight text-white line-clamp-2">{item.title}</div>
          {subtitle ? <div className="text-xs text-white/75 line-clamp-1 mt-0.5">{subtitle}</div> : null}

          {showRating && starValue != null ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="w-3 h-3" />
              <span>{starValue.toFixed(1)} / 5</span>
            </div>
          ) : null}

          {showProgress && typeof item.progress === "number" ? (
            <div className="mt-2 h-1 w-full bg-muted rounded">
              <div className="h-1 bg-primary rounded" style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
            </div>
          ) : null}
        </div>

        {/* Hover overlay play */}
        <div className="absolute inset-0 bg-background/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
            {isMusic ? <Music2 className="w-6 h-6 text-primary-foreground" /> : <Play className="w-6 h-6 text-primary-foreground" />}
          </div>
        </div>
      </button>
    );
  }
);

MediaCard.displayName = "MediaCard";
export default MediaCard;
