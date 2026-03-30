import { useEffect } from "react";
import { mapRemoteAction } from "@/lib/remoteActions";

type Dir = "left" | "right" | "up" | "down";

function isFocusable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.classList.contains("focusable")) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;

  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getScope(): ParentNode {
  const openModal = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")).at(-1);
  if (openModal) return openModal;
  return document.querySelector("main") ?? document.body;
}

function selectOpen() {
  return Boolean(document.querySelector("[data-tv-select-content][data-state='open']"));
}

function focusTopNav() {
  const firstNav = document.querySelector<HTMLElement>("[data-tv-group='top-nav'] .focusable");
  if (!firstNav) return false;
  firstNav.focus();
  firstNav.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  return true;
}

function getFirstFocusableInGroup(group: string) {
  return document.querySelector<HTMLElement>(`[data-tv-group="${group}"] .focusable`);
}

function isNearTopOfPage() {
  return (window.scrollY || window.pageYOffset || 0) <= 16;
}

function getGroupKey(el: HTMLElement): string {
  const group = el.closest<HTMLElement>("[data-tv-group]");
  if (group?.dataset.tvGroup) return group.dataset.tvGroup;

  const rail = el.closest<HTMLElement>(".rail-scroll");
  if (rail) return "rail-scroll";

  return "default";
}

function getEpisodeButton(el: HTMLElement | null): HTMLButtonElement | null {
  if (!el) return null;
  if (el instanceof HTMLButtonElement && el.dataset.episodeId) return el;
  return el.closest("button[data-episode-id]");
}

function getTopNavItems(items: HTMLElement[]) {
  return items.filter((x) => getGroupKey(x) === "top-nav");
}

function getMainContentTarget() {
  return (
    document.querySelector<HTMLElement>("main [data-tv-autofocus='true'].focusable") ||
    document.querySelector<HTMLElement>("main .focusable")
  );
}

function pickTopNavEdge(items: HTMLElement[], edge: "first" | "last") {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  return edge === "first" ? sorted[0] : sorted[sorted.length - 1];
}

function pickNext(current: HTMLElement, dir: Dir, items: HTMLElement[]): HTMLElement | null {
  const cRect = current.getBoundingClientRect();
  const c = center(cRect);
  const currentGroup = getGroupKey(current);

  const candidates: { el: HTMLElement; score: number }[] = [];

  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const p = center(r);
    const dx = p.x - c.x;
    const dy = p.y - c.y;

    let ok = false;
    let primary = 0;
    let secondary = 0;

    if (dir === "left" && dx < -8) {
      ok = true;
      primary = Math.abs(dx);
      secondary = Math.abs(dy);
    } else if (dir === "right" && dx > 8) {
      ok = true;
      primary = Math.abs(dx);
      secondary = Math.abs(dy);
    } else if (dir === "up" && dy < -8) {
      ok = true;
      primary = Math.abs(dy);
      secondary = Math.abs(dx);
    } else if (dir === "down" && dy > 8) {
      ok = true;
      primary = Math.abs(dy);
      secondary = Math.abs(dx);
    }

    if (!ok) continue;

    const sameGroup = getGroupKey(el) === currentGroup;
    const groupPenalty = sameGroup ? 0 : dir === "left" || dir === "right" ? 1200 : 90;
    const score = primary * 10 + secondary + groupPenalty;

    candidates.push({ el, score });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.el ?? null;
}

