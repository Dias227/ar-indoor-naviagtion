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
  ensureBuiltinBuildingData,
  persistBuilding,
  pullFromCloud,
  pushToCloud,
  type CloudSyncStatus,
} from '@/services/cloudSync';
import { StorageKeys, loadJSON, removeKey, saveJSON } from '@/services/storage';

/** Расстояние от маршрута (м), после которого запускается пересчёт. */
const REROUTE_THRESHOLD = 3.5;
const DEG2RAD = Math.PI / 180;

const persistedEdit = loadJSON<BuildingData | null>(
  StorageKeys.editedBuilding,
  null,
);
const initialBuildingData: BuildingData = ensureBuiltinBuildingData(
  persistedEdit ?? collegeBuildingData,
);

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

  /** Доп. поворот AR-маршрута после калибровки (рад). */
  calibrationHeadingOffset: number;
  /** Инкремент сбрасывает AR-калибровку в ARScene. */
  calibrationGeneration: number;

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
  /** Поставить старт = «Вход» (для простого сценария «зашёл и выбрал кабинет»). */
  setStartAtEntrance: () => boolean;
  computeRoute: (opts?: { preferElevator?: boolean }) => boolean;
  clearRoute: () => void;
  updateUserPosition: (pos: Vec3, heading?: number) => void;
  applyPositionFix: (fix: PositionFix) => void;
  /** Ручная привязка к помещению (2D-карта + пересчёт маршрута). */
  setPositionAtRoom: (roomId: string) => void;
  /** Поворот AR-маршрута влево/вправо (градусы). */
  adjustCalibrationHeading: (deltaDeg: number) => void;
  /** Сброс AR-калибровки (нужно снова тапнуть пол). */
  resetARCalibration: () => void;
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

  calibrationHeadingOffset: 0,
  calibrationGeneration: 0,

  cloudConfigured: cloudConfigured(),
  cloudSyncStatus: cloudConfigured() ? 'idle' : 'offline',
  cloudLastSyncedAt: null,

  loadBuildings: async () => {
    set({ cloudSyncStatus: 'syncing' });

    const applyBuiltin = (data: BuildingData) => ensureBuiltinBuildingData(data);

    // Принудительное обновление: если встроенные данные новее сохранённых,
    // стираем устаревший кэш/правки, чтобы показать актуальные кабинеты из GLB.
    const builtinVersion = collegeBuildingData.building.dataVersion ?? 0;
    const savedVersion = loadJSON<number>(StorageKeys.builtinDataVersion, 0);
    if (builtinVersion > savedVersion) {
      removeKey(StorageKeys.editedBuilding);
      removeKey(StorageKeys.buildingUpdatedAt);
      removeKey(StorageKeys.buildingCache);
      saveJSON(StorageKeys.builtinDataVersion, builtinVersion);
      set({
        buildings: [collegeBuildingData],
        buildingData: collegeBuildingData,
        graph: makeGraph(collegeBuildingData),
        cloudSyncStatus: cloudConfigured() ? 'idle' : 'offline',
      });
      if (cloudConfigured()) {
        void pushToCloud(collegeBuildingData);
      }
      return;
    }

    if (cloudConfigured()) {
      try {
        const pulled = await pullFromCloud();
        if (pulled) {
          const active = applyBuiltin(pulled.active);
          const buildings = pulled.buildings.map((b) => applyBuiltin(b));
          if (
            active.rooms.length !== pulled.active.rooms.length ||
            active.building.dataVersion !== pulled.active.building.dataVersion
          ) {
            saveJSON(StorageKeys.editedBuilding, active);
            saveJSON(StorageKeys.buildingCache, buildings);
            void pushToCloud(active);
          }
          set({
            buildings,
            buildingData: active,
            graph: makeGraph(active),
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
      const buildings = (await fetchBuildings()).map((b) => applyBuiltin(b));
      const edited = loadJSON<BuildingData | null>(
        StorageKeys.editedBuilding,
        null,
      );
      let merged = buildings;
      if (edited) {
        const normalized = applyBuiltin(edited);
        const has = buildings.some((b) => b.building.id === normalized.building.id);
        merged = has
          ? buildings.map((b) =>
              b.building.id === normalized.building.id ? normalized : b,
            )
          : [normalized, ...buildings];
      }
      const active =
        merged.find((b) => b.building.id === collegeBuildingData.building.id) ??
        merged[0] ??
        collegeBuildingData;
      set({
        buildings: merged,
        buildingData: active,
        graph: makeGraph(active),
        cloudSyncStatus: cloudConfigured() ? 'error' : 'offline',
      });
    } catch {
      const fallback = applyBuiltin(
        loadJSON<BuildingData | null>(StorageKeys.editedBuilding, null) ??
          collegeBuildingData,
      );
      set({
        buildings: [fallback],
        buildingData: fallback,
        graph: makeGraph(fallback),
        cloudSyncStatus: 'offline',
      });
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
        const active = ensureBuiltinBuildingData(pulled.active);
        const buildings = pulled.buildings.map((b) =>
          ensureBuiltinBuildingData(b),
        );
        if (active.rooms.length !== pulled.active.rooms.length) {
          void pushToCloud(active);
        }
        set({
          buildings,
          buildingData: active,
          graph: makeGraph(active),
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
    const resolved = ensureBuiltinBuildingData(data);
    set({
      buildingData: resolved,
      graph: makeGraph(resolved),
      route: null,
      startRoom: null,
      endRoom: null,
      arrived: false,
    });
  },

  setStartRoom: (room) => set({ startRoom: room, route: null, arrived: false }),
  setEndRoom: (room) => set({ endRoom: room, route: null, arrived: false }),

  setStartAtEntrance: () => {
    const { buildingData } = get();
    const entrance =
      buildingData.rooms.find((r) => r.category === 'entrance') ??
      buildingData.rooms.find((r) => /вход/i.test(r.name));
    if (!entrance) return false;
    set({ startRoom: entrance, route: null, arrived: false });
    return true;
  },

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
    const snapped = graph.snapToGraph(startNode.position, startNode.floor);
    const startPos = snapped ? snapped.position : { ...startNode.position };
    set({
      route,
      userPosition: startPos,
      userFloor: startNode.floor,
      lastFix: {
        nodeId: startNode.id,
        position: startPos,
        floor: startNode.floor,
        source: 'manual',
        timestamp: Date.now(),
      },
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
    const snapped = graph.snapToGraph(pos, userFloor);
    const aligned = snapped ? snapped.position : pos;
    const patch: Partial<NavigationState> = { userPosition: aligned };
    if (heading !== undefined) patch.userHeading = heading;

    if (route) {
      const prog = routeProgress(route, aligned);
      patch.progress = {
        fraction: prog.fraction,
        travelled: prog.travelled,
        remaining: prog.remaining,
      };
      patch.currentStep = nextStep(route, prog.travelled);

      const goal = route.points[route.points.length - 1];
      if (
        distance(aligned, goal) < 2 &&
        prog.fraction > 0.88 &&
        prog.remaining < 3
      ) {
        patch.arrived = true;
      }

      if (prog.offRouteDistance > REROUTE_THRESHOLD && endRoom) {
        const startNode = graph.nearestNode(aligned, userFloor);
        if (startNode) {
          const newRoute = buildRoute(graph, startNode.id, endRoom.nodeId);
          // Отсекаем «скачок» маршрута при ошибочной AR-позиции
          if (
            newRoute &&
            newRoute.totalDistance >= prog.remaining * 0.45
          ) {
            patch.route = newRoute;
            patch.progress = {
              fraction: 0,
              travelled: 0,
              remaining: newRoute.totalDistance,
            };
            patch.currentStep = newRoute.steps[0] ?? null;
            patch.arrived = false;
          }
        }
      }
    }
    set(patch);
  },

  applyPositionFix: (fix) => {
    const { buildingData, graph, endRoom } = get();
    const roomId = fix.nodeId.startsWith('room:')
      ? fix.nodeId.slice('room:'.length)
      : null;
    const roomNodeId = roomId
      ? buildingData.rooms.find((r) => r.id === roomId)?.nodeId
      : null;
    const node = graph.getNode(roomNodeId ?? fix.nodeId);
    const base = node ? { ...node.position } : fix.position;
    const snapped = graph.snapToGraph(base, node?.floor ?? fix.floor);
    const position = snapped ? snapped.position : base;
    const floor = node ? node.floor : fix.floor;

    const patch: Partial<NavigationState> = {
      lastFix: fix,
      userPosition: position,
      userFloor: floor,
      arrived: false,
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

  setPositionAtRoom: (roomId) => {
    const { buildingData, graph } = get();
    const room = buildingData.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const node = graph.getNode(room.nodeId);
    if (!node) return;
    get().applyPositionFix({
      nodeId: node.id,
      position: { ...node.position },
      floor: node.floor,
      source: 'manual',
      timestamp: Date.now(),
    });
  },

  adjustCalibrationHeading: (deltaDeg) => {
    set({
      calibrationHeadingOffset:
        get().calibrationHeadingOffset + DEG2RAD * deltaDeg,
    });
  },

  resetARCalibration: () => {
    set({
      calibrationGeneration: get().calibrationGeneration + 1,
      calibrationHeadingOffset: 0,
    });
  },
}));
