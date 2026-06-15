/**
 * Корневой компонент: маршрутизация страниц приложения.
 */
import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { useNavigationStore } from '@/store/useNavigationStore';

// Тяжёлые страницы (Three.js, AR) грузим лениво — быстрый первый экран.
const BuildingSelectPage = lazy(() =>
  import('@/pages/BuildingSelectPage').then((m) => ({ default: m.BuildingSelectPage })),
);
const PointSelectPage = lazy(() =>
  import('@/pages/PointSelectPage').then((m) => ({ default: m.PointSelectPage })),
);
const ARNavigationPage = lazy(() =>
  import('@/pages/ARNavigationPage').then((m) => ({ default: m.ARNavigationPage })),
);
const MapPage = lazy(() =>
  import('@/pages/MapPage').then((m) => ({ default: m.MapPage })),
);
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const FavoritesPage = lazy(() =>
  import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AdminPage = lazy(() =>
  import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const ARMapPage = lazy(() =>
  import('@/pages/ARMapPage').then((m) => ({ default: m.ARMapPage })),
);
const AboutPage = lazy(() =>
  import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })),
);

function PageLoader() {
  return (
    <div className="app-bg flex min-h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-neon/20 border-t-neon shadow-neon" />
        <p className="animate-pulse text-sm text-white/50">Загрузка…</p>
      </div>
    </div>
  );
}

export default function App() {
  const loadBuildings = useNavigationStore((s) => s.loadBuildings);

  useEffect(() => {
    void loadBuildings();
  }, [loadBuildings]);

  return (
    <HashRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/buildings" element={<BuildingSelectPage />} />
          <Route path="/select-start" element={<PointSelectPage mode="start" />} />
          <Route path="/select-end" element={<PointSelectPage mode="end" />} />
          <Route path="/ar" element={<ARNavigationPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/ar-map" element={<ARMapPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
