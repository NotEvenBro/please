import { useEffect } from "react";

type Dir = "left" | "right" | "up" | "down";

function normalizeKey(key: string) {
  return key === "Left"
    ? "ArrowLeft"
    : key === "Right"
      ? "ArrowRight"
      : key === "Up"
        ? "ArrowUp"
        : key === "Down"
          ? "ArrowDown"
          : key === "OK" || key === "Select"
            ? "Enter"
            : key;
}

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

    let primary = 0;
    let secondary = 0;
    let directionalOk = false;

    if (dir === "left" && dx < -8) {
      directionalOk = true;
      primary = Math.abs(dx);
      secondary = Math.abs(dy);
    } else if (dir === "right" && dx > 8) {
      directionalOk = true;
      primary = Math.abs(dx);
      secondary = Math.abs(dy);
    } else if (dir === "up" && dy < -8) {
      directionalOk = true;
      primary = Math.abs(dy);
      secondary = Math.abs(dx);
    } else if (dir === "down" && dy > 8) {
      directionalOk = true;
      primary = Math.abs(dy);
      secondary = Math.abs(dx);
    }

    if (!directionalOk) continue;

    const groupPenalty = getGroupKey(el) === currentGroup ? 0 : dir === "left" || dir === "right" ? 250 : 25;
    const score = primary * 10 + secondary + groupPenalty;
    candidates.push({ el, score });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.el ?? null;
}

function isTypingContext(active: HTMLElement | null): boolean {
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return active.isContentEditable;
}

function normalizeDirectionalKeyForLayout(key: string, active: HTMLElement) {
  const inEpisodeColumn = Boolean(active.closest("[data-tv-episode-column='true']"));
  if (!inEpisodeColumn) return key;

  if (key === "ArrowRight") return "ArrowDown";
  if (key === "ArrowLeft") return "ArrowUp";
  return key;
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

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const rawKey = normalizeKey(e.key);

      if (isTypingContext(active) && rawKey !== "Escape") return;

      const scope = getScope();
      const items = getFocusableItems(scope);

      if (!active || !active.classList.contains("focusable")) {
        if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(rawKey)) {
          const first = getAutoFocusTarget(scope, items);
          if (!first) return;
          e.preventDefault();
          first.focus();
          ensureVisible(first);
        }
        return;
      }

      const key = normalizeDirectionalKeyForLayout(rawKey, active);

      if (key === "ArrowUp" && isNearTopOfPage() && getGroupKey(active) !== "top-nav") {
        const topNavItems = getTopNavItems(items);
        const target = pickTopNavEdge(topNavItems, "first");
        if (target) {
          e.preventDefault();
          target.focus();
          ensureVisible(target);
          return;
        }
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
        e.preventDefault();
        const dir: Dir =
          key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : "down";
        const next = pickNext(active, dir, items);
        if (next) {
          next.focus();
          ensureVisible(next);
        }
        return;
      }

      if (key === "Enter" || key === " ") {
        e.preventDefault();
        const episodeButton = getEpisodeButton(active);
        if (episodeButton) {
          episodeButton.click();
          return;
        }
        active.click();
      }

      if (key === "Home") {
        if (focusTopNav()) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as EventListener);
  }, [enabled]);
}
