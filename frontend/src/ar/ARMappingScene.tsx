/**
 * WebXR-сцена для РАЗМЕТКИ кабинетов «по месту» (не навигация).
 *
 * Отличие от ARScene: калибровка не по маршруту, а по двум известным
 * точкам графа — «якорь» A (где стоит пользователь) и «ориентир» B
 * (куда смотрит). Это задаёт перенос и поворот системы координат здания
 * в реальный мир. После калибровки каждый кадр поза камеры переводится в
 * координаты здания и отдаётся наверх (onPosition) — оверлей по кнопке
 * ставит кабинет в текущей позиции.
 *
 * Доступно только там, где есть WebXR immersive-ar (Android + Chrome).
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ARSessionState, Vec3 } from '@/types';
import { requestARSession } from './webxr';

interface PlacedMarker {
  id: string;
  position: Vec3;
  name: string;
}

interface ARMappingSceneProps {
  overlayRoot: HTMLElement | null;
  anchor: Vec3;
  facing: Vec3;
  /** Уже размеченные точки текущего этажа — для подсветки в AR. */
  placed: PlacedMarker[];
  onStateChange: (s: ARSessionState) => void;
  onSessionEnd: () => void;
  /** Текущая позиция пользователя в координатах здания (10 раз/с). */
  onPosition: (pos: Vec3 | null) => void;
}

export function ARMappingScene({
  overlayRoot,
  anchor,
  facing,
  placed,
  onStateChange,
  onSessionEnd,
  onPosition,
}: ARMappingSceneProps) {
  const [session, setSession] = useState<XRSession | null>(null);
  const startedRef = useRef(false);

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
        <MappingWorld
          session={session}
          anchor={anchor}
          facing={facing}
          placed={placed}
          onStateChange={onStateChange}
          onPosition={onPosition}
        />
      </Suspense>
    </Canvas>
  );
}

function MappingWorld({
  session,
  anchor,
  facing,
  placed,
  onStateChange,
  onPosition,
}: {
  session: XRSession;
  anchor: Vec3;
  facing: Vec3;
  placed: PlacedMarker[];
  onStateChange: (s: ARSessionState) => void;
  onPosition: (pos: Vec3 | null) => void;
}) {
  const { gl } = useThree();

  const reticleRef = useRef<THREE.Group>(null);
  const anchorGroupRef = useRef<THREE.Group>(null);

  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const anchorRef = useRef<XRAnchor | null>(null);
  const calibratedRef = useRef(false);
  const lastHitRef = useRef<THREE.Vector3 | null>(null);
  const lastUpdateRef = useRef(0);

  // Свежие A/B без переинициализации эффектов калибровки.
  const anchorVecRef = useRef(anchor);
  const facingVecRef = useRef(facing);
  anchorVecRef.current = anchor;
  facingVecRef.current = facing;

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const viewerSpace = await session.requestReferenceSpace('viewer');
        const source = await session.requestHitTestSource?.({
          space: viewerSpace,
        });
        if (!disposed && source) hitTestSourceRef.current = source;
      } catch {
        /* hit-test недоступен — калибровка по точке перед камерой */
      }
    })();
    return () => {
      disposed = true;
      hitTestSourceRef.current?.cancel();
      hitTestSourceRef.current = null;
    };
  }, [session]);

  const calibrate = useCallback(
    (hitPoint: THREE.Vector3, frame?: XRFrame) => {
      const group = anchorGroupRef.current;
      if (!group) return;

      const camera = gl.xr.getCamera();
      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0)
        .normalize();

      const a = anchorVecRef.current;
      const b = facingVecRef.current;
      const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();

      const theta =
        Math.atan2(forward.x, forward.z) - Math.atan2(dir.x, dir.z);

      group.rotation.set(0, theta, 0);
      const anchorWorld = new THREE.Vector3(a.x, a.y, a.z).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        theta,
      );
      group.position.copy(hitPoint).sub(anchorWorld);
      group.visible = true;

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
    [gl, onStateChange],
  );

  useEffect(() => {
    const onSelect = () => {
      if (calibratedRef.current) return;
      const frame = gl.xr.getFrame();
      if (lastHitRef.current) {
        calibrate(lastHitRef.current.clone(), frame ?? undefined);
      } else {
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

  useFrame((state, _delta, frame: XRFrame | undefined) => {
    if (!frame) return;
    const refSpace = gl.xr.getReferenceSpace();
    if (!refSpace) return;

    // Ретикл по hit-test до калибровки
    if (
      !calibratedRef.current &&
      hitTestSourceRef.current &&
      reticleRef.current
    ) {
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

    // Анти-дрейф по якорю
    if (calibratedRef.current && anchorRef.current && anchorGroupRef.current) {
      const anchorPose = frame.getPose(
        anchorRef.current.anchorSpace,
        refSpace,
      );
      if (anchorPose && lastHitRef.current) {
        const anchorPos = new THREE.Vector3(
          anchorPose.transform.position.x,
          anchorPose.transform.position.y,
          anchorPose.transform.position.z,
        );
        const drift = anchorPos.clone().sub(lastHitRef.current);
        if (drift.lengthSq() > 1e-6) {
          anchorGroupRef.current.position.add(drift);
          lastHitRef.current.copy(anchorPos);
        }
      }
    }

    // Позиция пользователя → координаты здания (10 раз/с)
    if (calibratedRef.current && anchorGroupRef.current) {
      const now = state.clock.getElapsedTime();
      if (now - lastUpdateRef.current > 0.1) {
        lastUpdateRef.current = now;
        const camera = gl.xr.getCamera();
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const local = anchorGroupRef.current.worldToLocal(camPos.clone());
        onPosition({ x: local.x, y: anchorVecRef.current.y, z: local.z });
      }
    }
  });

  return (
    <>
      <group ref={reticleRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.12, 0.16, 36]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.04, 20]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      </group>

      {/* Уже размеченные кабинеты в реальном пространстве */}
      <group ref={anchorGroupRef} visible={false}>
        {placed.map((m) => (
          <group key={m.id} position={[m.position.x, m.position.y, m.position.z]}>
            <mesh position={[0, 0.9, 0]}>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshBasicMaterial color="#ff2d78" />
            </mesh>
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
              <meshBasicMaterial color="#ff2d78" transparent opacity={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </>
  );
}
