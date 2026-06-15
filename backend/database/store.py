"""Слой данных: Firebase Firestore с прозрачным локальным фолбэком.

Архитектура (Repository pattern):
- `DataStore` — абстрактный интерфейс репозитория;
- `FirestoreStore` — продакшн-реализация поверх Firestore
  (коллекции `buildings`, `history`);
- `LocalJSONStore` — файловое хранилище для разработки/офлайна
  (backend/data/db.json, сидируется из seed.json).

Выбор реализации происходит один раз при старте (см. get_store).
"""
from __future__ import annotations

import json
import logging
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from models.schemas import BuildingData, HistoryEntry

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
SEED_FILE = DATA_DIR / "seed.json"
DB_FILE = DATA_DIR / "db.json"


class DataStore(ABC):
    """Интерфейс репозитория данных приложения."""

    @abstractmethod
    def list_buildings(self) -> list[BuildingData]: ...

    @abstractmethod
    def get_building(self, building_id: str) -> Optional[BuildingData]: ...

    @abstractmethod
    def save_building(self, data: BuildingData) -> None: ...

    @abstractmethod
    def add_history(self, entry: HistoryEntry) -> None: ...

    @abstractmethod
    def list_history(self, limit: int = 100) -> list[HistoryEntry]: ...


def _load_seed() -> list[BuildingData]:
    """Стартовые данные здания (общие с frontend)."""
    if SEED_FILE.exists():
        raw = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        return [BuildingData.model_validate(b) for b in raw]
    logger.warning("seed.json не найден — пустая база")
    return []


class LocalJSONStore(DataStore):
    """Потокобезопасное файловое JSON-хранилище."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if DB_FILE.exists():
            raw = json.loads(DB_FILE.read_text(encoding="utf-8"))
            self._buildings = {
                b["building"]["id"]: BuildingData.model_validate(b)
                for b in raw.get("buildings", [])
            }
            self._history = [
                HistoryEntry.model_validate(h) for h in raw.get("history", [])
            ]
        else:
            seed = _load_seed()
            self._buildings = {b.building.id: b for b in seed}
            self._history = []
            self._flush()

    def _flush(self) -> None:
        DB_FILE.write_text(
            json.dumps(
                {
                    "buildings": [
                        b.model_dump(by_alias=True) for b in self._buildings.values()
                    ],
                    "history": [h.model_dump() for h in self._history],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    def list_buildings(self) -> list[BuildingData]:
        return list(self._buildings.values())

    def get_building(self, building_id: str) -> Optional[BuildingData]:
        return self._buildings.get(building_id)

    def save_building(self, data: BuildingData) -> None:
        with self._lock:
            self._buildings[data.building.id] = data
            self._flush()

    def add_history(self, entry: HistoryEntry) -> None:
        with self._lock:
            self._history.insert(0, entry)
            self._history = self._history[:500]
            self._flush()

    def list_history(self, limit: int = 100) -> list[HistoryEntry]:
        return self._history[:limit]


class FirestoreStore(DataStore):
    """Репозиторий поверх Firebase Firestore."""

    def __init__(self, client: object) -> None:
        self._db = client
        # Сидирование пустой базы
        if not list(self._db.collection("buildings").limit(1).stream()):
            for b in _load_seed():
                self.save_building(b)
            logger.info("Firestore засеян стартовыми данными")

    def list_buildings(self) -> list[BuildingData]:
        docs = self._db.collection("buildings").stream()
        return [BuildingData.model_validate(d.to_dict()) for d in docs]

    def get_building(self, building_id: str) -> Optional[BuildingData]:
        doc = self._db.collection("buildings").document(building_id).get()
        return BuildingData.model_validate(doc.to_dict()) if doc.exists else None

    def save_building(self, data: BuildingData) -> None:
        self._db.collection("buildings").document(data.building.id).set(
            data.model_dump(by_alias=True)
        )

    def add_history(self, entry: HistoryEntry) -> None:
        self._db.collection("history").document(entry.id).set(entry.model_dump())

    def list_history(self, limit: int = 100) -> list[HistoryEntry]:
        docs = (
            self._db.collection("history")
            .order_by("startedAt", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        return [HistoryEntry.model_validate(d.to_dict()) for d in docs]


_store: Optional[DataStore] = None


def get_store() -> DataStore:
    """Singleton-доступ к хранилищу: Firestore либо локальный JSON."""
    global _store
    if _store is None:
        from firebase.client import init_firestore

        client = init_firestore()
        _store = FirestoreStore(client) if client is not None else LocalJSONStore()
        logger.info("Хранилище: %s", type(_store).__name__)
    return _store
