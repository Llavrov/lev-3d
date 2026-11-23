// Прыжок в длину с места. Замах: руки назад, таз назад и вниз, корпус наклонён. Прыжок: мах рук вперёд-вверх, ноги
// толкают вперёд и вверх, полёт около 0,6 с на 1 м (в жизни 2 м и больше: путь показа держим до 2 м). Приземление
// на обе ноги, сразу глубоко в колени и таз назад, замереть. Возврат: по два шага каждой ногой назад на старт.
// Ракурс спереди-сбоку: видно и вылет вперёд, и посадку, и колени.
import * as THREE from 'three';
import { cm, w } from '../poses.js';
import { mod, ss, seg, hop, arms, track, footAt, body, measureFloor, legAudit } from '../jump.js';

const C = 5, TO = 1.3, TD = 1.9, D = 1.0; // цикл, отрыв, касание (с), длина прыжка (м)

export default {
  id: 'broad-jump',
  name: 'Прыжок в длину с места',
  muscles: { work: ['glutes', 'quads', 'hamstrings', 'calves'], stretch: [], careful: ['knee'] },
  phases: [
    { name: 'замах', cue: 'Руки назад, таз назад', tempo_s: 1 },
    { name: 'прыжок', cue: 'Вперёд и вверх', tempo_s: 1 },
    { name: 'приземление', cue: 'Зафиксируй посадку', tempo_s: 1.5 },
    { name: 'возврат', cue: 'Шагом назад на старт', tempo_s: 1.5 },
  ],
  mistakes: ['Посадка на прямые ноги', 'Нет паузы между прыжками'],
  dose: { sets: '4', reps: '5', rest_s: 90 },
  view: 'quarter',
  flat: 'side',
  wide: true,
  pace: 'В жизни прыжок взрывной, в полную силу',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, Hs = A + 0.95 * L, x = T.hipHalf + 0.05;
    // Стоянки стоп: старт, посадка, по два шага назад (правая, левая, правая, левая); последняя тянется до отрыва.
    const P = (a, b, z, s, h) => ({ a, b, x: s * x, z, yaw: s * 0.1, h });
    T.bj = {
      Left: [P(0, TO, 0, 1), P(TD, 3.6, D, 1, 0.16), P(3.95, 4.25, 0.5, 1, 0.07), P(4.6, C + TO, 0, 1, 0.07)],
      Right: [P(0, TO, 0, -1), P(TD, 3.45, D, -1, 0.16), P(3.75, 4.1, 0.6, -1, 0.07), P(4.4, C + TO, 0, -1, 0.07)],
    };
    // Таз (y, z) и корпус el, мах рук a.
    T.bjK = track([[0, { y: Hs, z: 0, el: 82, a: 0 }], [0.3, { y: Hs, z: 0, el: 82, a: 0 }],
      [1.0, { y: Hs - 0.2, z: -0.12, el: 42, a: -38 }], [TO, { y: Hs - 0.02, z: 0.28, el: 52, a: 120 }],
      [TD, { y: Hs - 0.08, z: D - 0.12, el: 58, a: 70 }], [2.25, { y: Hs - 0.22, z: D - 0.14, el: 45, a: 40 }],
      [3.0, { y: Hs - 0.2, z: D - 0.13, el: 47, a: 35 }], [3.4, { y: Hs, z: D - 0.02, el: 82, a: 0 }],
      [4.0, { y: Hs, z: 0.55, el: 84, a: 0 }], [4.8, { y: Hs, z: 0.03, el: 83, a: 0 }]], C);
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, st = {};
    for (const s of ['Left', 'Right']) {
      const f = footAt(T.bj[s], C, tau, 0.07);
      if (f.planted) { f.t0 += base; f.land = Math.abs(f.t0 - base - TD) < 1e-6 && tau - TD < 0.45; }
      f.toe = 0;
      if (f.planted && tau < TO) f.toe = 0.4 * ss(tau, 1.05, TO);
      if (f.planted && tau >= TD && tau < 2.0) f.toe = 0.35 * (1 - ss(tau, TD, 2.0));
      if (!f.planted && tau > TO && tau < TD) f.toe = 0.7;
      st[s] = f;
    }
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), st = this.feet(T, t), k = T.bjK(tau), air = tau > TO && tau < TD;
    const y = air ? k.y + 0.2 * hop(seg(tau, TO, TD)) : k.y;
    const ft = {};
    for (const s of ['Left', 'Right']) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: st[s].yaw, toe: st[s].toe };
    const walk = tau > 3.4 ? Math.sin(Math.PI * (tau - 3.4) / 0.6) * 12 : 0; // мах рук на шагах назад
    body(T, { M: new THREE.Vector3(0, y, k.z), ft, el: k.el, arm: arms({ r: k.a + walk, l: k.a - walk, out: 0.18, bend: tau > 3.4 ? 30 : 15, fwd: 0 }), knees: air ? [] : ['Left', 'Right'] });
  },
  audit(T) {
    const r = legAudit(T, this, T.tNow);
    r.m.hipsZ = cm(w(T.rig, 'Hips').z);
    return r;
  },
};
