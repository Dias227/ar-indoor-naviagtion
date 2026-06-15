/**
 * Fallback AR-режим для устройств без WebXR (iOS Safari и десктоп).
 *
 * Камера телефона выводится как фон (getUserMedia), поверх — Three.js
 * сцена с маршрутом. Ориентация виртуальной камеры управляется
 * гироскопом (deviceorientation), позиция — фиксациями QR-маркеров
 * и симуляцией движения. Видеоэлемент одновременно служит источником
 * кадров для QR-сканера (visual positioning).
 */
import {
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { RouteLine } from '@/three/RouteLine';
import { Effects } from '@/three/Effects';
import { requestCameraStream } from './webxr';

export interface FallbackARHandle {
  /** Видеоэлемент с потоком камеры (для QR-сканера). */
  video: HTMLVideoElement | null;
}

interface FallbackARProps {
  onCameraReady: (ok: boolean) => void;
}

export const FallbackAR = forwardRef<FallbackARHandle, FallbackARProps>(
  function FallbackAR({ onCameraReady }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [streamReady, setStreamReady] = useState(false);

    useImperativeHandle(ref, () => ({ video: videoRef.current }), [streamReady]);

    // Запуск камеры
    useEffect(() => {
      let stream: MediaStream | null = null;
      let cancelled = false;
      (async () => {
        try {
          stream = await requestCameraStream();
          if (cancelled || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreamReady(true);
          onCameraReady(true);
        } catch {
          onCameraReady(false);
        }
      })();
      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, [onCameraReady]);

    // Разрешение на гироскоп (iOS требует явного запроса)
    useEffect(() => {
      const D = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof D.requestPermission === 'function') {
        const ask = () => {
          D.requestPermission?.().catch(() => undefined);
          window.removeEventListener('click', ask);
        };
        window.addEventListener('click', ask);
        return () => window.removeEventListener('click', ask);
      }
    }, []);

    return (
      <div className="absolute inset-0 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
        />
        {streamReady && (
          <Canvas
            gl={{ antialias: true, alpha: true }}
            camera={{ fov: 65, near: 0.05, far: 300 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <ambientLight intensity={1.1} />
            <Suspense fallback={null}>
              <FallbackWorld />
            </Suspense>
            <Effects />
          </Canvas>
        )}
      </div>
    );
  },
);

/**
 * Виртуальный мир fallback-режима: камера стоит в позиции пользователя
 * (из стора) на высоте глаз, ориентация — от гироскопа.
 */
function FallbackWorld() {
  const { camera } = useThree();
  const route = useNavigationStore((s) => s.route);
  const progress = useNavigationStore((s) => s.progress);
  const userPosition = useNavigationStore((s) => s.userPosition);
  const { routeColor, showParticles } = useSettingsStore();

  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const smoothQuat = useRef(new THREE.Quaternion());

  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      orientationRef.current = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, []);

  useFrame(() => {
    // Позиция камеры — позиция пользователя на высоте глаз
    if (userPosition) {
      camera.position.lerp(
        new THREE.Vector3(userPosition.x, userPosition.y + 1.6, userPosition.z),
        0.2,
      );
    }

    // Ориентация от гироскопа (формула W3C deviceorientation → quaternion)
    const o = orientationRef.current;
    if (o) {
      const alpha = THREE.MathUtils.degToRad(o.alpha);
      const beta = THREE.MathUtils.degToRad(o.beta);
      const gamma = THREE.MathUtils.degToRad(o.gamma);
      const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
      const target = new THREE.Quaternion()
        .setFromEuler(euler)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      smoothQuat.current.slerp(target, 0.15);
      camera.quaternion.copy(smoothQuat.current);
    } else if (route && userPosition) {
      // Без гироскопа (десктоп): смотрим вдоль маршрута
      const heading = useNavigationStore.getState().userHeading;
      camera.rotation.set(0, heading + Math.PI, 0);
    }
  });

  if (!route) return null;
  return (
    <RouteLine
      route={route}
      color={routeColor}
      progress={progress.fraction}
      showParticles={showParticles}
      radius={0.12}
    />
  );
}
