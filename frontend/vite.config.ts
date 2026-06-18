import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

/**
 * Конфигурация Vite.
 *
 * - React + Fast Refresh
 * - PWA с офлайн-кэшированием (модели, шрифты, API)
 * - Алиас "@" на каталог src
 * - Прокси /api на FastAPI backend (порт 8000)
 */
export default defineConfig({
  // На GitHub Pages приложение публикуется по подпути /<repo>/.
  // Переменная GITHUB_ACTIONS=true выставляется автоматически в CI — тогда
  // используем подпуть; локально (dev/preview) остаётся корень '/'.
  base: process.env.GITHUB_ACTIONS ? '/ar-indoor-naviagtion/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'brand/college-logo.jpeg'],
      manifest: {
        name: 'AR Indoor Navigation',
        short_name: 'AR Nav',
        description:
          'Навигация внутри здания с AR-маршрутом на полу в стиле Need for Speed',
        theme_color: '#05080f',
        background_color: '#05080f',
        display: 'standalone',
        orientation: 'portrait',
        // Относительные пути — корректно работают и в корне, и на подпути Pages.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // GLB-модель тяжёлая — кэшируем по запросу, а не в precache
        globPatterns: ['**/*.{js,css,html,svg,png,jpeg,jpg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.glb$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'glb-models',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
