/**
 * Данные здания «Колледж», извлечённые из анализа модели SampleScene.glb.
 *
 * Координаты узлов получены из реальной структуры GLB:
 * - секция «начало колледжа» — входная зона (z ≈ -22…27);
 * - «2 этажга апартын лестница» — лестничный блок (x ≈ -2, z ≈ -27…-33);
 * - «Гардероб, Акт зал» — актовый зал (z ≈ 19…26);
 * - «длинный коридор асхана бухгалтерия» — главный коридор (x ≈ -19, z ≈ 17…91);
 * - «2 асхана, продолжение длинного коридора» — z ≈ 96…135;
 * - секция «s» — столовая в конце коридора (z ≈ 140+);
 * - Real_Points_Storage (Cab102_B/C, Hall_B/C) и Cabinets (105, 110) —
 *   реперные точки, использованные для калибровки координат кабинетов.
 *
 * Этажи: пол 1-го этажа на y = -2.0, шаг этажа ≈ 3.4 м.
 */
import type { BuildingData, NavEdge, NavNode, Room } from '@/types';

/**
 * Базовый путь приложения. На GitHub Pages статика публикуется по подпути
 * (/<repo>/), поэтому URL модели должен его учитывать. Вне Vite (например,
 * при экспорте seed через tsx) import.meta.env отсутствует — используем '/'.
 */
const MODEL_BASE =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';

const F1 = -2.0;
const F2 = 1.6;
const F3 = 5.2;
const F4 = 8.4;

const node = (
  id: string,
  x: number,
  y: number,
  z: number,
  floor: number,
  type: NavNode['type'] = 'waypoint',
  name?: string,
  roomId?: string,
): NavNode => ({ id, position: { x, y, z }, floor, type, name, roomId });

