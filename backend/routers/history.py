"""Эндпоинты истории маршрутов."""
from __future__ import annotations

from fastapi import APIRouter

from database.store import get_store
from models.schemas import HistoryEntry

router = APIRouter(tags=["history"])


@router.get("/history", response_model=list[HistoryEntry])
def list_history(limit: int = 100) -> list[HistoryEntry]:
    """Последние записи истории (для аналитики и синхронизации)."""
    return get_store().list_history(limit=limit)


@router.post("/history", status_code=201)
def add_history(entry: HistoryEntry) -> dict[str, str]:
    """Сохранение записи истории из клиента."""
    get_store().add_history(entry)
    return {"status": "ok"}
