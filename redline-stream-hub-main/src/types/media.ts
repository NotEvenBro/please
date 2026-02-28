export type MediaKind =
  | "Movie"
  | "Series"
  | "Episode"
  | "MusicAlbum"
  | "Track"
  | "Artist"
  | "Other";

export interface MediaItemUI {
  id: string;
  title: string;
  year?: number;
  description?: string;
  kind: MediaKind;

  posterUrl?: string;
  backdropUrl?: string;

  rating?: number;
  userStars?: number; // 1..5 (local)

  // Media specifics
  durationMinutes?: number;
  progress?: number; // 0..1 for continue-watching style UI


  // ids for navigation
  seriesId?: string;
  seasonId?: string;
  albumId?: string;

  // Series/Episode
  season?: number;
  episode?: number;
  seriesTitle?: string;

  // Music
  album?: string;
  artist?: string;
}
