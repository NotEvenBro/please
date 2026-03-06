import { useEffect, useMemo, useState } from "react";

export type ControlMode = "tv" | "pc";

function isLikelyTvUa() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  return /smart-tv|smarttv|tizen|webos|appletv|hbbtv|aft|googletv|bravia|viera|roku|crkey|tv|vidda_edge/.test(ua);
}

export function useControlMode() {
  const [mode, setMode] = useState<ControlMode>(() => (isLikelyTvUa() ? "tv" : "pc"));

  useEffect(() => {
    const onPointer = () => setMode("pc");
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) {
        setMode("tv");
      }
    };

    window.addEventListener("mousemove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.controlMode = mode;
    return () => {
      delete document.body.dataset.controlMode;
    };
  }, [mode]);

  return useMemo(() => ({ mode, isTvMode: mode === "tv" }), [mode]);
}
