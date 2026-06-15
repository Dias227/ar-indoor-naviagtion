/**
 * Страница «О приложении»: стек, возможности, инструкция по QR-маркерам.
 */
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';

export function AboutPage() {
  const features = [
    ['◎', 'AR-маршрут', 'Светящаяся линия на полу через WebXR с hit-testing и якорями'],
    ['⚡', 'A* Pathfinding', 'Граф узлов и рёбер, несколько этажей, лестницы и лифты'],
    ['🔊', 'Голосовой помощник', 'Подсказки поворотов через Web Speech API'],
    ['🗺', 'Миникарта', 'Вид сверху: позиция, маршрут, прогресс и расстояние'],
    ['⌗', 'QR-позиционирование', 'Сканирование маркеров уточняет позицию в здании'],
    ['📱', 'PWA + офлайн', 'Работает без сети, устанавливается на домашний экран'],
  ];

  const stack = [
    'React 18 + TypeScript + Vite',
    'Three.js + React Three Fiber + Drei',
    'WebXR Device API (hit-test, anchors, dom-overlay)',
    'TailwindCSS + Framer Motion (glassmorphism)',
    'Zustand (состояние) + A* (маршрутизация)',
    'jsQR (компьютерное зрение, QR-детект)',
    'FastAPI + Firebase Firestore (backend)',
  ];

  return (
    <PageShell title="О приложении" subtitle="AR Indoor Navigation v1.0">
      <GlassCard className="p-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-neon/10 text-3xl shadow-neon">
          ◎
        </div>
        <h2 className="mt-3 font-display text-xl font-bold">AR Indoor Navigation</h2>
        <p className="mt-1 text-sm text-white/55">
          Навигация внутри здания с маршрутом на полу в стиле Need for Speed
        </p>
      </GlassCard>

      <h3 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
        Возможности
      </h3>
      <div className="flex flex-col gap-2">
        {features.map(([icon, title, desc], i) => (
          <GlassCard key={title} delay={i * 0.05} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">
              {icon}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-white/50">{desc}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <h3 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
        Технологии
      </h3>
      <GlassCard className="p-4">
        <ul className="flex flex-col gap-1.5 text-sm text-white/70">
          {stack.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className="text-neon">▸</span> {s}
            </li>
          ))}
        </ul>
      </GlassCard>

      <h3 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
        QR-маркеры позиционирования
      </h3>
      <GlassCard className="p-4 text-sm leading-relaxed text-white/60">
        Распечатайте QR-коды с содержимым{' '}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-neon">
          arnav:node:&lt;id точки&gt;
        </code>{' '}
        и разместите на стенах. При сканировании в AR-режиме позиция
        пользователя мгновенно привязывается к точке здания, а маршрут
        пересчитывается. Идентификаторы точек — в админ-панели.
      </GlassCard>
    </PageShell>
  );
}
