import { useQuery } from "@tanstack/react-query";
import type { JellyfinItem, JellyfinSystemInfo, JellyfinItemsResponse, JellyfinView } from "@/types";

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};

export function useSystemInfo() {
  return useQuery<JellyfinSystemInfo>({
    queryKey: ["jellyfin", "system-info"],
    queryFn: () => fetchJson("/api/jellyfin/system-info"),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useViews() {
  return useQuery<JellyfinView[]>({
    queryKey: ["jellyfin", "views"],
    queryFn: async () => {
      const data = await fetchJson<{ Items?: JellyfinView[] }>("/api/jellyfin/views");
      return data?.Items ?? [];
    },
    retry: 1,
    staleTime: 60_000,
  });
}

export function useRecentMovies(limit = 20) {
  return useQuery<JellyfinItem[]>({
    queryKey: ["jellyfin", "recent-movies", limit],
    queryFn: () => fetchJson(`/api/jellyfin/recent/movies?limit=${limit}`),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useRecentEpisodes(limit = 20) {
  return useQuery<JellyfinItem[]>({
    queryKey: ["jellyfin", "recent-episodes", limit],
    queryFn: () => fetchJson(`/api/jellyfin/recent/episodes?limit=${limit}`),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useMovies(startIndex: number, limit: number, search: string) {
  return useQuery<JellyfinItemsResponse>({
    queryKey: ["jellyfin", "movies", startIndex, limit, search],
    queryFn: () =>
      fetchJson(`/api/jellyfin/movies?startIndex=${startIndex}&limit=${limit}&search=${encodeURIComponent(search)}`),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useSeries(startIndex: number, limit: number, search: string) {
  return useQuery<JellyfinItemsResponse>({
    queryKey: ["jellyfin", "series", startIndex, limit, search],
    queryFn: () =>
      fetchJson(`/api/jellyfin/series?startIndex=${startIndex}&limit=${limit}&search=${encodeURIComponent(search)}`),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useRecentMusic(limit = 30, parentId?: string) {
  const parentQ = parentId ? `&parentId=${encodeURIComponent(parentId)}` : "";
  return useQuery<JellyfinItem[]>({
    queryKey: ["jellyfin", "recent-music", limit, parentId],
    queryFn: () => fetchJson(`/api/jellyfin/music/recent?limit=${limit}${parentQ}`),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useMusicAlbums(startIndex: number, limit: number, search: string, parentId?: string) {
  const parentQ = parentId ? `&parentId=${encodeURIComponent(parentId)}` : "";
  return useQuery<JellyfinItemsResponse>({
    queryKey: ["jellyfin", "music-albums", startIndex, limit, search, parentId],
    queryFn: () =>
      fetchJson(
        `/api/jellyfin/music/albums?startIndex=${startIndex}&limit=${limit}&search=${encodeURIComponent(search)}${parentQ}`
      ),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useMusicTracks(startIndex: number, limit: number, search: string, parentId?: string) {
  const parentQ = parentId ? `&parentId=${encodeURIComponent(parentId)}` : "";
  return useQuery<JellyfinItemsResponse>({
    queryKey: ["jellyfin", "music-tracks", startIndex, limit, search, parentId],
    queryFn: () =>
      fetchJson(
        `/api/jellyfin/music/tracks?startIndex=${startIndex}&limit=${limit}&search=${encodeURIComponent(search)}${parentQ}`
      ),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useAlbumTracks(albumId: string, startIndex: number, limit: number) {
  return useQuery<JellyfinItemsResponse>({
    queryKey: ["jellyfin", "album-tracks", albumId, startIndex, limit],
    queryFn: () =>
      fetchJson(`/api/jellyfin/music/album/${albumId}/tracks?startIndex=${startIndex}&limit=${limit}`),
    enabled: !!albumId,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useItem(id?: string) {
  return useQuery<JellyfinItem>({
    queryKey: ["jellyfin", "item", id],
    queryFn: () => fetchJson(`/api/jellyfin/item/${id}`),
    enabled: !!id,
    retry: 1,
    staleTime: 30_000,
  });
}

export function jellyfinImageUrl(itemId: string, maxWidth = 360): string {
  return `/api/jellyfin/image/${itemId}/primary?maxWidth=${maxWidth}`;
}


export async function rateItem(id: string, rating: number): Promise<void> {
  const res = await fetch(`/api/jellyfin/rate/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: Math.round(rating) }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Rating failed: ${res.status} ${txt}`);
  }
}


export function useSeasonEpisodes(seasonId?: string) {
  return useQuery({
    queryKey: ["jellyfin", "seasonEpisodes", seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      return fetchJson<JellyfinItemsResponse>(`/api/jellyfin/season/${encodeURIComponent(seasonId!)}/episodes`);
    },
  });
}


export function useSeriesSeasons(seriesId?: string) {
  return useQuery({
    queryKey: ["jellyfin", "seriesSeasons", seriesId],
    enabled: !!seriesId,
    queryFn: async () => {
      return fetchJson<JellyfinItemsResponse>(`/api/jellyfin/series/${encodeURIComponent(seriesId!)}/seasons`);
    },
  });
}
