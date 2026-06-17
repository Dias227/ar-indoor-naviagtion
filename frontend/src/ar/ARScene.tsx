/**
 * WebXR AR-сцена (React Three Fiber).
 *
 * Пайплайн:
 *  1. Запуск immersive-ar сессии (hit-test + anchors + dom-overlay).
 *  2. Поиск пола: hit-testing из центра экрана, ретикл следует за полом.
 *  3. Тап — калибровка: строится трансформация «координаты здания → AR-мир»
 *     (точка старта маршрута встаёт в точку тапа, направление первого
 *     сегмента совмещается с направлением взгляда). При поддержке —
 *     создаётся XRAnchor, и группа маршрута следует за якорем, что
 *     устраняет дрожание и дрейф (world tracking).
 *  4. Каждый кадр поза камеры переводится обратно в координаты здания —
 *     стор обновляет прогресс, инструкции и при необходимости
 *     пересчитывает маршрут.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ARSessionState } from '@/types';
import { useNavigationStore } from '@/store/useNavigationStore';
import { distance } from '@/navigation/graph';
import { useSettingsStore } from '@/store/useSettingsStore';
import { RouteLine } from '@/three/RouteLine';
import { requestARSession } from './webxr';

interface ARSceneProps {
  overlayRoot: HTMLElement | null;
  onStateChange: (state: ARSessionState) => void;
  onSessionEnd: () => void;
}

/** Высота камеры над полом для оценки позиции пользователя, м. */
const EYE_HEIGHT = 1.6;

export function ARScene({ overlayRoot, onStateChange, onSessionEnd }: ARSceneProps) {
  const [session, setSession] = useState<XRSession | null>(null);
  const startedRef = useRef(false);

  // Запуск XR-сессии один раз при монтировании.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    onStateChange('requesting');
    requestARSession(overlayRoot)
      .then((s) => {
        if (cancelled) {
          void s.end();
          return;
        }
        setSession(s);
        onStateChange('scanning-floor');
        s.addEventListener('end', onSessionEnd);
      })
      .catch(() => onStateChange('error'));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      void session?.end().catch(() => undefined);
    };
  }, [session]);

  if (!session) return null;

  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.xr.enabled = true;
        gl.xr.setReferenceSpaceType('local-floor');
        void gl.xr.setSession(session);
      }}
      camera={{ fov: 70, near: 0.01, far: 200 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={1.2} />
      <Suspense fallback={null}>
        <ARWorld session={session} onStateChange={onStateChange} />
      </Suspense>
    </Canvas>
  );
}

