/**
 * Неоновая линия маршрута в стиле Need for Speed.
 *
 * Состав:
 *  - TubeGeometry по CatmullRomCurve3 (плавные изгибы) + ShaderMaterial
 *    с бегущими полосами, шевронами и пульсацией;
 *  - плоская «подсветка» на полу (широкая лента) для эффекта отражения;
 *  - 3D-стрелки направления (конусы), скользящие вдоль кривой;
 *  - поток частиц вдоль маршрута.
 *
 * Свечение даёт Bloom-пасс на уровне сцены (см. Effects.tsx).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RouteResult } from '@/types';
import {
  particleFragmentShader,
  particleVertexShader,
  routeFragmentShader,
  routeVertexShader,
} from './shaders/routeShader';

interface RouteLineProps {
  route: RouteResult;
  color?: string;
  /** Доля пройденного маршрута [0..1] — пройденная часть затемняется. */
  progress?: number;
  /** Поднятие линии над полом, м. */
  floorOffset?: number;
  /** Радиус трубы, м. */
  radius?: number;
  showParticles?: boolean;
}

/** Построение сглаженной кривой по точкам маршрута. */
export function useRouteCurve(route: RouteResult, floorOffset = 0.06) {
  return useMemo(() => {
    const pts = route.points.map(
      (p) => new THREE.Vector3(p.x, p.y + floorOffset, p.z),
    );
    if (pts.length < 2) return null;
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.35);
  }, [route, floorOffset]);
}

