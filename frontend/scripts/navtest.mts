import { collegeBuildingData } from '../src/navigation/collegeBuilding';
import { NavigationGraph } from '../src/navigation/graph';
import { buildRoute, routeProgress, nextStep } from '../src/navigation/routeBuilder';
import { alternativeRoute, aStar } from '../src/algorithms/astar';

const g = new NavigationGraph(collegeBuildingData.nodes, collegeBuildingData.edges);

const pairs: [string, string][] = [
  ['n-вход', 'n-104'],
  ['n-вход', 'n-гардероб'],
  ['n-вход', 'n-столовая-1'],
  ['n-101', 'n-126'],
  ['n-103', 'n-спорт-зал'],
];

let fails = 0;
for (const [f, t] of pairs) {
  const r = buildRoute(g, f, t);
  if (!r) {
    console.log('FAIL', f, '->', t);
    fails++;
    continue;
  }
  console.log('OK', f, '->', t, r.totalDistance.toFixed(1) + 'м', r.steps.length, 'шагов');
}
console.log(`Маршруты: ${pairs.length - fails}/${pairs.length} построены`);

const r = buildRoute(g, 'n-вход', 'n-104')!;
console.log('Вход → Каб.104:', r.totalDistance.toFixed(1), 'м, этажи', r.floorsVisited.join('→'));
r.steps.slice(0, 5).forEach((s) => console.log('  •', s.instruction));

const prog = routeProgress(r, { x: 5.0, y: -0.8, z: 12.0 });
console.log('Прогресс от входа:', (prog.fraction * 100).toFixed(0) + '%', 'осталось', prog.remaining.toFixed(0), 'м');
console.log('Следующий шаг:', nextStep(r, prog.travelled)?.instruction);

const primary = aStar(g, 'n-вход', 'n-столовая-1')!;
const alt = alternativeRoute(g, primary);
console.log('Альтернативный маршрут:', alt ? `найден (${alt.length} узлов vs ${primary.length})` : 'нет');
