/**
 * Навигационный граф здания.
 *
 * Хранит узлы (Node/Waypoint) и рёбра (Edge), строит список смежности,
 * умеет искать ближайший узел к произвольной точке (для пересчёта
 * маршрута при движении пользователя и привязки QR-позиций).
 */
import type { NavEdge, NavNode, Vec3 } from '@/types';

export interface Neighbor {
  nodeId: string;
  edge: NavEdge;
}

export class NavigationGraph {
  private nodes = new Map<string, NavNode>();
  private adjacency = new Map<string, Neighbor[]>();
  private edges = new Map<string, NavEdge>();

  constructor(nodes: NavNode[] = [], edges: NavEdge[] = []) {
    nodes.forEach((n) => this.addNode(n));
    edges.forEach((e) => this.addEdge(e));
  }

  /** Все узлы графа. */
  getNodes(): NavNode[] {
    return [...this.nodes.values()];
  }

  /** Все рёбра графа. */
  getEdges(): NavEdge[] {
    return [...this.edges.values()];
  }

  getNode(id: string): NavNode | undefined {
    return this.nodes.get(id);
  }

  addNode(node: NavNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) this.adjacency.set(node.id, []);
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    this.adjacency.delete(id);
    for (const e of [...this.edges.values()]) {
      if (e.from === id || e.to === id) this.removeEdge(e.id);
    }
  }

  addEdge(e: NavEdge): void {
    if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) return;
    this.edges.set(e.id, e);
    this.adjacency.get(e.from)!.push({ nodeId: e.to, edge: e });
    if (e.bidirectional !== false) {
      this.adjacency.get(e.to)!.push({ nodeId: e.from, edge: e });
    }
  }

  removeEdge(id: string): void {
    const e = this.edges.get(id);
    if (!e) return;
    this.edges.delete(id);
    const prune = (from: string) => {
      const list = this.adjacency.get(from);
      if (list) {
        this.adjacency.set(from, list.filter((n) => n.edge.id !== id));
      }
    };
    prune(e.from);
    prune(e.to);
  }

  getNeighbors(id: string): Neighbor[] {
    return this.adjacency.get(id) ?? [];
  }

  /** Геометрическая длина ребра в метрах. */
  edgeLength(e: NavEdge): number {
    const a = this.nodes.get(e.from)!.position;
    const b = this.nodes.get(e.to)!.position;
    return distance(a, b);
  }

  /**
   * Ближайший узел к точке.
   * @param floor если задан — поиск только на этом этаже.
   * @param types если заданы — только узлы этих типов.
   */
  nearestNode(
    point: Vec3,
    floor?: number,
    types?: NavNode['type'][],
  ): NavNode | null {
    let best: NavNode | null = null;
    let bestDist = Infinity;
    for (const n of this.nodes.values()) {
      if (floor !== undefined && n.floor !== floor) continue;
      if (types && !types.includes(n.type)) continue;
      const d = distance(point, n.position);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  /**
   * Проекция точки на ближайшее ребро графа — точная привязка
   * позиции пользователя к коридорной сети.
   */
  snapToGraph(point: Vec3, floor?: number): { position: Vec3; edgeId: string } | null {
    let best: { position: Vec3; edgeId: string } | null = null;
    let bestDist = Infinity;
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.from)!;
      const b = this.nodes.get(e.to)!;
      if (floor !== undefined && a.floor !== floor && b.floor !== floor) continue;
      const p = projectOnSegment(point, a.position, b.position);
      const d = distance(point, p);
      if (d < bestDist) {
        bestDist = d;
        best = { position: p, edgeId: e.id };
      }
    }
    return best;
  }
}

/** Евклидово расстояние между точками. */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Проекция точки p на отрезок [a, b]. */
function projectOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
}
