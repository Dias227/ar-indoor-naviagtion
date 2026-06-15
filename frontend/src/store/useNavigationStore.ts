/**
 * Главный Zustand-стор навигации.
 *
 * Управляет: выбором здания/точек, графом, активным маршрутом,
 * позицией пользователя, прогрессом, пересчётом маршрута и
 * фиксациями позиции от QR/маркеров.
 */
import { create } from 'zustand';
import type {
  BuildingData,
  PositionFix,
  Room,
  RouteResult,
  RouteStep,
  Vec3,
} from '@/types';
import { NavigationGraph, distance } from '@/navigation/graph';
import {
  buildRoute,
  nextStep,
  routeProgress,
} from '@/navigation/routeBuilder';
import { collegeBuildingData } from '@/navigation/collegeBuilding';
import { fetchBuilding, fetchBuildings } from '@/services/api';

/** Расстояние от маршрута (м), после которого запускается пересчёт. */
const REROUTE_THRESHOLD = 3.5;

interface NavigationState {
  // Данные
  buildings: BuildingData[];
  buildingData: BuildingData;
  graph: NavigationGraph;

  // Выбор пользователя
  startRoom: Room | null;
  endRoom: Room | null;

  // Маршрут
  route: RouteResult | null;
  alternativeAvailable: boolean;

  // Позиция и прогресс
  userPosition: Vec3 | null;
  userFloor: number;
  userHeading: number;
  progress: { fraction: number; travelled: number; remaining: number };
  currentStep: RouteStep | null;
  arrived: boolean;
  lastFix: PositionFix | null;

  // Действия
  loadBuildings: () => Promise<void>;
  selectBuilding: (id: string) => Promise<void>;
  setBuildingData: (data: BuildingData) => void;
  setStartRoom: (room: Room | null) => void;
  setEndRoom: (room: Room | null) => void;
  computeRoute: (opts?: { preferElevator?: boolean }) => boolean;
  clearRoute: () => void;
  updateUserPosition: (pos: Vec3, heading?: number) => void;
  applyPositionFix: (fix: PositionFix) => void;
  swapPoints: () => void;
}

function makeGraph(data: BuildingData): NavigationGraph {
  return new NavigationGraph(data.nodes, data.edges);
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  buildings: [collegeBuildingData],
  buildingData: collegeBuildingData,
  graph: makeGraph(collegeBuildingData),

  startRoom: null,
  endRoom: null,
  route: null,
  alternativeAvailable: false,

  userPosition: null,
  userFloor: 1,
  userHeading: 0,
  progress: { fraction: 0, travelled: 0, remaining: 0 },
  currentStep: null,
  arrived: false,
  lastFix: null,

  loadBuildings: async () => {
    const buildings = await fetchBuildings();
    set({ buildings });
  },

  selectBuilding: async (id) => {
    const data = await fetchBuilding(id);
    get().setBuildingData(data);
  },

  setBuildingData: (data) => {
    set({
      buildingData: data,
      graph: makeGraph(data),
      route: null,
      startRoom: null,
      endRoom: null,
      arrived: false,
    });
  },

  setStartRoom: (room) => set({ startRoom: room, route: null, arrived: false }),
  setEndRoom: (room) => set({ endRoom: room, route: null, arrived: false }),

  swapPoints: () => {
    const { startRoom, endRoom } = get();
    set({ startRoom: endRoom, endRoom: startRoom, route: null });
  },

  computeRoute: (opts) => {
    const { graph, startRoom, endRoom } = get();
    if (!startRoom || !endRoom) return false;
    const route = buildRoute(graph, startRoom.nodeId, endRoom.nodeId, {
      stairsPenalty: opts?.preferElevator ? 2.5 : 1,
      elevatorPenalty: opts?.preferElevator ? 0.6 : 1.4,
    });
    if (!route) return false;

    const startNode = graph.getNode(startRoom.nodeId)!;
    set({
      route,
      userPosition: { ...startNode.position },
      userFloor: startNode.floor,
      progress: { fraction: 0, travelled: 0, remaining: route.totalDistance },
      currentStep: route.steps[0] ?? null,
      arrived: false,
    });
    return true;
  },

  clearRoute: () =>
    set({
      route: null,
      arrived: false,
      progress: { fraction: 0, travelled: 0, remaining: 0 },
      currentStep: null,
    }),

  /**
   * Обновление позиции пользователя (из AR-трекинга или симуляции).
   * Автоматически: прогресс, текущая инструкция, пересчёт при сходе с маршрута.
   */
  updateUserPosition: (pos, heading) => {
    const { route, graph, endRoom, userFloor } = get();
    const patch: Partial<NavigationState> = { userPosition: pos };
    if (heading !== undefined) patch.userHeading = heading;

    if (route) {
      const prog = routeProgress(route, pos);
      patch.progress = {
        fraction: prog.fraction,
        travelled: prog.travelled,
        remaining: prog.remaining,
      };
      patch.currentStep = nextStep(route, prog.travelled);

      // Прибытие: ближе 1.5 м к финальной точке
      const goal = route.points[route.points.length - 1];
      if (distance(pos, goal) < 1.5) {
        patch.arrived = true;
      }

      // Пересчёт при значительном отклонении от маршрута
      const nearest = route.points[prog.nearestIndex];
      if (distance(pos, nearest) > REROUTE_THRESHOLD && endRoom) {
        const startNode = graph.nearestNode(pos, userFloor);
        if (startNode) {
          const newRoute = buildRoute(graph, startNode.id, endRoom.nodeId);
          if (newRoute) {
            patch.route = newRoute;
            patch.progress = {
              fraction: 0,
              travelled: 0,
              remaining: newRoute.totalDistance,
            };
            patch.currentStep = newRoute.steps[0] ?? null;
          }
        }
      }
    }
    set(patch);
  },

  /**
   * Жёсткая фиксация позиции по QR-коду или визуальному маркеру.
   * Перепривязывает пользователя к узлу графа и пересчитывает маршрут.
   */
  applyPositionFix: (fix) => {
    const { graph, endRoom } = get();
    const node = graph.getNode(fix.nodeId);
    const position = node ? { ...node.position } : fix.position;
    const floor = node ? node.floor : fix.floor;

    const patch: Partial<NavigationState> = {
      lastFix: fix,
      userPosition: position,
      userFloor: floor,
    };

    if (endRoom) {
      const from = node ?? graph.nearestNode(position, floor);
      if (from) {
        const newRoute = buildRoute(graph, from.id, endRoom.nodeId);
        if (newRoute) {
          patch.route = newRoute;
          patch.progress = {
            fraction: 0,
            travelled: 0,
            remaining: newRoute.totalDistance,
          };
          patch.currentStep = newRoute.steps[0] ?? null;
        }
      }
    }
    set(patch);
  },
}));
