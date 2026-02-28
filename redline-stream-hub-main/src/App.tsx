import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import SearchPage from "./pages/SearchPage";
import MoviesPage from "./pages/MoviesPage";
import TvShowsPage from "./pages/TvShowsPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import WatchPage from "./pages/WatchPage";
import MusicPage from "./pages/MusicPage";
import MusicAlbumPage from "./pages/MusicAlbumPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/music/album/:id" element={<MusicAlbumPage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/tv" element={<TvShowsPage />} />
          <Route path="/library" element={<Navigate to="/movies" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/watch/:id" element={<WatchPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
