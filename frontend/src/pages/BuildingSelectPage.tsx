/**
 * Страница выбора здания. Поддерживает несколько зданий из backend
 * (офлайн — встроенное здание колледжа). Предзагружает GLB-модель.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { useNavigationStore } from '@/store/useNavigationStore';
import { preloadBuildingModel } from '@/three/BuildingModel';

export function BuildingSelectPage() {
  const navigate = useNavigate();
  const buildings = useNavigationStore((s) => s.buildings);
  const current = useNavigationStore((s) => s.buildingData);
  const loadBuildings = useNavigationStore((s) => s.loadBuildings);
  const setBuildingData = useNavigationStore((s) => s.setBuildingData);

  useEffect(() => {
    void loadBuildings();
  }, [loadBuildings]);

  return (
    <PageShell title="Выбор здания" subtitle="Доступные корпуса">
      <div className="flex flex-col gap-3">
        {buildings.map((b, i) => {
          const active = b.building.id === current.building.id;
          return (
            <GlassCard
              key={b.building.id}
              delay={i * 0.06}
              strong={active}
              className={`cursor-pointer p-5 ${active ? 'border-neon/50 shadow-neon' : ''}`}
              onClick={() => {
                setBuildingData(b);
                preloadBuildingModel(b.building.modelUrl);
                navigate('/select-start');
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">{b.building.name}</h2>
                  {b.building.address && (
                    <p className="mt-0.5 text-xs text-white/50">{b.building.address}</p>
                  )}
                </div>
                {active && (
                  <span className="rounded-full bg-neon/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neon">
                    Активно
                  </span>
                )}
              </div>
              {b.building.description && (
                <p className="mt-3 text-sm leading-relaxed text-white/60">
                  {b.building.description}
                </p>
              )}
              <div className="mt-4 flex gap-4 text-xs text-white/45">
                <span>🏬 {b.building.floors.length} этажа</span>
                <span>🚪 {b.rooms.length} помещений</span>
                <span>📍 {b.nodes.length} точек</span>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </PageShell>
  );
}
