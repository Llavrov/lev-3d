// Интервалы «розыгрыш» (цикл 8,8 с): одно «очко» из готовых кусков и отдых. Очко: сплит-степ (подскок, стопы
// встают шире, таз приседает), выход вправо скрестным шагом (crossover-step-drill), торможение, возврат четырьмя
// приставными (lateral-shuffle) и снова сплит-степ. Отдых: спокойный шаг на месте, корпус прямо, руки висят.
// Настоящие длительности (10–15 с работы, 20 с отдыха) в подсказке и дозировке: показ сжат, чтобы влез в один проход.
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { shuffles } from './lateral-shuffle.js';
import { crossover } from './crossover-step-drill.js';

const X0 = 0.35, HALF = 0.25, WIDE = 0.3, WORK = 4.8, REST = 4; // середина стойки, полуширина до и после сплит-степа, с

// Сплит-степ на месте: обе стопы в воздухе, встают на полуширину half вокруг x0.
export function splitStep(S, t, x0, half, yawOut = 0.1, extra = {}) {
  S.step('Left', t, t + 0.22, x0 + half, 0, yawOut, { h: 0.04, ...extra.Left });
  S.step('Right', t, t + 0.22, x0 - half, 0, -yawOut, { h: 0.04, ...extra.Right });
}

export function build(T) {
  const { rig } = T, leg = rig.L1 + rig.L2, low = rig.ankleH + 0.8 * leg, tall = rig.ankleH + 0.93 * leg;
  const S = script(WORK + REST, { Left: { x: X0 + HALF, z: 0, yaw: 0.1 }, Right: { x: X0 - HALF, z: 0, yaw: -0.1 } });
  const t0 = 0.55; // начало выхода
  splitStep(S, 0.2, X0, WIDE, 0.1, { Left: { follow: 0.6 }, Right: { pivot: [-1.2, t0 + 0.1, t0 + 0.45] } });
  const c = crossover(S, t0, X0 - WIDE + HALF, { cross: 0.45, run: 0.38 });
  shuffles(S, t0 + 1.8, c, 1, 4, 0, { half: HALF, step: (X0 - c) / 4, pair: 0.45 });
  splitStep(S, 4.3, X0, HALF);
  for (let i = 0; i < 4; i++) { // отдых: шаг на месте, раз в секунду
    const s = i % 2 ? 'Right' : 'Left', t = WORK + 0.2 + i * 0.95;
    S.step(s, t, t + 0.5, X0 + (s === 'Left' ? HALF : -HALF), 0, s === 'Left' ? 0.1 : -0.1, { h: 0.05 });
  }
  const k = (t, y, yaw, elev, run = 0, hang = 0) => S.key(t, { y, dx: 0, dz: 0, yaw, hips: 0, torso: 0, elev, run, hang, gait: run, v: 3 }); // gait: нога в махе по клипу на выходе
  k(0, low + 0.03, 0, 74); k(0.3, low + 0.05, 0, 74); k(0.45, low - 0.03, 0, 72); // подскок и мягкая посадка
  k(t0 + 0.45, low, -48, 68, 0.6); k(t0 + 0.85, low + 0.03, -62, 64, 1); k(t0 + 1.2, low + 0.02, -58, 66, 1);
  k(t0 + 1.5, low - 0.03, -35, 70, 0.4); k(t0 + 1.75, low - 0.03, 0, 72); k(4.2, low, 0, 72);
  k(4.35, low + 0.04, 0, 74); k(4.55, low - 0.02, 0, 72);
  k(WORK + 0.3, tall, 0, 86, 0, 1); k(WORK + REST - 0.4, tall, 0, 86, 0, 1);
  S.stride = 0.55;
  S.low = true; // игровая стойка: низкий таз — суть упражнения («высокий центр тяжести» в ошибках)
  return S.done();
}

export default {
  id: 'court-intervals',
  name: 'Интервалы «розыгрыш»',
  muscles: { work: ['quads', 'glutes', 'calves', 'hamstrings'], stretch: [], careful: ['ankle'] },
  phases: [
    { name: 'очко', cue: 'Сплит-степ, выход, стоп, возврат', tempo_s: WORK },
    { name: 'отдых', cue: 'Спокойный шаг, дыши', tempo_s: REST },
  ],
  dose: { sets: '3', reps: '6–8 очков: 12 с работы, 20 с отдыха', rest_s: 90 },
  mistakes: ['Слишком короткий отдых', 'Ленивая работа без сплит-степа'],
  view: 'front',
  pace: 'Работа на максимуме, отдых шагом', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  flat: 'front',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { gait(T, T.S, t); },
  audit(T) { return legAudit(T); },
};
