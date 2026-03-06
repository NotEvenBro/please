import { ReactNode, useEffect } from "react";
import { init } from "@noriginmedia/norigin-spatial-navigation";
import TopNav from "./TopNav";
import { useTvNavigation } from "@/lib/useTvNavigation";
import { useControlMode } from "@/lib/useControlMode";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
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

  return (
    <div className="min-h-screen bg-background" data-control-mode={mode}>
      <TopNav />
      <main>{children}</main>
    </div>
  );
}
