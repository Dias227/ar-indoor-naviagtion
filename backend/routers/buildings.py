"""Публичные эндпоинты: здания и построение маршрутов."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from database.store import get_store
from models.schemas import BuildingData, RouteRequest, RouteResponse
from utils.astar import a_star

router = APIRouter(tags=["buildings"])


@router.get("/buildings", response_model=list[BuildingData])
def list_buildings() -> list[BuildingData]:
    """Все здания с графами навигации."""
    return get_store().list_buildings()


@router.get("/buildings/{building_id}", response_model=BuildingData)
def get_building(building_id: str) -> BuildingData:
    """Данные конкретного здания."""
    data = get_store().get_building(building_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Здание не найдено")
    return data


@router.post("/routes", response_model=RouteResponse)
def compute_route(req: RouteRequest) -> RouteResponse:
    """Серверное построение маршрута (A*)."""
    data = get_store().get_building(req.buildingId)
    if data is None:
        raise HTTPException(status_code=404, detail="Здание не найдено")
    result = a_star(
        data,
        req.fromNodeId,
        req.toNodeId,
        stairs_penalty=2.5 if req.preferElevator else 1.0,
        elevator_penalty=0.6 if req.preferElevator else 1.4,
    )
    if result is None:
        raise HTTPException(status_code=422, detail="Маршрут не существует")
    node_ids, total = result
    return RouteResponse(nodeIds=node_ids, totalDistance=total)
