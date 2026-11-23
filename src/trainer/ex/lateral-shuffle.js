// Приставные шаги: низкая стойка лицом к сетке, две пары шагов вправо и две обратно (цикл 3,4 с, тело остаётся в кадре).
// Вправо ведёт правая: она уходит в сторону (стойка шире), левая толкает и подтягивается, но не до конца — стопы
// не сходятся и не скрещиваются. Таз всё время низко и едет между стопами, корпус чуть вперёд, руки в игровой стойке.
import { cm } from '../poses.js';
import { script, measureFeet, gait, legAudit } from '../steps.js';

const HALF = 0.26, STEP = 0.26, TOE = 0.1; // полуширина стойки, длина пары шагов, носки наружу (рад)
const P0 = 0.6, PAIR = 0.7; // стойка, одна пара шагов, с

// Пары шагов в сторону dir (−1 — вправо, в −X: у Mixamo правая сторона в −X), начиная с t0, от центра x0.
export function shuffles(S, t0, x0, dir, n, z = 0, o = {}) {
  const lead = dir < 0 ? 'Right' : 'Left', trail = lead === 'Right' ? 'Left' : 'Right', half = o.half ?? HALF, step = o.step ?? STEP, pair = o.pair ?? PAIR;
  const yaw = (s) => (s === 'Left' ? TOE : -TOE);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * pair, c = x0 + dir * step * i;
    S.step(lead, t, t + pair * 0.32, c + dir * (half + step), z, yaw(lead), { h: 0.05, push: 0 });
    S.step(trail, t + pair * 0.45, t + pair * 0.8, c + dir * (step - half), z, yaw(trail), { h: 0.04, push: 0.3 });
  }
  return x0 + dir * step * n;
}

export function build(T) {
  const { rig } = T, leg = rig.L1 + rig.L2, low = rig.ankleH + 0.78 * leg, X0 = STEP;
  const S = script(P0 + 4 * PAIR, { Left: { x: X0 + HALF, z: 0, yaw: TOE }, Right: { x: X0 - HALF, z: 0, yaw: -TOE } });
  const k = (y) => ({ y, dx: 0, dz: 0, yaw: 0, hips: 0, torso: 0, elev: 72, run: 0 });
  S.key(0, k(low)).key(P0, k(low));
  const mid = shuffles(S, P0, X0, -1, 2);
  shuffles(S, P0 + 2 * PAIR, mid, 1, 2);
  for (let i = 0; i < 4; i++) S.key(P0 + (i + 0.38) * PAIR, k(low - 0.03)).key(P0 + (i + 0.9) * PAIR, k(low)); // в широкой стойке таз ниже: колени согнуты, ноги не выпрямляются
  return S.done();
}

export default {
  id: 'lateral-shuffle',
  name: 'Приставные шаги',
  muscles: { work: ['hip_abductors', 'adductors', 'quads', 'glutes'], stretch: ['adductors'], careful: ['ankle', 'knee'] },
  phases: [
    { name: 'стойка', cue: 'Низкая стойка, стопы широко', tempo_s: P0 },
    { name: 'вправо', cue: 'Ведёт правая, левая толкает', tempo_s: 2 * PAIR },
    { name: 'влево', cue: 'Ведёт левая, стопы не сходятся', tempo_s: 2 * PAIR },
  ],
  dose: { sets: '3', reps: '2 × 18 м', rest_s: 45 },
  mistakes: ['Стопы сходятся вместе', 'Высокая стойка, таз прыгает', 'Ноги скрещиваются'],
  view: 'front',
  pace: 'В жизни быстрее, стойку не поднимай', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  flat: 'front',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { gait(T, T.S, t); },
  audit(T) {
    const r = legAudit(T);
    const L = T.gait.f.Left, R = T.gait.f.Right;
    r.m.feetApart = cm(L.x - R.x);
    if (L.x - R.x < 0.4) r.bad.push(`стопы сошлись: ${cm(L.x - R.x)} см`);
    return r;
  },
};
