// Монстр-шаги с резинкой: мини-петля на голенях над щиколотками, полуприсед, стопы шире таза. Четыре шага вперёд:
// стопа уходит вперёд-наружу (дугой в сторону) и встаёт на прежней ширине, вторая так же; потом четыре шага назад
// тем же путём — человек остаётся в кадре. Стопы не сходятся, колени над носками, таз низко, корпус не качается.
import { cm } from '../poses.js';
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { pelvisTilt } from '../jump.js';
import { loop, wrap, restLength, loopAudit, reachAudit, gazeAudit } from '../bandlegs.js';

const P0 = 0.4, STEP = 0.7, D = 0.24, TOE = 0.12; // стойка, один шаг (с), вынос стопы за шаг (м), носки наружу (рад)
const PLAN = [['Right', D], ['Left', 2 * D], ['Right', 3 * D], ['Left', 3 * D], ['Right', 2 * D], ['Left', D], ['Right', 0], ['Left', 0]];

function build(T) {
  const { rig } = T, leg = rig.L1 + rig.L2, y = rig.ankleH + 0.86 * leg, half = T.hipHalf + 0.08;
  const yaw = (s) => (s === 'Left' ? TOE : -TOE), x = (s) => (s === 'Left' ? half : -half);
  const S = script(P0 + PLAN.length * STEP, { Left: { x: half, z: 0, yaw: TOE }, Right: { x: -half, z: 0, yaw: -TOE } });
  const k = (yy, dz) => ({ y: yy, dx: 0, dz, yaw: 0, hips: 0, torso: 0, elev: 74, run: 0 });
  S.key(0, k(y, 0)).key(P0, k(y, 0));
  PLAN.forEach(([s, z], i) => {
    const t = P0 + i * STEP;
    S.step(s, t, t + 0.5 * STEP, x(s), z, yaw(s), { h: 0.05, arc: { x: (s === 'Left' ? 1 : -1) * 0.07, z: 0 } });
    S.key(t + 0.25 * STEP, k(y - 0.015, 0)).key(t + 0.75 * STEP, k(y, 0)); // таз ровно над серединой стоп, едва ниже на шаге
  });
  T.half = half;
  return S.done();
}

export default {
  id: 'monster-walk-band',
  name: 'Монстр-шаги с резинкой',
  muscles: { work: ['hip_abductors', 'glutes'], stretch: [], careful: ['knee'] },
  phases: [
    { name: 'вперёд', cue: 'Полуприсед, шаг вперёд-наружу', tempo_s: P0 + 4 * STEP },
    { name: 'назад', cue: 'Колени наружу, резинка натянута', tempo_s: 4 * STEP },
  ],
  dose: { sets: '2', reps: '10–20 шагов', rest_s: 30 },
  mistakes: ['Колени сводятся внутрь', 'Корпус раскачивается', 'Стопы сходятся'],
  view: 'quarter',
  pace: 'В жизни шагай только вперёд', // показ ходит туда и обратно, чтобы человек не уходил из кадра
  wide: true,
  flat: 'front',
  setup(T) {
    measureFeet(T);
    T.loop = loop(T, 'shin');
    restLength(T, T.loop);
    T.S = build(T);
  },
  pose(T, { t }) { gait(T, T.S, t); wrap(T, T.loop); },
  audit(T) {
    const r = loopAudit(T, T.loop, legAudit(T), 1.08), L = T.gait.f.Left, R = T.gait.f.Right;
    r.m.feetApart = cm(L.x - R.x);
    if (L.x - R.x < 2 * T.hipHalf + 0.08) r.bad.push(`стопы сошлись: ${r.m.feetApart} см`);
    r.m.tilt = pelvisTilt(T.rig);
    if (r.m.tilt > 5) r.bad.push(`корпус раскачивается: таз ${r.m.tilt}°`);
    return gazeAudit(T, reachAudit(T, r));
  },
};
