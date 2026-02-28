import { useMemo, useState } from "react";
import Layout from "@/components/streaming/Layout";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import { useViews, useRecentMusic, useMusicAlbums, useMusicTracks } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { useRatingsVersion } from "@/lib/localRating";

function pickMusicViewId(views?: { Id: string; Name: string; CollectionType?: string }[]): string | undefined {
  if (!views || views.length === 0) return undefined;
  // Prefer collectionType === 'music'
  const byType = views.find((v) => (v.CollectionType || "").toLowerCase() === "music");
  if (byType) return byType.Id;
  // Fallback: name includes 'music'
  const byName = views.find((v) => (v.Name || "").toLowerCase().includes("music"));
  return byName?.Id;
}

export default function MusicPage() {
  const _ratingsVersion = useRatingsVersion();
  const [selected, setSelected] = useState<MediaItemUI | null>(null);

  const viewsQ = useViews();
  const musicViewId = useMemo(() => pickMusicViewId(viewsQ.data), [viewsQ.data]);

  const recentQ = useRecentMusic(30, musicViewId);
  const albumsQ = useMusicAlbums(0, 48, "", musicViewId);
  const tracksQ = useMusicTracks(0, 48, "", musicViewId);

  const recent = useMemo(() => (recentQ.data ?? []).map((x) => jellyfinToMediaUI(x)), [recentQ.data]);
  const albums = useMemo(() => (albumsQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [albumsQ.data]);
  const tracks = useMemo(() => (tracksQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [tracksQ.data]);

  const playableRecent = useMemo(() => recent.filter((x) => x.kind === "Track"), [recent]);

  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <h1 className="text-3xl font-black text-foreground mt-6 mb-6">Music</h1>

        <div className="space-y-12">
          {playableRecent.length > 0 && (
            <RailCarousel title="Recently Added" items={playableRecent} onItemSelect={setSelected} />
          )}

          {albums.length > 0 && (
            <RailCarousel
              title="Albums"
              items={albums}
              onItemSelect={(item) => {
                // Albums aren't always directly playable; open modal (shows info + can open tracks via details modal actions)
                setSelected(item);
              }}
            />
          )}

          {tracks.length > 0 && <RailCarousel title="Tracks" items={tracks} onItemSelect={setSelected} />}
        </div>
      </div>

      <DetailsModal item={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}