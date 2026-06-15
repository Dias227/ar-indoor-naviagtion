/**
 * 3D-редактор графа навигации поверх модели здания.
 *
 * Ключевая идея: модель рендерится без трансформаций, поэтому мировые
 * координаты сцены совпадают с системой координат узлов графа. Невидимая
 * плоскость на уровне пола ловит клики (raycast) и отдаёт точные X/Z прямо
 * «по месту» — больше не нужно угадывать координаты на пустой 2D-сетке.
 *
 * Точки графа показываются как кликабельные 3D-маркеры (рендерятся поверх
 * стен — depthTest=false), рёбра — линиями. Камера автоматически
 * центрируется на выбранном этаже при его переключении.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NavEdge, NavNode, Vec3 } from '@/types';
import { BuildingModel } from './BuildingModel';

/** Порог в пикселях: больше — это вращение камеры, а не клик. */
const DRAG_PX = 6;

const TYPE_COLOR: Record<NavNode['type'], string> = {
  waypoint: '#00e5ff',
  room: '#ff2d78',
  stairs: '#7c4dff',
  elevator: '#ffaa00',
  entrance: '#00ffa3',
  marker: '#aaff00',
};

interface EditorSceneProps {
  modelUrl: string;
  nodes: NavNode[];
  edges: NavEdge[];
  floor: number;
  floorElevation: number;
  /** Скрыть этажи выше этого Y (изоляция текущего этажа). */
  isolateMaxY?: number;
  selectedId: string | null;
  /** Клик по полу — координаты на уровне текущего этажа. */
  onPickSurface: (point: Vec3) => void;
  /** Клик по существующему маркеру точки. */
  onPickNode: (id: string) => void;
}

/** Перенацеливает камеру на центр этажа при переключении этажа. */
function CameraRig({
  floor,
  nodes,
  floorElevation,
}: {
  floor: number;
  nodes: NavNode[];
  floorElevation: number;
}) {
  const { camera } = useThree();
  // Тип контролов из three-stdlib не реэкспортируется удобно — используем any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const floorNodes = nodes.filter((n) => n.floor === floor);
    const center = new THREE.Vector3();
    if (floorNodes.length > 0) {
      floorNodes.forEach((n) =>
        center.add(new THREE.Vector3(n.position.x, n.position.y, n.position.z)),
      );
      center.divideScalar(floorNodes.length);
    } else {
      center.set(-12, floorElevation, 50);
    }
    camera.position.set(center.x + 8, center.y + 36, center.z + 14);
    camera.lookAt(center);
    const ctr = controlsRef.current;
    if (ctr) {
      ctr.target.copy(center);
      ctr.update();
    }
    // Перецентровка только при смене этажа, не при каждой правке точек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      maxPolarAngle={Math.PI / 2.05}
      minDistance={3}
      maxDistance={260}
      enableDamping
    />
  );
}

/** Рёбра текущего этажа единым LineSegments. */
function EdgeLines({
  nodes,
  edges,
  floor,
}: {
  nodes: NavNode[];
  edges: NavEdge[];
  floor: number;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    for (const e of edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      if (a.floor !== floor && b.floor !== floor) continue;
      positions.push(
        a.position.x, a.position.y + 0.15, a.position.z,
        b.position.x, b.position.y + 0.15, b.position.z,
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [nodes, edges, floor]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#00e5ff"
        transparent
        opacity={0.55}
        depthTest={false}
      />
    </lineSegments>
  );
}

/** Кликабельные маркеры точек текущего этажа. */
function NodeMarkers({
  nodes,
  floor,
  selectedId,
  onPickNode,
}: {
  nodes: NavNode[];
  floor: number;
  selectedId: string | null;
  onPickNode: (id: string) => void;
}) {
  return (
    <>
      {nodes
        .filter((n) => n.floor === floor)
        .map((n) => {
          const selected = n.id === selectedId;
          return (
            <group
              key={n.id}
              position={[n.position.x, n.position.y + 0.5, n.position.z]}
            >
              <mesh
                onClick={(e: ThreeEvent<MouseEvent>) => {
                  if (e.delta > DRAG_PX) return;
                  e.stopPropagation();
                  onPickNode(n.id);
                }}
              >
                <sphereGeometry args={[selected ? 0.85 : 0.6, 18, 18]} />
                <meshBasicMaterial
                  color={TYPE_COLOR[n.type]}
                  depthTest={false}
                  transparent
                  opacity={0.95}
                />
              </mesh>
              {/* Стойка до пола — чтобы маркер «стоял» на этаже */}
              <mesh position={[0, -0.25, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 0.5, 6]} />
                <meshBasicMaterial
                  color={TYPE_COLOR[n.type]}
                  depthTest={false}
                  transparent
                  opacity={0.5}
                />
              </mesh>
              {selected && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]}>
                  <ringGeometry args={[1.0, 1.3, 32]} />
                  <meshBasicMaterial
                    color="#ffffff"
                    depthTest={false}
                    transparent
                    opacity={0.9}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
            </group>
          );
        })}
    </>
  );
}

export function EditorScene({
  modelUrl,
  nodes,
  edges,
  floor,
  floorElevation,
  isolateMaxY,
  selectedId,
  onPickSurface,
  onPickNode,
}: EditorSceneProps) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 40, 30], fov: 50, near: 0.1, far: 1200 }}
      dpr={[1, 2]}
      style={{
        background:
          'radial-gradient(ellipse at center, #0a1322 0%, #05080f 100%)',
      }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[20, 60, 10]} intensity={0.7} />

      <Suspense fallback={null}>
        {/* Модель — только визуальная подложка (без обработчиков → не ловит raycast) */}
        <BuildingModel url={modelUrl} mode="xray" maxVisibleY={isolateMaxY} />
      </Suspense>

      {/* Невидимая плоскость пола: ловит клики и даёт координаты этажа */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-12, floorElevation + 0.02, 50]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > DRAG_PX) return;
          e.stopPropagation();
          onPickSurface({ x: e.point.x, y: floorElevation, z: e.point.z });
        }}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Сетка-ориентир на уровне пола */}
      <gridHelper
        args={[400, 80, '#16384a', '#0c2030']}
        position={[-12, floorElevation + 0.03, 50]}
      />

      <EdgeLines nodes={nodes} edges={edges} floor={floor} />
      <NodeMarkers
        nodes={nodes}
        floor={floor}
        selectedId={selectedId}
        onPickNode={onPickNode}
      />

      <CameraRig floor={floor} nodes={nodes} floorElevation={floorElevation} />
    </Canvas>
  );
}
