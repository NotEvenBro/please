import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import Hero from "@/components/streaming/Hero";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import { useRecentMovies, useRecentEpisodes, useMovies, useSeries } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { Loader2, AlertCircle } from "lucide-react";
import { useRatingsVersion } from "@/lib/localRating";

const Index = () => {
  const [selectedItem, setSelectedItem] = useState<MediaItemUI | null>(null);

  const recentMoviesQ = useRecentMovies(24);
  const recentEpisodesQ = useRecentEpisodes(24);
  const moviesQ = useMovies(0, 24, "");
  const seriesQ = useSeries(0, 24, "");

  const recentMovies = useMemo(() => (recentMoviesQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [recentMoviesQ.data]);
  const recentEpisodes = useMemo(() => (recentEpisodesQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [recentEpisodesQ.data]);
  const movies = useMemo(() => (moviesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [moviesQ.data]);
  const series = useMemo(() => (seriesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [seriesQ.data]);

  const featured = recentMovies[0] ?? movies[0] ?? series[0] ?? null;

  const isLoading = recentMoviesQ.isLoading || recentEpisodesQ.isLoading || moviesQ.isLoading || seriesQ.isLoading;
  const isError = recentMoviesQ.isError || recentEpisodesQ.isError || moviesQ.isError || seriesQ.isError;

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
          {recentMovies.length > 0 && (
            <RailCarousel title="Recently Added Movies" titleLink="/movies" items={recentMovies} onItemSelect={setSelectedItem} />
          )}

          {recentEpisodes.length > 0 && (
            <RailCarousel title="Recently Added Episodes" titleLink="/tv" items={recentEpisodes} onItemSelect={setSelectedItem} />
          )}

          {movies.length > 0 && <RailCarousel title="Movies" titleLink="/movies" items={movies} onItemSelect={setSelectedItem} />}

          {series.length > 0 && <RailCarousel title="Series" titleLink="/tv" items={series} onItemSelect={setSelectedItem} />}
        </div>
      </div>

      <DetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </Layout>
  );
};

export default Index;