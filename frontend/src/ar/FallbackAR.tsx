/**
 * Fallback AR-режим для устройств без WebXR (iOS Safari и десктоп).
 *
 * Камера телефона выводится как фон (getUserMedia), поверх — Three.js
 * сцена с маршрутом. Ориентация виртуальной камеры управляется
 * гироскопом (deviceorientation), позиция — оценкой шагов.
 */
import {
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RouteResult } from '@/types';
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

    // Разрешение на гироскоп и шаги (iOS требует явного запроса)
    useEffect(() => {
      const Orientation = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      const Motion = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (
        typeof Orientation.requestPermission === 'function' ||
        typeof Motion.requestPermission === 'function'
      ) {
        const ask = () => {
          Orientation.requestPermission?.().catch(() => undefined);
          Motion.requestPermission?.().catch(() => undefined);
          window.removeEventListener('click', ask);
          window.removeEventListener('touchend', ask);
        };
        window.addEventListener('click', ask);
        window.addEventListener('touchend', ask);
        return () => {
          window.removeEventListener('click', ask);
          window.removeEventListener('touchend', ask);
        };
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
  const calibrationHeadingOffset = useNavigationStore(
    (s) => s.calibrationHeadingOffset,
  );
  const { routeColor, showParticles } = useSettingsStore();

  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const smoothQuat = useRef(new THREE.Quaternion());
  const autoYawRef = useRef<number | null>(null);
  const routePivot = useMemo(() => {
    if (!userPosition) return null;
    return new THREE.Vector3(userPosition.x, userPosition.y, userPosition.z);
  }, [userPosition]);

  useEffect(() => {
    autoYawRef.current = null;
  }, [route]);

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
      const screenAngle = THREE.MathUtils.degToRad(
        window.screen.orientation?.angle ??
          (window.orientation as number | undefined) ??
          0,
      );
      const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
      const target = new THREE.Quaternion().setFromEuler(euler);
      target.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          -Math.PI / 2,
        ),
      );
      target.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          -screenAngle,
        ),
      );
      smoothQuat.current.slerp(target, 0.15);
      camera.quaternion.copy(smoothQuat.current);
    } else if (route && userPosition) {
      // Без гироскопа (десктоп): смотрим вдоль маршрута
      const heading = useNavigationStore.getState().userHeading;
      camera.rotation.set(0, heading + Math.PI, 0);
    }

    if (route && userPosition && autoYawRef.current === null) {
      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .setY(0)
        .normalize();
      const routeDir = routeDirectionAt(route, progress.travelled);
      if (forward.lengthSq() > 0.001 && routeDir.lengthSq() > 0.001) {
        autoYawRef.current =
          Math.atan2(forward.x, forward.z) -
          Math.atan2(routeDir.x, routeDir.z);
      }
    }
  });

  if (!route) return null;
  const routeLine = (
    <RouteLine
      route={route}
      color={routeColor}
      progress={progress.fraction}
      showParticles={showParticles}
      radius={0.12}
    />
  );

  if (!routePivot) return routeLine;

  const yaw = (autoYawRef.current ?? 0) + calibrationHeadingOffset;

  return (
    <group position={routePivot} rotation={[0, yaw, 0]}>
      <group position={routePivot.clone().multiplyScalar(-1)}>{routeLine}</group>
    </group>
  );
}

function routeDirectionAt(route: RouteResult, travelled: number): THREE.Vector3 {
  let acc = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const segment = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (acc + segment >= travelled + 0.2 || i === route.points.length - 1) {
      return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    }
    acc += segment;
  }
  return new THREE.Vector3(0, 0, -1);
}
