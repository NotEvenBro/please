import { useSyncExternalStore } from "react";

const KEY = "redline_ratings_v1";

type RatingsMap = Record<string, number>; // 1..5

function safeParse(raw: string | null): RatingsMap {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const out: RatingsMap = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function readAll(): RatingsMap {
  return safeParse(localStorage.getItem(KEY));
}

function writeAll(map: RatingsMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

// Simple pub/sub for reactivity
const listeners = new Set<() => void>();
function emit() {
  for (const l of Array.from(listeners)) l();
  // also broadcast cross-tab
  try {
    window.dispatchEvent(new Event("redline-rating-change"));
  } catch {}
}

export function getLocalStars(id: string): number | undefined {
  const map = readAll();
  return map[id];
}

export function setLocalStars(id: string, stars: number | null) {
  const map = readAll();
  if (stars == null) {
    delete map[id];
  } else {
    const n = Math.max(1, Math.min(5, Math.round(stars)));
    map[id] = n;
  }
  writeAll(map);
  emit();
}

export function useRatingsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) cb();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener("redline-rating-change", cb as any);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("redline-rating-change", cb as any);
      };
    },
    () => {
      // version can just be the raw JSON length or timestamp
      const raw = localStorage.getItem(KEY) || "";
      return raw.length;
    },
    () => 0
  );
}
