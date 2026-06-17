/**
 * Страница карты: 3D-вид здания (x-ray) с NFS-маршрутом + 2D-миникарта,
 * пошаговый список инструкций и симуляция прохождения.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Minimap } from '@/components/Minimap';
import { LocationFixBar } from '@/components/LocationFixBar';
import { ScenePreview } from '@/three/ScenePreview';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useRouteSimulation } from '@/hooks/useRouteSimulation';
import { useRouteVoiceAnnouncements } from '@/hooks/useVoiceGuidance';

export function MapPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const route = useNavigationStore((s) => s.route);
  const startRoom = useNavigationStore((s) => s.startRoom);
  const endRoom = useNavigationStore((s) => s.endRoom);
  const currentStep = useNavigationStore((s) => s.currentStep);
  const sim = useRouteSimulation();
  const { addFavorite, isFavorite } = useHistoryStore();

  useRouteVoiceAnnouncements();

  if (!route || !startRoom || !endRoom) {
    return (
      <PageShell title="Миникарта" subtitle="Маршрут не построен">
        <GlassCard className="p-8 text-center">
          <p className="text-4xl">🗺</p>
          <p className="mt-3 text-white/60">
            Сначала выберите начальную и конечную точки
          </p>
          <NeonButton full className="mt-5" onClick={() => navigate('/select-start')}>
            Построить маршрут
          </NeonButton>
        </GlassCard>
      </PageShell>
    );
  }

  const fav = isFavorite(startRoom.id, endRoom.id);

  return (
    <PageShell
      title="Миникарта"
      subtitle={`${startRoom.name} → ${endRoom.name}`}
      actions={
        <button
          onClick={() =>
            !fav &&
            addFavorite({
              buildingId: useNavigationStore.getState().buildingData.building.id,
              fromRoomId: startRoom.id,
              toRoomId: endRoom.id,
              fromName: startRoom.name,
              toName: endRoom.name,
            })
          }
          className={`text-2xl active:scale-90 transition-transform ${fav ? 'text-neon' : 'text-white/30'}`}
          aria-label="В избранное"
        >
          ★
        </button>
      }
    >
      {/* Переключатель вида */}
      <div className="glass mb-4 flex p-1">
        {(['3d', '2d'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
              view === v ? 'bg-neon/15 text-neon shadow-neon' : 'text-white/50'
            }`}
          >
            {v === '3d' ? '3D-сцена' : '2D-карта'}
          </button>
        ))}
      </div>

      <GlassCard className="mb-4 p-3">
        <LocationFixBar compact />
      </GlassCard>

      {/* Вид */}
      {view === '3d' ? (
        <GlassCard className="overflow-hidden">
          <div className="h-[380px]">
            <ScenePreview />
          </div>
        </GlassCard>
      ) : (
        <div className="flex justify-center">
          <Minimap />
        </div>
      )}

      {/* Сводка маршрута */}
      <GlassCard delay={0.1} className="mt-4 flex items-center justify-around p-4 text-center">
        <Stat label="Дистанция" value={`${route.totalDistance.toFixed(0)} м`} />
        <Divider />
        <Stat label="Время" value={formatTime(route.estimatedSeconds)} />
        <Divider />
        <Stat
          label="Этажи"
          value={route.floorsVisited.join(' → ')}
        />
      </GlassCard>

      {/* Управление: крупная понятная кнопка показа пути */}
      <div className="mt-4 flex gap-3">
        <NeonButton
          full
          className="py-4 text-base"
          onClick={() => (sim.playing ? sim.pause() : sim.start())}
        >
          {sim.playing ? '⏸ Пауза' : '▶ Показать путь'}
        </NeonButton>
        <NeonButton variant="ghost" onClick={sim.reset} className="px-5">
          ⟲ Сначала
        </NeonButton>
      </div>

      {/* AR — вторичная опция для продвинутых, без давления на пользователя */}
      <button
        onClick={() => navigate('/ar')}
        className="mt-2 w-full text-center text-xs text-white/35 underline-offset-4 hover:text-white/60 hover:underline"
      >
        Включить камеру (AR-режим)
      </button>

      {/* Пошаговые инструкции */}
      <h3 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
        Шаги маршрута
      </h3>
      <div className="flex flex-col gap-2">
        {route.steps.map((step, i) => {
          const isActive = currentStep === step;
          return (
            <GlassCard
              key={i}
              delay={0.05 * i}
              className={`flex items-center gap-3 p-3.5 ${
                isActive ? 'border-neon/50 shadow-neon' : ''
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm font-bold text-neon">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${isActive ? 'font-semibold text-neon' : ''}`}>
                  {step.instruction}
                </p>
                <p className="text-xs text-white/40">
                  {step.cumulativeDistance.toFixed(0)} м от старта · этаж {step.floor}
                </p>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-lg font-bold text-neon">{value}</p>
      <p className="text-[11px] text-white/45">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-white/10" />;
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec} сек`;
  return `${Math.floor(sec / 60)} мин ${sec % 60} с`;
}
