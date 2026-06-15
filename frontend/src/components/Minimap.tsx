/**
 * 2D-миникарта (вид сверху) на SVG.
 *
 * Отображает: граф коридоров текущего этажа, маршрут (неоновая
 * полилиния с пройденной/оставшейся частью), позицию пользователя
 * с направлением, точку назначения, прогресс и оставшееся расстояние.
 *
 * Проекция: ось X модели → экранный X, ось Z модели → экранный Y.
 */
import { useMemo } from 'react';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSettingsStore } from '@/store/useSettingsStore';

interface MinimapProps {
  /** Компактный режим — оверлей в углу AR-экрана. */
  compact?: boolean;
  className?: string;
}

const PADDING = 18;

export function Minimap({ compact = false, className = '' }: MinimapProps) {
  const route = useNavigationStore((s) => s.route);
  const graph = useNavigationStore((s) => s.graph);
  const userPosition = useNavigationStore((s) => s.userPosition);
  const userHeading = useNavigationStore((s) => s.userHeading);
  const userFloor = useNavigationStore((s) => s.userFloor);
  const progress = useNavigationStore((s) => s.progress);
  const endRoom = useNavigationStore((s) => s.endRoom);
  const routeColor = useSettingsStore((s) => s.routeColor);

  const width = compact ? 168 : 360;
  const height = compact ? 168 : 420;

  // Видимая область: маршрут целиком либо весь граф этажа
  const view = useMemo(() => {
    const pts =
      route?.points ??
      graph
        .getNodes()
        .filter((n) => n.floor === userFloor)
        .map((n) => n.position);
    if (pts.length === 0) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    // Не даём схлопнуться при коротком маршруте
    if (maxX - minX < 10) { const c = (minX + maxX) / 2; minX = c - 5; maxX = c + 5; }
    if (maxZ - minZ < 10) { const c = (minZ + maxZ) / 2; minZ = c - 5; maxZ = c + 5; }
    return { minX, maxX, minZ, maxZ };
  }, [route, graph, userFloor]);

  const scale = Math.min(
    (width - PADDING * 2) / (view.maxX - view.minX),
    (height - PADDING * 2) / (view.maxZ - view.minZ),
  );

  const toScreen = (x: number, z: number): [number, number] => [
    PADDING + (x - view.minX) * scale,
    PADDING + (z - view.minZ) * scale,
  ];

  // Полилиния маршрута: пройденная и оставшаяся части
  const { passedPath, aheadPath } = useMemo(() => {
    if (!route) return { passedPath: '', aheadPath: '' };
    const splitIdx = Math.max(
      1,
      Math.round(progress.fraction * (route.points.length - 1)),
    );
    const toPath = (pts: typeof route.points) =>
      pts
        .map((p, i) => {
          const [sx, sy] = toScreen(p.x, p.z);
          return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
        })
        .join(' ');
    return {
      passedPath: toPath(route.points.slice(0, splitIdx + 1)),
      aheadPath: toPath(route.points.slice(splitIdx)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, progress.fraction, scale, view]);

  // Рёбра графа текущего этажа (подложка коридоров)
  const corridorLines = useMemo(() => {
    return graph
      .getEdges()
      .map((e) => {
        const a = graph.getNode(e.from)!;
        const b = graph.getNode(e.to)!;
        if (a.floor !== userFloor && b.floor !== userFloor) return null;
        const [x1, y1] = toScreen(a.position.x, a.position.z);
        const [x2, y2] = toScreen(b.position.x, b.position.z);
        return { x1, y1, x2, y2, id: e.id };
      })
      .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; id: string }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, userFloor, scale, view]);

  const userScreen = userPosition ? toScreen(userPosition.x, userPosition.z) : null;
  const destNode = endRoom ? graph.getNode(endRoom.nodeId) : null;
  const destScreen = destNode ? toScreen(destNode.position.x, destNode.position.z) : null;

  return (
    <div className={`glass-strong overflow-hidden ${className}`}>
      <svg width={width} height={height} className="block">
        {/* Сетка-фон */}
        <defs>
          <pattern id="mmgrid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="rgba(0,229,255,.07)" strokeWidth="1" />
          </pattern>
          <filter id="mmglow">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={width} height={height} fill="rgba(5,8,15,.82)" />
        <rect width={width} height={height} fill="url(#mmgrid)" />

        {/* Коридоры */}
        {corridorLines.map((l) => (
          <line
            key={l.id}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(120,160,200,.22)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

        {/* Маршрут: пройдено / впереди */}
        {passedPath && (
          <path d={passedPath} fill="none" stroke="rgba(0,229,255,.28)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {aheadPath && (
          <path
            d={aheadPath}
            fill="none"
            stroke={routeColor}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#mmglow)"
          >
            <animate attributeName="stroke-opacity" values="1;.6;1" dur="2s" repeatCount="indefinite" />
          </path>
        )}

        {/* Точка назначения */}
        {destScreen && (
          <g transform={`translate(${destScreen[0]},${destScreen[1]})`}>
            <circle r="7" fill="none" stroke="#ff2d78" strokeWidth="2">
              <animate attributeName="r" values="5;9;5" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#ff2d78" />
          </g>
        )}

        {/* Пользователь */}
        {userScreen && (
          <g transform={`translate(${userScreen[0]},${userScreen[1]}) rotate(${(userHeading * 180) / Math.PI})`}>
            <polygon points="0,-9 6,7 0,3 -6,7" fill="#aaff00" filter="url(#mmglow)" />
          </g>
        )}
      </svg>

      {/* Панель прогресса */}
      {!compact && route && (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-white/60">
            <span>Пройдено {Math.round(progress.fraction * 100)}%</span>
            <span>
              Осталось <span className="neon-text font-semibold">{progress.remaining.toFixed(0)} м</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-neon shadow-neon transition-all duration-300"
              style={{ width: `${progress.fraction * 100}%` }}
            />
          </div>
        </div>
      )}
      {compact && route && (
        <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-semibold text-neon">
          {progress.remaining.toFixed(0)} м · {Math.round(progress.fraction * 100)}%
        </div>
      )}
    </div>
  );
}
