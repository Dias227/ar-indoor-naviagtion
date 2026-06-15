/**
 * Каркас страницы: шапка с кнопкой «назад», заголовок,
 * анимированный контент, нижняя навигация.
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  actions?: ReactNode;
}

export function PageShell({ title, subtitle, children, back = true, actions }: PageShellProps) {
  const navigate = useNavigate();
  return (
    <div className="app-bg min-h-full flex flex-col">
      <header className="safe-top sticky top-0 z-30 backdrop-blur-xl bg-ink-950/70 border-b border-white/5">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {back && (
            <button
              onClick={() => navigate(-1)}
              className="glass flex h-10 w-10 items-center justify-center text-lg text-white/80 active:scale-90 transition-transform"
              aria-label="Назад"
            >
              ←
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="truncate font-display text-lg font-bold tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-white/50">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
      </header>
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-28"
      >
        {children}
      </motion.main>
      <BottomNav />
    </div>
  );
}

/** Нижняя навигация (стеклянный док). */
export function BottomNav() {
  const navigate = useNavigate();
  const items = [
    { to: '/', icon: '⌂', label: 'Главная' },
    { to: '/map', icon: '🗺', label: 'Карта' },
    { to: '/ar', icon: '◎', label: 'AR' },
    { to: '/favorites', icon: '★', label: 'Избранное' },
    { to: '/settings', icon: '⚙', label: 'Настройки' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 safe-bottom px-4 pb-2">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {items.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-white/70 transition-all active:scale-90 hover:text-neon ${
              location.pathname === item.to ? 'text-neon' : ''
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
