export interface FocusSnapshot {
  route: string;
  selector: string;
  savedAt: number;
}

const STORAGE_KEY = "redline:focus-history:v1";
const STALE_MS = 1000 * 60 * 60 * 12;

function safeStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function readAll(): Record<string, FocusSnapshot> {
  const storage = safeStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FocusSnapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, FocusSnapshot>) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota/private mode failures
  }
}

export function buildRouteKey(pathname: string, search = "") {
  return `${pathname}${search}`;
}

export function getFocusableSelectorForElement(el: HTMLElement | null) {
  if (!el) return null;
  if (!el.classList.contains("focusable")) return null;

  const focusId = el.getAttribute("data-focus-id");
  if (focusId) return `[data-focus-id='${CSS.escape(focusId)}']`;

  const href = (el as HTMLAnchorElement).getAttribute?.("href");
  if (href) return `a.focusable[href='${CSS.escape(href)}']`;

  if (el.id) return `#${CSS.escape(el.id)}`;

  const group = el.closest<HTMLElement>("[data-tv-group]")?.dataset.tvGroup;
  if (group) {
    const groupItems = Array.from(document.querySelectorAll<HTMLElement>(`[data-tv-group='${group}'] .focusable`));
    const idx = groupItems.indexOf(el);
    if (idx >= 0) return `[data-tv-group='${group}'] .focusable:nth-of-type(${idx + 1})`;
  }

  return null;
}

export function saveFocusSnapshot(route: string, selector: string) {
  const all = readAll();
  all[route] = { route, selector, savedAt: Date.now() };
  writeAll(all);
}

export function getFocusSnapshot(route: string): FocusSnapshot | null {
  const all = readAll();
  const snapshot = all[route];
  if (!snapshot) return null;
  if (Date.now() - snapshot.savedAt > STALE_MS) {
    delete all[route];
    writeAll(all);
    return null;
  }
  return snapshot;
}