/** Узлы графа: коридорный «хребет» снят с floor-меток модели. */
const nodes: NavNode[] = [
  // ── Этаж 1: входная зона и холл ─────────────────────────────────────────
  node('n-entrance', 1.4, F1, 11.5, 1, 'entrance', 'Главный вход', 'r-entrance'),
  node('n-hall', 0.6, F1, 17.5, 1, 'waypoint', 'Холл'),
  node('n-reception', 0.0, F1, 20.5, 1, 'room', 'Ресепшен', 'r-reception'),
  node('n-assembly', 2.3, F1, 26.2, 1, 'room', 'Актовый зал', 'r-assembly'),
  node('n-cloakroom', -1.5, F1, 24.0, 1, 'room', 'Гардероб', 'r-cloakroom'),

  // ── Этаж 1: западное крыло ──────────────────────────────────────────────
  node('n-cor-w1', -5.5, F1, 18.3, 1),
  node('n-gym', -7.8, F1, 15.0, 1, 'room', 'Спортзал', 'r-gym'),
  node('n-cor-w2', -9.9, F1, 18.3, 1),
  node('n-library', -12.8, F1, 18.2, 1, 'room', 'Библиотека', 'r-library'),
  node('n-cor-sw', -5.3, F1, 3.9, 1),
  node('n-cab110', -6.9, F1, 3.3, 1, 'room', 'Кабинет 110', 'r-cab110'),

  // ── Этаж 1: длинный коридор (асхана, бухгалтерия) ───────────────────────
  node('n-junction-sw', -16.5, F1, 22.0, 1, 'waypoint', 'Поворот в длинный коридор'),
  node('n-long-1', -18.2, F1, 28.7, 1),
  node('n-hr', -18.5, F1, 34.9, 1, 'room', 'Отдел кадров', 'r-hr'),
  node('n-long-2', -18.7, F1, 41.0, 1),
  node('n-accounting', -18.8, F1, 44.1, 1, 'room', 'Бухгалтерия', 'r-accounting'),
  node('n-long-3', -19.0, F1, 50.3, 1),
  node('n-long-4', -19.1, F1, 58.2, 1),
  node('n-long-5', -18.9, F1, 63.1, 1),
  node('n-long-6', -19.1, F1, 69.4, 1),
  node('n-long-7', -19.4, F1, 77.7, 1),
  node('n-long-8', -20.0, F1, 85.8, 1),
  node('n-long-9', -20.1, F1, 90.1, 1),
  node('n-long-10', -23.8, F1, 96.4, 1, 'waypoint', 'Развилка у перехода'),
  node('n-side-1', -33.8, F1, 97.5, 1),
  node('n-side-end', -40.0, F1, 99.5, 1, 'waypoint', 'Боковой коридор'),
  node('n-long-11', -17.0, F1, 101.0, 1),
  node('n-long-12', -15.8, F1, 107.0, 1),
  node('n-long-13', -16.2, F1, 113.0, 1),
  node('n-long-14', -16.5, F1, 124.7, 1),
  node('n-canteen2', -24.2, F1, 127.0, 1, 'room', 'Столовая №2 (асхана)', 'r-canteen2'),
  node('n-long-15', -20.7, F1, 138.4, 1),
  node('n-canteen', -22.5, F1, 142.5, 1, 'room', 'Столовая', 'r-canteen'),

  // ── Этаж 1: северное крыло (кабинеты 101–105) ───────────────────────────
  node('n-north-1', 1.2, F1, -5.0, 1),
  node('n-north-2', 1.2, F1, -15.0, 1),
  node('n-junction-n', 1.0, F1, -21.9, 1, 'waypoint', 'Северный коридор'),
  node('n-cab101', 6.1, F1, -21.9, 1, 'room', 'Кабинет 101', 'r-cab101'),
  node('n-cab102', 9.5, F1, -21.9, 1, 'room', 'Кабинет 102', 'r-cab102'),
  node('n-nw-1', -4.0, F1, -22.0, 1),
  node('n-cab105', -9.5, F1, -22.0, 1, 'room', 'Кабинет 105', 'r-cab105'),
  node('n-nw-2', -18.0, F1, -21.9, 1),

  // ── Лестница (узлы на каждом этаже) ────────────────────────────────────
  node('n-stairs-app', -2.9, F1, -27.0, 1, 'waypoint', 'Подход к лестнице'),
  node('n-stairs-1', -2.4, F1, -30.5, 1, 'stairs', 'Лестница, 1 этаж'),
  node('n-stairs-2', -2.4, F2, -30.5, 2, 'stairs', 'Лестница, 2 этаж'),
  node('n-stairs-3', -2.4, F3, -30.5, 3, 'stairs', 'Лестница, 3 этаж'),
  node('n-stairs-4', -2.4, F4, -30.5, 4, 'stairs', 'Лестница, 4 этаж'),

  // ── Лифт (узлы на каждом этаже) ────────────────────────────────────────
  node('n-elev-1', -4.9, F1, 22.7, 1, 'elevator', 'Лифт, 1 этаж'),
  node('n-elev-2', -4.9, F2, 22.7, 2, 'elevator', 'Лифт, 2 этаж'),
  node('n-elev-3', -4.9, F3, 22.7, 3, 'elevator', 'Лифт, 3 этаж'),
  node('n-elev-4', -4.9, F4, 22.7, 4, 'elevator', 'Лифт, 4 этаж'),

  // ── Этаж 2 ─────────────────────────────────────────────────────────────
  node('n-f2-cor1', -2.4, F2, -25.0, 2),
  node('n-f2-junction', 1.0, F2, -21.9, 2),
  node('n-cab204', 6.1, F2, -21.9, 2, 'room', 'Кабинет 204', 'r-cab204'),
  node('n-director', -7.0, F2, -22.0, 2, 'room', 'Кабинет директора', 'r-director'),
  node('n-f2-cor2', 1.2, F2, -8.0, 2),
  node('n-f2-hall', 0.6, F2, 17.5, 2, 'waypoint', 'Холл 2 этажа'),

  // ── Этаж 3 ─────────────────────────────────────────────────────────────
  node('n-f3-cor1', -2.4, F3, -25.0, 3),
  node('n-f3-junction', 1.0, F3, -21.9, 3),
  node('n-cab304', 6.1, F3, -21.9, 3, 'room', 'Кабинет 304', 'r-cab304'),
  node('n-f3-cor2', 1.2, F3, -8.0, 3),
  node('n-f3-hall', 0.6, F3, 17.5, 3, 'waypoint', 'Холл 3 этажа'),

  // ── Этаж 4 ─────────────────────────────────────────────────────────────
  node('n-f4-cor1', -2.4, F4, -25.0, 4),
  node('n-f4-junction', 1.0, F4, -21.9, 4),
  node('n-cab410', 6.1, F4, -21.9, 4, 'room', 'Кабинет 410', 'r-cab410'),
  node('n-f4-cor2', 1.2, F4, -8.0, 4),
  node('n-f4-hall', 0.6, F4, 17.5, 4, 'waypoint', 'Холл 4 этажа'),
];

const edge = (
  from: string,
  to: string,
  kind: NavEdge['kind'] = 'corridor',
): NavEdge => ({ id: `e-${from}-${to}`, from, to, kind, bidirectional: true });

