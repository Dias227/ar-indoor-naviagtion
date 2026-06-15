/**
 * История маршрутов: список посещений с повторным запуском навигации.
 */
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useNavigationStore } from '@/store/useNavigationStore';

export function HistoryPage() {
  const navigate = useNavigate();
  const { history, clearHistory } = useHistoryStore();
  const buildingData = useNavigationStore((s) => s.buildingData);

  const repeatRoute = (fromRoomId: string, toRoomId: string) => {
    const from = buildingData.rooms.find((r) => r.id === fromRoomId);
    const to = buildingData.rooms.find((r) => r.id === toRoomId);
    if (!from || !to) return;
    const store = useNavigationStore.getState();
    store.setStartRoom(from);
    store.setEndRoom(to);
    if (store.computeRoute()) navigate('/ar');
  };

  return (
    <PageShell
      title="История маршрутов"
      subtitle={`${history.length} записей`}
      actions={
        history.length > 0 ? (
          <button
            onClick={clearHistory}
            className="text-xs text-accent-pink/80 active:scale-95"
          >
            Очистить
          </button>
        ) : undefined
      }
    >
      {history.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-4xl">🕘</p>
          <p className="mt-3 text-white/60">История пока пуста</p>
          <NeonButton full className="mt-5" onClick={() => navigate('/select-start')}>
            Построить первый маршрут
          </NeonButton>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2.5">
          {history.map((h, i) => (
            <GlassCard key={h.id} delay={i * 0.04} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {h.fromName} <span className="text-neon">→</span> {h.toName}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    {new Date(h.startedAt).toLocaleString('ru-RU')} ·{' '}
                    {h.distance.toFixed(0)} м ·{' '}
                    {h.completed ? '✅ завершён' : '⏳ не завершён'}
                  </p>
                </div>
                <NeonButton
                  variant="ghost"
                  className="!px-3 !py-2 text-sm shrink-0"
                  onClick={() => repeatRoute(h.fromRoomId, h.toRoomId)}
                >
                  Повторить
                </NeonButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
