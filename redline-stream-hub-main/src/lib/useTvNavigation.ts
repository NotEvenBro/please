import { useEffect } from "react";

type Dir = "left" | "right" | "up" | "down";

function normalizeKey(key: string, code?: string, keyCode?: number) {
  if (code === "NumpadEnter" || keyCode === 13) return "Enter";
  if (keyCode === 37) return "ArrowLeft";
  if (keyCode === 38) return "ArrowUp";
  if (keyCode === 39) return "ArrowRight";
  if (keyCode === 40) return "ArrowDown";

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

function pickNext(current: HTMLElement, dir: Dir, items: HTMLElement[]) {
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

    // Keep focus movement local for smoother TV UX.
    const sameGroup = getGroupKey(el) === currentGroup;
    const groupPenalty = sameGroup ? 0 : (dir === "left" || dir === "right" ? 240 : 45);
    const score = primary * 10 + secondary + groupPenalty;

    candidates.push({ el, score });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.el ?? null;
}

function ensureVisible(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const outOfVerticalBounds = rect.top < 0 || rect.bottom > window.innerHeight;
  const outOfHorizontalBounds = rect.left < 0 || rect.right > window.innerWidth;
  if (!outOfVerticalBounds && !outOfHorizontalBounds) return;

  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

export function useTvNavigation() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (selectOpen()) return;

      const key = normalizeKey(e.key, e.code, e.keyCode);
      const scope = getScope();
      const items = Array.from(scope.querySelectorAll(".focusable")).filter(isFocusable);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!active || !active.classList.contains("focusable")) {
        if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) {
          const first = items[0];
          if (!first) return;
          e.preventDefault();
          first.focus();
          ensureVisible(first);
        }
        return;
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
        e.preventDefault();
        const dir: Dir = key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : "down";
        const activeGroup = getGroupKey(active);

        // Keep horizontal focus locked within top nav so it doesn't spill into content.
        const directionalPool =
          activeGroup === "top-nav" && (dir === "left" || dir === "right")
            ? items.filter((x) => getGroupKey(x) === "top-nav")
            : items;

        const next = pickNext(active, dir, directionalPool);
        if (next) {
          next.focus();
          ensureVisible(next);
        } else if (dir === "up" && getScope() === (document.querySelector("main") ?? document.body)) {
          // If user reached top of page content, move focus into top navigation.
          focusTopNav();
        }
        return;
      }

      if (key === "Enter" || key === " ") {
        const episodeBtn = getEpisodeButton(active);
        if (episodeBtn) {
          e.preventDefault();
          episodeBtn.click();
          return;
        }

        const tag = active.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || active.isContentEditable) return;
        e.preventDefault();
        active.click();
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as EventListener);
  }, []);
}
