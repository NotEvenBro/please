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
  if (el.getAttribute("aria-disabled") === "true") return false;
  if ((el as HTMLButtonElement).disabled) return false;

  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return true;
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getNavigationScope(): ParentNode {
  const openModal = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")).at(-1);
  if (openModal) return openModal;
  return document.querySelector("main") ?? document.body;
}

function getFocusables(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll(".focusable")).filter(isFocusable);
}

function getGroupKey(el: HTMLElement): string {
  const grouped = el.closest<HTMLElement>("[data-tv-group]");
  if (grouped?.dataset.tvGroup) return grouped.dataset.tvGroup;

  const rail = el.closest<HTMLElement>(".rail-scroll");
  if (rail) return "rail-scroll";

  const nav = el.closest<HTMLElement>("nav, header");
  if (nav) return "top-nav";

  return "default";
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

function hasOpenSelectContent() {
  return Boolean(document.querySelector("[data-tv-select-content][data-state='open']"));
}

function isTypingContext(active: HTMLElement | null): boolean {
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return active.isContentEditable;
}

export function useTvNavigation() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const normalizedKey =
        key === "Left" ? "ArrowLeft" :
        key === "Right" ? "ArrowRight" :
        key === "Up" ? "ArrowUp" :
        key === "Down" ? "ArrowDown" :
        key === "OK" || key === "Select" ? "Enter" :
        key;

      const normalizedKey = normalizeKey(e.key);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (hasOpenSelectContent()) {
        // Let Radix Select manage its own directional navigation.
        return;
      }

      const scope = getNavigationScope();
      const items = getFocusables(scope);

      if (!active || !active.classList.contains("focusable")) {
        if (["ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Enter"].includes(normalizedKey)) {
          const first = items[0];
          if (!first) return;
          e.preventDefault();
          first.focus();
          first.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
        return;
      }

      if (normalizedKey === "ArrowLeft" || normalizedKey === "ArrowRight" || normalizedKey === "ArrowUp" || normalizedKey === "ArrowDown") {
        e.preventDefault();
        const dir = normalizedKey === "ArrowLeft" ? "left" : normalizedKey === "ArrowRight" ? "right" : normalizedKey === "ArrowUp" ? "up" : "down";
        const next = pickNext(active, dir, items);
        if (next) {
          next.focus();
          next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
        return;
      }

      // Enter/Space to activate like Netflix remote
      if (normalizedKey === "Enter" || normalizedKey === " ") {
        // Don't break typing in inputs
        const tag = (active.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        e.preventDefault();
        active.click();
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as EventListener);
  }, []);
}
