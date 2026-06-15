# AR Indoor Navigation

Веб-приложение навигации внутри здания: пользователь выбирает точки «Откуда»
и «Куда», включается камера смартфона, и на полу появляется светящаяся
неоновая линия маршрута в стиле Need for Speed.

Здание — реальная 3D-модель `SampleScene.glb` (Unity-экспорт колледжа).
Граф навигации построен по результатам анализа модели: входная зона, холл,
актовый зал, северное крыло с кабинетами, лестница на верхние этажи,
длинный коридор с отделом кадров, бухгалтерией и столовой.

## Запуск

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

Backend опционален: при его недоступности frontend работает полностью
офлайн на встроенных данных здания (PWA + localStorage).

### Firebase Firestore

Положите ключ сервисного аккаунта в `backend/firebase/serviceAccount.json`
(или задайте `GOOGLE_APPLICATION_CREDENTIALS`). Без ключа backend прозрачно
использует локальное JSON-хранилище `backend/data/db.json` — данные и API
идентичны.

### Тесты навигации

```bash
cd frontend
npm run test:nav     # A*: все 35 обязательных пар маршрутов, инструкции, прогресс
npm run seed:export  # синхронизация seed-данных с backend
```

## Использование на телефоне

1. Откройте `http://<IP-компьютера>:5173` с телефона в той же сети
   (для камеры/WebXR нужен HTTPS или localhost — удобно пробросить
   через `npx vite --host` + туннель, например `cloudflared`/`ngrok`).
2. Выберите «Откуда» и «Куда» → откроется AR-режим.
3. **Android (Chrome, WebXR):** наведите камеру на пол, тапните —
   маршрут привяжется к полу (hit-testing + XRAnchor, не дрожит).
4. **iPhone (Safari):** автоматически включается fallback-режим:
   камера + гироскоп, позиция обновляется QR-маркерами и демо-проходом.
5. Голосовые подсказки: «Идите прямо», «Через 10 метров поверните налево»,
   «Поднимитесь на второй этаж», «Вы прибыли в пункт назначения».

### QR-маркеры позиционирования

Распечатайте QR-коды с содержимым `arnav:node:<id>` (id точек — в
админ-панели, вкладка «Граф»). Сканирование в AR-режиме мгновенно
фиксирует позицию пользователя и пересчитывает маршрут.

## Возможности

- **A\* pathfinding** — граф Node/Edge/Waypoint, 4 этажа, лестницы и лифты,
  альтернативные маршруты, автоматический пересчёт при отклонении от пути;
- **NFS-маршрут** — TubeGeometry по CatmullRomCurve3, ShaderMaterial
  (бегущие полосы, шевроны, пульсация), Bloom, частицы, стрелки направления,
  маяк назначения;
- **AR** — WebXR (hit-test, anchors, dom-overlay), world tracking,
  fallback для iOS (камера + deviceorientation);
- **Компьютерное зрение** — QR-детект (jsQR) → visual positioning;
- **Голосовой помощник** — Web Speech API (ru-RU), вкл/выкл в настройках;
- **Миникарта** — 2D-вид сверху: позиция, маршрут, прогресс %, остаток метров;
- **Страницы** — главная, выбор здания/точек, AR-камера, карта, история,
  избранное, настройки, админ-панель, о приложении;
- **Админ-панель** — помещения, точки и рёбра (2D-редактор графа), этажи,
  загрузка GLB, сохранение в Firebase;
- **PWA** — офлайн-режим, установка на домашний экран, кэш GLB-модели.

## Архитектура

```
frontend/src/
  algorithms/astar/   A* + очередь с приоритетом
  navigation/         граф, построитель маршрутов, данные здания из GLB
  three/              NFS-линия, шейдеры, Bloom, модель здания, маркеры
  ar/                 WebXR-сцена, fallback-AR, утилиты
  cv/                 QR-сканер (visual positioning)
  store/              Zustand: навигация, настройки, история
  services/           REST API (offline-first), localStorage
  hooks/              голос, QR, симуляция движения
  components/         glassmorphism UI, миникарта
  pages/              11 страниц приложения
backend/
  routers/            здания, маршруты, история
  admin/              CRUD графа, загрузка GLB
  database/           Firestore + локальный JSON-фолбэк (Repository)
  firebase/           инициализация Admin SDK
  utils/              серверный A*
  models/             Pydantic-схемы
```

## Стек

React 18 · TypeScript · Vite · TailwindCSS · Zustand · Framer Motion ·
Three.js · React Three Fiber · Drei · postprocessing (Bloom) · WebXR ·
jsQR · Web Speech API · vite-plugin-pwa · FastAPI · Pydantic v2 ·
Firebase Firestore
