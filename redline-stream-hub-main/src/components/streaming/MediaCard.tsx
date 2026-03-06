import React, { forwardRef } from "react";
import { Play, Star } from "lucide-react";
import type { MediaItemUI } from "@/types/media";

interface MediaCardProps {
  item: MediaItemUI;
  onClick?: (item: MediaItemUI) => void;
  showProgress?: boolean;
  showRating?: boolean;
  focused?: boolean;
}

const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(
  ({ item, onClick, showProgress, showRating, focused }, ref) => {
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
          "focusable group relative overflow-hidden rounded-md border border-white/10 bg-card/80",
          "transition-transform duration-200 ease-out will-change-transform",
          focused ? "z-10 scale-110 border-white/50 shadow-[0_16px_40px_rgba(0,0,0,0.65)]" : "scale-100",
        ].join(" ")}
        style={{ width: "clamp(220px, 24vw, 330px)", aspectRatio: "16/9" }}
        onClick={() => onClick?.(item)}
        aria-label={subtitle ? `${item.title} — ${subtitle}` : item.title}
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

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black">
            <Play className="h-6 w-6 fill-current" />
          </div>
        </div>
      </button>
    );
  }
);

MediaCard.displayName = "MediaCard";
export default MediaCard;
