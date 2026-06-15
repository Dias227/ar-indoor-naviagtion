/**
 * Неоновая кнопка с тактильной анимацией нажатия.
 */
import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

interface NeonButtonProps extends HTMLMotionProps<'button'> {
  children: ReactNode;
  variant?: 'neon' | 'ghost' | 'danger';
  full?: boolean;
}

export function NeonButton({
  children,
  variant = 'neon',
  full = false,
  className = '',
  ...rest
}: NeonButtonProps) {
  const base =
    variant === 'neon'
      ? 'btn-neon'
      : variant === 'danger'
        ? 'btn-ghost !text-accent-pink !border-accent-pink/30'
        : 'btn-ghost';
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      className={`${base} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
