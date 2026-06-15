/**
 * Голосовой помощник на Web Speech API (speechSynthesis).
 *
 * - Озвучивает инструкции маршрута на русском языке;
 * - не повторяет одну и ту же фразу подряд;
 * - подключён к стору настроек (вкл/выкл, скорость, громкость);
 * - автоматически реагирует на смену текущего шага маршрута.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useNavigationStore } from '@/store/useNavigationStore';

export function useVoiceGuidance(): {
  speak: (text: string) => void;
  stop: () => void;
  supported: boolean;
} {
  const { voiceEnabled, voiceRate, voiceVolume, language } = useSettingsStore();
  const lastSpokenRef = useRef<string>('');
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !voiceEnabled || !text) return;
      if (lastSpokenRef.current === text) return;
      lastSpokenRef.current = text;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'ru' ? 'ru-RU' : 'en-US';
      utterance.rate = voiceRate;
      utterance.volume = voiceVolume;

      // Предпочитаем русский голос, если установлен в системе.
      const voices = window.speechSynthesis.getVoices();
      const target = voices.find((v) => v.lang.startsWith(language === 'ru' ? 'ru' : 'en'));
      if (target) utterance.voice = target;

      window.speechSynthesis.speak(utterance);
    },
    [supported, voiceEnabled, voiceRate, voiceVolume, language],
  );

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  useEffect(() => stop, [stop]);

  return { speak, stop, supported };
}

/**
 * Автоматическое озвучивание шагов активного маршрута.
 * Вызывается один раз на странице AR/карты.
 */
export function useRouteVoiceAnnouncements(): void {
  const { speak } = useVoiceGuidance();
  const currentStep = useNavigationStore((s) => s.currentStep);
  const arrived = useNavigationStore((s) => s.arrived);
  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (arrived) {
      speak('Вы прибыли в пункт назначения');
      return;
    }
    if (!currentStep) return;
    const key = `${currentStep.maneuver}:${Math.round(currentStep.cumulativeDistance)}`;
    if (announcedRef.current.has(key)) return;
    announcedRef.current.add(key);
    speak(currentStep.instruction);
  }, [currentStep, arrived, speak]);

  // Сбрасываем озвученные шаги при смене маршрута.
  const route = useNavigationStore((s) => s.route);
  useEffect(() => {
    announcedRef.current.clear();
  }, [route]);
}
