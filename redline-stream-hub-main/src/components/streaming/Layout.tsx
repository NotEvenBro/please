import { ReactNode, useEffect } from "react";
import { init } from "@noriginmedia/norigin-spatial-navigation";
import TopNav from "./TopNav";
import { useTvNavigation } from "@/lib/useTvNavigation";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  useTvNavigation();

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
    <div className="min-h-screen bg-background">
      <TopNav />
      <main>{children}</main>
    </div>
  );
}
