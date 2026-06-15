/**
 * React-хук QR-сканера: подключает QRScanner к видеоэлементу
 * и транслирует фиксации позиции в навигационный стор.
 */
import { useEffect, useRef, useState } from 'react';
import { QRScanner, type QRScanResult } from '@/cv/qrScanner';
import { useNavigationStore } from '@/store/useNavigationStore';

export function useQRScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): { lastScan: QRScanResult | null } {
  const [lastScan, setLastScan] = useState<QRScanResult | null>(null);
  const applyPositionFix = useNavigationStore((s) => s.applyPositionFix);
  const scannerRef = useRef<QRScanner | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;

    const scanner = new QRScanner(video, (result) => {
      setLastScan(result);
      if (result.fix) {
        applyPositionFix(result.fix);
        if (navigator.vibrate) navigator.vibrate(80);
      }
    });
    scannerRef.current = scanner;
    scanner.start();

    return () => {
      scanner.stop();
      scannerRef.current = null;
    };
  }, [enabled, videoRef, applyPositionFix]);

  return { lastScan };
}
