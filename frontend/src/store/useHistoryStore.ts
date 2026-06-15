/**
 * Zustand-стор истории маршрутов и избранного.
 * Хранится локально (офлайн) и асинхронно синхронизируется с backend.
 */
import { create } from 'zustand';
import type { FavoriteRoute, HistoryEntry } from '@/types';
import { StorageKeys, loadJSON, saveJSON } from '@/services/storage';
import { pushHistory } from '@/services/api';

interface HistoryState {
  history: HistoryEntry[];
  favorites: FavoriteRoute[];
  addHistory: (entry: Omit<HistoryEntry, 'id'>) => void;
  markCompleted: (id: string) => void;
  clearHistory: () => void;
  addFavorite: (fav: Omit<FavoriteRoute, 'id' | 'createdAt'>) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (fromRoomId: string, toRoomId: string) => boolean;
}

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  history: loadJSON<HistoryEntry[]>(StorageKeys.history, []),
  favorites: loadJSON<FavoriteRoute[]>(StorageKeys.favorites, []),

  addHistory: (entry) => {
    const full: HistoryEntry = { ...entry, id: genId() };
    const history = [full, ...get().history].slice(0, 100);
    set({ history });
    saveJSON(StorageKeys.history, history);
    void pushHistory(full);
  },

  markCompleted: (id) => {
    const history = get().history.map((h) =>
      h.id === id ? { ...h, completed: true } : h,
    );
    set({ history });
    saveJSON(StorageKeys.history, history);
  },

  clearHistory: () => {
    set({ history: [] });
    saveJSON(StorageKeys.history, []);
  },

  addFavorite: (fav) => {
    const full: FavoriteRoute = { ...fav, id: genId(), createdAt: Date.now() };
    const favorites = [full, ...get().favorites];
    set({ favorites });
    saveJSON(StorageKeys.favorites, favorites);
  },

  removeFavorite: (id) => {
    const favorites = get().favorites.filter((f) => f.id !== id);
    set({ favorites });
    saveJSON(StorageKeys.favorites, favorites);
  },

  isFavorite: (fromRoomId, toRoomId) =>
    get().favorites.some(
      (f) => f.fromRoomId === fromRoomId && f.toRoomId === toRoomId,
    ),
}));
