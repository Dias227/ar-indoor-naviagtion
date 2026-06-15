import { collegeBuildingData } from '../src/navigation/collegeBuilding';
import { NavigationGraph } from '../src/navigation/graph';
import { buildRoute, routeProgress, nextStep } from '../src/navigation/routeBuilder';
import { alternativeRoute, aStar } from '../src/algorithms/astar';

const g = new NavigationGraph(collegeBuildingData.nodes, collegeBuildingData.edges);

// Все обязательные пары из ТЗ
const from = ['n-entrance','n-reception','n-library','n-cab101','n-cab304','n-hr','n-accounting'];
const to = ['n-director','n-canteen','n-assembly','n-cab204','n-cab410'];
let fails = 0;
for (const f of from) for (const t of to) {
  const r = buildRoute(g, f, t);
  if (!r) { console.log('FAIL', f, '->', t); fails++; continue; }
}
console.log(`Маршруты: ${from.length * to.length - fails}/${from.length * to.length} построены`);

const r = buildRoute(g, 'n-entrance', 'n-cab410')!;
console.log('Вход → Каб.410:', r.totalDistance.toFixed(1), 'м, этажи', r.floorsVisited.join('→'));
r.steps.forEach(s => console.log('  •', s.instruction, `(${s.cumulativeDistance.toFixed(0)} м, этаж ${s.floor})`));

const prog = routeProgress(r, { x: 1.2, y: -2, z: -15 });
console.log('Прогресс на полпути к северному крылу:', (prog.fraction*100).toFixed(0)+'%', 'осталось', prog.remaining.toFixed(0), 'м');
console.log('Следующий шаг:', nextStep(r, prog.travelled)?.instruction);

const primary = aStar(g, 'n-entrance', 'n-canteen')!;
const alt = alternativeRoute(g, primary);
console.log('Альтернативный маршрут:', alt ? `найден (${alt.length} узлов vs ${primary.length})` : 'нет (единственный путь)');

// Лифт vs лестница
const stairs = buildRoute(g, 'n-reception', 'n-cab204')!;
const elev = buildRoute(g, 'n-reception', 'n-cab204', { stairsPenalty: 2.5, elevatorPenalty: 0.6 })!;
console.log('Ресепшен → Каб.204 лестницей:', stairs.nodeIds.includes('n-stairs-1') ? 'лестница' : 'лифт', stairs.totalDistance.toFixed(0)+'м');
console.log('Ресепшен → Каб.204 с приоритетом лифта:', elev.nodeIds.includes('n-elev-1') ? 'лифт' : 'лестница', elev.totalDistance.toFixed(0)+'м');
