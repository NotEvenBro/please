import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import MediaCard from "@/components/streaming/MediaCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMovies, useRecentMovies } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { useRatingsVersion } from "@/lib/localRating";

export default function MoviesPage() {
  const _ratingsVersion = useRatingsVersion();
  const [selected, setSelected] = useState<MediaItemUI | null>(null);
  const [sort, setSort] = useState<"az" | "rating">("az");

  const recentMoviesQ = useRecentMovies(24);
  const moviesQ = useMovies(0, 200, "");

  const recentMovies = useMemo(() => (recentMoviesQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [_ratingsVersion, recentMoviesQ.data]);

  const movies = useMemo(() => {
    const arr = (moviesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x));
    arr.sort((a, b) => {
      if (sort === "rating") {
        const ar = a.userStars ?? (a.rating != null ? a.rating / 2 : -1);
        const br = b.userStars ?? (b.rating != null ? b.rating / 2 : -1);
        if (br !== ar) return br - ar;
      }
      return a.title.localeCompare(b.title);
    });
    return arr;
  }, [_ratingsVersion, moviesQ.data, sort]);

  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mt-6 mb-6">
          <h1 className="text-3xl font-black text-foreground">Movies</h1>

          <div className="w-full sm:w-56">
            <Select value={sort} onValueChange={(v) => setSort(v as any)}>
              <SelectTrigger className="focusable">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="az">Alphabetical (A–Z)</SelectItem>
                <SelectItem value="rating">Rating (high → low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {recentMovies.length > 0 && (
          <RailCarousel title="Recently Added Movies" items={recentMovies} onItemSelect={setSelected} />
        )}

        <div className="mt-10">
          <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4">All Movies</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {movies.map((it) => (
              <MediaCard key={it.id} item={it} onClick={() => setSelected(it)} showRating={sort === "rating"} />
            ))}
          </div>
        </div>
      </div>

      <DetailsModal item={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}
