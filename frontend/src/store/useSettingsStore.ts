/**
 * Zustand-стор настроек приложения с персистентностью в localStorage.
 */
import { create } from 'zustand';
import type { AppSettings } from '@/types';
import { StorageKeys, loadJSON, saveJSON } from '@/services/storage';

const DEFAULT_SETTINGS: AppSettings = {
  voiceEnabled: true,
  voiceRate: 1.0,
  voiceVolume: 1.0,
  language: 'ru',
  showMinimap: true,
  showParticles: true,
  bloomIntensity: 1.4,
  routeColor: '#00e5ff',
  highQuality: true,
};

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadJSON<AppSettings>(StorageKeys.settings, DEFAULT_SETTINGS),

  update: (patch) => {
    set(patch);
    const { update: _u, reset: _r, ...settings } = get();
    saveJSON(StorageKeys.settings, settings);
  },

  reset: () => {
    set(DEFAULT_SETTINGS);
    saveJSON(StorageKeys.settings, DEFAULT_SETTINGS);
  },
}));
