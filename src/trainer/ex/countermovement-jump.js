// Прыжок вверх с замахом. Присед: быстрый подсед на четверть, таз назад, руки уходят назад. Прыжок: руки махом вперёд-
// вверх, ноги разгибаются до носков, тело летит вверх (таз выше на 22 см, около 0,5 с). Приземление: сначала носки,
// потом вся стопа, колени мягко гасят вниз над носками, встать. Сбоку видно и замах рук, и подсед, и мягкую посадку.
import * as THREE from 'three';
import { cm, w } from '../poses.js';
import { mod, ss, seg, hop, arms, track, body, measureFloor, legAudit, P3 } from '../jump.js';

const C = 3, TO = 1.15, TD = 1.65; // цикл, отрыв, касание, с

export default {
  id: 'countermovement-jump',
  name: 'Прыжок вверх с замахом',
  muscles: { work: ['quads', 'glutes', 'calves'], stretch: [], careful: ['knee', 'ankle'] },
  phases: [
    { name: 'присед', cue: 'Быстрый присед, руки назад', tempo_s: 1 },
    { name: 'прыжок', cue: 'Взрывно вверх', tempo_s: 1 },
    { name: 'приземление', cue: 'Мягко, колени наружу', tempo_s: 1 },
  ],
  mistakes: ['Жёсткое приземление', 'Колени внутрь при посадке'],
  dose: { sets: '3', reps: '5', rest_s: 90 },
  view: 'side',
  flat: 'side',
  pace: 'В жизни прыжок взрывной, в полную силу',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, Hs = A + 0.95 * L;
    T.cj = { half: T.hipHalf + 0.04, Hs, up: 0.22 };
    // Таз (y, z), корпус el, мах рук a (° вперёд от отвеса), носки toe.
    T.cjK = track([[0, { y: Hs, z: 0, el: 82, a: 0, toe: 0 }], [0.3, { y: Hs, z: 0, el: 82, a: 0, toe: 0 }],
      [0.85, { y: Hs - 0.2, z: -0.1, el: 52, a: -45, toe: 0 }], [TO, { y: Hs + 0.03, z: 0, el: 84, a: 140, toe: 0.4 }],
      [TD, { y: Hs + 0.03, z: 0, el: 82, a: 115, toe: 0.4 }], [1.95, { y: Hs - 0.17, z: -0.08, el: 60, a: 30, toe: 0 }],
      [2.3, { y: Hs - 0.15, z: -0.07, el: 62, a: 25, toe: 0 }], [2.8, { y: Hs, z: 0, el: 82, a: 0, toe: 0 }]], C);
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, k = T.cjK(tau), st = {}, air = tau > TO && tau < TD, u = seg(tau, TO, TD);
    for (const [s, x] of [['Left', T.cj.half], ['Right', -T.cj.half]]) {
      st[s] = air ? { pos: P3(x, 0), lift: T.cj.up * 0.85 * hop(u), toe: 0.7, yaw: Math.sign(x) * 0.12, planted: false, u }
        : { pos: P3(x, 0), lift: 0, toe: tau >= TD ? 0.4 * (1 - ss(tau, TD, TD + 0.12)) : k.toe, yaw: Math.sign(x) * 0.12, planted: true,
          t0: tau >= TD ? base + TD : base + TD - C, land: tau >= TD && tau < TD + 0.45 };
    }
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), st = this.feet(T, t), k = T.cjK(tau), air = tau > TO && tau < TD;
    const y = air ? T.cjK(TO).y + T.cj.up * hop(seg(tau, TO, TD)) : k.y;
    const ft = {};
    for (const s of ['Left', 'Right']) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: st[s].yaw, toe: st[s].toe };
    body(T, { M: new THREE.Vector3(0, y, k.z), ft, el: k.el, arm: arms({ r: k.a, l: k.a, out: 0.18, bend: 12, fwd: 0 }), knees: air ? [] : ['Left', 'Right'] });
  },
  audit(T) {
    const r = legAudit(T, this, T.tNow);
    r.m.hipsY = cm(w(T.rig, 'Hips').y);
    return r;
  },
};
