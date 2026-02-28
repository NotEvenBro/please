import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "@/components/streaming/Layout";
import RailCarousel from "@/components/streaming/RailCarousel";
import DetailsModal from "@/components/streaming/DetailsModal";
import { useAlbumTracks, useItem } from "@/hooks/use-jellyfin";
import { jellyfinToMediaUI } from "@/lib/mediaAdapters";
import type { MediaItemUI } from "@/types/media";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useRatingsVersion } from "@/lib/localRating";

export default function MusicAlbumPage() {
  const _ratingsVersion = useRatingsVersion();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<MediaItemUI | null>(null);

  const albumQ = useItem(id);
  const tracksQ = useAlbumTracks(id || "", 0, 200);

  const album = useMemo(() => (albumQ.data ? jellyfinToMediaUI(albumQ.data, { posterWidth: 720, backdropWidth: 1440 }) : undefined), [albumQ.data]);
  const tracks = useMemo(() => (tracksQ.data?.Items ?? []).map((x) => jellyfinToMediaUI(x)), [tracksQ.data]);

  const firstTrack = tracks.find((t) => t.kind === "Track");

  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <div className="flex items-start justify-between gap-6 mt-6 mb-6">
          <div>
            <h1 className="text-3xl font-black text-foreground">{album?.title ?? "Album"}</h1>
            {album?.artist && <p className="text-muted-foreground mt-1">{album.artist}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="focusable" onClick={() => navigate(-1)}>
              Back
            </Button>
            {firstTrack && (
              <Button className="focusable" onClick={() => navigate(`/watch/${firstTrack.id}`)}>
                Play
              </Button>
            )}
          </div>
        </div>

        {tracks.length > 0 ? (
          <RailCarousel title="Tracks" items={tracks} onItemSelect={setSelected} />
        ) : (
          <p className="text-muted-foreground">No tracks found for this album.</p>
        )}
      </div>

      <DetailsModal item={selected} onClose={() => setSelected(null)} />
    </Layout>
  );
}