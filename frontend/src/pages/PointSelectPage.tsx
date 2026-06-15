/**
 * Универсальная страница выбора точки (Откуда / Куда).
 *
 * - Поиск по названию помещения;
 * - группировка по этажам;
 * - после выбора обеих точек строится маршрут (A*) и выполняется
 *   переход к AR-навигации.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Room } from '@/types';
import { PageShell } from '@/components/PageShell';
import { NeonButton } from '@/components/NeonButton';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useHistoryStore } from '@/store/useHistoryStore';

export function PointSelectPage({ mode }: { mode: 'start' | 'end' }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const buildingData = useNavigationStore((s) => s.buildingData);
  const startRoom = useNavigationStore((s) => s.startRoom);
  const endRoom = useNavigationStore((s) => s.endRoom);
  const setStartRoom = useNavigationStore((s) => s.setStartRoom);
  const setEndRoom = useNavigationStore((s) => s.setEndRoom);
  const computeRoute = useNavigationStore((s) => s.computeRoute);
  const addHistory = useHistoryStore((s) => s.addHistory);

  const isStart = mode === 'start';
  const selected = isStart ? startRoom : endRoom;
  const counterpart = isStart ? endRoom : startRoom;

  const rooms = useMemo(() => {
    const list = buildingData.rooms.filter((r) =>
      isStart ? r.isStart !== false : r.isDestination !== false,
    );
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.description?.toLowerCase().includes(q),
        )
      : list;
    // Группировка по этажам
    const byFloor = new Map<number, Room[]>();
    for (const r of filtered) {
      if (!byFloor.has(r.floor)) byFloor.set(r.floor, []);
      byFloor.get(r.floor)!.push(r);
    }
    return [...byFloor.entries()].sort((a, b) => a[0] - b[0]);
  }, [buildingData.rooms, query, isStart]);

  const handleSelect = (room: Room) => {
    if (isStart) {
      setStartRoom(room);
      navigate('/select-end');
    } else {
      setEndRoom(room);
      // Если старт уже выбран — строим маршрут и идём в AR
      const start = useNavigationStore.getState().startRoom;
      if (start) {
        const ok = useNavigationStore.getState().computeRoute();
        if (ok) {
          addHistory({
            buildingId: buildingData.building.id,
            fromRoomId: start.id,
            toRoomId: room.id,
            fromName: start.name,
            toName: room.name,
            distance: useNavigationStore.getState().route?.totalDistance ?? 0,
            startedAt: Date.now(),
            completed: false,
          });
          navigate('/ar');
        }
      } else {
        navigate('/select-start');
      }
    }
  };
  void computeRoute;

  return (
    <PageShell
      title={isStart ? 'Откуда идём?' : 'Куда идём?'}
      subtitle={
        counterpart
          ? `${isStart ? 'Назначение' : 'Старт'}: ${counterpart.name}`
          : buildingData.building.name
      }
    >
      {/* Поиск */}
      <div className="glass mb-5 flex items-center gap-2 px-4 py-3">
        <span className="text-white/40">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск кабинета или помещения…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-white/40">
            ✕
          </button>
        )}
      </div>

      {/* Списки по этажам */}
      {rooms.length === 0 && (
        <p className="py-10 text-center text-sm text-white/40">
          Ничего не найдено
        </p>
      )}
      {rooms.map(([floor, list], gi) => (
        <div key={floor} className="mb-5">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
            {floor} этаж
          </p>
          <div className="flex flex-col gap-2">
            {list.map((room, i) => {
              const isSelected = selected?.id === room.id;
              const isCounterpart = counterpart?.id === room.id;
              return (
                <motion.button
                  key={room.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: gi * 0.04 + i * 0.03 }}
                  disabled={isCounterpart}
                  onClick={() => handleSelect(room)}
                  className={`glass flex items-center gap-3 p-3.5 text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-neon/60 shadow-neon'
                      : 'hover:bg-white/10'
                  } ${isCounterpart ? 'opacity-35' : ''}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xl">
                    {room.icon ?? '📍'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{room.name}</span>
                    {room.description && (
                      <span className="block truncate text-xs text-white/45">
                        {room.description}
                      </span>
                    )}
                  </span>
                  {isSelected && <span className="text-neon">✓</span>}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Свап точек */}
      {startRoom && endRoom && (
        <NeonButton
          variant="ghost"
          full
          onClick={() => useNavigationStore.getState().swapPoints()}
        >
          ⇅ Поменять местами
        </NeonButton>
      )}
    </PageShell>
  );
}
