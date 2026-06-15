/**
 * Экспорт встроенных данных здания в backend/data/seed.json.
 * Запуск: npx tsx scripts/exportSeed.mts
 * Гарантирует, что frontend и backend используют одинаковые seed-данные.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collegeBuildingData } from '../src/navigation/collegeBuilding';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../backend/data/seed.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify([collegeBuildingData], null, 2), 'utf-8');
console.log('Seed written:', out);
