"""Pydantic-схемы доменных сущностей.

Зеркало TypeScript-типов фронтенда (frontend/src/types/index.ts):
здания, этажи, помещения, граф навигации, история маршрутов.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Vec3(BaseModel):
    """Точка в системе координат здания (метры)."""

    x: float
    y: float
    z: float


NodeType = Literal["waypoint", "room", "stairs", "elevator", "entrance", "marker"]
EdgeKind = Literal["corridor", "stairs", "elevator", "door"]
RoomCategory = Literal[
    "office", "classroom", "service", "food", "hall", "entrance", "library", "gym", "other"
]


class NavNode(BaseModel):
    """Узел навигационного графа (Node/Waypoint)."""

    id: str
    name: Optional[str] = None
    position: Vec3
    floor: int
    type: NodeType = "waypoint"
    roomId: Optional[str] = None


class NavEdge(BaseModel):
    """Ребро графа (Edge) между двумя узлами."""

    id: str
    from_: str = Field(alias="from")
    to: str
    weight: Optional[float] = None
    bidirectional: bool = True
    kind: EdgeKind = "corridor"

    model_config = {"populate_by_name": True}


class Room(BaseModel):
    """Помещение / точка интереса."""

    id: str
    name: str
    description: Optional[str] = None
    floor: int
    category: RoomCategory = "other"
    nodeId: str
    isStart: bool = True
    isDestination: bool = True
    icon: Optional[str] = None


class Floor(BaseModel):
    """Этаж здания."""

    id: str
    building: str
    level: int
    name: str
    elevation: float


class Building(BaseModel):
    """Здание с метаданными модели."""

    id: str
    name: str
    address: Optional[str] = None
    description: Optional[str] = None
    modelUrl: str
    metersPerUnit: float = 1.0
    floors: list[Floor] = []


class BuildingData(BaseModel):
    """Полный набор данных здания для навигации."""

    building: Building
    rooms: list[Room] = []
    nodes: list[NavNode] = []
    edges: list[NavEdge] = []


class HistoryEntry(BaseModel):
    """Запись истории маршрутов пользователя."""

    id: str
    buildingId: str
    fromRoomId: str
    toRoomId: str
    fromName: str
    toName: str
    distance: float
    startedAt: float
    completed: bool = False


class RouteRequest(BaseModel):
    """Запрос построения маршрута на сервере."""

    buildingId: str
    fromNodeId: str
    toNodeId: str
    preferElevator: bool = False


class RouteResponse(BaseModel):
    """Ответ с маршрутом: последовательность узлов и длина."""

    nodeIds: list[str]
    totalDistance: float
