/**
 * Данные здания «Колледж» — автоматически из collehenavnewblender.glb.
 *
 * Граф: полоска «Плоскость» (коридор) + маркеры у дверей (сферы в Blender).
 * Перегенерация:
 *   python3 tools/extract_nav_from_glb.py frontend/public/models/collehenavnewblender.glb
 */
import type { BuildingData } from '@/types';
import raw from '../data/college-building.json';

const MODEL_BASE =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';

const extracted = raw as BuildingData;

/** Полные данные здания с учётом base URL Vite/GitHub Pages. */
export const collegeBuildingData: BuildingData = {
  ...extracted,
  building: {
    ...extracted.building,
    modelUrl: `${MODEL_BASE}models/collehenavnewblender.glb`,
  },
};
