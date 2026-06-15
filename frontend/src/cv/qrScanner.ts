/**
 * Компьютерное зрение: визуальное позиционирование по QR-маркерам.
 *
 * Видеопоток камеры покадрово анализируется библиотекой jsQR
 * (детект и декодирование QR в чистом JS, без WASM-зависимостей).
 *
 * Формат содержимого маркера:
 *   arnav:node:<nodeId>            — фиксация на узле графа
 *   arnav:room:<roomId>            — фиксация у двери помещения
 *   arnav:pos:<floor>:<x>:<y>:<z>  — произвольная позиция
 *
 * Каждое распознавание конвертируется в PositionFix и передаётся
 * подписчику — стор пересчитывает маршрут от новой позиции.
 */
import jsQR from 'jsqr';
import type { PositionFix } from '@/types';

export interface QRScanResult {
  raw: string;
  fix: PositionFix | null;
}

/** Разбор полезной нагрузки QR-кода в PositionFix. */
export function parseQRPayload(raw: string): PositionFix | null {
  const parts = raw.trim().split(':');
  if (parts[0] !== 'arnav') return null;
  const now = Date.now();

  if (parts[1] === 'node' && parts[2]) {
    return {
      nodeId: parts[2],
      position: { x: 0, y: 0, z: 0 }, // позиция возьмётся из узла графа
      floor: 1,
      source: 'qr',
      timestamp: now,
    };
  }
  if (parts[1] === 'room' && parts[2]) {
    return {
      nodeId: `room:${parts[2]}`,
      position: { x: 0, y: 0, z: 0 },
      floor: 1,
      source: 'qr',
      timestamp: now,
    };
  }
  if (parts[1] === 'pos' && parts.length >= 6) {
    const [floor, x, y, z] = parts.slice(2).map(Number);
    if ([floor, x, y, z].some(Number.isNaN)) return null;
    return {
      nodeId: '',
      position: { x, y, z },
      floor,
      source: 'qr',
      timestamp: now,
    };
  }
  return null;
}

/**
 * Сканер QR-кодов поверх HTMLVideoElement.
 * Анализ с пониженной частотой (каждые scanIntervalMs), чтобы
 * не конкурировать за CPU с рендерингом AR-сцены.
 */
export class QRScanner {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private rafId = 0;
  private lastScan = 0;
  private lastResult = '';
  private running = false;

  constructor(
    private video: HTMLVideoElement,
    private onResult: (result: QRScanResult) => void,
    private scanIntervalMs = 400,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (time: number) => {
      if (!this.running) return;
      if (time - this.lastScan >= this.scanIntervalMs) {
        this.lastScan = time;
        this.scanFrame();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private scanFrame(): void {
    const { video } = this;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    // Даунскейл кадра ×2 — jsQR работает быстрее без потери распознавания.
    const w = Math.floor(video.videoWidth / 2);
    const h = Math.floor(video.videoHeight / 2);
    if (w === 0 || h === 0) return;

    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(video, 0, 0, w, h);
    const imageData = this.ctx.getImageData(0, 0, w, h);

    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    if (code && code.data && code.data !== this.lastResult) {
      this.lastResult = code.data;
      this.onResult({ raw: code.data, fix: parseQRPayload(code.data) });
      // Повторное распознавание того же кода разрешаем через 5 секунд.
      setTimeout(() => {
        if (this.lastResult === code.data) this.lastResult = '';
      }, 5000);
    }
  }
}
