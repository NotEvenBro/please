import { ReactNode, useEffect } from "react";
import { init } from "@noriginmedia/norigin-spatial-navigation";
import TopNav from "./TopNav";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  useEffect(() => {
    init({
      debug: false,
      visualDebug: false,
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main>{children}</main>
    </div>
  );
}
