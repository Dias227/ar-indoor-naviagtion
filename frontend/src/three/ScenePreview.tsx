/**
 * 3D-предпросмотр здания с маршрутом (страница миникарты и превью маршрута).
 *
 * Канвас R3F: модель в режиме x-ray, NFS-линия маршрута, маркер
 * пользователя, орбитальная камера с автоцентрированием на маршруте.
 */
import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BuildingModel } from './BuildingModel';
import { RouteLine } from './RouteLine';
import { UserMarker } from './UserMarker';
import { Effects } from './Effects';

export function ScenePreview({ showBuilding = true }: { showBuilding?: boolean }) {
  const route = useNavigationStore((s) => s.route);
  const userPosition = useNavigationStore((s) => s.userPosition);
  const userHeading = useNavigationStore((s) => s.userHeading);
  const progress = useNavigationStore((s) => s.progress);
  const buildingData = useNavigationStore((s) => s.buildingData);
  const { routeColor, showParticles } = useSettingsStore();

  // Центр маршрута для прицеливания камеры
  const center = useMemo(() => {
    if (!route || route.points.length === 0) return new THREE.Vector3(0, 0, 10);
    const c = new THREE.Vector3();
    route.points.forEach((p) => c.add(new THREE.Vector3(p.x, p.y, p.z)));
    return c.divideScalar(route.points.length);
  }, [route]);

  const cameraPos = useMemo(
    () => [center.x + 18, center.y + 26, center.z - 18] as [number, number, number],
    [center],
  );

  return (
    <Canvas
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: cameraPos, fov: 50, near: 0.1, far: 600 }}
      dpr={[1, 2]}
      style={{ background: 'radial-gradient(ellipse at center, #0a1322 0%, #05080f 100%)' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[20, 40, 10]} intensity={0.8} />

      <Suspense fallback={null}>
        {showBuilding && (
          <BuildingModel url={buildingData.building.modelUrl} mode="xray" />
        )}
      </Suspense>

      {route && (
        <RouteLine
          route={route}
          color={routeColor}
          progress={progress.fraction}
          showParticles={showParticles}
          radius={0.18}
        />
      )}

      {userPosition && <UserMarker position={userPosition} heading={userHeading} />}

      {/* Сетка пола для ориентации */}
      <gridHelper
        args={[300, 60, '#123042', '#0b1d2b']}
        position={[0, -2.6, 40]}
      />

      <OrbitControls
        target={center}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={5}
        maxDistance={160}
        enableDamping
      />
      <Effects />
    </Canvas>
  );
}
