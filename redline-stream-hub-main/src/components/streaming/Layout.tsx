import { ReactNode, useEffect } from "react";
import { init } from "@noriginmedia/norigin-spatial-navigation";
import { useLocation } from "react-router-dom";
import TopNav from "./TopNav";
import { useTvNavigation } from "@/lib/useTvNavigation";
import { useControlMode } from "@/lib/useControlMode";
import { buildRouteKey, getFocusableSelectorForElement, getFocusSnapshot, saveFocusSnapshot } from "@/lib/focusHistory";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { mode, isTvMode } = useControlMode();

  useTvNavigation(isTvMode);
  useEffect(() => {
    init({
      debug: false,
      visualDebug: false,
      shouldFocusDOMNode: true,
      throttle: 16,
      throttleKeypresses: true,
    });
  }, []);

  useEffect(() => {
    if (!isTvMode) return;

    const routeKey = buildRouteKey(location.pathname, location.search);
    const t = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.classList.contains("focusable") && active.isConnected) return;

      const snapshot = getFocusSnapshot(routeKey);
      const restored = snapshot ? document.querySelector<HTMLElement>(snapshot.selector) : null;
      const target =
        restored ||
        document.querySelector<HTMLElement>("main [data-tv-autofocus='true'].focusable") ||
        document.querySelector<HTMLElement>("main .focusable") ||
        document.querySelector<HTMLElement>("[data-tv-group='top-nav'] .focusable");

      target?.focus();
    }, 50);

    return () => window.clearTimeout(t);
  }, [isTvMode, location.pathname, location.search]);

  useEffect(() => {
    const routeKey = buildRouteKey(location.pathname, location.search);
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const selector = getFocusableSelectorForElement(target);
      if (!selector) return;
      saveFocusSnapshot(routeKey, selector);
    };

    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-background" data-control-mode={mode}>
      <TopNav />
      <main>{children}</main>
    </div>
  );
}
