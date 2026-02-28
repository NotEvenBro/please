import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import MediaCard from "@/components/streaming/MediaCard";
import DetailsModal from "@/components/streaming/DetailsModal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2 } from "lucide-react";
import { useMovies, useSeries } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { useRatingsVersion } from "@/lib/localRating";

export default function SearchPage() {
  const _ratingsVersion = useRatingsVersion();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"az" | "rating">("az");
  const [selected, setSelected] = useState<MediaItemUI | null>(null);

  const moviesQ = useMovies(0, 60, query);
  const seriesQ = useSeries(0, 60, query);

  const results = useMemo(() => {
    const m = (moviesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x));
    const s = (seriesQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x));
    // de-dup by id
    const map = new Map<string, MediaItemUI>();
    [...m, ...s].forEach((it) => map.set(it.id, it));
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (sort === "rating") {
        const ar = a.rating ?? -1;
        const br = b.rating ?? -1;
        if (br !== ar) return br - ar;
      }
      return a.title.localeCompare(b.title);
    });
    return arr;
  }, [_ratingsVersion, moviesQ.data, seriesQ.data, sort]);

  const isLoading = moviesQ.isLoading || seriesQ.isLoading;

  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <div className="max-w-3xl mt-6">
          <h1 className="text-3xl font-black text-foreground mb-6">Search</h1>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                // Prevent any global "back" handlers from stealing backspace while typing
                e.stopPropagation();
              }
            }}
              placeholder="Search movies, series, episodes…"
              className="pl-12 pr-4 py-6 text-lg bg-card border-border rounded-md focus-visible:ring-primary"
              aria-label="Search"
            />
          </div>
        </div>

        <div className="mt-10">
          {isLoading && query.trim().length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching…
            </div>
          )}

          {query.trim().length === 0 ? (
            <p className="text-muted-foreground mt-6">Type to search your Jellyfin library.</p>
          ) : results.length === 0 && !isLoading ? (
            <p className="text-muted-foreground mt-6">No results.</p>
          ) : (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {results.map((item) => (
                <MediaCard key={item.id} item={item} onClick={setSelected} />
              ))}
            </div>
          )}
        </div>
      </div>

      <DetailsModal item={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}