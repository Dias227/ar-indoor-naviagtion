/**
 * Ручная фиксация «где я сейчас» — аналог visual positioning без SLAM.
 *
 * Пользователь выбирает ближайшее помещение/точку (например «Вход»),
 * приложение ставит его на узел графа и пересчитывает маршрут.
 * Это решает главную проблему: телефон не знает позицию в здании.
 */
import { useMemo, useState } from 'react';
import type { Room } from '@/types';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { useNavigationStore } from '@/store/useNavigationStore';

interface LocationFixBarProps {
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

  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-neon/40 bg-black/70 px-4 py-2 text-xs font-semibold text-neon backdrop-blur-md active:scale-95"
      >
        📍 Где я?
      </button>
    );
  }

  return (
    <div className={compact ? 'pointer-events-auto' : ''}>
      {!open ? (
        <NeonButton
          full={!compact}
          variant={compact ? 'ghost' : 'neon'}
          onClick={() => setOpen(true)}
        >
          📍 Я здесь — указать место вручную
        </NeonButton>
      ) : (
        <GlassCard strong className="flex max-h-[50vh] flex-col gap-3 overflow-hidden p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Где вы сейчас?</p>
            <button onClick={() => setOpen(false)} className="text-white/50">
              ✕
            </button>
          </div>
          <p className="text-xs leading-relaxed text-white/50">
            Выберите помещение, рядом с которым вы стоите. Карта и маршрут
            обновятся сразу — без AR и GPS.
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
      )}
    </div>
  );
}
