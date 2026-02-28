import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import { useMovies, useSeries, useRecentMovies } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { useRatingsVersion } from "@/lib/localRating";

export default function LibraryPage() {
  const _ratingsVersion = useRatingsVersion();
  const [selected, setSelected] = useState<MediaItemUI | null>(null);

  const recentMoviesQ = useRecentMovies(24);
  const moviesQ = useMovies(0, 48, "");
  const seriesQ = useSeries(0, 48, "");

  const recentMovies = useMemo(() => (recentMoviesQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [recentMoviesQ.data]);
  const movies = useMemo(() => (moviesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [moviesQ.data]);
  const series = useMemo(() => (seriesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [seriesQ.data]);

  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <h1 className="text-3xl font-black text-foreground mt-6 mb-6">Library</h1>

        <div className="space-y-12">
          {recentMovies.length > 0 && (
            <RailCarousel title="Recently Added" items={recentMovies} onItemSelect={setSelected} />
          )}
          {movies.length > 0 && <RailCarousel title="All Movies" items={movies} onItemSelect={setSelected} />}
          {series.length > 0 && <RailCarousel title="All Series" items={series} onItemSelect={setSelected} />}
        </div>
      </div>

      <DetailsModal item={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}