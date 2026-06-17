/**
 * Типобезопасная обёртка над localStorage для офлайн-режима.
 * Все ключи приложения собраны в одном месте.
 */

const PREFIX = 'arnav:';

export const StorageKeys = {
  settings: `${PREFIX}settings`,
  history: `${PREFIX}history`,
  favorites: `${PREFIX}favorites`,
  buildingCache: `${PREFIX}building-cache`,
  lastBuilding: `${PREFIX}last-building`,
  /** Правки данных здания из админки (офлайн-персистентность без backend). */
  editedBuilding: `${PREFIX}edited-building`,
  /** Метка времени последнего сохранения карты (для слияния с облаком). */
  buildingUpdatedAt: `${PREFIX}building-updated-at`,
  /** Версия встроенных данных здания — для принудительного обновления кэша. */
  builtinDataVersion: `${PREFIX}builtin-data-version`,
} as const;

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Квота исчерпана или приватный режим — офлайн-кэш недоступен.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
