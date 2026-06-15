/**
 * Главный Zustand-стор навигации.
 *
 * Управляет: выбором здания/точек, графом, активным маршрутом,
 * позицией пользователя, прогрессом, пересчётом маршрута и
 * фиксациями позиции от QR/маркеров.
 *
 * Данные здания: offline-first + облако Firebase Firestore (если настроено).
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
import {
  cloudConfigured,
  persistBuilding,
  pullFromCloud,
  pushToCloud,
  type CloudSyncStatus,
} from '@/services/cloudSync';
import { StorageKeys, loadJSON, removeKey, saveJSON } from '@/services/storage';

/** Расстояние от маршрута (м), после которого запускается пересчёт. */
const REROUTE_THRESHOLD = 3.5;

const persistedEdit = loadJSON<BuildingData | null>(
  StorageKeys.editedBuilding,
  null,
);
const initialBuildingData: BuildingData = persistedEdit ?? collegeBuildingData;

interface NavigationState {
  buildings: BuildingData[];
  buildingData: BuildingData;
  graph: NavigationGraph;

  startRoom: Room | null;
  endRoom: Room | null;

  route: RouteResult | null;
  alternativeAvailable: boolean;

  userPosition: Vec3 | null;
  userFloor: number;
  userHeading: number;
  progress: { fraction: number; travelled: number; remaining: number };
  currentStep: RouteStep | null;
  arrived: boolean;
  lastFix: PositionFix | null;

  cloudConfigured: boolean;
  cloudSyncStatus: CloudSyncStatus;
  cloudLastSyncedAt: number | null;

  loadBuildings: () => Promise<void>;
  syncFromCloud: () => Promise<boolean>;
  selectBuilding: (id: string) => Promise<void>;
  setBuildingData: (data: BuildingData) => void;
  saveBuildingEdits: (data: BuildingData) => void;
  resetBuildingEdits: () => void;
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
  buildings: [initialBuildingData],
  buildingData: initialBuildingData,
  graph: makeGraph(initialBuildingData),

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

  cloudConfigured: cloudConfigured(),
  cloudSyncStatus: cloudConfigured() ? 'idle' : 'offline',
  cloudLastSyncedAt: null,

  loadBuildings: async () => {
    set({ cloudSyncStatus: 'syncing' });

    if (cloudConfigured()) {
      try {
        const pulled = await pullFromCloud();
        if (pulled) {
          set({
            buildings: pulled.buildings,
            buildingData: pulled.active,
            graph: makeGraph(pulled.active),
            cloudSyncStatus: 'synced',
            cloudLastSyncedAt: pulled.updatedAt,
          });
          return;
        }
      } catch {
        /* облако недоступно — фолбэк ниже */
      }
    }

    try {
      const buildings = await fetchBuildings();
      const edited = loadJSON<BuildingData | null>(
        StorageKeys.editedBuilding,
        null,
      );
      let merged = buildings;
      if (edited) {
        const has = buildings.some((b) => b.building.id === edited.building.id);
        merged = has
          ? buildings.map((b) =>
              b.building.id === edited.building.id ? edited : b,
            )
          : [edited, ...buildings];
      }
      set({
        buildings: merged,
        cloudSyncStatus: cloudConfigured() ? 'error' : 'offline',
      });
    } catch {
      set({ cloudSyncStatus: 'offline' });
    }
  },

  syncFromCloud: async () => {
    if (!cloudConfigured()) {
      set({ cloudSyncStatus: 'offline' });
      return false;
    }
    set({ cloudSyncStatus: 'syncing' });
    try {
      const pulled = await pullFromCloud();
      if (pulled) {
        set({
          buildings: pulled.buildings,
          buildingData: pulled.active,
          graph: makeGraph(pulled.active),
          route: null,
          startRoom: null,
          endRoom: null,
          arrived: false,
          cloudSyncStatus: 'synced',
          cloudLastSyncedAt: pulled.updatedAt,
        });
        return true;
      }
      const ok = await pushToCloud(get().buildingData);
      set({
        cloudSyncStatus: ok ? 'synced' : 'error',
        cloudLastSyncedAt: ok ? Date.now() : get().cloudLastSyncedAt,
      });
      return ok;
    } catch {
      set({ cloudSyncStatus: 'error' });
      return false;
    }
  },

  selectBuilding: async (id) => {
    if (cloudConfigured()) {
      try {
        const pulled = await pullFromCloud();
        if (pulled) {
          const picked =
            pulled.buildings.find((b) => b.building.id === id) ?? pulled.active;
          get().setBuildingData(picked);
          return;
        }
      } catch {
        /* локальный фолбэк */
      }
    }

    const edited = loadJSON<BuildingData | null>(
      StorageKeys.editedBuilding,
      null,
    );
    if (edited && edited.building.id === id) {
      get().setBuildingData(edited);
      return;
    }
    const data = await fetchBuilding(id);
    get().setBuildingData(data);
  },

  saveBuildingEdits: (data) => {
    set((state) => ({
      buildingData: data,
      graph: makeGraph(data),
      buildings: state.buildings.some(
        (b) => b.building.id === data.building.id,
      )
        ? state.buildings.map((b) =>
            b.building.id === data.building.id ? data : b,
          )
        : [data, ...state.buildings],
    }));
    saveJSON(StorageKeys.editedBuilding, data);

    void persistBuilding(data).then(({ cloudOk, updatedAt }) => {
      set({
        cloudSyncStatus: cloudConfigured()
          ? cloudOk
            ? 'synced'
            : 'error'
          : 'offline',
        cloudLastSyncedAt: cloudOk ? updatedAt : get().cloudLastSyncedAt,
      });
    });
  },

  resetBuildingEdits: () => {
    removeKey(StorageKeys.editedBuilding);
    removeKey(StorageKeys.buildingUpdatedAt);
    set({
      buildingData: collegeBuildingData,
      graph: makeGraph(collegeBuildingData),
      buildings: [collegeBuildingData],
      route: null,
      startRoom: null,
      endRoom: null,
      arrived: false,
    });
    void persistBuilding(collegeBuildingData);
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

      const goal = route.points[route.points.length - 1];
      if (distance(pos, goal) < 1.5) {
        patch.arrived = true;
      }

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
