// Баланс на одной ноге, поочерёдно (span 2): чётный цикл стоит на левой, нечётный на правой. Таз смещается к опорной
// (тазобедренный над стопой), свободное бедро поднято вперёд, колено согнуто, стопа на 25 см над полом. Опорное колено
// чуть согнуто (25–30°), таз ровно, руки немного в стороны, взгляд вперёд. Удержание 2,4 с вместо 30 с базы: для показа.
import * as THREE from 'three';
import { sgn, w } from '../poses.js';
import { mod, ss, other, arms, body, measureFloor, legAudit, pelvisTilt, P3 } from '../jump.js';

const C = 4, UP_ = [0.35, 1.0], DOWN = [3.4, 3.9];
const stance = (t) => (Math.floor(t / C) % 2 ? 'Right' : 'Left');

export default {
  id: 'single-leg-balance',
  name: 'Баланс на одной ноге',
  muscles: { work: ['calves', 'hip_abductors', 'glutes'], stretch: [], careful: ['ankle', 'knee'] },
  phases: [
    { name: 'стойка', cue: 'Колено чуть согнуто', tempo_s: 1 },
    { name: 'держи', cue: 'Стопа «тренога», таз ровно', tempo_s: 2.4 },
    { name: 'смена', cue: 'Поставь ногу, смени опору', tempo_s: 0.6 },
  ],
  mistakes: ['Колено заваливается внутрь', 'Таз проваливается на сторону', 'Взгляд в пол'],
  dose: { sets: '3', reps: '30 с на ногу', rest_s: 20 },
  view: 'front',
  pace: 'В жизни держи 30 с на каждой ноге', // показ идёт медленнее или короче, чем делают в жизни
  flat: 'front',
  span: 2,
  setup(T) {
    measureFloor(T);
    const { rig } = T;
    T.sb = { x: T.hipHalf, shift: 0.035, top: rig.ankleH + 0.975 * (rig.L1 + rig.L2), hold: rig.ankleH + 0.962 * (rig.L1 + rig.L2) };
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, S = stance(t), F = other(S), { x } = T.sb;
    const up = ss(tau, ...UP_) * (1 - ss(tau, ...DOWN)), st = {};
    st[S] = { pos: P3(sgn(S) * x, 0), lift: 0, yaw: 0, toe: 0, planted: true, t0: base + (tau < 0.35 ? -C + DOWN[1] : 0) }; // стояла и в конце прошлого цикла
    const air = tau > UP_[0] && tau < DOWN[1];
    st[F] = air ? { pos: P3(sgn(F) * x * 0.85, 0.13 * up), lift: 0.25 * up + 0.004, yaw: 0, toe: 0.35 * up, planted: false }
      : { pos: P3(sgn(F) * x, 0), lift: 0, yaw: 0, toe: 0, planted: true, t0: base + (tau <= UP_[0] ? -C + DOWN[1] : DOWN[1]) };
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), S = stance(t), st = this.feet(T, t), { shift, top, hold } = T.sb;
    const on = ss(tau, 0, 0.45) * (1 - ss(tau, 3.55, C)), sway = 0.006 * Math.sin((tau / C) * Math.PI * 6) * ss(tau, 1, 1.5) * (1 - ss(tau, 3.2, 3.4));
    const M = new THREE.Vector3(sgn(S) * (shift * on + sway), top + (hold - top) * on, 0);
    const ft = {};
    for (const s of ['Left', 'Right']) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: 0, toe: st[s].toe };
    body(T, { M, ft, el: 86, arm: arms({ out: 0.2 + 0.4 * on, bend: 95 - 35 * on, fwd: 15 - 5 * on }) });
  },
  audit(T) {
    const { rig } = T, r = legAudit(T, this, T.tNow), tau = mod(T.tNow, C), S = stance(T.tNow), F = other(S);
    r.m.tilt = pelvisTilt(rig);
    if (r.m.tilt > 4) r.bad.push(`таз не ровно: ${r.m.tilt}°`);
    if (tau > 1.0 && tau < 3.4) {
      r.m.kneeS = r.m['knee' + S[0]];
      if (r.m.kneeS < 22 || r.m.kneeS > 40) r.bad.push(`опорное колено ${r.m.kneeS}°, нужно чуть согнуто (22–40°)`);
      r.m.freeY = +(w(rig, F + 'Foot').y - T.floor.ank).toFixed(3);
      if (r.m.freeY < 0.15) r.bad.push(`свободная стопа низко: ${r.m.freeY} м`);
      const hipX = w(rig, S + 'UpLeg').x, footX = w(rig, S + 'Foot').x;
      r.m.hipOverFoot = +((hipX - footX) * 100).toFixed(1);
      if (Math.abs(hipX - footX) > 0.08) r.bad.push(`таз не над опорной стопой: ${r.m.hipOverFoot} см`);
    }
    return r;
  },
};
