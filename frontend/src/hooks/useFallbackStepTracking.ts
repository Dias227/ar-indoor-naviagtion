/**
 * Оценка движения для fallback-AR без WebXR world tracking.
 *
 * iOS Safari не отдаёт позицию телефона в пространстве. Этот хук использует
 * devicemotion как простой шагомер и продвигает пользователя вдоль маршрута.
 * Ручная фиксация «Где я?» остаётся запасной коррекцией позиции.
 */
import { useEffect, useRef } from 'react';
import type { RouteResult, Vec3 } from '@/types';
import { distance } from '@/navigation/graph';
import { useNavigationStore } from '@/store/useNavigationStore';

const STEP_LENGTH_M = 0.72;
const STEP_THRESHOLD = 1.15;
const MIN_STEP_INTERVAL_MS = 320;
const MAX_STEP_INTERVAL_MS = 1400;

export function useFallbackStepTracking(enabled: boolean): void {
  const route = useNavigationStore((s) => s.route);
  const progress = useNavigationStore((s) => s.progress);
  const updateUserPosition = useNavigationStore((s) => s.updateUserPosition);

  const travelledRef = useRef(0);
  const gravityRef = useRef<number | null>(null);
  const wasAboveThresholdRef = useRef(false);
  const lastStepAtRef = useRef(0);

  useEffect(() => {
    travelledRef.current = progress.travelled;
  }, [progress.travelled, route]);

  useEffect(() => {
    if (!enabled || !route) return;

    const onMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc?.x || !acc.y || !acc.z) return;

      const magnitude = Math.hypot(acc.x, acc.y, acc.z);
      const gravity = gravityRef.current ?? magnitude;
      gravityRef.current = gravity * 0.92 + magnitude * 0.08;
      const impulse = Math.abs(magnitude - gravityRef.current);
      const now = performance.now();
      const sinceLastStep = now - lastStepAtRef.current;
      const aboveThreshold = impulse > STEP_THRESHOLD;

      if (
        aboveThreshold &&
        !wasAboveThresholdRef.current &&
        sinceLastStep > MIN_STEP_INTERVAL_MS
      ) {
        const multiplier =
          sinceLastStep > MAX_STEP_INTERVAL_MS && lastStepAtRef.current !== 0
            ? 0.85
            : 1;
        lastStepAtRef.current = now;
        travelledRef.current = Math.min(
          route.totalDistance,
          travelledRef.current + STEP_LENGTH_M * multiplier,
        );

        const sample = pointAtDistance(route, travelledRef.current);
        updateUserPosition(sample.position, sample.heading);
      }

      wasAboveThresholdRef.current = aboveThreshold;
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, route, updateUserPosition]);
}

function pointAtDistance(
  route: RouteResult,
  targetDistance: number,
): { position: Vec3; heading: number } {
  let travelled = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const segment = distance(a, b);
    if (travelled + segment >= targetDistance) {
      const t = segment === 0 ? 0 : (targetDistance - travelled) / segment;
      return {
        position: {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
        },
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    travelled += segment;
  }

  const last = route.points[route.points.length - 1];
  const prev = route.points[route.points.length - 2] ?? last;
  return {
    position: { ...last },
    heading: Math.atan2(last.x - prev.x, last.z - prev.z),
  };
}
