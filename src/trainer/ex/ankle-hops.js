// Прыжки на голеностопах: короткие частые подскоки на месте за счёт стопы. Колени почти прямые и мягкие (около 25–35°),
// пятки пола не касаются, касание подушечками, отскок сразу. В полёте носки вытянуты, стопы над полом на 7–8 см.
// Сбоку видно главное: работает голеностоп, а не колено, и пятка не опускается.
import * as THREE from 'three';
import { w } from '../poses.js';
import { mod, seg, hop, arms, body, measureFloor, legAudit, P3 } from '../jump.js';

const C = 1, TA = 0.6; // цикл и конец полёта (полёт 0..TA, контакт TA..C), с
const kneeOf = (rig, s) => Math.round(THREE.MathUtils.radToDeg(w(rig, s + 'Leg').sub(w(rig, s + 'UpLeg')).angleTo(w(rig, s + 'Foot').sub(w(rig, s + 'Leg')))));

export default {
  id: 'ankle-hops',
  name: 'Прыжки на голеностопах',
  muscles: { work: ['calves'], stretch: [], careful: ['ankle'] },
  phases: [
    { name: 'отскок', cue: 'Короткие быстрые прыжки', tempo_s: TA },
    { name: 'контакт', cue: 'Касание носком, колени мягкие', tempo_s: C - TA },
  ],
  mistakes: ['Приземление на пятки', 'Сильное сгибание коленей'],
  dose: { sets: '3', reps: '10', rest_s: 45 },
  view: 'side',
  flat: 'side',
  pace: 'В жизни быстро: касание как от горячего',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2;
    T.ah = { half: T.hipHalf + 0.02, Hs: rig.ankleH + 0.955 * L, up: 0.08 };
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, air = tau < TA, u = seg(tau, 0, TA), st = {};
    // контакт: пятка над полом всё время, глубже всего в середине касания (стопа пружинит)
    const toe = air ? 0.75 : 0.42 - 0.1 * Math.sin(Math.PI * seg(tau, TA, C));
    for (const [s, x] of [['Left', T.ah.half], ['Right', -T.ah.half]])
      st[s] = air ? { pos: P3(x, 0), lift: T.ah.up * hop(u), toe, yaw: Math.sign(x) * 0.08, planted: false, u }
        : { pos: P3(x, 0), lift: 0, toe, yaw: Math.sign(x) * 0.08, planted: true, t0: base + TA };
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), st = this.feet(T, t), air = tau < TA;
    const y = T.ah.Hs + (air ? T.ah.up * hop(seg(tau, 0, TA)) + 0.045 : 0.045 - 0.02 * Math.sin(Math.PI * seg(tau, TA, C)));
    const ft = {};
    for (const s of ['Left', 'Right']) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: st[s].yaw, toe: st[s].toe };
    const a = air ? 8 * Math.sin(Math.PI * seg(tau, 0, TA)) : 0; // руки помогают чуть-чуть
    body(T, { M: new THREE.Vector3(0, y, 0), ft, el: 84, arm: arms({ r: a, l: a, out: 0.2, bend: 80, fwd: 10 }), knees: air ? [] : ['Left', 'Right'] });
  },
  audit(T) {
    const { rig } = T, r = legAudit(T, this, T.tNow), st = this.feet(T, T.tNow);
    for (const s of ['Left', 'Right']) {
      const k = kneeOf(rig, s), heel = w(rig, s + 'Foot').y - T.floor.ank;
      r.m['heel' + s[0]] = +(heel * 100).toFixed(1);
      if (!st[s].planted) continue;
      if (k > 45) r.bad.push(`${s === 'Left' ? 'левое' : 'правое'} колено согнуто сильно: ${k}°`);
      if (heel < 0.015) r.bad.push(`${s === 'Left' ? 'левая' : 'правая'} пятка опустилась к полу: ${r.m['heel' + s[0]]} см`);
    }
    return r;
  },
};