/** Рёбра графа. Вес (метры) вычисляется автоматически по координатам. */
const edges: NavEdge[] = [
  // Входная зона и холл
  edge('n-entrance', 'n-hall'),
  edge('n-hall', 'n-reception', 'door'),
  edge('n-reception', 'n-assembly', 'door'),
  edge('n-hall', 'n-cloakroom', 'door'),
  edge('n-hall', 'n-cor-w1'),
  edge('n-entrance', 'n-cor-sw'),
  edge('n-cor-sw', 'n-cab110', 'door'),

  // Западное крыло
  edge('n-cor-w1', 'n-gym', 'door'),
  edge('n-cor-w1', 'n-cor-w2'),
  edge('n-cor-w2', 'n-library', 'door'),
  edge('n-library', 'n-junction-sw'),
  edge('n-cor-w1', 'n-elev-1', 'door'),

  // Длинный коридор
  edge('n-junction-sw', 'n-long-1'),
  edge('n-long-1', 'n-hr'),
  edge('n-hr', 'n-long-2'),
  edge('n-long-2', 'n-accounting'),
  edge('n-accounting', 'n-long-3'),
  edge('n-long-3', 'n-long-4'),
  edge('n-long-4', 'n-long-5'),
  edge('n-long-5', 'n-long-6'),
  edge('n-long-6', 'n-long-7'),
  edge('n-long-7', 'n-long-8'),
  edge('n-long-8', 'n-long-9'),
  edge('n-long-9', 'n-long-10'),
  edge('n-long-10', 'n-side-1'),
  edge('n-side-1', 'n-side-end'),
  edge('n-long-10', 'n-long-11'),
  edge('n-long-11', 'n-long-12'),
  edge('n-long-12', 'n-long-13'),
  edge('n-long-13', 'n-long-14'),
  edge('n-long-14', 'n-canteen2', 'door'),
  edge('n-long-14', 'n-long-15'),
  edge('n-long-15', 'n-canteen', 'door'),

  // Северное крыло
  edge('n-entrance', 'n-north-1'),
  edge('n-north-1', 'n-north-2'),
  edge('n-north-2', 'n-junction-n'),
  edge('n-junction-n', 'n-cab101', 'door'),
  edge('n-cab101', 'n-cab102', 'door'),
  edge('n-junction-n', 'n-nw-1'),
  edge('n-nw-1', 'n-cab105', 'door'),
  edge('n-cab105', 'n-nw-2'),
  edge('n-nw-1', 'n-stairs-app'),
  edge('n-stairs-app', 'n-stairs-1'),

  // Лестница между этажами
  edge('n-stairs-1', 'n-stairs-2', 'stairs'),
  edge('n-stairs-2', 'n-stairs-3', 'stairs'),
  edge('n-stairs-3', 'n-stairs-4', 'stairs'),

  // Лифт между этажами
  edge('n-elev-1', 'n-elev-2', 'elevator'),
  edge('n-elev-2', 'n-elev-3', 'elevator'),
  edge('n-elev-3', 'n-elev-4', 'elevator'),

  // Этаж 2
  edge('n-stairs-2', 'n-f2-cor1'),
  edge('n-f2-cor1', 'n-f2-junction'),
  edge('n-f2-junction', 'n-cab204', 'door'),
  edge('n-f2-junction', 'n-director', 'door'),
  edge('n-f2-junction', 'n-f2-cor2'),
  edge('n-f2-cor2', 'n-f2-hall'),
  edge('n-f2-hall', 'n-elev-2', 'door'),

  // Этаж 3
  edge('n-stairs-3', 'n-f3-cor1'),
  edge('n-f3-cor1', 'n-f3-junction'),
  edge('n-f3-junction', 'n-cab304', 'door'),
  edge('n-f3-junction', 'n-f3-cor2'),
  edge('n-f3-cor2', 'n-f3-hall'),
  edge('n-f3-hall', 'n-elev-3', 'door'),

  // Этаж 4
  edge('n-stairs-4', 'n-f4-cor1'),
  edge('n-f4-cor1', 'n-f4-junction'),
  edge('n-f4-junction', 'n-cab410', 'door'),
  edge('n-f4-junction', 'n-f4-cor2'),
  edge('n-f4-cor2', 'n-f4-hall'),
  edge('n-f4-hall', 'n-elev-4', 'door'),
];

