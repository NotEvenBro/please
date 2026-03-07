import { ReactNode, useEffect } from "react";
import { init } from "@noriginmedia/norigin-spatial-navigation";
import TopNav from "./TopNav";
import { useTvNavigation } from "@/lib/useTvNavigation";
import { useControlMode } from "@/lib/useControlMode";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { mode, isTvMode } = useControlMode();
  const location = useLocation();
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
    const t = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.classList.contains("focusable") && active.isConnected) return;

      const target =
        document.querySelector<HTMLElement>("main [data-tv-autofocus='true'].focusable") ||
        document.querySelector<HTMLElement>("main .focusable") ||
        document.querySelector<HTMLElement>("[data-tv-group='top-nav'] .focusable");
      target?.focus();
    }, 80);

    return () => window.clearTimeout(t);
  }, [isTvMode, location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-background" data-control-mode={mode}>
      <TopNav />
      <main>{children}</main>
    </div>
  );
}
