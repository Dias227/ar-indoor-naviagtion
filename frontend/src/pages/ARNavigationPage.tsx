/**
 * Страница AR-навигации — ядро приложения.
 *
 * Оркестрация:
 *  - проверка поддержки WebXR → ARScene (hit-test, anchors) либо
 *    FallbackAR (камера + гироскоп) для iOS/десктопа;
 *  - DOM-оверлей: инструкция текущего шага, компактная миникарта,
 *    прогресс, голос вкл/выкл, выход;
 *  - голосовые подсказки шагов маршрута;
 *  - экран прибытия.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { ARSessionState } from '@/types';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRouteVoiceAnnouncements } from '@/hooks/useVoiceGuidance';
import { useFallbackStepTracking } from '@/hooks/useFallbackStepTracking';
import { isImmersiveARSupported } from '@/ar/webxr';
import { ARScene } from '@/ar/ARScene';
import { FallbackAR } from '@/ar/FallbackAR';
import { Minimap } from '@/components/Minimap';
import { LocationFixBar } from '@/components/LocationFixBar';
import { NeonButton } from '@/components/NeonButton';

export function ARNavigationPage() {
  const navigate = useNavigate();
  const route = useNavigationStore((s) => s.route);
  const startRoom = useNavigationStore((s) => s.startRoom);
  const endRoom = useNavigationStore((s) => s.endRoom);
  const currentStep = useNavigationStore((s) => s.currentStep);
  const progress = useNavigationStore((s) => s.progress);
  const arrived = useNavigationStore((s) => s.arrived);
  const adjustCalibrationHeading = useNavigationStore(
    (s) => s.adjustCalibrationHeading,
  );
  const resetARCalibration = useNavigationStore((s) => s.resetARCalibration);
  const lastFix = useNavigationStore((s) => s.lastFix);
  const { voiceEnabled, showMinimap, update } = useSettingsStore();

  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [arState, setArState] = useState<ARSessionState>('idle');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Голосовые подсказки
  useRouteVoiceAnnouncements();
  useFallbackStepTracking(xrSupported === false && arState === 'fallback');

  // Определение поддержки WebXR
  useEffect(() => {
    void isImmersiveARSupported().then(setXrSupported);
  }, []);

  const handleCameraReady = useCallback((ok: boolean) => {
    setArState(ok ? 'fallback' : 'error');
  }, []);

  // Нет маршрута — отправляем на выбор точек
  useEffect(() => {
    if (!route) navigate('/select-start', { replace: true });
  }, [route, navigate]);

  if (!route) return null;

  const usingXR = xrSupported === true;

  return (
    <div className="fixed inset-0 bg-black">
      {/* AR-слой */}
      {xrSupported === null && (
        <div className="flex h-full items-center justify-center">
          <p className="animate-pulse text-white/60">Проверка AR…</p>
        </div>
      )}
      {usingXR && (
        <ARScene
          overlayRoot={overlayRef.current}
          onStateChange={setArState}
          onSessionEnd={() => navigate('/map')}
        />
      )}
      {xrSupported === false && (
        <FallbackAR onCameraReady={handleCameraReady} />
      )}

      {/* ── DOM-оверлей ── */}
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10">
        {/* Верх: статус и инструкция */}
        <div className="safe-top px-4 pt-3">
          <AnimatePresence mode="wait">
            {arState === 'scanning-floor' && (
              <Banner key="scan" color="text-neon">
                {lastFix
                  ? 'Наведите камеру на пол и коснитесь экрана, чтобы привязать маршрут'
                  : 'Наведите на пол и коснитесь экрана. Позицию можно уточнить кнопкой 📍 внизу'}
              </Banner>
            )}
            {arState === 'requesting' && (
              <Banner key="req" color="text-white/70">
                Запуск AR-сессии…
              </Banner>
            )}
            {arState === 'error' && (
              <Banner key="err" color="text-accent-pink">
                Камера недоступна. Разрешите доступ или откройте «Карту».
              </Banner>
            )}
            {(arState === 'tracking' || arState === 'fallback') &&
              currentStep &&
              !arrived && (
                <Banner key={currentStep.instruction} color="text-white">
                  <span className="mr-2 text-xl">
                    {maneuverIcon(currentStep.maneuver)}
                  </span>
                  {currentStep.instruction}
                </Banner>
              )}
          </AnimatePresence>

          {/* Маршрут: откуда → куда */}
          <div className="mx-auto mt-2 w-fit rounded-full border border-white/10 bg-black/50 px-4 py-1.5 text-xs text-white/70 backdrop-blur-md">
            {startRoom?.name} → <span className="text-neon">{endRoom?.name}</span>
          </div>
        </div>

        {/* Левый верх: ручная подстройка WebXR-калибровки */}
        {usingXR && (arState === 'tracking' || arState === 'scanning-floor') && (
          <div className="absolute left-3 top-24 pointer-events-auto flex gap-1.5">
            <HeadingBtn
              label="Повернуть влево"
              onClick={() => adjustCalibrationHeading(-15)}
            >
              ↺
            </HeadingBtn>
            <HeadingBtn label="Сброс AR" onClick={() => resetARCalibration()}>
              ⟲
            </HeadingBtn>
            <HeadingBtn
              label="Повернуть вправо"
              onClick={() => adjustCalibrationHeading(15)}
            >
              ↻
            </HeadingBtn>
          </div>
        )}

        {/* Правый верх: миникарта */}
        {showMinimap && (
          <div className="absolute right-3 top-24 pointer-events-auto">
            <Minimap compact className="relative" />
          </div>
        )}

        {/* Низ: прогресс + управление */}
        <div className="absolute bottom-0 left-0 right-0 safe-bottom pointer-events-auto px-4 pb-4">
          {/* Прогресс-бар */}
          <div className="glass-strong mb-3 px-4 py-3">
            <div className="mb-1.5 flex justify-between text-xs text-white/60">
              <span>{Math.round(progress.fraction * 100)}% пройдено</span>
              <span>
                осталось{' '}
                <b className="neon-text">{progress.remaining.toFixed(0)} м</b>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-neon shadow-neon transition-all"
                style={{ width: `${progress.fraction * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <RoundBtn onClick={() => navigate('/map')} label="Карта">🗺</RoundBtn>
            <RoundBtn
              active={voiceEnabled}
              onClick={() => update({ voiceEnabled: !voiceEnabled })}
              label="Голос"
            >
              {voiceEnabled ? '🔊' : '🔇'}
            </RoundBtn>

            <div className="flex flex-col items-center gap-1">
              <LocationFixBar compact />
            </div>
            <RoundBtn onClick={() => navigate('/')} label="Выход">✕</RoundBtn>
          </div>
        </div>

        {/* Экран прибытия */}
        <AnimatePresence>
          {arrived && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.8, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                className="glass-strong mx-6 max-w-sm p-8 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neon/15 text-4xl shadow-neon"
                >
                  🏁
                </motion.div>
                <h2 className="font-display text-2xl font-bold">Вы на месте!</h2>
                <p className="mt-2 text-sm text-white/60">
                  {endRoom?.name} · пройдено{' '}
                  {route.totalDistance.toFixed(0)} м
                </p>
                <div className="mt-6 flex gap-3">
                  <NeonButton full onClick={() => navigate('/')}>
                    Готово
                  </NeonButton>
                  <NeonButton
                    full
                    variant="ghost"
                    onClick={() => {
                      useNavigationStore.getState().swapPoints();
                      useNavigationStore.getState().computeRoute();
                    }}
                  >
                    Обратно
                  </NeonButton>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Баннер инструкции вверху экрана. */
function Banner({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className={`glass-strong mx-auto flex max-w-md items-center justify-center px-5 py-3.5 text-center text-sm font-semibold ${color}`}
    >
      {children}
    </motion.div>
  );
}

/** Круглая кнопка поворота AR-маршрута. */
function HeadingBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-lg backdrop-blur-md active:scale-90"
    >
      {children}
    </button>
  );
}

/** Круглая кнопка управления. */
function RoundBtn({
  children,
  onClick,
  label,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 active:scale-90 transition-transform`}
      aria-label={label}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg backdrop-blur-md ${
          active
            ? 'border-neon/60 bg-neon/20 text-neon shadow-neon'
            : 'border-white/15 bg-black/40 text-white/80'
        }`}
      >
        {children}
      </span>
      <span className="text-[10px] text-white/50">{label}</span>
    </button>
  );
}

/** Иконка манёвра. */
function maneuverIcon(m: string): string {
  const icons: Record<string, string> = {
    start: '🧭',
    straight: '⬆️',
    'turn-left': '⬅️',
    'turn-right': '➡️',
    'slight-left': '↖️',
    'slight-right': '↗️',
    'stairs-up': '🪜',
    'stairs-down': '🪜',
    'elevator-up': '🛗',
    'elevator-down': '🛗',
    arrive: '🏁',
  };
  return icons[m] ?? '🧭';
}
