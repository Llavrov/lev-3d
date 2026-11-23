// Боковые шаги в резинке: мини-петля на голенях над щиколотками, полуприсед, две пары шагов вправо и две обратно.
// Ведущая стопа уходит в сторону, вторая подтягивается, но не до конца: стопы всё время шире таза и параллельны,
// резинка натянута. Таз низко и ровно, корпус чуть вперёд, руки перед собой. Шаги — общие с приставными (shuffles).
import { cm } from '../poses.js';
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { pelvisTilt } from '../jump.js';
import { shuffles } from './lateral-shuffle.js';
import { loop, wrap, restLength, loopAudit, reachAudit, gazeAudit } from '../bandlegs.js';

const P0 = 0.5, PAIR = 0.95, STEP = 0.22, TOE = 0.1;

function build(T) {
  const { rig } = T, leg = rig.L1 + rig.L2, y = rig.ankleH + 0.86 * leg, half = T.hipHalf + 0.07, X0 = STEP;
  const S = script(P0 + 4 * PAIR, { Left: { x: X0 + half, z: 0, yaw: TOE }, Right: { x: X0 - half, z: 0, yaw: -TOE } });
  const k = (yy) => ({ y: yy, dx: 0, dz: 0, yaw: 0, hips: 0, torso: 0, elev: 76, run: 0 });
  S.key(0, k(y)).key(P0, k(y));
  const mid = shuffles(S, P0, X0, -1, 2, 0, { half, step: STEP, pair: PAIR });
  shuffles(S, P0 + 2 * PAIR, mid, 1, 2, 0, { half, step: STEP, pair: PAIR });
  for (let i = 0; i < 4; i++) S.key(P0 + (i + 0.38) * PAIR, k(y - 0.02)).key(P0 + (i + 0.9) * PAIR, k(y)); // в широкой стойке таз чуть ниже
  T.half = half;
  return S.done();
}

export default {
  id: 'lateral-band-walk',
  name: 'Боковые шаги в резинке',
  muscles: { work: ['hip_abductors', 'glutes'], stretch: [], careful: ['knee'] },
  phases: [
    { name: 'стойка', cue: 'Полуприсед, резинка натянута', tempo_s: P0 },
    { name: 'шаг', cue: 'Шаг в сторону, стопы параллельно', tempo_s: 2 * PAIR },
    { name: 'приставь', cue: 'Ноги не сводятся до конца', tempo_s: 2 * PAIR },
  ],
  dose: { sets: '2', reps: '10–20 шагов', rest_s: 30 },
  mistakes: ['Ноги сходятся полностью', 'Носки разворачиваются наружу', 'Таз прыгает вверх-вниз'],
  view: 'front',
  wide: true,
  flat: 'front',
  setup(T) {
    measureFeet(T);
    T.loop = loop(T, 'shin');
    restLength(T, T.loop); // в спокойной стойке на ширине таза петля почти не тянется
    T.S = build(T);
  },
  pose(T, { t }) { gait(T, T.S, t); wrap(T, T.loop); },
  audit(T) {
    const r = loopAudit(T, T.loop, legAudit(T), 1.08), L = T.gait.f.Left, R = T.gait.f.Right;
    r.m.feetApart = cm(L.x - R.x);
    if (L.x - R.x < 2 * T.hipHalf + 0.06) r.bad.push(`стопы сошлись: ${r.m.feetApart} см`);
    r.m.tilt = pelvisTilt(T.rig);
    if (r.m.tilt > 5) r.bad.push(`таз качается: ${r.m.tilt}°`);
    return gazeAudit(T, reachAudit(T, r));
  },
};
