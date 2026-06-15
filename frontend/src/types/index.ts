/**
 * Доменные типы приложения AR Indoor Navigation.
 *
 * Единая точка правды для всех структур данных: здания, этажи,
 * помещения, граф навигации, маршруты, история, настройки.
 */

/** Трёхмерная точка в системе координат здания (метры). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Тип узла навигационного графа. */
export type NavNodeType =
  | 'waypoint' // обычная точка коридора
  | 'room' // дверь помещения
  | 'stairs' // площадка лестницы
  | 'elevator' // кабина лифта
  | 'entrance' // вход в здание
  | 'marker'; // позиция QR/визуального маркера

/** Узел графа (Node/Waypoint). */
export interface NavNode {
  id: string;
  name?: string;
  position: Vec3;
  /** Номер этажа, на котором находится узел. */
  floor: number;
  type: NavNodeType;
  /** Идентификатор связанного помещения (для type === 'room'). */
  roomId?: string;
}

/** Ребро графа (Edge). Соединение двух узлов. */
export interface NavEdge {
  id: string;
  from: string;
  to: string;
  /** Вес: расстояние в метрах. Вычисляется автоматически, если не задан. */
  weight?: number;
  /** Двунаправленное ли ребро (по умолчанию true). */
  bidirectional?: boolean;
  /** Тип соединения — для штрафов и голосовых подсказок. */
  kind?: 'corridor' | 'stairs' | 'elevator' | 'door';
}

/** Категория помещения. */
export type RoomCategory =
  | 'office'
  | 'classroom'
  | 'service'
  | 'food'
  | 'hall'
  | 'entrance'
  | 'library'
  | 'gym'
  | 'other';

/** Помещение / точка интереса (POI). */
export interface Room {
  id: string;
  name: string;
  description?: string;
  floor: number;
  category: RoomCategory;
  /** Узел графа у двери помещения. */
  nodeId: string;
  /** Может ли быть стартовой точкой. */
  isStart?: boolean;
  /** Может ли быть точкой назначения. */
  isDestination?: boolean;
  icon?: string;
}

/** Этаж здания. */
export interface Floor {
  id: string;
  building: string;
  level: number;
  name: string;
  /** Высота пола этажа в координатах модели (ось Y). */
  elevation: number;
}

/** Здание. */
export interface Building {
  id: string;
  name: string;
  address?: string;
  description?: string;
  /** URL GLB модели здания. */
  modelUrl: string;
  /** Масштаб модели: метров на единицу модели. */
  metersPerUnit: number;
  floors: Floor[];
}

/** Полный набор данных здания для навигации. */
export interface BuildingData {
  building: Building;
  rooms: Room[];
  nodes: NavNode[];
  edges: NavEdge[];
}

/** Тип манёвра в инструкции маршрута. */
export type ManeuverType =
  | 'start'
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'stairs-up'
  | 'stairs-down'
  | 'elevator-up'
  | 'elevator-down'
  | 'arrive';

/** Шаг маршрута с голосовой инструкцией. */
export interface RouteStep {
  maneuver: ManeuverType;
  /** Текст инструкции («Через 10 метров поверните налево»). */
  instruction: string;
  /** Дистанция до следующего манёвра, м. */
  distance: number;
  /** Накопленная дистанция от старта до этого шага, м. */
  cumulativeDistance: number;
  /** Позиция манёвра. */
  position: Vec3;
  /** Этаж, на котором происходит манёвр. */
  floor: number;
}

/** Результат построения маршрута. */
export interface RouteResult {
  /** Последовательность узлов графа. */
  nodeIds: string[];
  /** Плотная ломаная маршрута (для кривой и миникарты). */
  points: Vec3[];
  /** Этаж каждой точки points. */
  pointFloors: number[];
  /** Общая длина, м. */
  totalDistance: number;
  /** Оценка времени в пути, сек (скорость пешехода ~1.2 м/с). */
  estimatedSeconds: number;
  steps: RouteStep[];
  /** Затронутые этажи в порядке прохождения. */
  floorsVisited: number[];
}

/** Запись истории маршрутов. */
export interface HistoryEntry {
  id: string;
  buildingId: string;
  fromRoomId: string;
  toRoomId: string;
  fromName: string;
  toName: string;
  distance: number;
  startedAt: number;
  completed: boolean;
}

/** Избранный маршрут. */
export interface FavoriteRoute {
  id: string;
  buildingId: string;
  fromRoomId: string;
  toRoomId: string;
  fromName: string;
  toName: string;
  label?: string;
  createdAt: number;
}

/** Настройки приложения. */
export interface AppSettings {
  voiceEnabled: boolean;
  voiceRate: number;
  voiceVolume: number;
  language: 'ru' | 'en';
  showMinimap: boolean;
  showParticles: boolean;
  bloomIntensity: number;
  routeColor: string;
  highQuality: boolean;
}

/** Состояние AR-сессии. */
export type ARSessionState =
  | 'idle'
  | 'requesting'
  | 'scanning-floor'
  | 'calibrating'
  | 'tracking'
  | 'fallback'
  | 'error';

/** Результат визуального позиционирования (QR / маркер). */
export interface PositionFix {
  nodeId: string;
  position: Vec3;
  floor: number;
  /** Источник определения позиции. */
  source: 'qr' | 'marker' | 'manual' | 'dead-reckoning';
  timestamp: number;
}
