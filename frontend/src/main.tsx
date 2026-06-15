/**
 * Точка входа: монтирование React-приложения и регистрация
 * service worker (PWA, офлайн-режим).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Автообновление service worker при выходе новой версии
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
