/**
 * Голосовой помощник на Web Speech API (speechSynthesis).
 *
 * - Озвучивает инструкции маршрута на русском языке;
 * - не дублирует одну фразу в одном «пакете» (кроме force);
 * - повторно озвучивает при повторном включении голоса;
 * - обходит зависание speechSynthesis в iOS Safari.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useNavigationStore } from '@/store/useNavigationStore';

export type SpeakOptions = { force?: boolean };

function pickVoice(lang: 'ru' | 'en'): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang === 'ru' ? 'ru' : 'en';
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
}

export function useVoiceGuidance(): {
  speak: (text: string, options?: SpeakOptions) => void;
  stop: () => void;
  supported: boolean;
} {
  const { voiceEnabled, voiceRate, voiceVolume, language } = useSettingsStore();
  const lastSpokenRef = useRef<string>('');
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // iOS Safari: голоса подгружаются асинхронно, без этого speak() может молчать.
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const prime = () => synth.getVoices();
    prime();
    synth.addEventListener('voiceschanged', prime);
    return () => synth.removeEventListener('voiceschanged', prime);
  }, [supported]);

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      if (!supported || !voiceEnabled || !text) return;
      if (!options?.force && lastSpokenRef.current === text) return;
      lastSpokenRef.current = text;

      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) synth.cancel();
      if (synth.paused) synth.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'ru' ? 'ru-RU' : 'en-US';
      utterance.rate = voiceRate;
      utterance.volume = voiceVolume;

      const target = pickVoice(language);
      if (target) utterance.voice = target;

      const release = () => {
        lastSpokenRef.current = '';
      };
      utterance.onend = release;
      utterance.onerror = release;

      // Короткая задержка помогает iOS Safari не «залипать» после cancel().
      window.setTimeout(() => {
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      }, 50);
    },
    [supported, voiceEnabled, voiceRate, voiceVolume, language],
  );

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    lastSpokenRef.current = '';
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
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const currentStep = useNavigationStore((s) => s.currentStep);
  const arrived = useNavigationStore((s) => s.arrived);
  const announcedRef = useRef<Set<string>>(new Set());
  const prevVoiceEnabledRef = useRef(voiceEnabled);

  useEffect(() => {
    const voiceJustEnabled = voiceEnabled && !prevVoiceEnabledRef.current;
    prevVoiceEnabledRef.current = voiceEnabled;

    if (!voiceEnabled) return;

    if (arrived) {
      speak('Вы прибыли в пункт назначения', { force: voiceJustEnabled });
      return;
    }
    if (!currentStep) return;

    const key = `${currentStep.maneuver}:${Math.round(currentStep.cumulativeDistance)}`;
    if (!voiceJustEnabled && announcedRef.current.has(key)) return;
    announcedRef.current.add(key);
    speak(currentStep.instruction, { force: voiceJustEnabled });
  }, [currentStep, arrived, speak, voiceEnabled]);

  const route = useNavigationStore((s) => s.route);
  useEffect(() => {
    announcedRef.current.clear();
  }, [route]);
}

/** Текст для повторного озвучивания текущего шага (кнопка 🔊). */
export function useCurrentRouteVoiceText(): string | null {
  const currentStep = useNavigationStore((s) => s.currentStep);
  const arrived = useNavigationStore((s) => s.arrived);
  if (arrived) return 'Вы прибыли в пункт назначения';
  return currentStep?.instruction ?? null;
}
