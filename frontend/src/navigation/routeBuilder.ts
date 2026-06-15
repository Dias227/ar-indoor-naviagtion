/**
 * Построитель маршрута: путь A* → плотная кривая + пошаговые инструкции.
 *
 * - Сглаживание CatmullRom выполняется на уровне Three.js (RouteLine),
 *   здесь готовится «скелет» маршрута и метаданные.
 * - Детект поворотов: знак векторного произведения направлений
 *   соседних сегментов в горизонтальной плоскости.
 * - Смена этажа конвертируется в инструкции «Поднимитесь/Спуститесь».
 */
import type {
  ManeuverType,
  NavNode,
  RouteResult,
  RouteStep,
  Vec3,
} from '@/types';
import { NavigationGraph, distance } from './graph';
import { aStar, type AStarOptions } from '@/algorithms/astar';

const WALK_SPEED_MPS = 1.2;
/** Порог угла (градусы), после которого фиксируем поворот. */
const TURN_THRESHOLD = 35;
const SLIGHT_TURN_THRESHOLD = 18;

/** Построить полный маршрут между двумя узлами графа. */
export function buildRoute(
  graph: NavigationGraph,
  startNodeId: string,
  endNodeId: string,
  options: AStarOptions = {},
): RouteResult | null {
  const nodeIds = aStar(graph, startNodeId, endNodeId, options);
  if (!nodeIds || nodeIds.length < 2) return null;

  const nodes = nodeIds.map((id) => graph.getNode(id)!);
  const points = nodes.map((n) => ({ ...n.position }));
  const pointFloors = nodes.map((n) => n.floor);

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += distance(points[i - 1], points[i]);
  }

  const steps = buildSteps(nodes);
  const floorsVisited = [...new Set(nodes.map((n) => n.floor))];

  return {
    nodeIds,
    points,
    pointFloors,
    totalDistance,
    estimatedSeconds: Math.round(totalDistance / WALK_SPEED_MPS),
    steps,
    floorsVisited,
  };
}

/** Сформировать пошаговые инструкции по последовательности узлов. */
function buildSteps(nodes: NavNode[]): RouteStep[] {
  const steps: RouteStep[] = [];
  let cumulative = 0;

  steps.push({
    maneuver: 'start',
    instruction: 'Идите прямо',
    distance: 0,
    cumulativeDistance: 0,
    position: nodes[0].position,
    floor: nodes[0].floor,
  });

  for (let i = 1; i < nodes.length - 1; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    const next = nodes[i + 1];
    const segment = distance(prev.position, curr.position);
    cumulative += segment;

    // Смена этажа: лестница или лифт
    if (curr.floor !== next.floor) {
      const goingUp = next.floor > curr.floor;
      const isElevator = curr.type === 'elevator' || next.type === 'elevator';
      const maneuver: ManeuverType = isElevator
        ? goingUp
          ? 'elevator-up'
          : 'elevator-down'
        : goingUp
          ? 'stairs-up'
          : 'stairs-down';
      const target = floorName(next.floor);
      steps.push({
        maneuver,
        instruction: isElevator
          ? `На лифте ${goingUp ? 'поднимитесь' : 'спуститесь'} на ${target}`
          : `${goingUp ? 'Поднимитесь' : 'Спуститесь'} по лестнице на ${target}`,
        distance: segment,
        cumulativeDistance: cumulative,
        position: curr.position,
        floor: curr.floor,
      });
      continue;
    }
    if (curr.floor !== prev.floor) continue; // выход с лестницы — без инструкции

    const turn = detectTurn(prev.position, curr.position, next.position);
    if (turn) {
      const dist = Math.round(distance(prev.position, curr.position));
      const direction = turn.includes('left') ? 'налево' : 'направо';
      const prefix = dist >= 8 ? `Через ${dist} метров ` : '';
      const verb = turn.startsWith('slight') ? 'плавно поверните' : 'поверните';
      steps.push({
        maneuver: turn,
        instruction: `${prefix}${prefix ? verb : capitalize(verb)} ${direction}`,
        distance: segment,
        cumulativeDistance: cumulative,
        position: curr.position,
        floor: curr.floor,
      });
    }
  }

  const last = nodes[nodes.length - 1];
  cumulative += distance(nodes[nodes.length - 2].position, last.position);
  steps.push({
    maneuver: 'arrive',
    instruction: 'Вы прибыли в пункт назначения',
    distance: 0,
    cumulativeDistance: cumulative,
    position: last.position,
    floor: last.floor,
  });

  return steps;
}

/** Определение поворота по трём точкам (в плоскости XZ). */
function detectTurn(a: Vec3, b: Vec3, c: Vec3): ManeuverType | null {
  const v1 = { x: b.x - a.x, z: b.z - a.z };
  const v2 = { x: c.x - b.x, z: c.z - b.z };
  const len1 = Math.hypot(v1.x, v1.z);
  const len2 = Math.hypot(v2.x, v2.z);
  if (len1 < 0.3 || len2 < 0.3) return null;

  const dot = (v1.x * v2.x + v1.z * v2.z) / (len1 * len2);
  const cross = v1.x * v2.z - v1.z * v2.x;
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;

  if (angle < SLIGHT_TURN_THRESHOLD) return null;
  // В системе Three.js (y вверх, смотрим сверху): cross > 0 — поворот направо.
  if (angle < TURN_THRESHOLD) return cross > 0 ? 'slight-right' : 'slight-left';
  return cross > 0 ? 'turn-right' : 'turn-left';
}

function floorName(level: number): string {
  const names: Record<number, string> = {
    1: 'первый этаж',
    2: 'второй этаж',
    3: 'третий этаж',
    4: 'четвёртый этаж',
  };
  return names[level] ?? `этаж ${level}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Прогресс прохождения маршрута для позиции пользователя.
 * Возвращает долю [0..1], пройденные метры и индекс ближайшей точки.
 */
export function routeProgress(
  route: RouteResult,
  userPosition: Vec3,
): { fraction: number; travelled: number; remaining: number; nearestIndex: number } {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.points.length; i++) {
    const d = distance(route.points[i], userPosition);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  let travelled = 0;
  for (let i = 1; i <= bestIdx; i++) {
    travelled += distance(route.points[i - 1], route.points[i]);
  }
  const fraction = route.totalDistance === 0 ? 0 : travelled / route.totalDistance;
  return {
    fraction: Math.max(0, Math.min(1, fraction)),
    travelled,
    remaining: Math.max(0, route.totalDistance - travelled),
    nearestIndex: bestIdx,
  };
}

/** Текущая/следующая инструкция для позиции пользователя. */
export function nextStep(route: RouteResult, travelled: number): RouteStep | null {
  const nearDest = travelled >= route.totalDistance - 2.5;
  for (const step of route.steps) {
    if (step.maneuver === 'arrive') {
      if (nearDest) return step;
      continue;
    }
    if (step.cumulativeDistance > travelled + 0.5) return step;
  }
  const fallback = route.steps.find((s) => s.maneuver !== 'arrive');
  return fallback ?? route.steps[0] ?? null;
}