/** Внутренний мир AR: hit-test, калибровка, маршрут, трекинг позы. */
function ARWorld({
  session,
  onStateChange,
}: {
  session: XRSession;
  onStateChange: (s: ARSessionState) => void;
}) {
  const { gl } = useThree();
  const route = useNavigationStore((s) => s.route);
  const progress = useNavigationStore((s) => s.progress);
  const updateUserPosition = useNavigationStore((s) => s.updateUserPosition);
  const userFloor = useNavigationStore((s) => s.userFloor);
  const startRoom = useNavigationStore((s) => s.startRoom);
  const userPosition = useNavigationStore((s) => s.userPosition);
  const graph = useNavigationStore((s) => s.graph);
  const calibrationHeadingOffset = useNavigationStore(
    (s) => s.calibrationHeadingOffset,
  );
  const calibrationGeneration = useNavigationStore(
    (s) => s.calibrationGeneration,
  );
  const { routeColor, showParticles } = useSettingsStore();

  const reticleRef = useRef<THREE.Group>(null);
  const anchorGroupRef = useRef<THREE.Group>(null);
  const baseThetaRef = useRef(0);

  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const anchorRef = useRef<XRAnchor | null>(null);
  const calibratedRef = useRef(false);
  const lastHitRef = useRef<THREE.Vector3 | null>(null);
  const lastUpdateRef = useRef(0);

  // Источник hit-test из viewer space (луч из центра экрана).
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const viewerSpace = await session.requestReferenceSpace('viewer');
        const source = await session.requestHitTestSource?.({ space: viewerSpace });
        if (!disposed && source) hitTestSourceRef.current = source;
      } catch {
        /* hit-test недоступен — калибровка по тапу в позицию перед камерой */
      }
    })();
    return () => {
      disposed = true;
      hitTestSourceRef.current?.cancel();
      hitTestSourceRef.current = null;
    };
  }, [session]);

  /** Калибровка по точке на полу: совмещение систем координат. */
  const calibrate = useCallback(
    (hitPoint: THREE.Vector3, frame?: XRFrame) => {
      if (!route || calibratedRef.current) return;
      const group = anchorGroupRef.current;
      if (!group) return;

      const camera = gl.xr.getCamera();
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);

      // Направление взгляда в горизонтальной плоскости
      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0)
        .normalize();

      // Якорь в координатах здания: ручная фиксация или старт маршрута
      let p0 = route.points[0];
      if (userPosition) {
        p0 = userPosition;
      } else if (startRoom) {
        const startNode = graph.getNode(startRoom.nodeId);
        if (startNode) p0 = startNode.position;
      }

      let p1 = route.points[Math.min(1, route.points.length - 1)];
      for (let i = 0; i < route.points.length - 1; i++) {
        if (distance(route.points[i], p0) < 1.2) {
          p1 = route.points[i + 1];
          break;
        }
      }

      const routeDir = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
      // Поворот вокруг Y в Three (правосторонняя система): R(θ) переводит
      // направление маршрута во взгляд. Чтобы R(θ)·routeDir = forward,
      // нужен угол atan2(routeDir) − atan2(forward), иначе маршрут зеркалится
      // (на карте поворот направо — в камере показывает налево).
      const theta =
        Math.atan2(routeDir.x, routeDir.z) - Math.atan2(forward.x, forward.z);
      baseThetaRef.current = theta;
      const totalYaw = theta + calibrationHeadingOffset;

      group.rotation.set(0, totalYaw, 0);
      const startWorld = new THREE.Vector3(p0.x, p0.y, p0.z).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        totalYaw,
      );
      group.position.copy(hitPoint).sub(startWorld);
      group.visible = true;

      // Пробуем создать XRAnchor — стабильная привязка к реальному миру
      if (frame?.createAnchor) {
        const anchorPose = new XRRigidTransform(
          { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
          { x: 0, y: 0, z: 0, w: 1 },
        );
        const refSpace = gl.xr.getReferenceSpace();
        if (refSpace) {
          frame
            .createAnchor(anchorPose, refSpace)
            ?.then((anchor) => {
              anchorRef.current = anchor;
            })
            .catch(() => undefined);
        }
      }

      calibratedRef.current = true;
      onStateChange('tracking');
    },
    [route, gl, onStateChange, userPosition, startRoom, graph, calibrationHeadingOffset],
  );

  useEffect(() => {
    if (calibratedRef.current && anchorGroupRef.current) {
      anchorGroupRef.current.rotation.y =
        baseThetaRef.current + calibrationHeadingOffset;
    }
  }, [calibrationHeadingOffset]);

  // Обработка тапа (XR select) — калибровка по текущему ретиклу.
  useEffect(() => {
    const onSelect = () => {
      if (calibratedRef.current) return;
      const frame = gl.xr.getFrame();
      if (lastHitRef.current) {
        calibrate(lastHitRef.current.clone(), frame ?? undefined);
      } else {
        // Без hit-test: точка в 2 м перед камерой на уровне пола
        const camera = gl.xr.getCamera();
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const fwd = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
          .setY(0)
          .normalize()
          .multiplyScalar(2);
        calibrate(camPos.add(fwd).setY(0), frame ?? undefined);
      }
    };
    session.addEventListener('select', onSelect);
    return () => session.removeEventListener('select', onSelect);
  }, [session, gl, calibrate]);

  // Покадровый цикл: hit-test до калибровки, трекинг позы после.
  useFrame((state, _delta, frame: XRFrame | undefined) => {
    if (!frame) return;
    const refSpace = gl.xr.getReferenceSpace();
    if (!refSpace) return;

    // ── Ретикл по hit-test ──
    if (!calibratedRef.current && hitTestSourceRef.current && reticleRef.current) {
      const results = frame.getHitTestResults(hitTestSourceRef.current);
      if (results.length > 0) {
        const pose = results[0].getPose(refSpace);
        if (pose) {
          const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
          const pos = new THREE.Vector3().setFromMatrixPosition(m);
          reticleRef.current.visible = true;
          reticleRef.current.position.copy(pos);
          lastHitRef.current = pos;
        }
      } else {
        reticleRef.current.visible = false;
      }
    }

    // ── Следование за якорем (анти-дрейф) ──
    if (calibratedRef.current && anchorRef.current && anchorGroupRef.current) {
      const anchorPose = frame.getPose(anchorRef.current.anchorSpace, refSpace);
      if (anchorPose && lastHitRef.current) {
        const anchorPos = new THREE.Vector3(
          anchorPose.transform.position.x,
          anchorPose.transform.position.y,
          anchorPose.transform.position.z,
        );
        // Смещение якоря переносим на группу маршрута
        const drift = anchorPos.clone().sub(lastHitRef.current);
        if (drift.lengthSq() > 1e-6) {
          anchorGroupRef.current.position.add(drift);
          lastHitRef.current.copy(anchorPos);
        }
      }
    }

    // ── Позиция пользователя в координатах здания (10 раз/с) ──
    if (calibratedRef.current && anchorGroupRef.current) {
      const now = state.clock.getElapsedTime();
      if (now - lastUpdateRef.current > 0.1) {
        lastUpdateRef.current = now;
        const camera = gl.xr.getCamera();
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const local = anchorGroupRef.current.worldToLocal(camPos.clone());

        const camQuat = camera.getWorldQuaternion(new THREE.Quaternion());
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat).setY(0);
        const heading = Math.atan2(fwd.x, fwd.z) - anchorGroupRef.current.rotation.y;

        const floorElevation = route
          ? route.points[0].y
          : -EYE_HEIGHT;
        updateUserPosition(
          { x: local.x, y: floorElevation, z: local.z },
          heading,
        );
      }
    }
  });

  // Сброс калибровки только по явному запросу (кнопка ⟲), не при пересчёте маршрута
  useEffect(() => {
    calibratedRef.current = false;
    anchorRef.current = null;
    if (anchorGroupRef.current) anchorGroupRef.current.visible = false;
    onStateChange('scanning-floor');
  }, [calibrationGeneration, onStateChange]);

  const ringColor = useMemo(() => new THREE.Color(routeColor), [routeColor]);
  void userFloor;

  return (
    <>
      {/* Ретикл прицеливания на пол */}
      <group ref={reticleRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.12, 0.16, 36]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.04, 20]} />
          <meshBasicMaterial color={'#ffffff'} transparent opacity={0.9} />
        </mesh>
      </group>

      {/* Маршрут в заякоренной системе координат */}
      <group ref={anchorGroupRef} visible={false}>
        {route && (
          <RouteLine
            route={route}
            color={routeColor}
            progress={progress.fraction}
            showParticles={showParticles}
            radius={0.12}
          />
        )}
      </group>
    </>
  );
}