function isTextInputElement(el: HTMLElement) {
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function normalizeDirectionalActionForLayout(action: "LEFT" | "RIGHT" | "UP" | "DOWN", active: HTMLElement) {
  const inEpisodeColumn = Boolean(active.closest("[data-tv-episode-column='true']"));
  if (!inEpisodeColumn) return action;

  if (action === "RIGHT") return "DOWN";
  if (action === "LEFT") return "UP";
  return action;
}

function getAutoFocusTarget(scope: ParentNode, items: HTMLElement[]) {
  const scoped = scope instanceof HTMLElement || scope instanceof Document ? scope : document;
  const preferred = scoped.querySelector<HTMLElement>("[data-tv-autofocus='true'].focusable");
  if (preferred && items.includes(preferred)) return preferred;
  return items[0] ?? null;
}

function getFocusableItems(scope: ParentNode) {
  const scopedItems = Array.from(scope.querySelectorAll(".focusable"));

  const topNav = document.querySelector("[data-tv-group='top-nav']");
  const includeTopNav =
    topNav &&
    scope !== topNav &&
    !(scope instanceof HTMLElement && scope.getAttribute("role") === "dialog");
  const topNavItems = includeTopNav ? Array.from(topNav.querySelectorAll(".focusable")) : [];

  return Array.from(new Set([...scopedItems, ...topNavItems])).filter(isFocusable);
}

function ensureVisible(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const outOfVerticalBounds = rect.top < 0 || rect.bottom > window.innerHeight;
  const outOfHorizontalBounds = rect.left < 0 || rect.right > window.innerWidth;
  if (!outOfVerticalBounds && !outOfHorizontalBounds) return;

  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

export function useTvNavigation(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (selectOpen()) return;

      const action = mapRemoteAction({ key: e.key, code: e.code, keyCode: e.keyCode });
      if (!action) return;

      const scope = getScope();
      const items = getFocusableItems(scope);
      const rawActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const active = rawActive && rawActive.isConnected ? rawActive : null;

      if (action === "BACK") {
        if (active && isTextInputElement(active)) return;

        if (document.querySelector("[role='dialog'][aria-modal='true']")) {
          e.preventDefault();
          const closeBtn = document.querySelector<HTMLElement>("[role='dialog'] .focusable[aria-label='Close']");
          closeBtn?.click();
          return;
        }

        if (!active || getGroupKey(active) !== "top-nav") {
          e.preventDefault();
          focusTopNav();
          return;
        }

        e.preventDefault();
        window.history.back();
        return;
      }

      if (!active || !active.classList.contains("focusable")) {
        if (["DOWN", "UP", "LEFT", "RIGHT", "SELECT"].includes(action)) {
          const first = getAutoFocusTarget(scope, items);
          if (!first) return;
          e.preventDefault();
          first.focus();
          ensureVisible(first);
        }
        return;
      }

      if (["LEFT", "RIGHT", "UP", "DOWN"].includes(action)) {
        e.preventDefault();

        const navAction = normalizeDirectionalActionForLayout(action as "LEFT" | "RIGHT" | "UP" | "DOWN", active);
        const dir: Dir = navAction === "LEFT" ? "left" : navAction === "RIGHT" ? "right" : navAction === "UP" ? "up" : "down";

        const activeGroup = getGroupKey(active);

        if (activeGroup === "top-nav" && dir === "down") {
          const mainTarget = getMainContentTarget();
          if (mainTarget) {
            mainTarget.focus();
            ensureVisible(mainTarget);
          }
          return;
        }

        if (activeGroup === "top-nav" && (dir === "left" || dir === "right")) {
          const navItems = getTopNavItems(items).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          const idx = navItems.indexOf(active);
          if (idx >= 0 && navItems.length > 0) {
            const nextIdx = dir === "left" ? (idx - 1 + navItems.length) % navItems.length : (idx + 1) % navItems.length;
            const nextNav = navItems[nextIdx];
            if (nextNav) {
              nextNav.focus();
              ensureVisible(nextNav);
              return;
            }
          }
        }

        if (dir === "up" && activeGroup !== "top-nav" && isNearTopOfPage()) {
          const inWatchPage = Boolean(active.closest("[data-tv-group='watch-page']"));
          if (!inWatchPage && focusTopNav()) {
            return;
          }
        }

        const activeRail = active.closest(".rail-scroll");
        const directionalPool =
          activeGroup === "top-nav" && (dir === "left" || dir === "right")
            ? getTopNavItems(items)
            : activeRail && (dir === "left" || dir === "right")
            ? items.filter((it) => it.closest(".rail-scroll") === activeRail)
            : dir === "left" || dir === "right"
            ? items.filter((it) => getGroupKey(it) === activeGroup)
            : items.filter((it) => getGroupKey(it) !== "top-nav");

        if (dir === "down" && getGroupKey(active) === "watch-controls") {
          const episodeTarget = getFirstFocusableInGroup("watch-episodes") || getFirstFocusableInGroup("watch-episode-row");
          if (episodeTarget) {
            episodeTarget.focus();
            ensureVisible(episodeTarget);
            return;
          }
        }

        if (dir === "down" && getGroupKey(active) === "details-actions") {
          const episodeTarget =
            document.querySelector<HTMLElement>("[data-tv-group='details-episodes'] [data-tv-episode-column-item='true'].focusable") ||
            getFirstFocusableInGroup("details-episodes");
          if (episodeTarget) {
            episodeTarget.focus();
            ensureVisible(episodeTarget);
            return;
          }
        }

        if (dir === "right" && active.closest("[data-tv-episode-column='true']")) {
          const seasonTrigger = document.querySelector<HTMLElement>("[data-tv-group='details-episodes'] [data-tv-season-trigger='true'].focusable");
          if (seasonTrigger) {
            seasonTrigger.focus();
            ensureVisible(seasonTrigger);
            return;
          }
        }

        if (dir === "left" && active.dataset.tvSeasonTrigger === "true") {
          const episodeTarget = document.querySelector<HTMLElement>("[data-tv-group='details-episodes'] [data-tv-episode-column-item='true'].focusable");
          if (episodeTarget) {
            episodeTarget.focus();
            ensureVisible(episodeTarget);
            return;
          }
        }

        const next = pickNext(active, dir, directionalPool);
        if (next) {
          next.focus();
          ensureVisible(next);
        } else if (activeGroup === "top-nav" && (dir === "left" || dir === "right")) {
          const edge = pickTopNavEdge(directionalPool, dir === "left" ? "last" : "first");
          if (edge) {
            edge.focus();
            ensureVisible(edge);
          }
        }
        return;
      }

      if (action === "SELECT") {
        const episodeBtn = getEpisodeButton(active);
        if (episodeBtn) {
          e.preventDefault();
          episodeBtn.click();
          return;
        }

        if (isTextInputElement(active)) return;
        e.preventDefault();
        active.click();
        return;
      }

      if (action === "HOME") {
        if (focusTopNav()) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as EventListener);
  }, [enabled]);
}
