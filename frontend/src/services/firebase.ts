/**
 * Firebase Firestore — облачное хранилище карты здания.
 *
 * Работает прямо из браузера (GitHub Pages), без FastAPI-backend.
 * Конфигурация через переменные VITE_FIREBASE_* (см. frontend/.env.example).
 *
 * Структура в Firestore:
 *   buildings/{buildingId} → { data: BuildingData, updatedAt: number }
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  type Firestore,
} from 'firebase/firestore';
import type { BuildingData } from '@/types';

export interface CloudBuildingRecord {
  data: BuildingData;
  updatedAt: number;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Firebase настроен (есть apiKey и projectId в .env / CI secrets). */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function getDb(): Firestore {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase не настроен — задайте VITE_FIREBASE_* в .env');
  }
  if (!app) {
    app = getApps().length
      ? getApps()[0]
      : initializeApp(firebaseConfig as Record<string, string>);
  }
  if (!db) db = getFirestore(app);
  return db;
}

function docRef(buildingId: string) {
  return doc(getDb(), 'buildings', buildingId);
}

/** Загрузить одно здание из облака. */
export async function fetchBuildingFromCloud(
  buildingId: string,
): Promise<CloudBuildingRecord | null> {
  const snap = await getDoc(docRef(buildingId));
  if (!snap.exists()) return null;
  const raw = snap.data() as CloudBuildingRecord;
  if (!raw?.data?.building?.id) return null;
  return { data: raw.data, updatedAt: raw.updatedAt ?? 0 };
}

/** Загрузить все здания из облака. */
export async function fetchAllBuildingsFromCloud(): Promise<CloudBuildingRecord[]> {
  const snaps = await getDocs(collection(getDb(), 'buildings'));
  const out: CloudBuildingRecord[] = [];
  snaps.forEach((s) => {
    const raw = s.data() as CloudBuildingRecord;
    if (raw?.data?.building?.id) {
      out.push({ data: raw.data, updatedAt: raw.updatedAt ?? 0 });
    }
  });
  return out;
}

/** Сохранить здание в облако. Возвращает метку времени. */
export async function saveBuildingToCloud(
  data: BuildingData,
  updatedAt = Date.now(),
): Promise<number> {
  await setDoc(docRef(data.building.id), { data, updatedAt });
  return updatedAt;
}
