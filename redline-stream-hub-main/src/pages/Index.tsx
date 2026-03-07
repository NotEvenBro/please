import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import Hero from "@/components/streaming/Hero";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import { useContinueWatching, useRecentMovies, useMovies, useSeries } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { Loader2, AlertCircle } from "lucide-react";

const Index = () => {
  const [selectedItem, setSelectedItem] = useState<MediaItemUI | null>(null);

  const recentMoviesQ = useRecentMovies(24);
  const continueWatchingQ = useContinueWatching(24);
  const moviesQ = useMovies(0, 24, "");
  const seriesQ = useSeries(0, 24, "");

  const recentMovies = useMemo(() => (recentMoviesQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [recentMoviesQ.data]);
  const continueWatching = useMemo(() => (continueWatchingQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [continueWatchingQ.data]);
  const movies = useMemo(() => (moviesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [moviesQ.data]);
  const series = useMemo(() => (seriesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [seriesQ.data]);

  const featured = recentMovies[0] ?? movies[0] ?? series[0] ?? null;

  const isLoading = recentMoviesQ.isLoading || continueWatchingQ.isLoading || moviesQ.isLoading || seriesQ.isLoading;
  const isError = recentMoviesQ.isError || continueWatchingQ.isError || moviesQ.isError || seriesQ.isError;

  return (
    <Layout>
      <div className="pt-[var(--nav-height)]">
        {isLoading && (
          <div className="tv-safe py-20 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading your library…
          </div>
        )}

        {isError && !isLoading && (
          <div className="tv-safe py-16">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">Couldn’t reach the media server.</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Make sure your backend proxy is running and that <code className="px-1 py-0.5 bg-muted rounded">/api/jellyfin/*</code> is reachable.
            </p>
          </div>
        )}

        {featured && (
          <Hero
            item={featured}
            onPlay={() => setSelectedItem(featured)}
            onDetails={() => setSelectedItem(featured)}
          />
        )}

        <div className="space-y-12 pb-16">
          {continueWatching.length > 0 && (
            <RailCarousel title="Continue watching" items={continueWatching} onItemSelect={setSelectedItem} showProgress />
          )}

          {recentMovies.length > 0 && (
            <RailCarousel title="Recently Added" titleLink="/movies" showViewMore items={recentMovies} onItemSelect={setSelectedItem} />
          )}

          {series.length > 0 && <RailCarousel title="Shows" titleLink="/tv" showViewMore items={series} onItemSelect={setSelectedItem} />}

          {movies.length > 0 && <RailCarousel title="Movies" titleLink="/movies" showViewMore items={movies} onItemSelect={setSelectedItem} />}
        </div>
      </div>

      <DetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </Layout>
  );
};

export default Index;
