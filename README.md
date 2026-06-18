# AR Indoor Navigation

Веб-приложение навигации внутри **Актюбинского высшего политехнического колледжа (АВПК)**.

Пользователь выбирает кабинет — приложение строит маршрут по карте здания.
При желании можно включить **AR-режим**: на полу появляется светящаяся
неоновая линия в стиле Need for Speed.

**Демо:** [https://dias227.github.io/ar-indoor-naviagtion/](https://dias227.github.io/ar-indoor-naviagtion/)

## Модель и навигация

- 3D-модель: `frontend/public/models/collehenavnewblender.glb` (экспорт из Blender)
- Маршрут по коридорам: полоска **«Плоскость»** в модели
- Кабинеты и POI: маркеры-сферы у дверей (101, 104, столовая, гардероб и т.д.)
- Граф навигации генерируется скриптом:

```bash
python3 tools/extract_nav_from_glb.py frontend/public/models/collehenavnewblender.glb
```

После правок в Blender: заменить GLB → запустить скрипт → `dataVersion` в
`tools/extract_nav_from_glb.py` увеличить на 1 (чтобы сбросить кэш в браузере).

## Запуск локально

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Backend (FastAPI, опционально)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

Backend не обязателен: frontend работает офлайн (PWA + встроенные данные здания).

### Firebase Firestore (опционально)

Ключ сервисного аккаунта: `backend/firebase/serviceAccount.json`.
Без Firebase данные берутся из `frontend/src/data/college-building.json`.

### Тесты и seed

```bash
cd frontend
npm run test:nav     # проверка маршрутов A*
npm run seed:export  # синхронизация backend/data/seed.json
```

## Как пользоваться (простой сценарий)

1. Откройте сайт на телефоне.
2. Нажмите **«Я у входа — куда идти?»**.
3. Выберите кабинет из списка.
4. Откроется **карта с маршрутом** — путь анимируется автоматически.
5. AR-камера — по ссылке «Включить камеру» на карте (нужна калибровка: навести на пол и тапнуть).

## Возможности

- **A\*** — граф узлов/рёбер, маршрут по коридорам, пересчёт при отклонении
- **NFS-маршрут** — неоновая линия, Bloom, стрелки, частицы
- **AR (WebXR)** — hit-test, якоря; fallback для iOS (камера + шаги)
- **2D-миникарта** — вид сверху, прогресс, остаток метров
- **Голос** — Web Speech API (ru-RU)
- **PWA** — офлайн, установка на домашний экран
- **Админ-панель** — редактирование графа, загрузка GLB

## Структура

```
frontend/src/
  navigation/         граф, маршруты, college-building.json
  three/              3D-модель, NFS-линия, шейдеры
  ar/                 WebXR и fallback-AR
  pages/              главная, карта, AR, выбор кабинетов
  public/brand/       логотип колледжа (college-logo.jpeg)
tools/
  extract_nav_from_glb.py   извлечение графа из GLB
backend/              FastAPI, seed.json, Firestore
```

## Стек

React 18 · TypeScript · Vite · TailwindCSS · Zustand · Three.js · R3F ·
WebXR · jsQR · Web Speech API · vite-plugin-pwa · FastAPI · Firestore
