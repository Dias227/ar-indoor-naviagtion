"""Админ-эндпоинты: редактирование зданий, помещений, графа,
загрузка GLB-моделей. Сохранение — в Firestore (или локальный JSON).
"""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from database.store import get_store
from models.schemas import BuildingData, NavEdge, NavNode, Room

router = APIRouter(prefix="/admin", tags=["admin"])

UPLOADS_DIR = Path(__file__).parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _require_building(building_id: str) -> BuildingData:
    data = get_store().get_building(building_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Здание не найдено")
    return data


@router.put("/buildings/{building_id}")
def save_building(building_id: str, data: BuildingData) -> dict[str, str]:
    """Полное сохранение здания (граф + помещения + метаданные)."""
    if data.building.id != building_id:
        raise HTTPException(status_code=400, detail="ID здания не совпадает")
    get_store().save_building(data)
    return {"status": "saved"}


@router.put("/buildings/{building_id}/rooms")
def upsert_room(building_id: str, room: Room) -> dict[str, str]:
    """Добавление или изменение помещения."""
    data = _require_building(building_id)
    data.rooms = [r for r in data.rooms if r.id != room.id] + [room]
    get_store().save_building(data)
    return {"status": "saved"}


@router.delete("/buildings/{building_id}/rooms/{room_id}")
def delete_room(building_id: str, room_id: str) -> dict[str, str]:
    """Удаление помещения."""
    data = _require_building(building_id)
    data.rooms = [r for r in data.rooms if r.id != room_id]
    get_store().save_building(data)
    return {"status": "deleted"}


@router.put("/buildings/{building_id}/nodes")
def upsert_node(building_id: str, node: NavNode) -> dict[str, str]:
    """Добавление или изменение точки маршрута."""
    data = _require_building(building_id)
    data.nodes = [n for n in data.nodes if n.id != node.id] + [node]
    get_store().save_building(data)
    return {"status": "saved"}


@router.delete("/buildings/{building_id}/nodes/{node_id}")
def delete_node(building_id: str, node_id: str) -> dict[str, str]:
    """Удаление точки и всех её рёбер."""
    data = _require_building(building_id)
    data.nodes = [n for n in data.nodes if n.id != node_id]
    data.edges = [e for e in data.edges if e.from_ != node_id and e.to != node_id]
    get_store().save_building(data)
    return {"status": "deleted"}


@router.put("/buildings/{building_id}/edges")
def upsert_edge(building_id: str, edge: NavEdge) -> dict[str, str]:
    """Соединение точек (создание/изменение ребра)."""
    data = _require_building(building_id)
    node_ids = {n.id for n in data.nodes}
    if edge.from_ not in node_ids or edge.to not in node_ids:
        raise HTTPException(status_code=422, detail="Узлы ребра не существуют")
    data.edges = [e for e in data.edges if e.id != edge.id] + [edge]
    get_store().save_building(data)
    return {"status": "saved"}


@router.delete("/buildings/{building_id}/edges/{edge_id}")
def delete_edge(building_id: str, edge_id: str) -> dict[str, str]:
    """Удаление ребра."""
    data = _require_building(building_id)
    data.edges = [e for e in data.edges if e.id != edge_id]
    get_store().save_building(data)
    return {"status": "deleted"}


@router.post("/buildings/{building_id}/model")
def upload_model(building_id: str, file: UploadFile) -> dict[str, str]:
    """Загрузка новой GLB-модели здания."""
    if not (file.filename or "").lower().endswith(".glb"):
        raise HTTPException(status_code=422, detail="Ожидается файл .glb")

    data = _require_building(building_id)
    filename = f"{building_id}-{uuid.uuid4().hex[:8]}.glb"
    target = UPLOADS_DIR / filename
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    model_url = f"/api/models/{filename}"
    data.building.modelUrl = model_url
    get_store().save_building(data)
    return {"modelUrl": model_url}
