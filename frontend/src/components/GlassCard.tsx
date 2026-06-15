/**
 * Стеклянная карточка с blur-эффектом и анимацией появления.
 * Базовый строительный блок интерфейса (Apple Vision Pro style).
 */
import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  strong?: boolean;
  delay?: number;
}

export function GlassCard({
  children,
  strong = false,
  delay = 0,
  className = '',
  ...rest
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 0.9, 0.3, 1] }}
      className={`${strong ? 'glass-strong' : 'glass'} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
