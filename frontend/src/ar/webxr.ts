/**
 * Утилиты WebXR: проверка поддержки и запуск immersive-ar сессии
 * с hit-testing, якорями и DOM-оверлеем.
 *
 * iOS Safari не поддерживает WebXR AR — приложение автоматически
 * переключается на fallback-режим (камера + гироскоп), см. FallbackAR.
 */

/** Поддерживает ли браузер WebXR immersive-ar. */
export async function isImmersiveARSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('xr' in navigator)) return false;
  try {
    return (await navigator.xr!.isSessionSupported('immersive-ar')) ?? false;
  } catch {
    return false;
  }
}

/**
 * Запрос AR-сессии.
 * @param overlayRoot DOM-элемент интерфейса поверх камеры (dom-overlay).
 */
export async function requestARSession(
  overlayRoot: HTMLElement | null,
): Promise<XRSession> {
  if (!navigator.xr) throw new Error('WebXR не поддерживается');
  const init: XRSessionInit = {
    requiredFeatures: ['hit-test', 'local-floor'],
    optionalFeatures: ['anchors', 'dom-overlay', 'light-estimation'],
  };
  if (overlayRoot) {
    (init as XRSessionInit & { domOverlay?: { root: HTMLElement } }).domOverlay = {
      root: overlayRoot,
    };
  }
  return navigator.xr.requestSession('immersive-ar', init);
}

/** Есть ли доступ к камере (для fallback-режима и QR-сканера). */
export async function requestCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}
