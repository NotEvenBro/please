import poster1 from "@/assets/poster-1.jpg";
import poster2 from "@/assets/poster-2.jpg";
import poster3 from "@/assets/poster-3.jpg";
import poster4 from "@/assets/poster-4.jpg";
import poster5 from "@/assets/poster-5.jpg";
import poster6 from "@/assets/poster-6.jpg";
import heroBanner from "@/assets/hero-banner-1.jpg";

export interface MediaItem {
  id: string;
  title: string;
  year: number;
  rating: string;
  duration: string;
  genres: string[];
  description: string;
  poster: string;
  backdrop?: string;
  type: "movie" | "series";
  progress?: number; // 0-100
  episodeCount?: number;
  seasonCount?: number;
}

const posters = [poster1, poster2, poster3, poster4, poster5, poster6];

function makeMockItem(id: number, overrides: Partial<MediaItem> = {}): MediaItem {
  const titles = [
    "Shadow Protocol", "Deep Current", "Neon District", "Eyes in the Dark",
    "Thunder Peak", "Crimson Horizon", "Iron Circuit", "Silent Waters",
    "Dark Velocity", "The Last Signal", "Midnight Run", "Edge of Nowhere",
    "Cold Ember", "Steel Dawn", "Binary Storm", "Fractured Light",
    "Rogue Element", "Phantom Grid", "Zero Meridian", "Black Resonance",
  ];
  const genres = [["Action", "Thriller"], ["Sci-Fi", "Drama"], ["Horror", "Mystery"], ["Adventure", "Drama"], ["Action", "Sci-Fi"], ["Drama", "Romance"]];
  return {
    id: `item-${id}`,
    title: titles[id % titles.length],
    year: 2022 + (id % 4),
    rating: ["PG-13", "R", "TV-MA", "PG"][id % 4],
    duration: `${1 + (id % 2)}h ${20 + (id * 7) % 40}m`,
    genres: genres[id % genres.length],
    description: "A gripping tale of suspense and intrigue that keeps you on the edge of your seat from start to finish. When the unthinkable happens, heroes must rise.",
    poster: posters[id % posters.length],
    type: id % 3 === 0 ? "series" : "movie",
    episodeCount: id % 3 === 0 ? 8 + (id % 5) : undefined,
    seasonCount: id % 3 === 0 ? 1 + (id % 3) : undefined,
    ...overrides,
  };
}

export const featuredItem: MediaItem = {
  ...makeMockItem(0),
  title: "Shadow Protocol",
  backdrop: heroBanner,
  description: "When a covert government program is exposed, an elite operative must go rogue to protect the ones she loves — and uncover a conspiracy that reaches the highest levels of power.",
};

export const continueWatching: MediaItem[] = [
  makeMockItem(1, { progress: 45 }),
  makeMockItem(5, { progress: 72 }),
  makeMockItem(9, { progress: 20 }),
  makeMockItem(3, { progress: 88 }),
  makeMockItem(12, { progress: 33 }),
  makeMockItem(7, { progress: 60 }),
];

export const recentlyAdded: MediaItem[] = Array.from({ length: 12 }, (_, i) => makeMockItem(i + 10));
export const actionMovies: MediaItem[] = Array.from({ length: 12 }, (_, i) => makeMockItem(i + 2));
export const sciFiMovies: MediaItem[] = Array.from({ length: 12 }, (_, i) => makeMockItem(i + 6));
export const dramaMovies: MediaItem[] = Array.from({ length: 12 }, (_, i) => makeMockItem(i + 14));

export const allMedia: MediaItem[] = Array.from({ length: 20 }, (_, i) => makeMockItem(i));

export const categories = [
  "Action", "Sci-Fi", "Drama", "Horror", "Comedy", "Thriller",
  "Romance", "Adventure", "Documentary", "Animation",
];
