"""AR Indoor Navigation — FastAPI backend.

Запуск:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

API: /api/buildings, /api/routes, /api/history, /api/admin/*
Загруженные GLB-модели раздаются из /api/models/<file>.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from admin.router import UPLOADS_DIR, router as admin_router
from routers.buildings import router as buildings_router
from routers.history import router as history_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="AR Indoor Navigation API",
    version="1.0.0",
    description="Backend навигации внутри зданий: графы, маршруты, админка.",
)

# CORS: фронтенд работает с другого origin (Vite dev / PWA)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(buildings_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(admin_router, prefix="/api")

# Раздача загруженных GLB-моделей
app.mount("/api/models", StaticFiles(directory=str(UPLOADS_DIR)), name="models")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Проверка живости сервиса."""
    return {"status": "ok"}
