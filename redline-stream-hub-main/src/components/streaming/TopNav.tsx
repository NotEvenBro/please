import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Home, Film, Tv, Settings, Music2 } from "lucide-react";

const navItems = [
  { label: "Home", path: "/", icon: Home },
  { label: "Search", path: "/search", icon: Search },
  { label: "Movies", path: "/movies", icon: Film },
  { label: "TV Shows", path: "/tv", icon: Tv },
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
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border"
          : "bg-gradient-to-b from-background/80 to-transparent"
      }`}
      style={{ height: "var(--nav-height)" }}
      role="navigation"
      aria-label="Main navigation"
      data-tv-group="top-nav"
    >
      <div className="flex items-center h-full tv-safe">
        <Link to="/" className="focusable mr-6 sm:mr-10 flex items-center gap-3">
          <img
            src="/Website.png"
            alt="Redline"
            className="h-12 sm:h-14 w-auto brightness-125 drop-shadow-[0_0_14px_rgba(255,0,0,0.55)]"
          />
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`focusable flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0 stroke-[2.25] drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex sm:hidden items-center gap-1 ml-auto">
          {navItems.slice(0, 5).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`focusable p-3 rounded-md transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
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
