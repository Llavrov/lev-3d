// Наружная ротация бедра стоя: мини-петля над коленями, четверть приседа, стопы чуть шире таза. Одно колено
// разворачивается наружу против резинки (бедро крутится в тазобедренном, стопа стоит на месте), держит и медленно
// возвращается; таз и корпус смотрят прямо. Поочерёдно (span 2): чётный цикл левое колено, нечётный правое.
// Удержание 2 с вместо 5 с базы: для показа.
import * as THREE from 'three';
import { deg, smooth, w, SIDES, sgn, ruSide, cm, baseAudit } from '../poses.js';
import { kneeDir } from '../steps.js';
import { mod, arms, body, pelvisTilt } from '../jump.js';
import { loop, wrap, restLength, loopAudit, reachAudit, gazeAudit } from '../bandlegs.js';

const C = 4.5, TOE = 0.12, TURN = 32; // цикл одной ноги, с; носки наружу, рад; разворот бедра, °
const side = (t) => (Math.floor(t / C) % 2 ? 'Right' : 'Left');

// Нога s целиком поворачивается вокруг оси таз → щиколотка на a° коленом наружу, стопа остаётся как стояла.
function turnOut(T, s, a) {
  const { rig } = T, hip = w(rig, s + 'UpLeg'), ax = w(rig, s + 'Foot').sub(hip).normalize();
  const footQ = rig.b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion()), toeQ = rig.b[s + 'ToeBase'].getWorldQuaternion(new THREE.Quaternion());
  const k0 = w(rig, s + 'Leg'), q = new THREE.Quaternion().setFromAxisAngle(ax, deg(a));
  const k1 = k0.clone().sub(hip).applyQuaternion(q);
  if (k1.x * sgn(s) < (k0.x - hip.x) * sgn(s)) q.setFromAxisAngle(ax, -deg(a)); // знак — туда, где колено уходит наружу
  rig.turnWorld(rig.b[s + 'UpLeg'], q);
  rig.setWorld(rig.b[s + 'Foot'], footQ); rig.setWorld(rig.b[s + 'ToeBase'], toeQ);
  rig.root.updateMatrixWorld(true);
}

export default {
  id: 'standing-hip-er-band',
  name: 'Наружная ротация бедра стоя',
  muscles: { work: ['glutes', 'hip_abductors'], stretch: ['adductors'], careful: ['knee'] },
  phases: [
    { name: 'поворот', cue: 'Разверни колено наружу', tempo_s: 1 },
    { name: 'держи', cue: 'Держи, таз смотрит прямо', tempo_s: 2, stretch: true },
    { name: 'возврат', cue: 'Медленно вернись', tempo_s: 1.5 },
  ],
  dose: { sets: '3', reps: '20 на ногу', rest_s: 30 },
  mistakes: ['Поворот корпусом вместо бедра', 'Стопа отрывается от пола'],
  view: 'front',
  flat: 'front',
  pace: 'В жизни держи 5 с', // показ держит 2 с
  span: 2,
  setup(T) {
    const { rig } = T;
    T.er = { y: rig.ankleH + 0.89 * (rig.L1 + rig.L2), half: T.hipHalf + 0.05 };
    this.pose(T, { t: 0, depth: 0 });
    T.loop = loop(T, 'knee');
    restLength(T, T.loop, 0.9);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { t, depth }) {
    T.tNow = t; T.depth = depth;
    const s = side(t), { y, half } = T.er, ft = {};
    for (const k of SIDES) ft[k] = { pos: new THREE.Vector3(sgn(k) * half, 0, 0), lift: 0, yaw: sgn(k) * TOE };
    body(T, { M: new THREE.Vector3(0, y, -0.03), ft, el: 80, knees: SIDES, arm: arms({ out: 0.25, bend: 100, fwd: 12 }) });
    turnOut(T, s, TURN * depth);
    if (T.loop) wrap(T, T.loop);
  },
  audit(T) {
    const { rig } = T, s = side(T.tNow), o = s === 'Left' ? 'Right' : 'Left';
    const r = loopAudit(T, T.loop, baseAudit(T, { feet: ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] }), 1.05);
    r.m.kneeOut = -Math.round(kneeDir(T, s, sgn(s) * TOE)); r.m.kneeIn = Math.round(kneeDir(T, o, sgn(o) * TOE));
    if (T.depth > 0.99 && r.m.kneeOut < 12) r.bad.push(`${ruSide(s)} колено мало развёрнуто: ${r.m.kneeOut}°`);
    if (r.m.kneeIn > 10) r.bad.push(`${ruSide(o)} колено завалено внутрь: ${r.m.kneeIn}°`);
    const d = w(rig, 'LeftUpLeg').sub(w(rig, 'RightUpLeg')); r.m.pelvisYaw = Math.round(Math.abs(THREE.MathUtils.radToDeg(Math.atan2(d.z, d.x))));
    if (r.m.pelvisYaw > 3) r.bad.push(`таз повернулся: ${r.m.pelvisYaw}°`);
    r.m.tilt = pelvisTilt(rig);
    if (r.m.tilt > 3) r.bad.push(`таз не ровно: ${r.m.tilt}°`);
    return gazeAudit(T, reachAudit(T, r));
  },
};
