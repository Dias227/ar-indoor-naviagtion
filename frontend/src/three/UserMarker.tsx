/**
 * 3D-маркер пользователя: светящаяся точка с конусом направления
 * и пульсирующим кольцом (как в Google Maps AR).
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '@/types';

interface UserMarkerProps {
  position: Vec3;
  heading: number;
  color?: string;
}

export function UserMarker({ position, heading, color = '#aaff00' }: UserMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      // Плавное следование за позицией — без рывков
      groupRef.current.position.lerp(
        new THREE.Vector3(position.x, position.y + 0.1, position.z),
        0.25,
      );
      groupRef.current.rotation.y = heading;
    }
    if (ringRef.current) {
      const s = 1 + 0.25 * Math.sin(t * 4);
      ringRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Конус направления взгляда */}
      <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.3, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <ringGeometry args={[0.3, 0.38, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
