/**
 * Страница «AR-разметка»: расстановка кабинетов прямо через камеру.
 *
 * Поток (Android + Chrome, WebXR):
 *  1. Выбираешь две известные точки графа: «якорь» A (где стоишь) и
 *     «ориентир» B (куда смотришь) — они калибруют координаты здания.
 *  2. Встаёшь в точке A, смотришь на B, тапаешь пол — система привязана.
 *  3. Ходишь по этажу: у каждой двери вписываешь название и жмёшь
 *     «Поставить кабинет» — точка+помещение создаются в твоей позиции.
 *
 * На iOS Safari (нет WebXR) показывается пояснение и переход в 3D-редактор.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { ARSessionState, NavNode, Room, Vec3 } from '@/types';
import { useNavigationStore } from '@/store/useNavigationStore';
import { isImmersiveARSupported } from '@/ar/webxr';
import { ARMappingScene } from '@/ar/ARMappingScene';
import { adminSaveNode, adminSaveRoom } from '@/services/api';
import { PageShell } from '@/components/PageShell';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';

const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const round = (v: number) => Math.round(v * 10) / 10;

export function ARMapPage() {
  const navigate = useNavigate();
  const buildingData = useNavigationStore((s) => s.buildingData);
  const saveBuildingEdits = useNavigationStore((s) => s.saveBuildingEdits);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'setup' | 'ar'>('setup');
  const [anchorId, setAnchorId] = useState('');
  const [facingId, setFacingId] = useState('');
  const [floor, setFloor] = useState(1);
  const [arState, setArState] = useState<ARSessionState>('idle');
  const [nameDraft, setNameDraft] = useState('');
  const [placedCount, setPlacedCount] = useState(0);
  const [justPlaced, setJustPlaced] = useState<string | null>(null);
  const posRef = useRef<Vec3 | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void isImmersiveARSupported().then(setSupported);
  }, []);

  // Кандидаты для калибровки — именованные/типизированные узлы.
  const refNodes = useMemo(
    () =>
      buildingData.nodes.filter((n) => n.name || n.type !== 'waypoint'),
    [buildingData.nodes],
  );

  useEffect(() => {
    if (!anchorId && refNodes[0]) setAnchorId(refNodes[0].id);
    if (!facingId && refNodes[1]) setFacingId(refNodes[1].id);
  }, [refNodes, anchorId, facingId]);

  const anchorNode = buildingData.nodes.find((n) => n.id === anchorId) ?? null;
  const facingNode = buildingData.nodes.find((n) => n.id === facingId) ?? null;
  const floorElevation =
    buildingData.building.floors.find((f) => f.level === floor)?.elevation ?? 0;

  const placed = useMemo(() => {
    return buildingData.rooms
      .filter((r) => r.floor === floor)
      .map((r) => {
        const node = buildingData.nodes.find((n) => n.id === r.nodeId);
        return node
          ? { id: r.id, name: r.name, position: node.position }
          : null;
      })
      .filter((m): m is { id: string; name: string; position: Vec3 } => !!m);
  }, [buildingData.rooms, buildingData.nodes, floor]);

  const nodeLabel = (n: NavNode) =>
    `${n.name || n.id} · эт.${n.floor}`;

  const dropCabinet = () => {
    const pos = posRef.current;
    if (!pos) return;
    const name =
      nameDraft.trim() || `Кабинет ${buildingData.rooms.length + 1}`;
    const roomId = genId('r');
    const node: NavNode = {
      id: genId('n'),
      position: { x: round(pos.x), y: round(floorElevation), z: round(pos.z) },
      floor,
      type: 'room',
      name,
      roomId,
    };
    const room: Room = {
      id: roomId,
      name,
      floor,
      category: 'classroom',
      nodeId: node.id,
      isStart: true,
      isDestination: true,
      icon: '🏫',
    };
    saveBuildingEdits({
      ...buildingData,
      nodes: [...buildingData.nodes, node],
      rooms: [...buildingData.rooms, room],
    });
    void adminSaveNode(buildingData.building.id, node).catch(() => undefined);
    void adminSaveRoom(buildingData.building.id, room).catch(() => undefined);
    setPlacedCount((c) => c + 1);
    setJustPlaced(name);
    setNameDraft('');
    window.setTimeout(() => setJustPlaced(null), 1800);
  };

  // ── Проверка поддержки ──
  if (supported === null) {
    return (
      <PageShell title="AR-разметка" subtitle="Проверка камеры…">
        <GlassCard className="p-8 text-center text-white/60">
          Проверяем поддержку AR…
        </GlassCard>
      </PageShell>
    );
  }

  if (supported === false) {
    return (
      <PageShell title="AR-разметка" subtitle="Недоступно на этом устройстве">
        <GlassCard className="p-6 text-center">
          <p className="text-4xl">📱</p>
          <p className="mt-3 font-semibold">AR-разметка работает на Android + Chrome</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            На iPhone/iPad (Safari) нет WebXR, поэтому отслеживать твою
            позицию в здании нельзя. Расставь кабинеты в 3D-редакторе — он
            работает на любом устройстве и тоже ставит точки прямо на модели.
          </p>
          <NeonButton full className="mt-5" onClick={() => navigate('/admin')}>
            Открыть 3D-редактор
          </NeonButton>
        </GlassCard>
      </PageShell>
    );
  }

  // ── Недостаточно опорных точек ──
  if (refNodes.length < 2) {
    return (
      <PageShell title="AR-разметка" subtitle="Нужны опорные точки">
        <GlassCard className="p-6 text-center">
          <p className="text-4xl">📍</p>
          <p className="mt-3 font-semibold">Сначала поставь 2 точки в 3D-редакторе</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Для калибровки нужны две известные точки (например «Вход» и
            «Холл»). Отметь их точно на модели — потом вернись сюда.
          </p>
          <NeonButton full className="mt-5" onClick={() => navigate('/admin')}>
            Открыть 3D-редактор
          </NeonButton>
        </GlassCard>
      </PageShell>
    );
  }

  // ── Экран настройки калибровки ──
  if (phase === 'setup') {
    const canStart = !!anchorNode && !!facingNode && anchorId !== facingId;
    return (
      <PageShell title="AR-разметка" subtitle="Калибровка по двум точкам">
        <GlassCard className="flex flex-col gap-4 p-5">
          <p className="text-sm leading-relaxed text-white/70">
            Выбери две известные точки. Затем встань <b>в точке A</b>, смотри
            <b> на точку B</b> и коснись пола — координаты привяжутся к зданию.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-white/50">
              A — где ты стоишь
            </span>
            <select
              className="admin-input"
              value={anchorId}
              onChange={(e) => setAnchorId(e.target.value)}
            >
              {refNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {nodeLabel(n)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/50">
              B — куда смотришь
            </span>
            <select
              className="admin-input"
              value={facingId}
              onChange={(e) => setFacingId(e.target.value)}
            >
              {refNodes
                .filter((n) => n.id !== anchorId)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {nodeLabel(n)}
                  </option>
                ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-white/50">
              Этаж, который размечаешь
            </span>
            <select
              className="admin-input"
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
            >
              {buildingData.building.floors.map((f) => (
                <option key={f.id} value={f.level}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <NeonButton full disabled={!canStart} onClick={() => setPhase('ar')}>
            ▶ Начать AR-разметку
          </NeonButton>
          <p className="text-xs text-white/40">
            Совет: чем дальше друг от друга A и B, тем точнее калибровка.
            На длинном этаже периодически возвращайся и перекалибруйся.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  // ── AR-режим ──
  const tracking = arState === 'tracking';
  return (
    <div className="fixed inset-0 bg-black">
      {anchorNode && facingNode && (
        <ARMappingScene
          overlayRoot={overlayRef.current}
          anchor={anchorNode.position}
          facing={facingNode.position}
          placed={placed}
          onStateChange={setArState}
          onSessionEnd={() => setPhase('setup')}
          onPosition={(p) => {
            posRef.current = p;
          }}
        />
      )}

      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10">
        {/* Верх: инструкция */}
        <div className="safe-top px-4 pt-3">
          <AnimatePresence mode="wait">
            {!tracking && (
              <Banner key="cal" color="text-neon">
                Встань в точке «{anchorNode?.name || anchorId}», смотри на «
                {facingNode?.name || facingId}» и коснись пола
              </Banner>
            )}
            {tracking && (
              <Banner key="track" color="text-white">
                Иди к двери кабинета и нажми «Поставить кабинет»
              </Banner>
            )}
          </AnimatePresence>
        </div>

        {/* Уведомление о постановке */}
        <AnimatePresence>
          {justPlaced && (
            <motion.div
              key={justPlaced + String(placedCount)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-44 left-1/2 -translate-x-1/2 rounded-full border border-neon/40 bg-black/70 px-4 py-2 text-xs text-neon backdrop-blur-md"
            >
              ✅ Поставлен: {justPlaced}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Низ: ввод названия + кнопки */}
        <div className="absolute bottom-0 left-0 right-0 safe-bottom pointer-events-auto px-4 pb-4">
          {tracking && (
            <div className="glass-strong mb-3 flex items-center gap-2 p-2">
              <span className="pl-1 text-lg">🚪</span>
              <input
                className="admin-input flex-1"
                value={nameDraft}
                placeholder={`Название (или «Кабинет ${buildingData.rooms.length + 1}»)`}
                onChange={(e) => setNameDraft(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <RoundBtn
              onClick={() => {
                setPhase('setup');
              }}
              label="Калибровка"
            >
              🎯
            </RoundBtn>

            {tracking && (
              <button
                onClick={dropCabinet}
                className="flex-1 rounded-2xl border border-neon/60 bg-neon/20 py-3.5 text-sm font-bold text-neon shadow-neon active:scale-95"
              >
                📍 Поставить кабинет здесь
              </button>
            )}

            <RoundBtn
              label={`${placedCount}`}
              onClick={() => undefined}
            >
              🗂️
            </RoundBtn>
            <RoundBtn onClick={() => navigate('/admin')} label="Готово">
              ✕
            </RoundBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Banner({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className={`glass-strong mx-auto flex max-w-md items-center justify-center px-5 py-3.5 text-center text-sm font-semibold ${color}`}
    >
      {children}
    </motion.div>
  );
}

function RoundBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
      aria-label={label}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/40 text-lg text-white/80 backdrop-blur-md">
        {children}
      </span>
      <span className="text-[10px] text-white/50">{label}</span>
    </button>
  );
}
