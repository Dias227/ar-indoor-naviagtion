/**
 * Постобработка сцены: Bloom (аналог UnrealBloomPass из пакета
 * postprocessing — selective bloom по яркости) + виньетка.
 * Интенсивность управляется из настроек приложения.
 */
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useSettingsStore } from '@/store/useSettingsStore';

export function Effects({ enabled = true }: { enabled?: boolean }) {
  const bloomIntensity = useSettingsStore((s) => s.bloomIntensity);
  const highQuality = useSettingsStore((s) => s.highQuality);

  if (!enabled || !highQuality) return null;

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.35}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={0.72}
      />
      <Vignette eskil={false} offset={0.18} darkness={0.78} />
    </EffectComposer>
  );
}
