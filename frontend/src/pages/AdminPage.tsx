/**
 * Админ-панель.
 *
 * Вкладки:
 *  - Помещения: добавление, переименование, удаление POI;
 *  - Граф: 2D-редактор точек маршрутов — клик по карте добавляет точку,
 *    режим «Соединить» создаёт рёбра, поддержка лестниц/лифтов;
 *  - Этажи: создание и редактирование этажей;
 *  - Здание: название, загрузка GLB-модели, сохранение в Firebase.
 *
 * Все изменения применяются локально мгновенно (офлайн-first) и
 * отправляются на backend (FastAPI → Firestore) в фоне.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Floor, NavEdge, NavNode, Room, RoomCategory, Vec3 } from '@/types';
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { EditorScene } from '@/three/EditorScene';
import { useNavigationStore } from '@/store/useNavigationStore';
import {
  adminDeleteEdge,
  adminDeleteNode,
  adminDeleteRoom,
  adminSaveBuilding,
  adminSaveEdge,
  adminSaveNode,
  adminSaveRoom,
  adminUploadModel,
} from '@/services/api';

type Tab = 'rooms' | 'graph' | 'place3d' | 'floors' | 'building';

const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('rooms');
  const [status, setStatus] = useState<string>('');

  const buildingData = useNavigationStore((s) => s.buildingData);
  const saveBuildingEdits = useNavigationStore((s) => s.saveBuildingEdits);

  /**
   * Применить изменение: мгновенно локально + фоновая отправка в Firebase.
   */
  const apply = (
    patch: Partial<typeof buildingData>,
    sync?: () => Promise<unknown>,
  ) => {
    saveBuildingEdits({ ...buildingData, ...patch });
    if (sync) void sync().catch(() => undefined);

    const configured = useNavigationStore.getState().cloudConfigured;
    setStatus(configured ? '☁️ Отправка в облако…' : '💾 Сохранено на устройстве');
    setTimeout(() => {
      const st = useNavigationStore.getState();
      if (!configured) return;
      setStatus(
        st.cloudSyncStatus === 'synced'
          ? '☁️ Сохранено в облаке'
          : '💾 Локально (облако недоступно)',
      );
    }, 1200);
    setTimeout(() => setStatus(''), 4000);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rooms', label: 'Помещения' },
    { id: 'graph', label: '2D-граф' },
    { id: 'place3d', label: '3D-модель' },
    { id: 'floors', label: 'Этажи' },
    { id: 'building', label: 'Здание' },
  ];

  return (
    <PageShell title="Админ-панель" subtitle={buildingData.building.name}>
      <div className="glass mb-4 flex p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-neon/15 text-neon shadow-neon' : 'text-white/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {status && (
        <div className="glass mb-4 px-4 py-2.5 text-center text-xs text-neon">
          {status}
        </div>
      )}

      {tab === 'rooms' && <RoomsTab apply={apply} />}
      {tab === 'graph' && <GraphTab apply={apply} />}
      {tab === 'place3d' && <Place3DTab apply={apply} />}
      {tab === 'floors' && <FloorsTab apply={apply} />}
      {tab === 'building' && <BuildingTab apply={apply} setStatus={setStatus} />}
    </PageShell>
  );
}

type ApplyFn = (
  patch: Partial<ReturnType<typeof useNavigationStore.getState>['buildingData']>,
  sync?: () => Promise<unknown>,
) => void;

// ───────────────────────── Помещения ─────────────────────────

