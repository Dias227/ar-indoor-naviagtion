#!/usr/bin/env python3
"""
Извлекает граф навигации из GLB Blender-модели колледжа.

Источники:
  - «Плоскость» — коридорный маршрут (центроиды сетки по вершинам полоски);
  - пустышки / маркеры-сферы у дверей — POI (кабинеты, столовая, …);
  - «Вход» — стартовая точка.

Запуск:
  python3 tools/extract_nav_from_glb.py frontend/public/models/collehenavnewblender.glb
"""
from __future__ import annotations

import json
import math
import re
import struct
import sys
from collections import defaultdict
from pathlib import Path

SKIP_MARKER_NAMES = frozenset({'Пустышка', 'Плоскость', 'Сфера', 'College_Floor1'})
BUILDING_ROOT_NAMES = frozenset({'College_Floor1'})
# Версия данных: увеличивайте при перегенерации, чтобы приложение
# принудительно заменило устаревшие облачные/локальные данные.
DATA_VERSION = 6
GRID_STEP = 0.75
PATH_LINK_MAX = 6.0
PATH_SIMPLIFY_MIN = 1.0
ROOM_LINK_MAX = 28.0
FLOOR1_ELEVATION = -1.0


def load_glb(path: Path) -> tuple[dict, bytes]:
    with path.open('rb') as f:
        f.read(12)
        clen, _ = struct.unpack('<II', f.read(8))
        data = json.loads(f.read(clen))
        blen, _ = struct.unpack('<II', f.read(8))
        bin_data = f.read(blen)
    return data, bin_data


def read_positions(data: dict, bin_data: bytes, mesh_idx: int) -> list[tuple[float, float, float]]:
    meshes = data['meshes']
    accs = data['accessors']
    buffs = data['bufferViews']
    pts: list[tuple[float, float, float]] = []
    for prim in meshes[mesh_idx].get('primitives', []):
        pos_idx = prim['attributes'].get('POSITION')
        if pos_idx is None:
            continue
        acc = accs[pos_idx]
        bv = buffs[acc['bufferView']]
        offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        stride = bv.get('byteStride', 12)
        for i in range(acc['count']):
            x, y, z = struct.unpack_from('<fff', bin_data, offset + i * stride)
            pts.append((x, y, z))
    return pts


def world_translation(data: dict, node_idx: int, parent: tuple[float, float, float] = (0.0, 0.0, 0.0)) -> tuple[float, float, float]:
    n = data['nodes'][node_idx]
    t = n.get('translation') or [0.0, 0.0, 0.0]
    return (parent[0] + t[0], parent[1] + t[1], parent[2] + t[2])


def mesh_centroid(data: dict, bin_data: bytes, node_idx: int, parent: tuple[float, float, float]) -> tuple[float, float, float]:
    n = data['nodes'][node_idx]
    wt = world_translation(data, node_idx, parent)
    if 'mesh' not in n:
        return wt
    pts = read_positions(data, bin_data, n['mesh'])
    if not pts:
        return wt
    cx = sum(p[0] for p in pts) / len(pts) + wt[0]
    cy = sum(p[1] for p in pts) / len(pts) + wt[1]
    cz = sum(p[2] for p in pts) / len(pts) + wt[2]
    return (cx, cy, cz)


