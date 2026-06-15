/**
 * Ручная фиксация «где я сейчас» — вызывается по кнопке, не мешает навигации.
 */
import { useMemo, useState } from 'react';
import type { Room } from '@/types';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { useNavigationStore } from '@/store/useNavigationStore';

interface LocationFixBarProps {
  /** Маленькая кнопка-иконка (AR, карта). */
  compact?: boolean;
}

export function LocationFixBar({ compact = false }: LocationFixBarProps) {
  const [open, setOpen] = useState(false);
  const buildingData = useNavigationStore((s) => s.buildingData);
  const userFloor = useNavigationStore((s) => s.userFloor);
  const startRoom = useNavigationStore((s) => s.startRoom);
  const setPositionAtRoom = useNavigationStore((s) => s.setPositionAtRoom);

  const byFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const r of buildingData.rooms) {
      if (!map.has(r.floor)) map.set(r.floor, []);
      map.get(r.floor)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [buildingData.rooms]);

  const pick = (room: Room) => {
    setPositionAtRoom(room.id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md active:scale-95'
            : 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 active:bg-white/10'
        }
        aria-label="Указать, где вы сейчас"
      >
        📍 {compact ? 'Где я?' : 'Указать место на карте'}
      </button>

      {open && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
          <GlassCard strong className="flex max-h-[70vh] w-full max-w-md flex-col gap-3 overflow-hidden p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Где вы сейчас?</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-white/50 active:bg-white/10"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <p className="text-xs leading-relaxed text-white/50">
              Нужно только в начале маршрута или если позиция сбилась. Выберите
              ближайшее помещение.
            </p>
            {startRoom && (
              <NeonButton variant="ghost" full onClick={() => pick(startRoom)}>
                ↩ Старт маршрута: {startRoom.name}
              </NeonButton>
            )}
            <div className="flex-1 overflow-y-auto">
              {byFloor.map(([floor, rooms]) => (
                <div key={floor} className="mb-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
                    {floor} этаж {floor === userFloor ? '· вы здесь' : ''}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => pick(room)}
                        className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-left text-sm active:bg-neon/10"
                      >
                        <span>{room.icon ?? '📍'}</span>
                        <span className="truncate">{room.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </>
  );
}
