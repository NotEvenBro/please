import type { JellyfinItem } from "@/types";
import type { MediaItemUI, MediaKind } from "@/types/media";
import { jellyfinImageUrl } from "@/hooks/use-jellyfin";
import { getLocalStars } from "@/lib/localRating";

function inferKind(item: JellyfinItem): MediaKind {
  const t = (item.Type || "").toLowerCase();
  if (t === "movie") return "Movie";
  if (t === "series") return "Series";
  if (t === "episode") return "Episode";
  if (t === "musicalbum") return "MusicAlbum";
  if (t === "audio") return "Track";
  if (t === "musicartist") return "Artist";
  return "Other";
}

function inferYear(item: JellyfinItem): number | undefined {
  if (typeof item.ProductionYear === "number") return item.ProductionYear;
  if (item.PremiereDate) {
    const d = new Date(item.PremiereDate);
    if (!Number.isNaN(d.getTime())) return d.getFullYear();
  }
  return undefined;
}

function ticksToMinutes(ticks?: number): number | undefined {
  if (!ticks || typeof ticks !== "number") return undefined;
  // 10,000,000 ticks per second
  return Math.round(ticks / 10_000_000 / 60);
}

export function jellyfinToMediaUI(
  item: JellyfinItem,
  opts?: { posterWidth?: number; backdropWidth?: number }
): MediaItemUI {
  const posterWidth = opts?.posterWidth ?? 420;
  const backdropWidth = opts?.backdropWidth ?? 1280;

  const kind = inferKind(item);
  const year = inferYear(item);

  // We only proxy a "primary" image in the backend; use that for both poster/backdrop with different widths.
  const posterUrl = item.Id ? jellyfinImageUrl(item.Id, posterWidth) : undefined;
  const backdropUrl = item.Id ? jellyfinImageUrl(item.Id, backdropWidth) : posterUrl;

  const artist =
    item.AlbumArtist ||
    (Array.isArray(item.Artists) && item.Artists.length > 0 ? item.Artists[0] : undefined);

  return {
    id: item.Id,
    title: item.Name,
    year,
    description: item.Overview,
    kind,
    rating: item.UserData?.Rating,
    userStars: item.Id ? getLocalStars(item.Id) : undefined,
    posterUrl,
    backdropUrl,

    // ids
    seriesId: (item as any).SeriesId,
    seasonId: (item as any).ParentId,
    albumId: (kind === "Track" || kind === "MusicAlbum") ? (item as any).ParentId : undefined,
    season: item.ParentIndexNumber,
    episode: item.IndexNumber,
    seriesTitle: item.SeriesName,

    // music
    album: item.Album,
    artist,
    durationMinutes: ticksToMinutes(item.RunTimeTicks),
  };
}
