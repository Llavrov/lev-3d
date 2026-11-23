// Боковые прыжки с фиксацией, поочерёдно (span 2): чётный цикл стоит на правой, толкается ею и летит влево, садится
// на левую; нечётный — обратно. Цикл начинается в фиксации прошлого прыжка, поэтому поочерёдность замыкается сама.
// Толчок: подсед и мах рук назад, разгиб наружной ноги с подушечки, мах вперёд-вверх. Полёт около 0,5 с, таз выше
// на 14 см. Приземление на подушечку согнутой ноги, амортизация вниз, замереть: колено над стопой, свободная нога у щиколотки.
import * as THREE from 'three';
import { lerp, sgn, w, cm } from '../poses.js';
import { mod, ss, seg, hop, other, arms, track, body, measureFloor, legAudit, P3 } from '../jump.js';

const C = 4, TO = 1.2, TD = 1.7; // цикл на сторону, отрыв и касание, с
const landing = (t) => (Math.floor(t / C) % 2 ? 'Right' : 'Left'); // на какую ногу садится этот цикл

export default {
  id: 'lateral-bound-stick',
  name: 'Боковые прыжки с фиксацией',
  muscles: { work: ['glutes', 'hip_abductors', 'quads', 'adductors'], stretch: ['adductors'], careful: ['knee', 'ankle'] },
  phases: [
    { name: 'толчок', cue: 'Оттолкнись наружной ногой', tempo_s: TO },
    { name: 'полёт', cue: 'Далеко в сторону', tempo_s: TD - TO },
    { name: 'фиксация', cue: 'Замри на одной ноге', tempo_s: C - TD },
  ],
  mistakes: ['Колено заваливается внутрь', 'Приземление на прямую ногу', 'Нет фиксации'],
  dose: { sets: '3', reps: '6 на сторону', rest_s: 60 },
  view: 'front',
  wide: true,
  flat: 'front',
  span: 2,
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, hh = T.hipHalf, D = 0.9;
    T.lb = { D, xP: -D / 2, xL: D / 2, hh, A, Hs: A + 0.885 * L };
    const xP = -D / 2, xL = D / 2, Hs = T.lb.Hs;
    // Таз в осях «к прыжку» (+x): ключи до отрыва и после касания; полёт между ними — парабола.
    T.lbPre = track([[0, { x: xP + 0.6 * hh, y: Hs }], [0.5, { x: xP + 0.6 * hh, y: Hs }], [0.9, { x: xP + 0.6 * hh - 0.05, y: Hs - 0.035 }],
      [TO, { x: xP + hh + 0.1, y: A + 0.95 * L }], [C - 0.01, { x: xP + 0.6 * hh, y: Hs }]], C);
    T.lbPost = track([[0, { x: xL - 0.6 * hh, y: Hs }], [TD, { x: xL - 0.6 * hh - 0.05, y: A + 0.93 * L }], [2.0, { x: xL - 0.6 * hh, y: Hs - 0.04 }],
      [2.5, { x: xL - 0.6 * hh, y: Hs }], [C - 0.01, { x: xL - 0.6 * hh, y: Hs }]], C);
    T.lbArm = track([[0, { a: 0 }], [0.5, { a: 0 }], [0.9, { a: -25 }], [TO, { a: 35 }], [TD, { a: 10 }], [2.3, { a: 0 }], [C - 0.01, { a: 0 }]], C);
  },
  // Таз (мир, оси «к прыжку») в секунду цикла tau.
  hips(T, tau) {
    if (tau <= TO) return T.lbPre(tau);
    if (tau >= TD) return T.lbPost(tau);
    const a = T.lbPre(TO), b = T.lbPost(TD), u = seg(tau, TO, TD);
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) + 0.14 * hop(u) };
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, Ld = landing(t), Pu = other(Ld), k = sgn(Ld), { xP, xL, A } = T.lb;
    const h = this.hips(T, tau), st = {};
    const hover = (xf, toward) => ({ x: xf + toward * 0.15, z: -0.14, lift: 0.24, toe: 0.4 }); // свободная стопа у щиколотки опорной
    // толкающая: стоит до отрыва, потом отстаёт под тазом, потом встаёт у щиколотки новой опорной
    if (tau <= TO) st[Pu] = { x: xP, z: 0, lift: 0, toe: 0.38 * ss(tau, 0.9, TO), planted: true, t0: base + TD - C };
    else {
      const trail = { x: h.x - T.lb.hh - 0.18, z: -0.05, lift: Math.max(0.06, h.y - A - 0.62), toe: 0.7 };
      const fin = hover(xL, -1), e1 = ss(tau, TO, TO + 0.25), e2 = ss(tau, TD - 0.1, 2.2);
      const m = (f) => lerp(lerp(f === 'lift' ? 0 : f === 'toe' ? 0.38 : f === 'x' ? xP : 0, trail[f], f === 'lift' ? Math.sqrt(seg(tau, TO, TO + 0.25)) : e1), fin[f], e2); // стопа сразу уходит от пола
      st[Pu] = { x: m('x'), z: m('z'), lift: m('lift'), toe: m('toe'), planted: false, u: Math.min(0.5, seg(tau, TO, TD)) }; // u: только миг отрыва считается касанием
    }
    // приземляющаяся: висит у опорной, в полёте тянется к месту и садится на подушечку
    if (tau < TD) {
      const hv = hover(xP, 1), e = ss(tau, TO, TD - 0.08), u = seg(tau, TO, TD);
      st[Ld] = { x: lerp(hv.x, xL, e), z: lerp(hv.z, 0, e), lift: tau <= TO ? hv.lift : hv.lift * (1 - u), toe: lerp(hv.toe, 0.35, e), planted: false };
    } else st[Ld] = { x: xL, z: 0, lift: 0, toe: 0.35 * (1 - ss(tau, TD + 0.05, 1.95)), planted: true, t0: base + TD, land: tau < 2.1 };
    for (const s of [Ld, Pu]) { st[s].pos = P3(k * st[s].x, st[s].z); st[s].yaw = 0; }
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), k = sgn(landing(t)), st = this.feet(T, t), h = this.hips(T, tau), a = T.lbArm(tau).a;
    const ft = {};
    for (const s of ['Left', 'Right']) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: 0, toe: st[s].toe };
    const el = tau < 0.5 ? 72 : tau < TO ? lerp(66, 72, ss(tau, 0.9, TO)) : tau < TD ? 74 : lerp(68, 72, ss(tau, 2.0, 2.6));
    body(T, { M: new THREE.Vector3(k * h.x, h.y, 0), ft, el, arm: arms({ r: a, l: a, out: 0.3 }) });
  },
  audit(T) {
    const r = legAudit(T, this, T.tNow);
    const tau = mod(T.tNow, C);
    if (tau > TO && tau < TD) r.m.hipsUp = cm(this.hips(T, tau).y - T.lb.Hs);
    r.m.feetDx = cm(Math.abs(w(T.rig, 'LeftFoot').x - w(T.rig, 'RightFoot').x));
    return r;
  },
};
