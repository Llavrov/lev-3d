// Интервалы «розыгрыш» (цикл 10,4 с, 24.11.2026): одно «очко» в настоящем темпе и отдых. Очко: сплит-степ (подскок,
// стопы встают шире, таз приседает), выход вправо скрестным шагом и бег к мячу 3,2 м (crossover-step-drill: S.run,
// до ~4,2 м/с, между опорами полёт), торможение лицом к сетке, возврат в центр приставными и снова сплит-степ.
// Отдых: спокойный шаг на месте, корпус прямо, руки висят. Было: выход на 0,8 м шагом — Лёва: «не бег, а ходьба».
// Настоящие длительности (10–15 с работы, 20 с отдыха) в подсказке и дозировке: показ сжат, чтобы влез в один проход.
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { crossover, recover, pose } from './crossover-step-drill.js';

const X0 = 0, HALF = 0.25, WIDE = 0.3, WORK = 6.4, REST = 4; // середина стойки, полуширина до и после сплит-степа, с

// Сплит-степ на месте: обе стопы в воздухе, встают на полуширину half вокруг x0.
export function splitStep(S, t, x0, half, yawOut = 0.1, extra = {}) {
  S.step('Left', t, t + 0.22, x0 + half, 0, yawOut, { h: 0.04, ...extra.Left });
  S.step('Right', t, t + 0.22, x0 - half, 0, -yawOut, { h: 0.04, ...extra.Right });
}

export function build(T) {
  const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, low = A + 0.8 * L, tall = A + 0.93 * L;
  const S = script(WORK + REST, { Left: { x: X0 + HALF, z: 0, yaw: 0.1 }, Right: { x: X0 - HALF, z: 0, yaw: -0.1 } });
  const t0 = 0.55; // начало выхода
  S.at(0, X0, 0);
  splitStep(S, 0.2, X0, WIDE, 0.1, { Left: { follow: 0.6 }, Right: { pivot: [-1.2, t0 + 0.1, t0 + 0.45] } });
  pose(S, 0, { y: low + 0.03, elev: 74 }); pose(S, 0.3, { y: low + 0.05, elev: 74 }); // подскок и мягкая посадка
  const c = crossover(S, t0, X0, { L, A, low, half: WIDE });
  const t = recover(S, c.t + 0.05, c.x, X0, { low, n: 7, pair: 0.36 });
  splitStep(S, t + 0.12, X0, HALF);
  pose(S, t + 0.25, { y: low + 0.04, elev: 74 }); pose(S, t + 0.42, { y: low - 0.02 });
  if (t + 0.5 > WORK) throw new Error(`розыгрыш: очко ${(t + 0.5).toFixed(2)} с длиннее ${WORK}`);
  for (let i = 0; i < 4; i++) { // отдых: шаг на месте, раз в секунду
    const s = i % 2 ? 'Right' : 'Left', q = WORK + 0.2 + i * 0.95;
    S.step(s, q, q + 0.5, X0 + (s === 'Left' ? HALF : -HALF), 0, s === 'Left' ? 0.1 : -0.1, { h: 0.05 });
  }
  S.at(WORK, X0, 0);
  pose(S, WORK + 0.3, { y: tall, elev: 89, hang: 1 }); pose(S, WORK + REST - 0.4, { y: tall, elev: 89, hang: 1 });
  S.low = true; // игровая стойка: низкий таз — суть упражнения («высокий центр тяжести» в ошибках)
  return S.done();
}

export default {
  id: 'court-intervals',
  name: 'Интервалы «розыгрыш»',
  muscles: { work: ['quads', 'glutes', 'calves', 'hamstrings'], stretch: [], careful: ['ankle'] },
  phases: [
    { name: 'выход', cue: 'Сплит-степ и беги к мячу', tempo_s: 2.1 },
    { name: 'стоп', cue: 'Тормози, лицом к сетке', tempo_s: 1.1 },
    { name: 'возврат', cue: 'Приставными в центр, сплит-степ', tempo_s: WORK - 3.2 },
    { name: 'отдых', cue: 'Спокойный шаг, дыши', tempo_s: REST },
  ],
  dose: { sets: '3', reps: '6–8 очков: 12 с работы, 20 с отдыха', rest_s: 90 },
  mistakes: ['Слишком короткий отдых', 'Ленивая работа без сплит-степа'],
  view: 'front',
  pace: 'Работа на максимуме, отдых шагом', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  follow: true, // камера едет за человеком: путь 3,8 м
  runs: { s: 0.6, flight: 0.2 }, // обещание «это бег»: проверяет __trainer.run()
  flat: 'front',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { gait(T, T.S, t); },
  audit(T) { return legAudit(T); },
};
