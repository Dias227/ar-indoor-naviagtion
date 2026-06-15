/**
 * Настройки: голос, визуальные эффекты, цвет маршрута, качество.
 */
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useVoiceGuidance } from '@/hooks/useVoiceGuidance';

const ROUTE_COLORS = ['#00e5ff', '#aaff00', '#ff2d78', '#7c4dff', '#ffaa00'];

export function SettingsPage() {
  const s = useSettingsStore();
  const { speak, supported } = useVoiceGuidance();

  return (
    <PageShell title="Настройки" subtitle="Голос, эффекты, качество">
      {/* Голос */}
      <Section title="Голосовой помощник">
        <Toggle
          label="Голосовые подсказки"
          checked={s.voiceEnabled}
          onChange={(v) => s.update({ voiceEnabled: v })}
        />
        <Slider
          label={`Скорость речи: ${s.voiceRate.toFixed(1)}×`}
          min={0.5}
          max={1.6}
          step={0.1}
          value={s.voiceRate}
          onChange={(v) => s.update({ voiceRate: v })}
        />
        <Slider
          label={`Громкость: ${Math.round(s.voiceVolume * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          value={s.voiceVolume}
          onChange={(v) => s.update({ voiceVolume: v })}
        />
        <NeonButton
          variant="ghost"
          full
          disabled={!supported || !s.voiceEnabled}
          onClick={() => speak('Через 10 метров поверните налево')}
        >
          🔊 Проверить голос
        </NeonButton>
        {!supported && (
          <p className="text-xs text-accent-pink/80">
            Web Speech API не поддерживается этим браузером
          </p>
        )}
      </Section>

      {/* Маршрут */}
      <Section title="Линия маршрута">
        <div>
          <p className="mb-2 text-sm text-white/70">Цвет неона</p>
          <div className="flex gap-3">
            {ROUTE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => s.update({ routeColor: c })}
                className={`h-10 w-10 rounded-full border-2 transition-all active:scale-90 ${
                  s.routeColor === c ? 'scale-110 border-white' : 'border-transparent'
                }`}
                style={{ background: c, boxShadow: `0 0 14px ${c}88` }}
                aria-label={`Цвет ${c}`}
              />
            ))}
          </div>
        </div>
        <Slider
          label={`Интенсивность свечения: ${s.bloomIntensity.toFixed(1)}`}
          min={0}
          max={3}
          step={0.1}
          value={s.bloomIntensity}
          onChange={(v) => s.update({ bloomIntensity: v })}
        />
        <Toggle
          label="Частицы вдоль маршрута"
          checked={s.showParticles}
          onChange={(v) => s.update({ showParticles: v })}
        />
      </Section>

      {/* Интерфейс */}
      <Section title="Интерфейс и качество">
        <Toggle
          label="Миникарта в AR-режиме"
          checked={s.showMinimap}
          onChange={(v) => s.update({ showMinimap: v })}
        />
        <Toggle
          label="Высокое качество (Bloom)"
          checked={s.highQuality}
          onChange={(v) => s.update({ highQuality: v })}
        />
      </Section>

      <NeonButton variant="danger" full className="mt-2" onClick={s.reset}>
        Сбросить настройки
      </NeonButton>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
        {title}
      </h3>
      <GlassCard className="flex flex-col gap-4 p-4">{children}</GlassCard>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-white/80">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors ${
          checked ? 'bg-neon/60 shadow-neon' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm text-white/70">{label}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#00e5ff]"
      />
    </div>
  );
}
