// Выпады в ходьбе: два выпада вперёд (правая, потом левая проносится мимо и встаёт в следующий), приставить ноги,
// и тем же путём обратно двумя выпадами назад — человек остаётся в кадре (путь 1,4 м). Низ каждого выпада как в выпаде
// назад: передняя голень почти отвесно, бедро параллельно полу, заднее колено в 10–20 см от пола, задняя стопа на носке,
// корпус прямо. Руки висят вдоль тела. Вид спереди-сбоку.
import * as THREE from 'three';
import { w, cm, SIDES } from '../poses.js';
import { mod, ss, arms, track, footAt, body, measureFloor, legAudit, other } from '../jump.js';
import { legsClear } from '../steps.js';
import { reachAudit, gazeAudit } from '../bandlegs.js';

const C = 7.6;
const BOTTOM = [[1.2, 1.6, 'Right'], [2.9, 3.1, 'Left'], [4.9, 5.1, 'Right'], [6.4, 6.6, 'Left']]; // низы выпадов и передняя нога

export default {
  id: 'walking-lunge',
  name: 'Выпады в ходьбе',
  muscles: { work: ['quads', 'glutes', 'hamstrings'], stretch: ['hip_flexors'], careful: ['knee'] },
  phases: [
    { name: 'шаг', cue: 'Длинный шаг вперёд', tempo_s: 1.2 },
    { name: 'низ', cue: 'Заднее колено к полу', tempo_s: 0.4, stretch: true },
    { name: 'переход', cue: 'Вставай сразу в следующий', tempo_s: 2.2 },
    { name: 'обратно', cue: 'Обратно выпадами назад', tempo_s: 3.8 },
  ],
  dose: { sets: '2', reps: '10 на ногу', rest_s: 60 },
  mistakes: ['Короткий шаг', 'Корпус падает вперёд', 'Колено уходит внутрь'],
  view: 'quarter',
  pace: 'В жизни шагай только вперёд', // показ ходит туда и обратно, чтобы человек не уходил из кадра
  wide: true,
  follow: true, // камера едет за человеком: весь путь в кадре делал его мелким на телефоне
  flat: 'side',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, x = T.hipHalf, s = rig.L1 + rig.L2 * 0.88, s2 = 2 * s;
    T.wl = {
      Right: [{ a: 0, b: 0.15, x: -x, z: 0 }, { a: 0.7, b: 3.25, x: -x, z: s, h: 0.08 }, { a: 3.75, b: 5.25, x: -x, z: s2, h: 0.08 }, { a: 5.95, b: C + 0.15, x: -x, z: 0, h: 0.08 }],
      Left: [{ a: 0, b: 1.75, x, z: 0 }, { a: 2.45, b: 3.95, x, z: s2, h: 0.1 }, { a: 4.45, b: 6.75, x, z: s, h: 0.08 }, { a: 7.25, b: C + 1.75, x, z: 0, h: 0.08 }],
    };
    // Таз в миг постановки ниже: нога длиной 0,985 должна достать до стопы, иначе Rig.legs сам роняет таз или пятку.
    const Y = (k) => A + k * L, low = A + rig.L2 * 0.97, b = rig.L1 * 0.9;
    T.wlHips = track([[0, { z: 0, y: Y(0.975), el: 86 }], [0.15, { z: 0, y: Y(0.975), el: 86 }], [0.7, { z: s * 0.45, y: Y(0.84), el: 85 }],
      [1.2, { z: s - b, y: low, el: 84 }], [1.6, { z: s - b, y: low, el: 84 }], [2.1, { z: s + 0.02, y: Y(0.93), el: 86 }],
      [2.45, { z: s + 0.36, y: Y(0.84), el: 85 }], [2.9, { z: s2 - b, y: low, el: 84 }], [3.1, { z: s2 - b, y: low, el: 84 }],
      [3.75, { z: s2 - 0.06, y: Y(0.93), el: 86 }], [3.95, { z: s2, y: Y(0.975), el: 86 }], [4.45, { z: s2 - 0.33, y: Y(0.8), el: 85 }],
      [4.9, { z: s2 - b, y: low, el: 84 }], [5.1, { z: s2 - b, y: low, el: 84 }], [5.6, { z: s - 0.02, y: Y(0.93), el: 86 }],
      [5.95, { z: s - 0.36, y: Y(0.84), el: 85 }], [6.4, { z: s - b, y: low, el: 84 }], [6.6, { z: s - b, y: low, el: 84 }],
      [7.25, { z: 0.06, y: Y(0.93), el: 86 }], [7.4, { z: 0, y: Y(0.975), el: 86 }], [C - 0.01, { z: 0, y: Y(0.975), el: 86 }]], C);
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, st = {};
    for (const s of SIDES) { const f = footAt(T.wl[s], C, tau); if (f.planted) f.t0 += base; st[s] = f; }
    for (const s of SIDES) { // стопа, что стоит позади другой больше чем на 25 см, — на подушечке (пятка вверх на 3 см)
      const d = st[other(s)].pos.z - st[s].pos.z;
      st[s].toe = st[s].planted ? 0.4 * ss(d, 0.25, 0.45) : 0;
    }
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), st = this.feet(T, t), h = T.wlHips(tau), ft = {};
    for (const s of SIDES) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: 0, toe: st[s].toe };
    body(T, { M: new THREE.Vector3(0, h.y, h.z), ft, el: h.el, arm: arms({ out: 0.14, bend: 12, fwd: 2, inward: 0 }) });
  },
  audit(T) {
    const { rig } = T, r = legAudit(T, this, T.tNow), tau = mod(T.tNow, C);
    for (const [a, b, front] of BOTTOM) {
      if (tau < a || tau > b) continue;
      const back = other(front), fk = w(rig, front + 'Leg'), fa = w(rig, front + 'Foot');
      r.m.frontKneeOverToe = cm(fk.z - fa.z);
      if (fk.z - fa.z > 0.12) r.bad.push(`переднее колено ушло за носок (${r.m.frontKneeOverToe} см)`);
      const by = w(rig, back + 'Leg').y; r.m.backKneeY = cm(by);
      if (by < 0.07) r.bad.push(`заднее колено бьётся в пол (${r.m.backKneeY} см)`);
      if (by > 0.22) r.bad.push(`неглубокий выпад: заднее колено в ${r.m.backKneeY} см от пола`);
    }
    if (r.m.torso < 75) r.bad.push(`корпус падает вперёд: ${r.m.torso}°`);
    const g = legsClear(T); r.m.legGap = cm(g.gap);
    if (g.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${g.where}, ${r.m.legGap} см)`);
    return gazeAudit(T, reachAudit(T, r));
  },
};
