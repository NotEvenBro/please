import { useEffect, useMemo, useRef, useState } from "react";
import { mapRemoteAction } from "@/lib/remoteActions";

export type ControlMode = "tv" | "pc";

function isLikelyTvUa() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  return /smart-tv|smarttv|tizen|webos|appletv|hbbtv|aft|googletv|bravia|viera|roku|crkey|tv|vidda_edge/.test(ua);
}

function shouldStartInTvMode() {
  if (isLikelyTvUa()) return true;
  if (typeof window === "undefined") return false;
  const forced = window.sessionStorage.getItem("redline:force-tv-mode");
  if (forced === "1") {
    window.sessionStorage.removeItem("redline:force-tv-mode");
    return true;
  }
  return false;
}

export function useControlMode() {
  const [mode, setMode] = useState<ControlMode>(() => (shouldStartInTvMode() ? "tv" : "pc"));
  const lastRemoteInputAtRef = useRef(0);

  useEffect(() => {
    const onPointer = (event: MouseEvent | PointerEvent) => {
      if (isLikelyTvUa()) return;
      if ("pointerType" in event && event.pointerType && event.pointerType !== "mouse") return;
      if (Date.now() - lastRemoteInputAtRef.current < 4000) return;
      setMode("pc");
    };
    const onKey = (e: KeyboardEvent) => {
      const action = mapRemoteAction({ key: e.key, code: e.code, keyCode: e.keyCode });
      if (action) {
        lastRemoteInputAtRef.current = Date.now();
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