export function RouteLine({
  route,
  color = '#00e5ff',
  progress = 0,
  floorOffset = 0.06,
  radius = 0.14,
  showParticles = true,
}: RouteLineProps) {
  const curve = useRouteCurve(route, floorOffset);
  const tubeMatRef = useRef<THREE.ShaderMaterial>(null);
  const glowMatRef = useRef<THREE.ShaderMaterial>(null);
  const particleMatRef = useRef<THREE.ShaderMaterial>(null);

  const colorVec = useMemo(() => new THREE.Color(color), [color]);

  // ── Геометрия трубы ──
  const tubeGeometry = useMemo(() => {
    if (!curve) return null;
    const segments = Math.min(1200, Math.max(120, Math.floor(route.totalDistance * 8)));
    return new THREE.TubeGeometry(curve, segments, radius, 10, false);
  }, [curve, radius, route.totalDistance]);

  // ── Широкая лента-подсветка на полу ──
  const ribbonGeometry = useMemo(() => {
    if (!curve) return null;
    const segments = Math.min(900, Math.max(100, Math.floor(route.totalDistance * 6)));
    const halfWidth = radius * 4.2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (side.lengthSq() < 0.001) side.set(1, 0, 0);
      positions.push(
        p.x - side.x * halfWidth, p.y - floorOffset + 0.02, p.z - side.z * halfWidth,
        p.x + side.x * halfWidth, p.y - floorOffset + 0.02, p.z + side.z * halfWidth,
      );
      uvs.push(t, 0, t, 1);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [curve, radius, floorOffset, route.totalDistance]);

  // ── Частицы вдоль маршрута ──
  const particles = useMemo(() => {
    if (!curve || !showParticles) return null;
    const count = Math.min(400, Math.max(60, Math.floor(route.totalDistance * 3)));
    const positions = new Float32Array(count * 3);
    const offsets = new Float32Array(count);
    const scales = new Float32Array(count);
    const sides = new Float32Array(count);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const lateral = (Math.random() - 0.5) * radius * 6;
      positions[i * 3] = p.x + side.x * lateral;
      positions[i * 3 + 1] = p.y + 0.05 + Math.random() * 0.5;
      positions[i * 3 + 2] = p.z + side.z * lateral;
      offsets[i] = t;
      scales[i] = 0.6 + Math.random() * 1.4;
      sides[i] = Math.sign(lateral);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    return geo;
  }, [curve, showParticles, radius, route.totalDistance]);

  // ── Стрелки направления (конусы вдоль кривой) ──
  const arrowData = useMemo(() => {
    if (!curve) return [];
    const spacing = 3.0; // метров между стрелками
    const count = Math.max(2, Math.floor(route.totalDistance / spacing));
    const arr: { position: THREE.Vector3; quaternion: THREE.Quaternion; t: number }[] = [];
    const coneForward = new THREE.Vector3(0, 1, 0); // конус «смотрит» вдоль +Y

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(coneForward, tangent);
      arr.push({ position: p.clone().add(new THREE.Vector3(0, 0.12, 0)), quaternion: q, t });
    }
    return arr;
  }, [curve, route.totalDistance]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (tubeMatRef.current) {
      tubeMatRef.current.uniforms.uTime.value = t;
      tubeMatRef.current.uniforms.uProgress.value = progress;
    }
    if (glowMatRef.current) {
      glowMatRef.current.uniforms.uTime.value = t;
      glowMatRef.current.uniforms.uProgress.value = progress;
    }
    if (particleMatRef.current) {
      particleMatRef.current.uniforms.uTime.value = t;
    }
  });

  if (!curve || !tubeGeometry) return null;

  const sharedUniforms = {
    uTime: { value: 0 },
    uColor: { value: colorVec },
    uLength: { value: route.totalDistance },
    uProgress: { value: progress },
  };

  return (
    <group>
      {/* Основная неоновая труба */}
      <mesh geometry={tubeGeometry} renderOrder={10}>
        <shaderMaterial
          ref={tubeMatRef}
          vertexShader={routeVertexShader}
          fragmentShader={routeFragmentShader}
          uniforms={{ ...structuredCloneUniforms(sharedUniforms), uOpacity: { value: 1.0 } }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Лента-отражение на полу */}
      {ribbonGeometry && (
        <mesh geometry={ribbonGeometry} renderOrder={9}>
          <shaderMaterial
            ref={glowMatRef}
            vertexShader={routeVertexShader}
            fragmentShader={routeFragmentShader}
            uniforms={{ ...structuredCloneUniforms(sharedUniforms), uOpacity: { value: 0.35 } }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Стрелки направления */}
      {arrowData.map((a, i) => (
        <mesh
          key={i}
          position={a.position}
          quaternion={a.quaternion}
          renderOrder={11}
        >
          <coneGeometry args={[0.13, 0.34, 6]} />
          <meshBasicMaterial
            color={colorVec}
            transparent
            opacity={a.t < progress ? 0.15 : 0.95}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Частицы */}
      {particles && (
        <points geometry={particles} renderOrder={12}>
          <shaderMaterial
            ref={particleMatRef}
            vertexShader={particleVertexShader}
            fragmentShader={particleFragmentShader}
            uniforms={{
              uTime: { value: 0 },
              uColor: { value: colorVec },
              uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {/* Маркер финиша: пульсирующее кольцо */}
      <DestinationBeacon
        position={curve.getPointAt(1)}
        color={colorVec}
      />
    </group>
  );
}

/** Клонирование объекта uniforms (у каждого материала свой набор). */
function structuredCloneUniforms(
  u: Record<string, { value: unknown }>,
): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {};
  for (const k of Object.keys(u)) out[k] = { value: u[k].value };
  return out;
}

/** Пульсирующий маяк в точке назначения. */
function DestinationBeacon({
  position,
  color,
}: {
  position: THREE.Vector3;
  color: THREE.Color;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const pillarRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const s = 1 + 0.35 * Math.sin(t * 3);
      ringRef.current.scale.set(s, s, s);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.55 + 0.3 * Math.sin(t * 3);
    }
    if (pillarRef.current) {
      (pillarRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.25 + 0.12 * Math.sin(t * 2.2);
    }
  });

  return (
    <group position={position}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
        <ringGeometry args={[0.45, 0.62, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={pillarRef} position={[0, 1.5, 0]} renderOrder={11}>
        <cylinderGeometry args={[0.07, 0.18, 3, 12, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
