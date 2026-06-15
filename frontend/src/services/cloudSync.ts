/**
 * Слой облачной синхронизации (offline-first).
 *
 * При загрузке: облако ↔ localStorage — побеждает более свежая версия.
 * При сохранении: сразу localStorage, затем фоновая отправка в Firestore.
 */
import type { BuildingData } from '@/types';
import { collegeBuildingData } from '@/navigation/collegeBuilding';
import {
  fetchAllBuildingsFromCloud,
  fetchBuildingFromCloud,
  isFirebaseConfigured,
  saveBuildingToCloud,
  type CloudBuildingRecord,
} from './firebase';
import { StorageKeys, loadJSON, saveJSON } from './storage';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export function cloudConfigured(): boolean {
  return isFirebaseConfigured();
}

function localUpdatedAt(): number {
  return loadJSON<number>(StorageKeys.buildingUpdatedAt, 0);
}

function setLocalUpdatedAt(ts: number): void {
  saveJSON(StorageKeys.buildingUpdatedAt, ts);
}

/** Выбрать более свежую версию здания. */
export function pickNewerBuilding(
  local: BuildingData | null,
  localTs: number,
  cloud: CloudBuildingRecord | null,
): { data: BuildingData; updatedAt: number; source: 'local' | 'cloud' | 'default' } {
  if (!cloud && !local) {
    return { data: collegeBuildingData, updatedAt: 0, source: 'default' };
  }
  if (!cloud && local) {
    return { data: local, updatedAt: localTs, source: 'local' };
  }
  if (cloud && !local) {
    return { data: cloud.data, updatedAt: cloud.updatedAt, source: 'cloud' };
  }
  if (cloud!.updatedAt >= localTs) {
    return { data: cloud!.data, updatedAt: cloud!.updatedAt, source: 'cloud' };
  }
  return { data: local!, updatedAt: localTs, source: 'local' };
}

/** Сохранить локально + отправить в облако (если настроено). */
export async function persistBuilding(
  data: BuildingData,
  updatedAt = Date.now(),
): Promise<{ cloudOk: boolean; updatedAt: number }> {
  saveJSON(StorageKeys.editedBuilding, data);
  setLocalUpdatedAt(updatedAt);

  const cache = loadJSON<BuildingData[] | null>(StorageKeys.buildingCache, null) ?? [];
  const nextCache = cache.some((b) => b.building.id === data.building.id)
    ? cache.map((b) => (b.building.id === data.building.id ? data : b))
    : [data, ...cache];
  saveJSON(StorageKeys.buildingCache, nextCache);

  if (!isFirebaseConfigured()) {
    return { cloudOk: false, updatedAt };
  }
  try {
    await saveBuildingToCloud(data, updatedAt);
    return { cloudOk: true, updatedAt };
  } catch {
    return { cloudOk: false, updatedAt };
  }
}

/** Подтянуть данные из облака и слить с локальными. */
export async function pullFromCloud(): Promise<{
  buildings: BuildingData[];
  active: BuildingData;
  updatedAt: number;
  source: 'local' | 'cloud' | 'default';
} | null> {
  if (!isFirebaseConfigured()) return null;

  const local = loadJSON<BuildingData | null>(StorageKeys.editedBuilding, null);
  const localTs = localUpdatedAt();
  const cloudList = await fetchAllBuildingsFromCloud();

  if (cloudList.length === 0) {
    if (local) {
      return {
        buildings: [local],
        active: local,
        updatedAt: localTs,
        source: 'local',
      };
    }
    return null;
  }

  const merged: BuildingData[] = cloudList.map((c) => {
    if (local && local.building.id === c.data.building.id) {
      return pickNewerBuilding(local, localTs, c).data;
    }
    return c.data;
  });

  // Локальное здание, которого нет в облаке
  if (local && !merged.some((b) => b.building.id === local.building.id)) {
    merged.unshift(local);
  }

  const activeId =
    local?.building.id ?? merged[0]?.building.id ?? collegeBuildingData.building.id;
  const active =
    merged.find((b) => b.building.id === activeId) ?? merged[0] ?? collegeBuildingData;

  const cloudRec = await fetchBuildingFromCloud(active.building.id);
  const picked = pickNewerBuilding(
    local?.building.id === active.building.id ? local : null,
    localTs,
    cloudRec,
  );

  saveJSON(StorageKeys.editedBuilding, picked.data);
  setLocalUpdatedAt(picked.updatedAt);
  saveJSON(StorageKeys.buildingCache, merged);

  return {
    buildings: merged.map((b) =>
      b.building.id === picked.data.building.id ? picked.data : b,
    ),
    active: picked.data,
    updatedAt: picked.updatedAt,
    source: picked.source,
  };
}

/** Принудительно отправить текущие локальные данные в облако. */
export async function pushToCloud(data: BuildingData): Promise<boolean> {
  const updatedAt = Date.now();
  const result = await persistBuilding(data, updatedAt);
  return result.cloudOk;
}
