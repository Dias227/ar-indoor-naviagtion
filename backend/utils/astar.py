"""Серверная реализация A* (зеркало frontend-алгоритма).

Используется эндпоинтом /api/routes для построения маршрута на
сервере — например, для интеграций или тонких клиентов.
"""
from __future__ import annotations

import heapq
import math
from typing import Optional

from models.schemas import BuildingData, NavNode

FLOOR_PENALTY = 3.0


def _dist(a: NavNode, b: NavNode) -> float:
    return math.sqrt(
        (a.position.x - b.position.x) ** 2
        + (a.position.y - b.position.y) ** 2
        + (a.position.z - b.position.z) ** 2
    )


def a_star(
    data: BuildingData,
    start_id: str,
    goal_id: str,
    stairs_penalty: float = 1.0,
    elevator_penalty: float = 1.0,
) -> Optional[tuple[list[str], float]]:
    """Кратчайший путь по графу здания.

    Возвращает (список id узлов, длина в метрах) либо None.
    """
    nodes = {n.id: n for n in data.nodes}
    if start_id not in nodes or goal_id not in nodes:
        return None

    adjacency: dict[str, list[tuple[str, float]]] = {nid: [] for nid in nodes}
    for e in data.edges:
        if e.from_ not in nodes or e.to not in nodes:
            continue
        w = e.weight or _dist(nodes[e.from_], nodes[e.to])
        if e.kind == "stairs":
            w *= stairs_penalty
        elif e.kind == "elevator":
            w *= elevator_penalty
        adjacency[e.from_].append((e.to, w))
        if e.bidirectional:
            adjacency[e.to].append((e.from_, w))

    goal = nodes[goal_id]

    def h(nid: str) -> float:
        n = nodes[nid]
        return _dist(n, goal) + abs(n.floor - goal.floor) * FLOOR_PENALTY

    open_heap: list[tuple[float, str]] = [(h(start_id), start_id)]
    g_score: dict[str, float] = {start_id: 0.0}
    came_from: dict[str, str] = {}
    closed: set[str] = set()

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current == goal_id:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path, g_score[goal_id]
        if current in closed:
            continue
        closed.add(current)

        for neighbor, weight in adjacency[current]:
            if neighbor in closed:
                continue
            tentative = g_score[current] + weight
            if tentative < g_score.get(neighbor, math.inf):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                heapq.heappush(open_heap, (tentative + h(neighbor), neighbor))
    return None
