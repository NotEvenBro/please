import { useRef, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MediaItemUI } from "@/types/media";
import MediaCard from "./MediaCard";
import { Link } from "react-router-dom";

import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface RailCarouselProps {
  title: string;
  titleLink?: string;
  showViewMore?: boolean;
  items: MediaItemUI[];
  onItemSelect?: (item: MediaItemUI) => void;
  /** @deprecated */
  onItemClick?: (item: MediaItemUI) => void;
  showProgress?: boolean;
}

function makeKey(input: string) {
  return input.replace(/[^a-z0-9_-]/gi, "_").slice(0, 60);
}

export default function RailCarousel({
  title,
  titleLink,
  showViewMore = false,
  items,
  onItemSelect,
  onItemClick,
  showProgress,
}: RailCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const railKey = useMemo(() => `RAIL_${makeKey(title)}`, [title]);

  const { ref, focusKey } = useFocusable({
    focusKey: railKey,
    isFocusBoundary: true,
    trackChildren: true,
    saveLastFocusedChild: true,
  });

  const scroll = useCallback((direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref as any} className="py-3" aria-label={title} data-tv-group={railKey}>
        <h2 className="text-2xl font-bold text-foreground/95 mb-3 tv-safe tracking-tight">{title}</h2>

        <div className="relative group/rail">
          {/* Scroll buttons (mouse/touch) */}
          <button
            onClick={() => scroll("left")}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/70 backdrop-blur flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity"
            aria-label="Scroll left"
            type="button"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>

          <button
            onClick={() => scroll("right")}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/70 backdrop-blur flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity"
            aria-label="Scroll right"
            type="button"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>

          <div ref={scrollRef} className="rail-scroll" role="list">
            {items.map((item, idx) => (
              <RailTile
                key={item.id}
                railKey={railKey}
                idx={idx}
                item={item}
                onSelect={onItemSelect ?? onItemClick}
                showProgress={showProgress}
                scrollContainerRef={scrollRef}
              />
            ))}

            {showViewMore && titleLink ? (
              <ViewMoreTile
                railKey={railKey}
                idx={items.length}
                titleLink={titleLink}
                scrollContainerRef={scrollRef}
              />
            ) : null}
          </div>
        </div>
      </section>
    </FocusContext.Provider>
  );
}

function ViewMoreTile({
  railKey,
  idx,
  titleLink,
  scrollContainerRef,
}: {
  railKey: string;
  idx: number;
  titleLink: string;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}) {
  const { ref, focused } = useFocusable({
    focusKey: `${railKey}_VIEW_MORE_${idx}`,
    onFocus: () => {
      const el = ref.current as HTMLElement | null;
      const scroller = scrollContainerRef.current;
      if (!el || !scroller) return;

      const elRect = el.getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();
      const leftOverflow = elRect.left < scRect.left + 24;
      const rightOverflow = elRect.right > scRect.right - 24;
      if (leftOverflow || rightOverflow) {
        el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    },
  });

  return (
    <div role="listitem">
      <Link
        ref={ref as any}
        to={titleLink}
        className={[
          "focusable group relative flex items-center justify-center overflow-hidden rounded-md border border-white/15 bg-white/5 text-white/90",
          "transition-transform duration-200 ease-out will-change-transform",
          focused ? "z-10 scale-110 border-white/50 shadow-[0_16px_40px_rgba(0,0,0,0.65)]" : "scale-100",
        ].join(" ")}
        style={{ width: "clamp(220px, 24vw, 330px)", aspectRatio: "16/9" }}
      >
        <span className="rounded-full border border-white/35 bg-black/30 px-5 py-2 text-sm font-semibold tracking-wide">View More</span>
      </Link>
    </div>
  );
}

function RailTile({
  railKey,
  idx,
  item,
  onSelect,
  showProgress,
  scrollContainerRef,
}: {
  railKey: string;
  idx: number;
  item: MediaItemUI;
  onSelect?: (item: MediaItemUI) => void;
  showProgress?: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}) {
  const tileKey = `${railKey}_ITEM_${idx}`;
  const lastMediaId = typeof window !== "undefined" ? window.sessionStorage.getItem("redline:last-media-id") : null;

  const handleSelect = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("redline:last-media-id", item.id);
      window.sessionStorage.setItem("redline:last-browse-path", `${window.location.pathname}${window.location.search}`);
    }
    onSelect?.(item);
  };

  const { ref, focused } = useFocusable({
    focusKey: tileKey,
    onEnterPress: handleSelect,
    onFocus: () => {
      const el = ref.current as HTMLElement | null;
      const scroller = scrollContainerRef.current;
      if (!el || !scroller) return;

      const elRect = el.getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();

      const leftOverflow = elRect.left < scRect.left + 24;
      const rightOverflow = elRect.right > scRect.right - 24;
      if (leftOverflow || rightOverflow) {
        el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    },
  });

  return (
    <div role="listitem">
      <MediaCard
        ref={ref as any}
        item={item}
        onClick={handleSelect}
        showProgress={showProgress}
        focused={focused}
        autofocus={lastMediaId ? lastMediaId === item.id : idx === 0}
      />
    </div>
  );
}
