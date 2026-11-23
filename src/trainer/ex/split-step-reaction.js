// Сплит-степ с реакцией, поочерёдно: чётный цикл первый шаг вправо, нечётный влево (span 2). Готовая стойка →
// подсед → низкий прыжок (стопы над полом 5–6 см) → приземление на подушечки в стойку шире → первый шаг наружу
// с раскрытым носком, дальняя нога толкает с подушечки → возврат в центр. Вид спереди: видно ширину и сторону.
import * as THREE from 'three';
import { lerp, w, sgn } from '../poses.js';
import { mod, ss, seg, hop, other, arms, track, footAt, body, measureFloor, legAudit } from '../jump.js';

const C = 4; // цикл на сторону, с
const side = (t) => (Math.floor(t / C) % 2 ? 'Left' : 'Right'); // сторона сигнала

export default {
  id: 'split-step-reaction',
  name: 'Сплит-степ с реакцией',
  muscles: { work: ['calves', 'quads', 'glutes', 'adductors'], stretch: [], careful: ['ankle', 'knee'] },
  phases: [
    { name: 'сплит', cue: 'Низкий прыжок с носков', tempo_s: 1 },
    { name: 'приземление', cue: 'На носки, стойка шире', tempo_s: 1 },
    { name: 'старт', cue: 'Шаг к сигналу, носок наружу', tempo_s: 1 },
    { name: 'возврат', cue: 'Вернись в центр', tempo_s: 1 },
  ],
  mistakes: ['Высокий прыжок', 'Приземление на пятки', 'Прямые ноги после приземления'],
  dose: { sets: '5', reps: '1 серия × 6 стартов', rest_s: 45 },
  view: 'front',
  pace: 'В жизни быстрее: прыжок и сразу шаг', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  flat: 'front',
  span: 2,
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH;
    const W0 = T.hipHalf + 0.05, W1 = W0 + 0.13, OUT = W1 + 0.30;
    // Стоянки ведущей (к сигналу) и дальней стопы, x со знаком «к сигналу» (+).
    T.ss = {
      lead: [{ a: 0, b: 0.72, x: W0, z: 0 }, { a: 1.0, b: 2.1, x: W1, z: 0, h: 0.055 }, { a: 2.42, b: 3.0, x: OUT, z: 0.1, yaw: 0.45 },
        { a: 3.38, b: 4.72, x: W0, z: 0 }],
      far: [{ a: 0, b: 0.72, x: -W0, z: 0 }, { a: 1.0, b: 3.42, x: -W1, z: 0, h: 0.055 }, { a: 3.72, b: 4.72, x: -W0, z: 0, h: 0.05 }],
    };
    const Hr = A + 0.95 * L, Hlow = A + 0.89 * L;
    T.ssHips = track([[0, { x: 0, y: Hr }], [0.35, { x: 0, y: Hr }], [0.6, { x: 0, y: Hr - 0.035 }], [0.72, { x: 0, y: Hr + 0.005 }],
      [1.0, { x: 0, y: Hr - 0.02 }], [1.3, { x: 0, y: Hlow }], [2.05, { x: 0, y: Hlow }], [2.45, { x: 0.22, y: Hlow - 0.04 }],
      [3.0, { x: 0.22, y: Hlow - 0.04 }], [3.45, { x: 0.02, y: Hlow + 0.02 }], [3.9, { x: 0, y: Hr }]], C);
  },
  feet(T, t) {
    const s = side(t), o = other(s), k = sgn(s), tau = mod(t, C), base = t - tau;
    const f = (plan) => { const r = footAt(plan, C, tau, 0.08); r.pos.x *= k; r.yaw *= k; if (r.planted) r.t0 += base; return r; };
    const st = { [s]: f(T.ss.lead), [o]: f(T.ss.far) };
    for (const x of [s, o]) st[x].land = st[x].planted && (Math.abs(tau - 1.0) < 0.35 || (x === s && Math.abs(tau - 2.42) < 0.2));
    // носки: толчок с подушечек, приземление на подушечки, дальняя толкает в старте
    const push = ss(tau, 0.55, 0.72), land = 1 - ss(tau, 1.05, 1.5), air = tau > 0.72 && tau < 1.0;
    for (const x of [s, o]) st[x].toe = air ? 0.7 : tau < 1 ? 0.35 * push : 0.35 * land;
    st[o].toe = Math.max(st[o].toe, 0.35 * ss(tau, 2.05, 2.4) * (1 - ss(tau, 3.0, 3.4)));
    st[s].toe = Math.max(st[s].toe, tau > 2.42 && tau < 3.0 ? 0.3 * (1 - ss(tau, 2.42, 2.7)) : 0);
    if (air) { // в полёте стопы чуть выше дуги переноса: прыжок с поджатыми стопами
      const u = seg(tau, 0.72, 1.0);
      for (const x of [s, o]) st[x].lift = 0.055 * hop(u);
    }
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const st = this.feet(T, t), tau = mod(t, C), s = side(t), k = sgn(s), h = T.ssHips(tau);
    const M = new THREE.Vector3(h.x * k, h.y + (tau > 0.72 && tau < 1.0 ? 0.05 * hop(seg(tau, 0.72, 1.0)) : 0), 0);
    const ft = {};
    for (const x of ['Left', 'Right']) ft[x] = { pos: st[x].pos, lift: st[x].lift, yaw: st[x].yaw, toe: st[x].toe };
    const swing = 18 * Math.sin(Math.PI * seg(tau, 0.45, 1.2)); // мах рук вверх-вперёд на толчке
    body(T, { M, ft, el: lerp(78, 74, ss(tau, 1.0, 1.3)) , arm: arms({ r: swing, l: swing, out: 0.28 }) });
  },
  audit(T) {
    const r = legAudit(T, this, T.tNow);
    r.m.feetW = +(w(T.rig, 'LeftFoot').x - w(T.rig, 'RightFoot').x).toFixed(2);
    return r;
  },
};