def dist(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.dist(a, b)


def slugify(name: str) -> str:
    s = name.strip().lower().replace(' ', '-')
    s = re.sub(r'[^a-z0-9а-яё_-]+', '', s, flags=re.IGNORECASE)
    return s or 'poi'


def display_name(name: str) -> str:
    if re.fullmatch(r'\d{2,3}', name.strip()):
        return f'Кабинет {name.strip()}'
    return name.strip()


def room_category(name: str) -> str:
    low = name.lower()
    if 'столов' in low:
        return 'food'
    if 'гардер' in low:
        return 'service'
    if 'спорт' in low:
        return 'gym'
    if 'акт' in low:
        return 'hall'
    if 'библи' in low:
        return 'library'
    if 'вход' in low:
        return 'entrance'
    if re.fullmatch(r'\d{1,3}', name.strip()):
        return 'classroom'
    return 'other'


def room_icon(category: str) -> str:
    return {
        'classroom': '🏫',
        'food': '🍽️',
        'service': '🧥',
        'gym': '🏀',
        'hall': '🎭',
        'library': '📚',
        'entrance': '🚪',
        'office': '🗂️',
    }.get(category, '📍')


def floor_from_y(y: float) -> int:
    if y < 0.8:
        return 1
    if y < 4.2:
        return 2
    if y < 7.8:
        return 3
    return 4


def is_poi_name(name: str) -> bool:
    if name in SKIP_MARKER_NAMES:
        return False
    if re.fullmatch(r'\d{1,3}', name.strip()):
        return True
    low = name.lower()
    return any(k in low for k in ('столов', 'гардер', 'спорт', 'акт', 'библи', 'бухгал', 'кадр', 'ресеп', 'вход'))


def extract_path_nodes(data: dict, bin_data: bytes) -> list[tuple[str, tuple[float, float, float]]]:
    plane_idx = next(i for i, n in enumerate(data['nodes']) if n.get('name') == 'Плоскость')
    wt = world_translation(data, plane_idx)
    pts = read_positions(data, bin_data, data['nodes'][plane_idx]['mesh'])
    world_pts = [(p[0] + wt[0], p[1] + wt[1], p[2] + wt[2]) for p in pts]

    grid: dict[tuple[float, float], list[tuple[float, float, float]]] = defaultdict(list)
    inv = 1.0 / GRID_STEP
    for x, y, z in world_pts:
        key = (round(x * inv) / inv, round(z * inv) / inv)
        grid[key].append((x, y, z))

    raw = []
    for i, group in enumerate(grid.values()):
        cx = sum(p[0] for p in group) / len(group)
        cy = sum(p[1] for p in group) / len(group)
        cz = sum(p[2] for p in group) / len(group)
        raw.append((f'path-{i:03d}', (cx, cy, cz)))

    # Упрощение: убираем точки слишком близко к уже принятым.
    kept: list[tuple[str, tuple[float, float, float]]] = []
    for item in sorted(raw, key=lambda t: t[1][2]):
        if all(dist(item[1], k[1]) >= PATH_SIMPLIFY_MIN for k in kept):
            kept.append(item)

    # Переименуем id последовательно.
    return [(f'path-{i:03d}', pos) for i, (_, pos) in enumerate(kept)]


def build_path_edges(
    path_nodes: list[tuple[str, tuple[float, float, float]]],
    start_hint: tuple[float, float, float] | None = None,
) -> list[tuple[str, str]]:
    """Граф соседства по точкам полоски коридора.

    Каждая точка соединяется с соседями в небольшом радиусе — сеть
    повторяет форму коридоров без длинных косых перескоков (в отличие
    от MST/жадной цепочки). Затем отдельные компоненты «сшиваются»
    кратчайшими мостами, чтобы граф был связным.
    """
    if len(path_nodes) < 2:
        return []
    ids = [nid for nid, _ in path_nodes]
    pos = {nid: p for nid, p in path_nodes}
    NEIGHBOR_RADIUS = 3.5

    edge_set: set[tuple[str, str]] = set()
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            if dist(pos[a], pos[b]) <= NEIGHBOR_RADIUS:
                edge_set.add((a, b))

    # Гарантируем минимум одно соединение у каждой точки (ближайший сосед).
    for a in ids:
        if not any(a in e for e in edge_set):
            nearest = min((i for i in ids if i != a), key=lambda i: dist(pos[a], pos[i]))
            edge_set.add(tuple(sorted((a, nearest))))

    # Находим компоненты связности и сшиваем их кратчайшими мостами.
    adj: dict[str, set[str]] = {i: set() for i in ids}
    for a, b in edge_set:
        adj[a].add(b)
        adj[b].add(a)

    def components() -> list[set[str]]:
        seen: set[str] = set()
        comps: list[set[str]] = []
        for s in ids:
            if s in seen:
                continue
            comp: set[str] = set()
            stack = [s]
            while stack:
                c = stack.pop()
                if c in comp:
                    continue
                comp.add(c)
                seen.add(c)
                stack.extend(adj[c] - comp)
            comps.append(comp)
        return comps

    comps = components()
    while len(comps) > 1:
        base = comps[0]
        best: tuple[float, str, str] | None = None
        for other in comps[1:]:
            for a in base:
                for b in other:
                    d = dist(pos[a], pos[b])
                    if best is None or d < best[0]:
                        best = (d, a, b)
        assert best is not None
        _, a, b = best
        edge_set.add(tuple(sorted((a, b))))
        adj[a].add(b)
        adj[b].add(a)
        comps = components()

    return sorted(edge_set)


def collect_poi_markers(data: dict, bin_data: bytes) -> list[tuple[str, tuple[float, float, float]]]:
    nodes = data['nodes']
    children_of: dict[int, list[int]] = defaultdict(list)
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            children_of[i].append(c)

    building_children: set[int] = set()

    def mark_subtree(i: int) -> None:
        building_children.add(i)
        for c in children_of.get(i, []):
            mark_subtree(c)

    for i, n in enumerate(nodes):
        if n.get('name') in BUILDING_ROOT_NAMES:
            mark_subtree(i)

    markers: list[tuple[str, tuple[float, float, float]]] = []
    for i, n in enumerate(nodes):
        if i in building_children:
            continue
        name = n.get('name', '')
        if not is_poi_name(name):
            continue
        pos = mesh_centroid(data, bin_data, i, (0.0, 0.0, 0.0))
        markers.append((name, pos))
    return markers


def densify_path(
    path_nodes: list[tuple[str, tuple[float, float, float]]],
    path_edges: list[tuple[str, str]],
    max_seg: float = 2.0,
) -> tuple[list[tuple[str, tuple[float, float, float]]], list[tuple[str, str]]]:
    """Разбивает длинные рёбра-«мосты» на короткие сегменты с новыми точками.

    Разрывы в нарисованной полоске соединяются не одной длинной косой
    линией, а цепочкой промежуточных точек вдоль прямой — путь выглядит
    ровно и в камере, и на 2D-карте.
    """
    pos = {nid: p for nid, p in path_nodes}
    out_nodes = list(path_nodes)
    out_edges: list[tuple[str, str]] = []
    counter = len(path_nodes)

    for a, b in path_edges:
        pa, pb = pos[a], pos[b]
        d = dist(pa, pb)
        if d <= max_seg:
            out_edges.append((a, b))
            continue
        steps = int(math.ceil(d / max_seg))
        prev = a
        for s in range(1, steps):
            t = s / steps
            mid = (
                pa[0] + (pb[0] - pa[0]) * t,
                pa[1] + (pb[1] - pa[1]) * t,
                pa[2] + (pb[2] - pa[2]) * t,
            )
            nid = f'path-fill-{counter:03d}'
            counter += 1
            out_nodes.append((nid, mid))
            pos[nid] = mid
            out_edges.append((prev, nid))
            prev = nid
        out_edges.append((prev, b))

    return out_nodes, out_edges


def nearest_path_node(
    pos: tuple[float, float, float],
    path_nodes: list[tuple[str, tuple[float, float, float]]],
) -> tuple[str, float] | None:
    best: tuple[str, float] | None = None
    for nid, p in path_nodes:
        d = dist(pos, p)
        if d <= ROOM_LINK_MAX and (best is None or d < best[1]):
            best = (nid, d)
    return best


def extract_building_data(glb_path: Path) -> dict:
    data, bin_data = load_glb(glb_path)
    path_nodes = extract_path_nodes(data, bin_data)
    poi_markers = collect_poi_markers(data, bin_data)
    entrance_pos = next(
        (pos for name, pos in poi_markers if name.lower() == 'вход'),
        None,
    )
    path_edges = build_path_edges(path_nodes, entrance_pos)
    path_nodes, path_edges = densify_path(path_nodes, path_edges)

    nodes: list[dict] = []
    edges: list[dict] = []
    rooms: list[dict] = []

    pos_by_id: dict[str, tuple[float, float, float]] = {}

    for nid, pos in path_nodes:
        pos_by_id[nid] = pos
        nodes.append(
            {
                'id': nid,
                'position': {'x': round(pos[0], 3), 'y': round(pos[1], 3), 'z': round(pos[2], 3)},
                'floor': floor_from_y(pos[1]),
                'type': 'waypoint',
            }
        )

    for a, b in path_edges:
        edges.append(
            {
                'id': f'e-{a}-{b}',
                'from': a,
                'to': b,
                'kind': 'corridor',
                'bidirectional': True,
            }
        )

    for raw_name, pos in poi_markers:
        slug = slugify(raw_name)
        node_id = f'n-{slug}'
        if node_id in pos_by_id:
            node_id = f'n-{slug}-2'
        pos_by_id[node_id] = pos
        category = room_category(raw_name)
        node_type = 'entrance' if category == 'entrance' else 'room'
        floor = floor_from_y(pos[1])
        room_id = f'r-{slug}'

        poi_node: dict = {
            'id': node_id,
            'name': display_name(raw_name),
            'position': {'x': round(pos[0], 3), 'y': round(pos[1], 3), 'z': round(pos[2], 3)},
            'floor': floor,
            'type': node_type,
        }
        if node_type == 'room':
            poi_node['roomId'] = room_id
        nodes.append(poi_node)

        nearest = nearest_path_node(pos, path_nodes)
        if nearest:
            from_id, _ = nearest
            edges.append(
                {
                    'id': f'e-{from_id}-{node_id}',
                    'from': from_id,
                    'to': node_id,
                    'kind': 'door' if node_type == 'room' else 'corridor',
                    'bidirectional': True,
                }
            )

        if node_type == 'room' or category == 'entrance':
            rooms.append(
                {
                    'id': room_id,
                    'name': display_name(raw_name),
                    'floor': floor,
                    'category': category,
                    'nodeId': node_id,
                    'isStart': True,
                    'isDestination': True,
                    'icon': room_icon(category),
                }
            )

    return {
        'building': {
            'id': 'college-main',
            'name': 'Главный корпус колледжа',
            'address': 'Учебный корпус №1',
            'description': 'Навигация по 1 этажу — маршрут из Blender (Плоскость + маркеры дверей).',
            'modelUrl': '/models/collehenavnewblender.glb',
            'metersPerUnit': 1,
            'dataVersion': DATA_VERSION,
            'floors': [
                {'id': 'f1', 'building': 'college-main', 'level': 1, 'name': '1 этаж', 'elevation': FLOOR1_ELEVATION},
                {'id': 'f2', 'building': 'college-main', 'level': 2, 'name': '2 этаж', 'elevation': 2.4},
                {'id': 'f3', 'building': 'college-main', 'level': 3, 'name': '3 этаж', 'elevation': 5.8},
                {'id': 'f4', 'building': 'college-main', 'level': 4, 'name': '4 этаж', 'elevation': 9.2},
            ],
        },
        'rooms': sorted(rooms, key=lambda r: r['name']),
        'nodes': nodes,
        'edges': edges,
        '_meta': {
            'sourceGlb': glb_path.name,
            'pathNodes': len(path_nodes),
            'pathEdges': len(path_edges),
            'rooms': len(rooms),
        },
    }


def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: extract_nav_from_glb.py <file.glb> [out.json]', file=sys.stderr)
        sys.exit(1)
    glb_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('frontend/src/data/college-building.json')

    building = extract_building_data(glb_path)
    meta = building.pop('_meta')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(building, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Written {out_path}')
    print(f"  path nodes: {meta['pathNodes']}, path edges: {meta['pathEdges']}, rooms: {meta['rooms']}")


if __name__ == '__main__':
    main()
