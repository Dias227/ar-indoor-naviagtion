/**
 * Загрузка и отображение GLB-модели здания (collehenavnewblender.glb).
 *
 * Режимы:
 *  - 'solid'  — модель как есть (предпросмотр);
 *  - 'xray'   — полупрозрачный каркас в неоновых тонах для миникарты
 *               и редактора, чтобы маршрут читался сквозь стены.
 *
 * Модель тяжёлая (~85 МБ), поэтому грузится через useGLTF с suspense
 * и кэшируется service worker'ом для офлайн-режима.
 */
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface BuildingModelProps {
  url: string;
  mode?: 'solid' | 'xray';
  /** Скрыть этажи выше указанного (для просмотра интерьера). */
  maxVisibleY?: number;
}

export function BuildingModel({ url, mode = 'solid', maxVisibleY }: BuildingModelProps) {
  const { scene } = useGLTF(url);

  const prepared = useMemo(() => {
    const clone = scene.clone(true);

    const xrayMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#10405a'),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const xrayEdgeColor = new THREE.Color('#1f6e8c');

    clone.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;

      // Текстовые TMP-метки, служебные ноды Unity и маркеры навигации Blender
      if (obj.name.includes('TMP') || obj.name.includes('Text') || isNavMarkerMesh(obj.name)) {
        obj.visible = false;
        return;
      }

      if (maxVisibleY !== undefined) {
        const box = new THREE.Box3().setFromObject(obj);
        if (box.min.y > maxVisibleY) {
          obj.visible = false;
          return;
        }
      }

      if (mode === 'xray') {
        obj.material = xrayMaterial;
        // Светящиеся рёбра для читаемости геометрии.
        // Только для умеренно тяжёлых мешей: EdgesGeometry на огромной
        // геометрии блокирует главный поток на секунды.
        const triangles =
          (obj.geometry.index?.count ?? obj.geometry.attributes.position?.count ?? 0) / 3;
        if (triangles > 0 && triangles < 60_000) {
          const edges = new THREE.EdgesGeometry(obj.geometry, 28);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
              color: xrayEdgeColor,
              transparent: true,
              opacity: 0.35,
            }),
          );
          obj.add(line);
        }
      } else {
        obj.castShadow = false;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, mode, maxVisibleY]);

  return <primitive object={prepared} />;
}

/** Маркеры дверей из Blender (меш-сферы с номерами кабинетов и POI). */
function isNavMarkerMesh(name: string): boolean {
  if (name === 'Пустышка' || name === 'Сфера') return true;
  if (/^\d{1,3}$/.test(name.trim())) return true;
  return /столов|гардер|спорт|акт|библи|бухгал|кадр|ресеп/i.test(name);
}

/** Предзагрузка модели (вызывается на странице выбора здания). */
export function preloadBuildingModel(url: string): void {
  useGLTF.preload(url);
}
