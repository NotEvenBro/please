import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Home, Film, Tv, Settings, Music2 } from "lucide-react";

const navItems = [
  { label: "Home", path: "/", icon: Home },
  { label: "Shows", path: "/tv", icon: Tv },
  { label: "Movies", path: "/movies", icon: Film },
  { label: "Search", path: "/search", icon: Search },
  { label: "Music", path: "/music", icon: Music2 },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function TopNav() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-black/95 backdrop-blur-md" : "bg-gradient-to-b from-black/90 to-transparent"
      }`}
      style={{ height: "var(--nav-height)" }}
      role="navigation"
      aria-label="Main navigation"
      data-tv-group="top-nav"
    >
      <div className="tv-safe flex h-full items-center gap-8">
        <div className="flex items-center" aria-hidden="true">
          <img src="/Website.png" alt="Redline" className="h-10 w-auto brightness-125" />
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`focusable rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "text-white" : "text-white/70 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
                data-focus-id={`nav:${item.path}`}
              >
                <item.icon className="w-5 h-5 shrink-0 stroke-[2.25] drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1 sm:hidden">
          {navItems.slice(0, 4).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`focusable rounded-md p-2.5 ${active ? "text-white" : "text-white/70"}`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                data-focus-id={`nav:${item.path}`}
              >
                <item.icon className="w-6 h-6 shrink-0 stroke-[2.4] drop-shadow-[0_0_2px_rgba(255,255,255,0.28)]" />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
