/**
 * Клиент REST API (FastAPI backend).
 *
 * Стратегия offline-first:
 * 1) запрос к backend с таймаутом;
 * 2) при недоступности — данные из localStorage-кэша;
 * 3) при пустом кэше — встроенные данные здания (collegeBuildingData).
 *
 * Благодаря этому приложение полностью работает без сервера (PWA-офлайн).
 */
import type {
  BuildingData,
  HistoryEntry,
  NavEdge,
  NavNode,
  Room,
} from '@/types';
import { collegeBuildingData } from '@/navigation/collegeBuilding';
import { StorageKeys, loadJSON, saveJSON } from './storage';

const BASE = '/api';
const TIMEOUT_MS = 4000;

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Список зданий (с офлайн-фолбэком). */
export async function fetchBuildings(): Promise<BuildingData[]> {
  try {
    const data = await request<BuildingData[]>('/buildings');
    saveJSON(StorageKeys.buildingCache, data);
    return data;
  } catch {
    const cached = loadJSON<BuildingData[] | null>(StorageKeys.buildingCache, null);
    return cached && cached.length > 0 ? cached : [collegeBuildingData];
  }
}

/** Данные конкретного здания. */
export async function fetchBuilding(id: string): Promise<BuildingData> {
  try {
    return await request<BuildingData>(`/buildings/${id}`);
  } catch {
    const cached = loadJSON<BuildingData[] | null>(StorageKeys.buildingCache, null);
    const found = cached?.find((b) => b.building.id === id);
    return found ?? collegeBuildingData;
  }
}

/** Сохранение записи истории (fire-and-forget при офлайне). */
export async function pushHistory(entry: HistoryEntry): Promise<void> {
  try {
    await request('/history', { method: 'POST', body: JSON.stringify(entry) });
  } catch {
    /* офлайн — история уже сохранена локально */
  }
}

// ── Админ-операции ────────────────────────────────────────────────────────

export async function adminSaveRoom(buildingId: string, room: Room): Promise<void> {
  await request(`/admin/buildings/${buildingId}/rooms`, {
    method: 'PUT',
    body: JSON.stringify(room),
  });
}

export async function adminDeleteRoom(buildingId: string, roomId: string): Promise<void> {
  await request(`/admin/buildings/${buildingId}/rooms/${roomId}`, { method: 'DELETE' });
}

export async function adminSaveNode(buildingId: string, node: NavNode): Promise<void> {
  await request(`/admin/buildings/${buildingId}/nodes`, {
    method: 'PUT',
    body: JSON.stringify(node),
  });
}

export async function adminDeleteNode(buildingId: string, nodeId: string): Promise<void> {
  await request(`/admin/buildings/${buildingId}/nodes/${nodeId}`, { method: 'DELETE' });
}

export async function adminSaveEdge(buildingId: string, edge: NavEdge): Promise<void> {
  await request(`/admin/buildings/${buildingId}/edges`, {
    method: 'PUT',
    body: JSON.stringify(edge),
  });
}

export async function adminDeleteEdge(buildingId: string, edgeId: string): Promise<void> {
  await request(`/admin/buildings/${buildingId}/edges/${edgeId}`, { method: 'DELETE' });
}

export async function adminSaveBuilding(data: BuildingData): Promise<void> {
  await request(`/admin/buildings/${data.building.id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Загрузка GLB-модели здания (multipart). */
export async function adminUploadModel(
  buildingId: string,
  file: File,
): Promise<{ modelUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${BASE}/admin/buildings/${buildingId}/model`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return (await res.json()) as { modelUrl: string };
  } finally {
    clearTimeout(timer);
  }
}

/** Проверка доступности backend. */
export async function pingBackend(): Promise<boolean> {
  try {
    await request('/health');
    return true;
  } catch {
    return false;
  }
}
