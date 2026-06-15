/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Палитра в стиле Apple Vision Pro / NFS Unbound
        ink: {
          950: '#05080f',
          900: '#090e1a',
          800: '#0e1626',
          700: '#16203a',
        },
        neon: {
          DEFAULT: '#00e5ff',
          soft: '#5ef2ff',
          deep: '#00a3c4',
        },
        accent: {
          pink: '#ff2d78',
          violet: '#7c4dff',
          lime: '#aaff00',
        },
      },
      fontFamily: {
        display: ['"SF Pro Display"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(0,229,255,.55), 0 0 42px rgba(0,229,255,.22)',
        'neon-strong':
          '0 0 18px rgba(0,229,255,.8), 0 0 64px rgba(0,229,255,.35)',
        glass: '0 8px 32px rgba(0,0,0,.45)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'pulse-neon': 'pulseNeon 2.2s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        pulseNeon: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '.72', filter: 'brightness(1.35)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
