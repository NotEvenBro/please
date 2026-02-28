import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import MediaCard from "@/components/streaming/MediaCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSeries, useRecentEpisodes } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { useRatingsVersion } from "@/lib/localRating";

export default function TvShowsPage() {
  const _ratingsVersion = useRatingsVersion();
  const [selected, setSelected] = useState<MediaItemUI | null>(null);
  const [sort, setSort] = useState<"az" | "rating">("az");

  const recentEpisodesQ = useRecentEpisodes(24);
  const seriesQ = useSeries(0, 200, "");

  const recentEpisodes = useMemo(() => (recentEpisodesQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [_ratingsVersion, recentEpisodesQ.data]);

  const series = useMemo(() => {
    const arr = (seriesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x));
    arr.sort((a, b) => {
      if (sort === "rating") {
        const ar = a.rating ?? -1;
        const br = b.rating ?? -1;
        if (br !== ar) return br - ar;
      }
      return a.title.localeCompare(b.title);
    });
    return arr;
  }, [_ratingsVersion, seriesQ.data, sort]);

  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mt-6 mb-6">
          <h1 className="text-3xl font-black text-foreground">TV Shows</h1>

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

        {recentEpisodes.length > 0 && (
          <RailCarousel title="Recently Added Episodes" items={recentEpisodes} onItemSelect={setSelected} />
        )}

        <div className="mt-10">
          <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4">All TV Shows</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {series.map((it) => (
              <MediaCard key={it.id} item={it} onClick={() => setSelected(it)} showRating={sort === "rating"} />
            ))}
          </div>
        </div>
      </div>

      <DetailsModal item={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}