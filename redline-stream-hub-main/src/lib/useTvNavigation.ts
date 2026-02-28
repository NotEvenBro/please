import { useEffect } from "react";

type Dir = "left" | "right" | "up" | "down";

function isFocusable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.classList.contains("focusable")) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if ((el as any).disabled) return false;
  // hidden
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return true;
}

function getFocusables(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".focusable")).filter(isFocusable);
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function pickNext(current: HTMLElement, dir: Dir, items: HTMLElement[]): HTMLElement | null {
  const cRect = current.getBoundingClientRect();
  const c = center(cRect);

  const candidates: { el: HTMLElement; score: number; primary: number; secondary: number }[] = [];

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
      ok = true; primary = Math.abs(dx); secondary = Math.abs(dy);
    } else if (dir === "right" && dx > 8) {
      ok = true; primary = Math.abs(dx); secondary = Math.abs(dy);
    } else if (dir === "up" && dy < -8) {
      ok = true; primary = Math.abs(dy); secondary = Math.abs(dx);
    } else if (dir === "down" && dy > 8) {
      ok = true; primary = Math.abs(dy); secondary = Math.abs(dx);
    }

    if (!ok) continue;

    // Netflix-ish: prefer closest in the intended axis, then closest orthogonal
    const score = primary * 10 + secondary;
    candidates.push({ el, score, primary, secondary });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.el ?? null;
}

function clickLike(el: HTMLElement) {
  // Prefer native click for links/buttons
  el.click();
}

export function useTvNavigation() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const items = getFocusables();

      // If nothing focused yet, focus first nav item on arrow/enter
      if (!active || !active.classList.contains("focusable")) {
        if (["ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Enter"].includes(key)) {
          const first = items[0];
          if (first) {
            e.preventDefault();
            first.focus();
            first.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }
        return;
      }

      if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
        e.preventDefault();
        const dir = key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : "down";
        const next = pickNext(active, dir, items);
        if (next) {
          next.focus();
          next.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        return;
      }

      // Enter/Space to activate like Netflix remote
      if (key === "Enter" || key === " ") {
        // Don't break typing in inputs
        const tag = (active.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        e.preventDefault();
        clickLike(active);
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as any);
  }, []);
}
