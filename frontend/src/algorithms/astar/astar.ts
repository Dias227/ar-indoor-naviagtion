/**
 * Алгоритм A* для навигационного графа здания.
 *
 * Особенности:
 * - эвристика: евклидово расстояние + штраф за смену этажа,
 *   что сохраняет допустимость (admissible) и ускоряет поиск;
 * - настраиваемые штрафы за лестницы/лифты — позволяет строить
 *   альтернативные маршруты («предпочитать лифт» и т.п.);
 * - возвращает null, если путь не существует.
 */
import type { NavigationGraph } from '@/navigation/graph';
import { PriorityQueue } from './priorityQueue';

export interface AStarOptions {
  /** Множитель веса лестничных рёбер (default 1). */
  stairsPenalty?: number;
  /** Множитель веса лифтовых рёбер (default 1). */
  elevatorPenalty?: number;
  /** Узлы, исключённые из поиска (для альтернативных маршрутов). */
  blockedNodeIds?: Set<string>;
}

/** Штраф эвристики за каждый этаж разницы (м, заведомо нижняя оценка). */
const FLOOR_HEURISTIC_PENALTY = 3;

/**
 * Поиск кратчайшего пути между узлами графа.
 * @returns массив id узлов от start до goal или null.
 */
export function aStar(
  graph: NavigationGraph,
  startId: string,
  goalId: string,
  options: AStarOptions = {},
): string[] | null {
  const { stairsPenalty = 1, elevatorPenalty = 1, blockedNodeIds } = options;

  const start = graph.getNode(startId);
  const goal = graph.getNode(goalId);
  if (!start || !goal) return null;

  const heuristic = (id: string): number => {
    const n = graph.getNode(id)!;
    const dx = n.position.x - goal.position.x;
    const dy = n.position.y - goal.position.y;
    const dz = n.position.z - goal.position.z;
    const euclid = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return euclid + Math.abs(n.floor - goal.floor) * FLOOR_HEURISTIC_PENALTY;
  };

  const open = new PriorityQueue<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const closed = new Set<string>();

  open.push(startId, heuristic(startId));

  while (!open.isEmpty) {
    const current = open.pop()!;
    if (current === goalId) {
      // Восстановление пути
      const path: string[] = [current];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.unshift(cursor);
      }
      return path;
    }
    if (closed.has(current)) continue;
    closed.add(current);

    for (const { nodeId: neighbor, edge } of graph.getNeighbors(current)) {
      if (closed.has(neighbor)) continue;
      if (blockedNodeIds?.has(neighbor)) continue;

      let weight = edge.weight ?? graph.edgeLength(edge);
      if (edge.kind === 'stairs') weight *= stairsPenalty;
      if (edge.kind === 'elevator') weight *= elevatorPenalty;

      const tentative = (gScore.get(current) ?? Infinity) + weight;
      if (tentative < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentative);
        open.push(neighbor, tentative + heuristic(neighbor));
      }
    }
  }
  return null;
}

/**
 * Поиск альтернативного маршрута: исключает промежуточные узлы
 * основного пути и запускает A* повторно.
 */
export function alternativeRoute(
  graph: NavigationGraph,
  primaryPath: string[],
  options: AStarOptions = {},
): string[] | null {
  if (primaryPath.length < 3) return null;
  // Блокируем «середину» основного маршрута, сохраняя старт и финиш.
  const middle = primaryPath.slice(1, -1);
  const blocked = new Set(middle.slice(Math.floor(middle.length / 3), Math.ceil((middle.length * 2) / 3)));
  const alt = aStar(graph, primaryPath[0], primaryPath[primaryPath.length - 1], {
    ...options,
    blockedNodeIds: blocked,
  });
  if (!alt) return null;
  // Альтернатива валидна, только если действительно отличается.
  return alt.join('|') === primaryPath.join('|') ? null : alt;
}
