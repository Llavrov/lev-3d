// Скрестный шаг к мячу вправо (цикл 3,5 с): из стойки лицом к сетке правая (ближняя к мячу) стопа разворачивается
// на подушечке носком вправо, таз и плечи за ней; левая (дальняя) идёт через — дугой перед правой голенью; правая
// делает быстрый шаг и тормозит, левая встаёт рядом, тело снова лицом к сетке. Возврат тремя приставными.
// Путь 0,9 м туда и обратно: на 375 px фигура остаётся в кадре.
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { shuffles } from './lateral-shuffle.js';

const HALF = 0.25, X0 = 0.45, CROSS = 0.45, RUN = 0.45; // полуширина стойки, середина старта, длина скрестного и быстрого шага, м

export function crossover(S, t0, x0, o = {}) {
  // Вправо (−X). Правая стоит с начала: разворот задаётся её стоянкой (pivot) снаружи, здесь только шаги.
  const xr = x0 - HALF, xl = xr - (o.cross ?? CROSS), xr2 = xl - (o.run ?? RUN);
  S.step('Left', t0 + 0.38, t0 + 0.82, xl, 0.22, -1.3, { h: 0.1, arc: { x: 0, z: 0.2 } }); // через перед правой
  S.step('Right', t0 + 0.92, t0 + 1.18, xr2, -0.04, -1.4, { h: 0.08, arc: { x: 0, z: -0.14 }, pivot: [-0.1, t0 + 1.3, t0 + 1.65] }); // шаг и торможение, носок к сетке
  S.step('Left', t0 + 1.28, t0 + 1.62, xr2 + 2 * HALF, 0, 0.1, { h: 0.06 }); // левая рядом: снова стойка
  return xr2 + HALF; // середина стойки после торможения
}

export function build(T) {
  const { rig } = T, leg = rig.L1 + rig.L2, low = rig.ankleH + 0.8 * leg;
  const S = script(3.5, { Left: { x: X0 + HALF, z: 0, yaw: 0.1, follow: 0.6 }, Right: { x: X0 - HALF, z: 0, yaw: -0.1, pivot: [-1.2, 0.1, 0.45] } });
  const c = crossover(S, 0, X0);
  shuffles(S, 1.8, c, 1, 3, 0, { half: HALF, step: (X0 - c) / 3, pair: 0.55 });
  const k = (t, yaw, elev, run, y = low) => S.key(t, { y, dx: 0, dz: 0, yaw, hips: 0, torso: 0, elev, run, gait: run, v: 3 }); // gait: нога в махе по клипу бега там, где бежит
  k(0, 0, 72, 0); k(0.1, 0, 72, 0); k(0.45, -48, 68, 0.6); k(0.85, -62, 64, 1, low + 0.03); k(1.2, -58, 66, 1, low + 0.02);
  k(1.5, -35, 70, 0.4, low - 0.02); k(1.75, 0, 72, 0, low - 0.02); k(2.2, 0, 72, 0);
  S.stride = 0.55;
  S.low = true; // игровая стойка: низкий таз — суть упражнения («высокий центр тяжести» в ошибках)
  return S.done();
}

export default {
  id: 'crossover-step-drill',
  name: 'Скрестный шаг к мячу',
  muscles: { work: ['glutes', 'hip_flexors', 'obliques', 'calves'], stretch: ['adductors'], careful: ['ankle'] },
  phases: [
    { name: 'разворот', cue: 'Правая стопа носком вправо', tempo_s: 0.5 },
    { name: 'скрест', cue: 'Левая нога через правую', tempo_s: 0.5 },
    { name: 'разгон', cue: 'Быстрый шаг и торможение', tempo_s: 0.7 },
    { name: 'возврат', cue: 'Назад приставными, лицом к сетке', tempo_s: 1.8 },
  ],
  dose: { sets: '2', reps: '6 на сторону', rest_s: 45 },
  mistakes: ['Шаг назад перед стартом', 'Высокий центр тяжести'],
  view: 'front',
  pace: 'В жизни первый шаг взрывной', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  follow: true, // камера едет за человеком: весь путь в кадре делал его мелким на телефоне
  flat: 'front',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { gait(T, T.S, t); },
  audit(T) { return legAudit(T); },
};
