// Румынская тяга с гантелями. depth 0 — стоя, 1 — низ. Колено 16 → 18° (Rig.legs доводит до ~20°, где нога достаёт),
// голень от 4° вперёд до 6° назад (колени уходят назад за таз, вес на пятки), корпус (таз → шея) от 86° до 20° над
// горизонталью, спина прямая, шея в линию спины, гантели по передней линии ног.
import * as THREE from 'three';
import { V, FWD, deg, rad, lerp, w, key, SIDES, sgn, ruSide, cm, DB, dumbbells, placeDB, stand, feet, trunk, placeHips, look, palmTo, reachOf, baseAudit, legGap } from '../poses.js';

const BOTTOM = 20; // ниже нельзя по технике; у модели плечо + предплечье ≈ 0,5 м — внизу гантели на уровне коленей
const HAND_X = 0.165, ARM_BACK = 14;
const K = key({ rUp: V(0.08, -1, 0.05), rFo: V(0.06, -1, 0.12), lUp: V(-0.08, -1, 0.05), lFo: V(-0.06, -1, 0.12),
  rTh: V(0.05, -1, 0), rSh: V(0.03, -1, 0), lTh: V(-0.05, -1, 0), lSh: V(-0.03, -1, 0) });

// Точка ручки гантели на передней линии ноги (бедро → голень): снаружи от кожи на полголовы гантели, сбоку на ширине кисти.
export function legLine(T, s, handX = HAND_X) {
  const { rig } = T, hip = w(rig, s + 'UpLeg'), knee = w(rig, s + 'Leg'), ank = w(rig, s + 'Foot');
  const segs = [[hip, knee, T.legR.thigh], [knee, ank, T.legR.shin]], l0 = hip.distanceTo(knee), l1 = knee.distanceTo(ank);
  return (u) => {
    let d = u * (l0 + l1), i = 0;
    if (d > l0) { d -= l0; i = 1; }
    const [p, q, R] = segs[i], len = i ? l1 : l0, t = Math.min(0.999, d / len), tau = q.clone().sub(p).normalize();
    const front = FWD.clone().addScaledVector(tau, -FWD.dot(tau)).normalize();
    const P = p.clone().lerp(q, t).addScaledVector(front, R[Math.floor(t * 10)] + DB.apothem + 0.012);
    P.x = sgn(s) * handX;
    return P;
  };
}
// Руки висят почти отвесно (назад не больше ARM_BACK), гантель — первая точка на линии ноги на длине прямой руки;
// если у ноги так не выходит, гантель отходит вперёд до 8 см (у модели короткие руки).
export function hangOnLegs(T) {
  const { rig } = T;
  for (const s of SIDES) {
    const S = w(rig, s + 'Arm'), reach = reachOf(T, s), line = legLine(T, s);
    let P = null;
    for (let e = 0; e <= 0.08 + 1e-6 && !P; e += 0.01) {
      let p = null;
      for (let u = 0; u <= 1; u += 0.004) { const q = line(u).addScaledVector(FWD, e); if (q.distanceTo(S) >= reach) { p = q; break; } }
      if (!p) continue;
      const d = p.clone().sub(S);
      if (rad(Math.atan2(-d.z, -d.y)) <= ARM_BACK || e >= 0.08 - 1e-6) P = p;
    }
    P ??= line(1);
    placeDB(T, s, palmTo(T, s, P, new THREE.Vector3(-sgn(s), 0, 0))); // к указательному — к другой руке: ладонь к ногам
  }
  rig.grip('Right', 1); rig.grip('Left', 1);
}
// Таз над щиколотками на высоте и выносе, которые дают колено k и голень ph (градусы, + — колено впереди щиколотки).
export function hipsOver(T, k, ph) {
  const { rig } = T, L1 = rig.L1, L2 = rig.L2;
  k = deg(k); ph = deg(ph);
  return new THREE.Vector3(0, rig.ankleH + L1 * Math.cos(k - ph) + L2 * Math.cos(ph), -(L1 * Math.sin(k - ph) - L2 * Math.sin(ph)));
}

export default {
  id: 'romanian-deadlift-db',
  name: 'Румынская тяга с гантелями',
  muscles: { work: ['hamstrings', 'glutes', 'lower_back'], stretch: ['hamstrings', 'glutes'], careful: ['lower_back'] },
  phases: [
    { name: 'Вниз', cue: 'Таз назад, гантели вдоль ног', tempo_s: 3, stretch: true },
    { name: 'Пауза', cue: 'Спина прямая, бедро сзади натянуто', tempo_s: 1, stretch: true },
    { name: 'Вверх', cue: 'Таз вперёд, сожми ягодицы', tempo_s: 2 },
  ],
  dose: { sets: 3, reps: 10, rest_s: 90 },
  mistakes: ['Круглая спина', 'Гантели далеко от ног'],
  view: 'side',
  setup(T) { dumbbells(T); T.feetAt = feet(T, T.hipHalf); },
  pose(T, { depth }) {
    stand(T);
    trunk(T, K, lerp(86, BOTTOM, depth));
    placeHips(T, hipsOver(T, lerp(16, 18, depth), lerp(4, -6, depth)), T.feetAt);
    look(T, new THREE.Vector3(0, 0, lerp(5, 2, depth)));
    hangOnLegs(T);
  },
  audit(T) {
    const r = baseAudit(T);
    for (const s of SIDES) {
      const g = legGap(T, s, T.db[s].position);
      r.m['gap' + s[0]] = cm(g);
      if (g < -0.01) r.bad.push(`${ruSide(s, true)} гантель в ноге (${cm(g)} см)`);
      if (g > 0.12) r.bad.push(`${ruSide(s, true)} гантель далеко от ноги (${cm(g)} см)`);
    }
    return r;
  },
};
