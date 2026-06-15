/**
 * Избранные маршруты: быстрый запуск сохранённых маршрутов.
 */
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useNavigationStore } from '@/store/useNavigationStore';

export function FavoritesPage() {
  const navigate = useNavigate();
  const { favorites, removeFavorite } = useHistoryStore();
  const buildingData = useNavigationStore((s) => s.buildingData);

  const startRoute = (fromRoomId: string, toRoomId: string) => {
    const from = buildingData.rooms.find((r) => r.id === fromRoomId);
    const to = buildingData.rooms.find((r) => r.id === toRoomId);
    if (!from || !to) return;
    const store = useNavigationStore.getState();
    store.setStartRoom(from);
    store.setEndRoom(to);
    if (store.computeRoute()) navigate('/ar');
  };

  return (
    <PageShell title="Избранные маршруты" subtitle={`${favorites.length} сохранено`}>
      {favorites.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-4xl">★</p>
          <p className="mt-3 text-white/60">
            Добавляйте маршруты в избранное со страницы карты
          </p>
          <NeonButton full className="mt-5" onClick={() => navigate('/select-start')}>
            Построить маршрут
          </NeonButton>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2.5">
          {favorites.map((f, i) => (
            <GlassCard key={f.id} delay={i * 0.04} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    <span className="mr-1 text-neon">★</span>
                    {f.fromName} <span className="text-neon">→</span> {f.toName}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    Сохранено {new Date(f.createdAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <NeonButton
                    variant="ghost"
                    className="!px-3 !py-2 text-sm"
                    onClick={() => startRoute(f.fromRoomId, f.toRoomId)}
                  >
                    Идти
                  </NeonButton>
                  <NeonButton
                    variant="danger"
                    className="!px-3 !py-2 text-sm"
                    onClick={() => removeFavorite(f.id)}
                  >
                    ✕
                  </NeonButton>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
