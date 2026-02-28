export interface AppConfig {
  siteName: string;
  /** Deprecated: previously used for an external photos section */
  photosUrl?: string;
  /** Optional Jellyfin Music view/library name to prefer (e.g. "Music") */
  musicLibraryName?: string;
  jellyfinBaseUrl: string;
  jellyfinApiKey: string;
  jellyfinUserId: string;
}

export interface JellyfinView {
  Id: string;
  Name: string;
  CollectionType?: string;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  PremiereDate?: string;

  // Identifiers
  ParentId?: string;
  SeriesId?: string;

  // Series/Episode
  SeriesName?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;

  // Music
  Album?: string;
  Artists?: string[];
  AlbumArtist?: string;
  RunTimeTicks?: number;

  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  Overview?: string;

  UserData?: {
    Rating?: number;
    PlayedPercentage?: number;
    PlaybackPositionTicks?: number;
    Played?: boolean;
  };
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount?: number;
}

export interface JellyfinSystemInfo {
  ServerName?: string;
  Version?: string;
  Id?: string;
}
