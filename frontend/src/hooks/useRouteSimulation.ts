/**
 * Симуляция движения пользователя по маршруту.
 *
 * Используется на странице миникарты («режим прогулки») и как
 * dead-reckoning-фолбэк, когда AR-трекинг недоступен. Позиция
 * интерполируется вдоль точек маршрута с пешеходной скоростью.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigationStore } from '@/store/useNavigationStore';
import { distance } from '@/navigation/graph';

const WALK_SPEED_MPS = 1.6;

export function useRouteSimulation(): {
  playing: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
} {
  const [playing, setPlaying] = useState(false);
  const travelledRef = useRef(0);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);

  const route = useNavigationStore((s) => s.route);
  const arrived = useNavigationStore((s) => s.arrived);
  const updateUserPosition = useNavigationStore((s) => s.updateUserPosition);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = 0;
  }, []);

  const tick = useCallback(
    (time: number) => {
      const r = useNavigationStore.getState().route;
      if (!r) return;
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      travelledRef.current += dt * WALK_SPEED_MPS;

      // Поиск точки на ломаной маршрута по пройденной дистанции.
      let acc = 0;
      let heading = 0;
      let pos = r.points[r.points.length - 1];
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        const seg = distance(a, b);
        if (acc + seg >= travelledRef.current) {
          const t = seg === 0 ? 0 : (travelledRef.current - acc) / seg;
          pos = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
          };
          heading = Math.atan2(b.x - a.x, b.z - a.z);
          break;
        }
        acc += seg;
      }
      updateUserPosition(pos, heading);

      if (travelledRef.current >= r.totalDistance) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [updateUserPosition],
  );

  const start = useCallback(() => {
    if (!route || arrived) return;
    setPlaying(true);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [route, arrived, tick]);

  const pause = useCallback(() => {
    setPlaying(false);
    stopLoop();
  }, [stopLoop]);

  const reset = useCallback(() => {
    setPlaying(false);
    stopLoop();
    travelledRef.current = 0;
    const r = useNavigationStore.getState().route;
    if (r) updateUserPosition({ ...r.points[0] });
  }, [stopLoop, updateUserPosition]);

  // Остановка цикла при размонтировании и сброс при смене маршрута.
  useEffect(() => stopLoop, [stopLoop]);
  useEffect(() => {
    travelledRef.current = 0;
  }, [route]);

  return { playing, start, pause, reset };
}
