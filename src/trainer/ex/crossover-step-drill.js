// Скрестный шаг к мячу вправо в настоящем темпе (цикл 6 с, 24.11.2026). Из стойки лицом к сетке правая (ближняя
// к мячу) стопа разворачивается на подушечке носком вправо, таз и плечи за ней; левая (дальняя) идёт через — дугой
// перед правой голенью; дальше бег к мячу (S.run: разгон до ~4,4 м/с, между опорами полёт), торможение широкой
// стойкой лицом к сетке и возврат в центр приставными в живом темпе. Путь около 3,7 м, камера едет за человеком.
// Было: скрестный и один «быстрый» шаг, путь 0,9 м — Лёва: «там не бег, там какая-то ходьба».
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { shuffles } from './lateral-shuffle.js';

const HALF = 0.25, CROSS = 0.45; // полуширина стойки, длина скрестного шага, м
const C = 6, T0 = 0.3, N = 8, PAIR = 0.34; // цикл; начало выхода; пары приставных на возврат и их длительность, с

// Ключ тела со всеми полями: кривая берёт недостающие из первого ключа.
export const pose = (S, t, o) => S.key(t, { dx: 0, dz: 0, yaw: 0, hips: 0, torso: 0, elev: 72, run: 0, gait: 0, hang: 0, v: 3, ...o });

// Выход вправо (−X) от стойки с серединой x0 в секунду t0: разворот правой, скрестный шаг левой, бег к мячу, торможение
// лицом к сетке стопами на полуширине half. Разворот правой (pivot [−1.2, t0+0.1, t0+0.45]) задаёт её стоянка снаружи.
// Ставит шаги, путь таза и ключи тела; возвращает { t, x } — когда и где стоит после торможения.
export function crossover(S, t0, x0, { L, A, low, half = HALF, dist = 3.2, v = 4.2 }) {
  const xr = x0 - half, xl = xr - CROSS, y = (k) => A + k * L, PI = Math.PI;
  S.step('Left', t0 + 0.38, t0 + 0.82, xl, 0.22, -1.3, { h: 0.1, arc: { x: 0, z: 0.2 } }); // через перед правой
  S.at(t0, x0, 0).at(t0 + 0.4, x0 - 0.12, 0.04);
  // Правая толкается, когда левая встаёт, и бег пошёл: разгон за 1 м, ровно, торможение за 1,2 м до остановки
  // (S.run сам приставляет стопы). Потом стойка лицом к сетке: левая шагает назад на свою сторону, правая наружу.
  const r = S.run({ side: 'Right', t0: t0 + 0.8, from: [xl + 0.15, 0.1], yaw: -PI / 2, v0: 1.8, segs: [[1, v, 0.2], [dist - 2.2, v, 0.35], [1.2, 0.9, 0.6]], cadence: 4, L });
  const t1 = r.t + 0.26, t2 = r.t + 0.44;
  S.plants.Right.at(-1).pivot = [-0.9, r.t, t1]; // правая крутится на подушечке за тазом, колено не заваливается
  S.step('Left', r.t + 0.06, t1, r.x + half, 0, 0.1, { h: 0.05 });
  S.step('Right', t1 - 0.04, t2, r.x - half, 0, -0.1, { h: 0.05 });
  S.at(t2 + 0.15, r.x, 0);
  pose(S, t0, { y: low }); pose(S, t0 + 0.1, { y: low });
  pose(S, t0 + 0.45, { y: low, yaw: -48, elev: 68, run: 0.6, gait: 0.6 });
  pose(S, t0 + 0.8, { y: low + 0.03, yaw: -72, elev: 64, run: 1, gait: 1, v: 3 });
  pose(S, t0 + 1.1, { y: y(0.9), yaw: -90, elev: 66, run: 1, gait: 1, v: 4 });
  pose(S, r.steps[0].t + 0.12, { y: y(0.92), yaw: -90, elev: 66, run: 1, gait: 1, v });
  pose(S, r.steps[1].t - 0.06, { y: y(0.92), yaw: -90, elev: 74, run: 0.85, gait: 1, v }); // торможение: руки вперёд
  pose(S, r.last, { y: y(0.9), yaw: -90, elev: 78, run: 0.5, gait: 0.8, v: 3 });
  pose(S, r.t, { y: y(0.88), yaw: -80, elev: 76 });
  pose(S, t1, { y: low + 0.03, yaw: -35, elev: 72 });
  pose(S, t2 + 0.15, { y: low - 0.02 });
  S.marks = { ...S.marks, run: r.steps[0].t, brake: r.last, stop: t2 + 0.15 };
  return { t: t2 + 0.15, x: r.x };
}

// Возврат в центр x0 приставными (ведёт левая) n парами по pair секунд, от стойки в x в секунду t: шаги, путь таза, ключи.
export function recover(S, t, x, x0, { low, n = N, pair = PAIR, half = HALF }) {
  const step = (x0 - x) / n;
  shuffles(S, t, x, 1, n, 0, { half, step, pair });
  for (let i = 0; i <= n; i++) S.at(t + i * pair, x + step * i, 0);
  for (let i = 0; i < n; i++) pose(S, t + (i + 0.4) * pair, { y: low - 0.03 }); // в широкой стойке таз ниже
  pose(S, t + n * pair, { y: low });
  return t + n * pair;
}

export function build(T) {
  const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, low = A + 0.8 * L;
  const S = script(C, { Left: { x: HALF, z: 0, yaw: 0.1, follow: 0.6 }, Right: { x: -HALF, z: 0, yaw: -0.1, pivot: [-1.2, T0 + 0.1, T0 + 0.45] } });
  S.at(0, 0, 0);
  pose(S, 0, { y: low });
  const c = crossover(S, T0, 0, { L, A, low });
  const t = recover(S, c.t + 0.05, c.x, 0, { low });
  if (t > C - 0.15) throw new Error(`скрестный шаг: сценарий ${t.toFixed(2)} с длиннее цикла ${C}`);
  S.marks.back = c.t + 0.05; S.marks.end = t;
  S.low = true; // игровая стойка: низкий таз — суть упражнения («высокий центр тяжести» в ошибках)
  return S.done();
}

export default {
  id: 'crossover-step-drill',
  name: 'Скрестный шаг к мячу',
  muscles: { work: ['glutes', 'hip_flexors', 'obliques', 'calves'], stretch: ['adductors'], careful: ['ankle'] },
  phases: [
    { name: 'разворот', cue: 'Правая стопа носком вправо', tempo_s: 0.7 },
    { name: 'скрест', cue: 'Левая нога через правую', tempo_s: 0.4 },
    { name: 'бег', cue: 'Беги к мячу и тормози', tempo_s: 1.9 }, // в базе у упражнения не больше четырёх фаз
    { name: 'возврат', cue: 'Назад приставными', tempo_s: 3 }, // сумма фаз = цикл C
  ],
  dose: { sets: '2', reps: '6 на сторону', rest_s: 45 },
  mistakes: ['Шаг назад перед стартом', 'Высокий центр тяжести'],
  view: 'front',
  pace: 'В жизни первый шаг взрывной',
  wide: true,
  follow: true, // камера едет за человеком: путь 3,7 м
  runs: { s: 0.6, flight: 0.2 }, // обещание «это бег»: проверяет __trainer.run()
  flat: 'front',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { gait(T, T.S, t); },
  audit(T) { return legAudit(T); },
};