/** Помещения (POI) с привязкой к узлам графа. */
const rooms: Room[] = [
  // Стартовые точки
  { id: 'r-entrance', name: 'Вход', floor: 1, category: 'entrance', nodeId: 'n-entrance', isStart: true, isDestination: true, icon: '🚪', description: 'Главный вход в здание' },
  { id: 'r-reception', name: 'Ресепшен', floor: 1, category: 'service', nodeId: 'n-reception', isStart: true, isDestination: true, icon: '💁', description: 'Стойка информации в холле' },
  { id: 'r-library', name: 'Библиотека', floor: 1, category: 'library', nodeId: 'n-library', isStart: true, isDestination: true, icon: '📚', description: 'Читальный зал, западное крыло' },
  { id: 'r-cab101', name: 'Кабинет 101', floor: 1, category: 'classroom', nodeId: 'n-cab101', isStart: true, isDestination: true, icon: '🏫', description: 'Северное крыло, 1 этаж' },
  { id: 'r-cab304', name: 'Кабинет 304', floor: 3, category: 'classroom', nodeId: 'n-cab304', isStart: true, isDestination: true, icon: '🏫', description: 'Северное крыло, 3 этаж' },
  { id: 'r-hr', name: 'Отдел кадров', floor: 1, category: 'office', nodeId: 'n-hr', isStart: true, isDestination: true, icon: '🗂️', description: 'Длинный коридор' },
  { id: 'r-accounting', name: 'Бухгалтерия', floor: 1, category: 'office', nodeId: 'n-accounting', isStart: true, isDestination: true, icon: '🧾', description: 'Длинный коридор' },

  // Точки назначения
  { id: 'r-director', name: 'Кабинет директора', floor: 2, category: 'office', nodeId: 'n-director', isStart: false, isDestination: true, icon: '👔', description: '2 этаж, северное крыло' },
  { id: 'r-canteen', name: 'Столовая', floor: 1, category: 'food', nodeId: 'n-canteen', isStart: false, isDestination: true, icon: '🍽️', description: 'Конец длинного коридора' },
  { id: 'r-assembly', name: 'Актовый зал', floor: 1, category: 'hall', nodeId: 'n-assembly', isStart: false, isDestination: true, icon: '🎭', description: 'Рядом с гардеробом' },
  { id: 'r-cab204', name: 'Кабинет 204', floor: 2, category: 'classroom', nodeId: 'n-cab204', isStart: false, isDestination: true, icon: '🏫', description: '2 этаж, северное крыло' },
  { id: 'r-cab410', name: 'Кабинет 410', floor: 4, category: 'classroom', nodeId: 'n-cab410', isStart: false, isDestination: true, icon: '🏫', description: '4 этаж, северное крыло' },

  // Дополнительные помещения из модели
  { id: 'r-cab102', name: 'Кабинет 102', floor: 1, category: 'classroom', nodeId: 'n-cab102', isStart: true, isDestination: true, icon: '🏫', description: 'Северное крыло, 1 этаж' },
  { id: 'r-cab105', name: 'Кабинет 105', floor: 1, category: 'classroom', nodeId: 'n-cab105', isStart: true, isDestination: true, icon: '🏫', description: 'Северное крыло, 1 этаж' },
  { id: 'r-cab110', name: 'Кабинет 110', floor: 1, category: 'classroom', nodeId: 'n-cab110', isStart: true, isDestination: true, icon: '🏫', description: 'Западнее входа' },
  { id: 'r-gym', name: 'Спортзал', floor: 1, category: 'gym', nodeId: 'n-gym', isStart: true, isDestination: true, icon: '🏀', description: 'Западное крыло' },
  { id: 'r-cloakroom', name: 'Гардероб', floor: 1, category: 'service', nodeId: 'n-cloakroom', isStart: true, isDestination: true, icon: '🧥', description: 'Рядом с актовым залом' },
  { id: 'r-canteen2', name: 'Столовая №2 (асхана)', floor: 1, category: 'food', nodeId: 'n-canteen2', isStart: true, isDestination: true, icon: '🥗', description: 'Продолжение длинного коридора' },
];

/** Полные данные здания «Колледж». */
export const collegeBuildingData: BuildingData = {
  building: {
    id: 'college-main',
    name: 'Главный корпус колледжа',
    address: 'Учебный корпус №1',
    description:
      'Четырёхэтажное здание: холл с актовым залом, северное крыло с кабинетами, длинный коридор со столовой и бухгалтерией.',
    modelUrl: `${MODEL_BASE}models/SampleScene.glb`,
    metersPerUnit: 1,
    floors: [
      { id: 'f1', building: 'college-main', level: 1, name: '1 этаж', elevation: F1 },
      { id: 'f2', building: 'college-main', level: 2, name: '2 этаж', elevation: F2 },
      { id: 'f3', building: 'college-main', level: 3, name: '3 этаж', elevation: F3 },
      { id: 'f4', building: 'college-main', level: 4, name: '4 этаж', elevation: F4 },
    ],
  },
  rooms,
  nodes,
  edges,
};