function RoomsTab({ apply }: { apply: ApplyFn }) {
  const data = useNavigationStore((s) => s.buildingData);
  const [editing, setEditing] = useState<Room | null>(null);

  const saveRoom = (room: Room) => {
    const exists = data.rooms.some((r) => r.id === room.id);
    const rooms = exists
      ? data.rooms.map((r) => (r.id === room.id ? room : r))
      : [...data.rooms, room];
    apply({ rooms }, () => adminSaveRoom(data.building.id, room));
    setEditing(null);
  };

  const deleteRoom = (id: string) => {
    apply(
      { rooms: data.rooms.filter((r) => r.id !== id) },
      () => adminDeleteRoom(data.building.id, id),
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <NeonButton
        full
        onClick={() =>
          setEditing({
            id: genId('r'),
            name: '',
            floor: 1,
            category: 'office',
            nodeId: data.nodes[0]?.id ?? '',
            isStart: true,
            isDestination: true,
            icon: '🚪',
          })
        }
      >
        + Добавить помещение
      </NeonButton>

      {editing && (
        <RoomEditor
          room={editing}
          nodes={data.nodes}
          floors={data.building.floors}
          onSave={saveRoom}
          onCancel={() => setEditing(null)}
        />
      )}

      {data.rooms.map((room) => (
        <GlassCard key={room.id} className="flex items-center gap-3 p-3.5">
          <span className="text-xl">{room.icon ?? '📍'}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{room.name}</p>
            <p className="text-xs text-white/45">
              Этаж {room.floor} · узел {room.nodeId}
            </p>
          </div>
          <button onClick={() => setEditing(room)} className="text-sm text-neon">
            Изм.
          </button>
          <button
            onClick={() => deleteRoom(room.id)}
            className="text-sm text-accent-pink/80"
          >
            ✕
          </button>
        </GlassCard>
      ))}
    </div>
  );
}

function RoomEditor({
  room,
  nodes,
  floors,
  onSave,
  onCancel,
}: {
  room: Room;
  nodes: NavNode[];
  floors: Floor[];
  onSave: (r: Room) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Room>(room);
  const categories: Room['category'][] = [
    'office', 'classroom', 'service', 'food', 'hall', 'entrance', 'library', 'gym', 'other',
  ];

  return (
    <GlassCard strong className="flex flex-col gap-3 p-4">
      <Field label="Название">
        <input
          className="admin-input"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Кабинет 205"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Этаж">
          <select
            className="admin-input"
            value={draft.floor}
            onChange={(e) => setDraft({ ...draft, floor: Number(e.target.value) })}
          >
            {floors.map((f) => (
              <option key={f.id} value={f.level}>{f.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Категория">
          <select
            className="admin-input"
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as Room['category'] })
            }
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Узел графа (дверь)">
        <select
          className="admin-input"
          value={draft.nodeId}
          onChange={(e) => setDraft({ ...draft, nodeId: e.target.value })}
        >
          {nodes
            .filter((n) => n.floor === draft.floor)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.name ?? n.id} ({n.id})
              </option>
            ))}
        </select>
      </Field>
      <Field label="Иконка (эмодзи)">
        <input
          className="admin-input"
          value={draft.icon ?? ''}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
        />
      </Field>
      <div className="flex gap-3">
        <NeonButton full disabled={!draft.name || !draft.nodeId} onClick={() => onSave(draft)}>
          Сохранить
        </NeonButton>
        <NeonButton full variant="ghost" onClick={onCancel}>
          Отмена
        </NeonButton>
      </div>
    </GlassCard>
  );
}

// ───────────────────────── Граф (точки и рёбра) ─────────────────────────

const MAP_W = 340;
const MAP_H = 430;
const PAD = 20;

