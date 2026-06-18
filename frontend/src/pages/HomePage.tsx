/**
 * Главная страница: hero-блок, быстрый запуск навигации,
 * быстрые ссылки на разделы.
 */
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { BottomNav } from '@/components/PageShell';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useHistoryStore } from '@/store/useHistoryStore';

const COLLEGE_NAME = 'Актюбинский высший политехнический колледж';
const LOGO_URL = `${
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
}brand/college-logo.svg`;

export function HomePage() {
  const navigate = useNavigate();
  const buildingData = useNavigationStore((s) => s.buildingData);
  const setStartAtEntrance = useNavigationStore((s) => s.setStartAtEntrance);
  const favorites = useHistoryStore((s) => s.favorites);
  const history = useHistoryStore((s) => s.history);

  // Простой сценарий: человек у входа жмёт «Куда идти?» → сразу выбор кабинета.
  const goFromEntrance = () => {
    const ok = setStartAtEntrance();
    navigate(ok ? '/select-end' : '/select-start');
  };

  const quickLinks = [
    { to: '/buildings', icon: '🏢', title: 'Здания', desc: 'Выбор корпуса' },
    { to: '/history', icon: '🕘', title: 'История', desc: `${history.length} маршрутов` },
    { to: '/favorites', icon: '★', title: 'Избранное', desc: `${favorites.length} сохранено` },
    { to: '/admin', icon: '🛠', title: 'Админ', desc: 'Редактор карты' },
    { to: '/about', icon: 'ℹ️', title: 'О приложении', desc: 'AR Indoor Nav' },
    { to: '/settings', icon: '⚙️', title: 'Настройки', desc: 'Голос, эффекты' },
  ];

  return (
    <div className="app-bg min-h-full pb-28">
      {/* Hero */}
      <div className="safe-top relative overflow-hidden px-5 pt-10 pb-8">
        <motion.div
          className="pointer-events-none absolute -top-24 right-[-80px] h-72 w-72 rounded-full bg-neon/10 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <img
            src={LOGO_URL}
            alt={COLLEGE_NAME}
            className="h-16 w-16 shrink-0 rounded-full border border-white/20 bg-white object-cover shadow-neon"
          />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-neon/80">
              AR Indoor Navigation
            </p>
            <p className="mt-1 max-w-[16rem] text-sm font-semibold leading-snug text-white/85">
              {COLLEGE_NAME}
            </p>
          </div>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mt-3 font-display text-4xl font-extrabold leading-tight tracking-tight"
        >
          Маршрут <span className="neon-text">на полу</span>
          <br />
          вашего здания
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18 }}
          className="mt-3 max-w-sm text-sm leading-relaxed text-white/55"
        >
          Выберите кабинет — и маршрут на карте приведёт вас от входа.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="mt-7 flex flex-col gap-2.5"
        >
          <NeonButton onClick={goFromEntrance} className="text-lg py-4">
            🚪 Я у входа — куда идти?
          </NeonButton>
          <button
            onClick={() => navigate('/select-start')}
            className="text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
          >
            Я в другом месте — выбрать старт вручную
          </button>
        </motion.div>
      </div>

      {/* Текущее здание */}
      <div className="px-5">
        <GlassCard delay={0.3} className="flex items-center gap-4 p-4">
          <img
            src={LOGO_URL}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full border border-white/15 bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-white/40">
              Текущее здание
            </p>
            <p className="truncate font-semibold">{buildingData.building.name}</p>
            <p className="truncate text-xs text-white/50">
              {buildingData.building.floors.length} этажа · {buildingData.rooms.length} помещений
            </p>
          </div>
          <button
            onClick={() => navigate('/buildings')}
            className="text-sm text-neon active:scale-95"
          >
            Сменить
          </button>
        </GlassCard>
      </div>

      {/* Быстрые ссылки */}
      <div className="mt-5 grid grid-cols-2 gap-3 px-5">
        {quickLinks.map((link, i) => (
          <GlassCard
            key={link.to}
            delay={0.34 + i * 0.05}
            className="cursor-pointer p-4 transition-colors hover:bg-white/10"
            onClick={() => navigate(link.to)}
          >
            <div className="text-2xl">{link.icon}</div>
            <p className="mt-2 font-semibold">{link.title}</p>
            <p className="text-xs text-white/45">{link.desc}</p>
          </GlassCard>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