function GraphTab({ apply }: { apply: ApplyFn }) {
  const data = useNavigationStore((s) => s.buildingData);
  const [floor, setFloor] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [nodeType, setNodeType] = useState<NavNode['type']>('waypoint');

  const floorNodes = useMemo(
    () => data.nodes.filter((n) => n.floor === floor),
    [data.nodes, floor],
  );
  const floorElevation =
    data.building.floors.find((f) => f.level === floor)?.elevation ?? 0;

  // Границы карты по всем узлам здания (стабильная проекция между этажами)
  const bounds = useMemo(() => {
    let minX = -45, maxX = 15, minZ = -40, maxZ = 150;
    if (data.nodes.length > 0) {
      minX = Math.min(...data.nodes.map((n) => n.position.x)) - 5;
      maxX = Math.max(...data.nodes.map((n) => n.position.x)) + 5;
      minZ = Math.min(...data.nodes.map((n) => n.position.z)) - 5;
      maxZ = Math.max(...data.nodes.map((n) => n.position.z)) + 5;
    }
    return { minX, maxX, minZ, maxZ };
  }, [data.nodes]);

  const scale = Math.min(
    (MAP_W - PAD * 2) / (bounds.maxX - bounds.minX),
    (MAP_H - PAD * 2) / (bounds.maxZ - bounds.minZ),
  );
  const toScreen = (x: number, z: number): [number, number] => [
    PAD + (x - bounds.minX) * scale,
    PAD + (z - bounds.minZ) * scale,
  ];
  const toWorld = (sx: number, sy: number): [number, number] => [
    bounds.minX + (sx - PAD) / scale,
    bounds.minZ + (sy - PAD) / scale,
  ];

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Попадание в существующий узел?
    const hit = floorNodes.find((n) => {
      const [nx, ny] = toScreen(n.position.x, n.position.z);
      return Math.hypot(nx - sx, ny - sy) < 12;
    });

    if (hit) {
      if (connectMode && selected && selected !== hit.id) {
        // Создание ребра
        const kind: NavEdge['kind'] =
          hit.type === 'stairs' || nodeIsType(data.nodes, selected, 'stairs')
            ? 'stairs'
            : hit.type === 'elevator' || nodeIsType(data.nodes, selected, 'elevator')
              ? 'elevator'
              : 'corridor';
        const edge: NavEdge = {
          id: genId('e'),
          from: selected,
          to: hit.id,
          kind,
          bidirectional: true,
        };
        apply(
          { edges: [...data.edges, edge] },
          () => adminSaveEdge(data.building.id, edge),
        );
        setSelected(hit.id);
      } else {
        setSelected(hit.id === selected ? null : hit.id);
      }
      return;
    }

    // Пустое место — добавляем узел
    const [wx, wz] = toWorld(sx, sy);
    const node: NavNode = {
      id: genId('n'),
      position: { x: Math.round(wx * 10) / 10, y: floorElevation, z: Math.round(wz * 10) / 10 },
      floor,
      type: nodeType,
    };
    apply(
      { nodes: [...data.nodes, node] },
      () => adminSaveNode(data.building.id, node),
    );
    setSelected(node.id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    const edges = data.edges.filter((e) => e.from !== selected && e.to !== selected);
    apply(
      { nodes: data.nodes.filter((n) => n.id !== selected), edges },
      () => adminDeleteNode(data.building.id, selected),
    );
    setSelected(null);
  };

  const deleteEdge = (id: string) => {
    apply(
      { edges: data.edges.filter((e) => e.id !== id) },
      () => adminDeleteEdge(data.building.id, id),
    );
  };

  const selectedNode = selected ? data.nodes.find((n) => n.id === selected) : null;
  const selectedEdges = selected
    ? data.edges.filter((e) => e.from === selected || e.to === selected)
    : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Панель инструментов */}
      <GlassCard className="flex flex-wrap items-center gap-2 p-3">
        <select
          className="admin-input !w-auto"
          value={floor}
          onChange={(e) => { setFloor(Number(e.target.value)); setSelected(null); }}
        >
          {data.building.floors.map((f) => (
            <option key={f.id} value={f.level}>{f.name}</option>
          ))}
        </select>
        <select
          className="admin-input !w-auto"
          value={nodeType}
          onChange={(e) => setNodeType(e.target.value as NavNode['type'])}
        >
          <option value="waypoint">Точка</option>
          <option value="room">Дверь</option>
          <option value="stairs">Лестница</option>
          <option value="elevator">Лифт</option>
          <option value="marker">QR-маркер</option>
        </select>
        <button
          onClick={() => setConnectMode((v) => !v)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            connectMode
              ? 'bg-neon/20 text-neon shadow-neon'
              : 'bg-white/5 text-white/60'
          }`}
        >
          🔗 Соединить
        </button>
      </GlassCard>

      <p className="px-1 text-xs text-white/40">
        Клик по пустому месту — новая точка. Клик по точке — выбор.
        В режиме «Соединить» клик по второй точке создаёт ребро.
      </p>

      {/* Карта-редактор */}
      <GlassCard className="overflow-hidden p-0">
        <svg
          width="100%"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          onClick={handleMapClick}
          className="block cursor-crosshair touch-none select-none"
          style={{ background: 'rgba(5,8,15,.7)' }}
        >
          {/* Рёбра этажа */}
          {data.edges.map((e) => {
            const a = data.nodes.find((n) => n.id === e.from);
            const b = data.nodes.find((n) => n.id === e.to);
            if (!a || !b) return null;
            if (a.floor !== floor && b.floor !== floor) return null;
            const [x1, y1] = toScreen(a.position.x, a.position.z);
            const [x2, y2] = toScreen(b.position.x, b.position.z);
            const interFloor = a.floor !== b.floor;
            return (
              <line
                key={e.id}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={interFloor ? '#7c4dff' : 'rgba(0,229,255,.45)'}
                strokeWidth={2.5}
                strokeDasharray={interFloor ? '4 4' : undefined}
                strokeLinecap="round"
              />
            );
          })}
          {/* Узлы этажа */}
          {floorNodes.map((n) => {
            const [x, y] = toScreen(n.position.x, n.position.z);
            const isSel = n.id === selected;
            const color =
              n.type === 'stairs' ? '#7c4dff'
              : n.type === 'elevator' ? '#ffaa00'
              : n.type === 'room' ? '#ff2d78'
              : n.type === 'marker' ? '#aaff00'
              : '#00e5ff';
            return (
              <g key={n.id} transform={`translate(${x},${y})`}>
                {isSel && (
                  <circle r="11" fill="none" stroke="#fff" strokeWidth="1.5">
                    <animate attributeName="r" values="9;13;9" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle r="6" fill={color} fillOpacity={0.9} stroke="rgba(0,0,0,.5)" />
              </g>
            );
          })}
        </svg>
      </GlassCard>

      {/* Свойства выбранного узла */}
      {selectedNode && (
        <GlassCard strong className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm text-neon">{selectedNode.id}</p>
            <button onClick={deleteSelected} className="text-sm text-accent-pink">
              Удалить точку
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <Field key={axis} label={axis.toUpperCase()}>
                <input
                  type="number"
                  step="0.1"
                  className="admin-input"
                  value={selectedNode.position[axis]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const updated: NavNode = {
                      ...selectedNode,
                      position: { ...selectedNode.position, [axis]: v },
                    };
                    apply(
                      { nodes: data.nodes.map((n) => (n.id === selected ? updated : n)) },
                      () => adminSaveNode(data.building.id, updated),
                    );
                  }}
                />
              </Field>
            ))}
          </div>
          <Field label="Название">
            <input
              className="admin-input"
              value={selectedNode.name ?? ''}
              onChange={(e) => {
                const updated = { ...selectedNode, name: e.target.value };
                apply(
                  { nodes: data.nodes.map((n) => (n.id === selected ? updated : n)) },
                  () => adminSaveNode(data.building.id, updated),
                );
              }}
            />
          </Field>
          {selectedEdges.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-white/50">Соединения:</p>
              <div className="flex flex-col gap-1.5">
                {selectedEdges.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono text-white/70">
                      {e.from === selected ? e.to : e.from}
                      <span className="ml-2 text-white/35">({e.kind})</span>
                    </span>
                    <button onClick={() => deleteEdge(e.id)} className="text-accent-pink">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function nodeIsType(nodes: NavNode[], id: string, type: NavNode['type']): boolean {
  return nodes.find((n) => n.id === id)?.type === type;
}

// ───────────────────────── 3D-модель (точки по месту) ─────────────────────────

const NODE_TYPE_OPTIONS: { value: NavNode['type']; label: string }[] = [
  { value: 'waypoint', label: 'Точка' },
  { value: 'room', label: 'Дверь' },
  { value: 'stairs', label: 'Лестница' },
  { value: 'elevator', label: 'Лифт' },
  { value: 'entrance', label: 'Вход' },
  { value: 'marker', label: 'QR-маркер' },
];

const CATEGORY_OPTIONS: RoomCategory[] = [
  'classroom', 'office', 'service', 'food', 'hall',
  'entrance', 'library', 'gym', 'other',
];

type EditMode = 'cabinet' | 'add' | 'select' | 'move' | 'connect';

function Place3DTab({ apply }: { apply: ApplyFn }) {
  const navigate = useNavigate();
  const data = useNavigationStore((s) => s.buildingData);
  const [floor, setFloor] = useState(1);
  const [mode, setMode] = useState<EditMode>('cabinet');
  const [nodeType, setNodeType] = useState<NavNode['type']>('waypoint');
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [isolate, setIsolate] = useState(true);

  // Автофокус на поле названия сразу после установки кабинета — для
  // быстрого ввода: клик по двери → печатаем название → клик по следующей.
  const nameInputRef = useRef<HTMLInputElement>(null);
  const focusNameRef = useRef(false);
  useEffect(() => {
    if (focusNameRef.current && nameInputRef.current) {
      nameInputRef.current.focus();
      focusNameRef.current = false;
    }
  }, [selected]);

  const floorMeta = data.building.floors.find((f) => f.level === floor);
  const floorElevation = floorMeta?.elevation ?? 0;

  // Скрываем этажи выше текущего, чтобы кликать именно по нужному уровню.
  const isolateMaxY = useMemo(() => {
    if (!isolate) return undefined;
    const above = data.building.floors
      .map((f) => f.elevation)
      .filter((y) => y > floorElevation)
      .sort((a, b) => a - b);
    return above[0] !== undefined ? above[0] - 0.2 : floorElevation + 3.2;
  }, [isolate, data.building.floors, floorElevation]);

  const selectedNode = selected
    ? data.nodes.find((n) => n.id === selected) ?? null
    : null;
  const selectedEdges = selected
    ? data.edges.filter((e) => e.from === selected || e.to === selected)
    : [];

  const linkedRoom = selectedNode
    ? data.rooms.find((r) => r.nodeId === selectedNode.id) ?? null
    : null;

  const round = (v: number) => Math.round(v * 10) / 10;

  const handleSurface = (p: Vec3) => {
    if (mode === 'cabinet') {
      // Точка-дверь + помещение (POI) одним действием, с автофокусом названия.
      const node: NavNode = {
        id: genId('n'),
        position: { x: round(p.x), y: round(floorElevation), z: round(p.z) },
        floor,
        type: 'room',
        name: '',
      };
      const room: Room = {
        id: genId('r'),
        name: '',
        floor,
        category: 'classroom',
        nodeId: node.id,
        isStart: true,
        isDestination: true,
        icon: '🏫',
      };
      node.roomId = room.id;
      apply(
        { nodes: [...data.nodes, node], rooms: [...data.rooms, room] },
        async () => {
          await adminSaveNode(data.building.id, node);
          await adminSaveRoom(data.building.id, room);
        },
      );
      setSelected(node.id);
      focusNameRef.current = true;
    } else if (mode === 'add') {
      const node: NavNode = {
        id: genId('n'),
        position: { x: round(p.x), y: round(floorElevation), z: round(p.z) },
        floor,
        type: nodeType,
      };
      apply(
        { nodes: [...data.nodes, node] },
        () => adminSaveNode(data.building.id, node),
      );
      setSelected(node.id);
    } else if (mode === 'move' && selectedNode) {
      const updated: NavNode = {
        ...selectedNode,
        position: { ...selectedNode.position, x: round(p.x), z: round(p.z) },
      };
      apply(
        { nodes: data.nodes.map((n) => (n.id === selectedNode.id ? updated : n)) },
        () => adminSaveNode(data.building.id, updated),
      );
    }
  };

  const handleNode = (id: string) => {
    if (mode === 'connect') {
      if (connectFrom && connectFrom !== id) {
        const fromType = data.nodes.find((n) => n.id === connectFrom)?.type;
        const toType = data.nodes.find((n) => n.id === id)?.type;
        const kind: NavEdge['kind'] =
          fromType === 'stairs' || toType === 'stairs'
            ? 'stairs'
            : fromType === 'elevator' || toType === 'elevator'
              ? 'elevator'
              : 'corridor';
        const edge: NavEdge = {
          id: genId('e'),
          from: connectFrom,
          to: id,
          kind,
          bidirectional: true,
        };
        apply(
          { edges: [...data.edges, edge] },
          () => adminSaveEdge(data.building.id, edge),
        );
        setConnectFrom(id);
        setSelected(id);
      } else {
        setConnectFrom(id);
        setSelected(id);
      }
    } else {
      setSelected((cur) => (cur === id ? null : id));
    }
  };

  const updateSelected = (updated: NavNode) => {
    apply(
      { nodes: data.nodes.map((n) => (n.id === updated.id ? updated : n)) },
      () => adminSaveNode(data.building.id, updated),
    );
  };

  const deleteSelected = () => {
    if (!selected) return;
    const edges = data.edges.filter(
      (e) => e.from !== selected && e.to !== selected,
    );
    const roomsToDelete = data.rooms.filter((r) => r.nodeId === selected);
    apply(
      {
        nodes: data.nodes.filter((n) => n.id !== selected),
        edges,
        rooms: data.rooms.filter((r) => r.nodeId !== selected),
      },
      async () => {
        await adminDeleteNode(data.building.id, selected);
        for (const r of roomsToDelete) {
          await adminDeleteRoom(data.building.id, r.id);
        }
      },
    );
    setSelected(null);
    setConnectFrom(null);
  };

  /** Изменить название кабинета (синхронно обновляет имя узла). */
  const updateRoomName = (room: Room, name: string) => {
    const updatedRoom = { ...room, name };
    apply(
      {
        rooms: data.rooms.map((r) => (r.id === room.id ? updatedRoom : r)),
        nodes: data.nodes.map((n) =>
          n.id === room.nodeId ? { ...n, name } : n,
        ),
      },
      () => adminSaveRoom(data.building.id, updatedRoom),
    );
  };

  const updateRoomCategory = (room: Room, category: RoomCategory) => {
    const updatedRoom = { ...room, category };
    apply(
      { rooms: data.rooms.map((r) => (r.id === room.id ? updatedRoom : r)) },
      () => adminSaveRoom(data.building.id, updatedRoom),
    );
  };

  const deleteEdge = (id: string) => {
    apply(
      { edges: data.edges.filter((e) => e.id !== id) },
      () => adminDeleteEdge(data.building.id, id),
    );
  };

  const makeRoom = () => {
    if (!selectedNode) return;
    const room: Room = {
      id: genId('r'),
      name: selectedNode.name || 'Новое помещение',
      floor: selectedNode.floor,
      category: 'office',
      nodeId: selectedNode.id,
      isStart: true,
      isDestination: true,
      icon: '🚪',
    };
    const updatedNode: NavNode = {
      ...selectedNode,
      type: 'room',
      roomId: room.id,
    };
    apply(
      {
        rooms: [...data.rooms, room],
        nodes: data.nodes.map((n) =>
          n.id === selectedNode.id ? updatedNode : n,
        ),
      },
      async () => {
        await adminSaveNode(data.building.id, updatedNode);
        await adminSaveRoom(data.building.id, room);
      },
    );
  };

  const modeButtons: { id: EditMode; label: string }[] = [
    { id: 'cabinet', label: '🚪 Кабинет' },
    { id: 'add', label: '➕ Точка' },
    { id: 'select', label: '👆 Выбрать' },
    { id: 'move', label: '✋ Двигать' },
    { id: 'connect', label: '🔗 Соединить' },
  ];

  const hint: Record<EditMode, string> = {
    cabinet:
      'Кликни у двери кабинета на модели — он появится, сразу впиши название и жми дальше.',
    add: 'Кликни по полу модели — добавится точка выбранного типа.',
    select: 'Кликни по точке, чтобы изменить её свойства.',
    move: 'Выбери точку, затем кликни по новому месту на полу.',
    connect: 'Кликни две точки подряд — между ними создастся путь (ребро).',
  };

  return (
    <div className="flex flex-col gap-3">
      <NeonButton full variant="ghost" onClick={() => navigate('/ar-map')}>
        📷 Размечать кабинеты в AR-камере (Android)
      </NeonButton>

      <GlassCard className="flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="admin-input !w-auto"
            value={floor}
            onChange={(e) => {
              setFloor(Number(e.target.value));
              setSelected(null);
              setConnectFrom(null);
            }}
          >
            {data.building.floors.map((f) => (
              <option key={f.id} value={f.level}>
                {f.name}
              </option>
            ))}
          </select>
          {mode === 'add' && (
            <select
              className="admin-input !w-auto"
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value as NavNode['type'])}
            >
              {NODE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setIsolate((v) => !v)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
              isolate
                ? 'bg-neon/20 text-neon shadow-neon'
                : 'bg-white/5 text-white/60'
            }`}
          >
            {isolate ? '👁 Только этаж' : '👁 Всё здание'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {modeButtons.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMode(m.id);
                setConnectFrom(null);
              }}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
                mode === m.id
                  ? 'bg-neon/20 text-neon shadow-neon'
                  : 'bg-white/5 text-white/55'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </GlassCard>

      <p className="px-1 text-xs text-white/45">
        {hint[mode]} Зажми и тяни — поворот камеры, колесо/щипок — зум.
      </p>

      <GlassCard className="overflow-hidden p-0">
        <div className="relative h-[420px] w-full">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                Загрузка 3D-модели…
              </div>
            }
          >
            <EditorScene
              modelUrl={data.building.modelUrl}
              nodes={data.nodes}
              edges={data.edges}
              floor={floor}
              floorElevation={floorElevation}
              isolateMaxY={isolateMaxY}
              selectedId={selected}
              onPickSurface={handleSurface}
              onPickNode={handleNode}
            />
          </Suspense>

          {/* Быстрый ввод названия только что поставленного кабинета */}
          {mode === 'cabinet' && linkedRoom && (
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-xl border border-neon/40 bg-black/75 p-2 backdrop-blur-md">
              <span className="pl-1 text-lg">🚪</span>
              <input
                ref={nameInputRef}
                className="admin-input flex-1"
                value={linkedRoom.name}
                placeholder="Название кабинета (напр. 205) и далее →"
                onChange={(e) => updateRoomName(linkedRoom, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg bg-neon/20 px-3 py-2 text-sm font-semibold text-neon"
              >
                ✓
              </button>
            </div>
          )}
        </div>
      </GlassCard>

      {selectedNode && (
        <GlassCard strong className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm text-neon">{selectedNode.id}</p>
            <button
              onClick={deleteSelected}
              className="text-sm text-accent-pink"
            >
              Удалить точку
            </button>
          </div>
          {linkedRoom ? (
            <>
              <Field label="Название кабинета / помещения">
                <input
                  className="admin-input"
                  value={linkedRoom.name}
                  placeholder="напр. Кабинет 205"
                  onChange={(e) => updateRoomName(linkedRoom, e.target.value)}
                />
              </Field>
              <Field label="Категория">
                <select
                  className="admin-input"
                  value={linkedRoom.category}
                  onChange={(e) =>
                    updateRoomCategory(
                      linkedRoom,
                      e.target.value as RoomCategory,
                    )
                  }
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Название">
                <input
                  className="admin-input"
                  value={selectedNode.name ?? ''}
                  placeholder="напр. Холл"
                  onChange={(e) =>
                    updateSelected({ ...selectedNode, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Тип точки">
                <select
                  className="admin-input"
                  value={selectedNode.type}
                  onChange={(e) =>
                    updateSelected({
                      ...selectedNode,
                      type: e.target.value as NavNode['type'],
                    })
                  }
                >
                  {NODE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <Field key={axis} label={axis.toUpperCase()}>
                <input
                  type="number"
                  step="0.1"
                  className="admin-input"
                  value={selectedNode.position[axis]}
                  onChange={(e) =>
                    updateSelected({
                      ...selectedNode,
                      position: {
                        ...selectedNode.position,
                        [axis]: Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          {!data.rooms.some((r) => r.nodeId === selectedNode.id) && (
            <NeonButton variant="ghost" full onClick={makeRoom}>
              🚪 Сделать помещением (POI)
            </NeonButton>
          )}
          {selectedEdges.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-white/50">Соединения:</p>
              <div className="flex flex-col gap-1.5">
                {selectedEdges.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono text-white/70">
                      {e.from === selected ? e.to : e.from}
                      <span className="ml-2 text-white/35">({e.kind})</span>
                    </span>
                    <button
                      onClick={() => deleteEdge(e.id)}
                      className="text-accent-pink"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard className="p-3 text-center text-xs text-white/45">
        Этаж {floor}: {data.nodes.filter((n) => n.floor === floor).length} точек ·{' '}
        {data.rooms.filter((r) => r.floor === floor).length} помещений
      </GlassCard>
    </div>
  );
}

// ───────────────────────── Этажи ─────────────────────────

function FloorsTab({ apply }: { apply: ApplyFn }) {
  const data = useNavigationStore((s) => s.buildingData);

  const addFloor = () => {
    const maxLevel = Math.max(0, ...data.building.floors.map((f) => f.level));
    const prev = data.building.floors.find((f) => f.level === maxLevel);
    const floor: Floor = {
      id: genId('f'),
      building: data.building.id,
      level: maxLevel + 1,
      name: `${maxLevel + 1} этаж`,
      elevation: (prev?.elevation ?? -2) + 3.4,
    };
    const building = { ...data.building, floors: [...data.building.floors, floor] };
    apply({ building }, () => adminSaveBuilding({ ...data, building }));
  };

  const updateFloor = (floor: Floor) => {
    const building = {
      ...data.building,
      floors: data.building.floors.map((f) => (f.id === floor.id ? floor : f)),
    };
    apply({ building }, () => adminSaveBuilding({ ...data, building }));
  };

  const deleteFloor = (id: string) => {
    const building = {
      ...data.building,
      floors: data.building.floors.filter((f) => f.id !== id),
    };
    apply({ building }, () => adminSaveBuilding({ ...data, building }));
  };

  return (
    <div className="flex flex-col gap-2.5">
      <NeonButton full onClick={addFloor}>+ Создать этаж</NeonButton>
      {data.building.floors.map((f) => (
        <GlassCard key={f.id} className="flex items-center gap-3 p-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 font-bold text-neon">
            {f.level}
          </span>
          <div className="grid flex-1 grid-cols-2 gap-2">
            <input
              className="admin-input"
              value={f.name}
              onChange={(e) => updateFloor({ ...f, name: e.target.value })}
            />
            <input
              type="number"
              step="0.1"
              className="admin-input"
              value={f.elevation}
              title="Высота пола (Y)"
              onChange={(e) => updateFloor({ ...f, elevation: Number(e.target.value) })}
            />
          </div>
          <button onClick={() => deleteFloor(f.id)} className="text-accent-pink/80">
            ✕
          </button>
        </GlassCard>
      ))}
      <p className="px-1 text-xs text-white/40">
        Второе поле — высота пола этажа по оси Y в координатах модели.
        Лестницы и лифты редактируются на вкладке «Граф» (типы точек
        «Лестница»/«Лифт», пунктирные рёбра соединяют этажи).
      </p>
    </div>
  );
}

// ───────────────────────── Здание ─────────────────────────

function BuildingTab({
  apply,
  setStatus,
}: {
  apply: ApplyFn;
  setStatus: (s: string) => void;
}) {
  const data = useNavigationStore((s) => s.buildingData);
  const resetBuildingEdits = useNavigationStore((s) => s.resetBuildingEdits);
  const [uploading, setUploading] = useState(false);

  const updateBuilding = (patch: Partial<typeof data.building>) => {
    const building = { ...data.building, ...patch };
    apply({ building });
  };

  const handleReset = () => {
    const ok = window.confirm(
      'Сбросить все правки (точки, помещения, этажи) к исходным данным колледжа? Это действие нельзя отменить.',
    );
    if (!ok) return;
    resetBuildingEdits();
    setStatus('↺ Правки сброшены к исходным');
    setTimeout(() => setStatus(''), 3000);
  };

  const saveAll = () => {
    setStatus('💾 Сохранение…');
    adminSaveBuilding(data)
      .then(() => setStatus('✅ Здание сохранено в Firebase'))
      .catch(() => setStatus('⚠️ Backend недоступен — данные остались локально'));
    setTimeout(() => setStatus(''), 3500);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setStatus('📤 Загрузка модели…');
    try {
      const { modelUrl } = await adminUploadModel(data.building.id, file);
      updateBuilding({ modelUrl });
      setStatus('✅ Модель загружена');
    } catch {
      setStatus('⚠️ Не удалось загрузить модель (backend недоступен)');
    } finally {
      setUploading(false);
      setTimeout(() => setStatus(''), 3500);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="flex flex-col gap-3 p-4">
        <Field label="Название здания">
          <input
            className="admin-input"
            value={data.building.name}
            onChange={(e) => updateBuilding({ name: e.target.value })}
          />
        </Field>
        <Field label="Адрес">
          <input
            className="admin-input"
            value={data.building.address ?? ''}
            onChange={(e) => updateBuilding({ address: e.target.value })}
          />
        </Field>
        <Field label="Описание">
          <textarea
            className="admin-input min-h-[70px]"
            value={data.building.description ?? ''}
            onChange={(e) => updateBuilding({ description: e.target.value })}
          />
        </Field>
      </GlassCard>

      <GlassCard className="p-4">
        <p className="mb-2 text-sm font-semibold">3D-модель (GLB)</p>
        <p className="mb-3 break-all font-mono text-xs text-white/45">
          {data.building.modelUrl}
        </p>
        <label className="btn-ghost block cursor-pointer text-center">
          {uploading ? 'Загрузка…' : '📤 Загрузить новую GLB-модель'}
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
        </label>
      </GlassCard>

      <GlassCard className="p-4 text-xs text-white/50">
        <p>
          📊 Статистика: {data.nodes.length} точек · {data.edges.length} рёбер ·{' '}
          {data.rooms.length} помещений · {data.building.floors.length} этажа
        </p>
      </GlassCard>

      <GlassCard className="p-3 text-xs text-white/45">
        ☁️ Правки сохраняются в Firebase (если настроено) и доступны на всех
        телефонах. Локальная копия остаётся для офлайна. Кнопка ниже — резервная
        синхронизация через backend, если он запущен локально.
      </GlassCard>

      <NeonButton full onClick={saveAll}>
        💾 Сохранить всё в Firebase
      </NeonButton>

      <NeonButton full variant="danger" onClick={handleReset}>
        ↺ Сбросить правки к исходным
      </NeonButton>
    </div>
  );
}

// ───────────────────────── Общие элементы ─────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/50">{label}</span>
      {children}
    </label>
  );
}
