// Растяжка задней поверхности бедра стоя, правая нога на тумбе высотой 0,3 м. Опорная левая стопа плоско, колено мягкое
// (12°), таз над опорной щиколоткой на 3 см позади. Пятка правой на тумбе (щиколотка на 7,5 см над её верхом), нога почти
// прямая (колено 10°, коленная чашка вверх), носок на себя на 9°. Укладка: стопа дугой с пола на тумбу, корпус отвесно.
// Растяжка: наклон из тазобедренных с прямой спиной, корпус (таз → шея) от 85° до 45° над горизонталью за 4 с, дальше
// держим с дыханием ±1,5°. Ладони лежат каждая на своём бедре, пальцы к колену (без хвата: травмированы пальцы),
// по наклону скользят от верха бедра к колену. Голова в линию спины, взгляд на носок.
import * as THREE from 'three';
import { key, w, SIDES, sgn, ruSide, cm, smooth, clamp, lerp, stand, trunk, placeHips, look, legIK, armIK, reachOf, baseAudit, frameMat, shadows } from '../poses.js';
import { footAlong } from '../kneel.js';

const BOX = 0.3, HEEL = 0.075, BEHIND = 0.03, KNEE_F = 10, KNEE_B = 12, DORSI = 0.15; // м, °, рад
const FRONT = 'Right', BACK = 'Left';
const K = key({});
const legDist = (rig, k) => Math.sqrt(rig.L1 ** 2 + rig.L2 ** 2 + 2 * rig.L1 * rig.L2 * Math.cos(THREE.MathUtils.degToRad(k)));
const UPV = new THREE.Vector3(0, 1, 0);

function box(T) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, BOX, 0.36), frameMat());
  m.position.set(T.heel.x, BOX / 2, T.heel.z - 0.04);
  return shadows(m);
}

// Ладонь на верх своего бедра: точка на линии бедро → колено на 0,96 длины руки от плеча, по середине бедра.
function palmOnThigh(T, s) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), Kn = w(rig, s + 'Leg'), S = w(rig, s + 'Arm'), reach = reachOf(T, s) * 0.96;
  const axis = Kn.clone().sub(H).normalize(), top = UPV.clone().addScaledVector(axis, -UPV.dot(axis)).normalize();
  let best = null;
  for (let u = 0.25; u <= 0.95; u += 0.01) {
    const R = T.legR.thigh[Math.min(9, Math.floor(u * 10))];
    const P = H.clone().lerp(Kn, u).addScaledVector(top, R + 0.005);
    const e = Math.abs(P.distanceTo(S) - reach);
    if (!best || e < best.e) best = { e, P, u };
  }
  // Пальцы продолжают предплечье, насколько позволяет бедро: ось кисти — предплечье, спроецированное на кожу.
  const N = top.clone().negate();
  for (let i = 0; i < 3; i++) {
    armIK(T, s, best.P.clone().sub(rig.palm(s).sub(w(rig, s + 'Hand'))), new THREE.Vector3(sgn(s), 0.2, -0.4));
    const A = rig.dirW(s + 'ForeArm', s + 'Hand'), F = A.addScaledVector(N, -A.dot(N)).normalize();
    const Rr = s === 'Right' ? new THREE.Vector3().crossVectors(F, N) : new THREE.Vector3().crossVectors(N, F);
    rig.orientHand(s, Rr, 1, false);
    const hand = rig.b[s + 'Hand'], f = rig.hand[s].f.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    rig.turnWorld(hand, new THREE.Quaternion().setFromUnitVectors(f, F));
  }
  (T.handU ??= {})[s] = best.u;
}

export default {
  id: 'hamstring-static-stretch',
  name: 'Растяжка задней поверхности бедра',
  muscles: { work: ['quads', 'hip_abductors'], stretch: ['hamstrings', 'calves'], careful: ['lower_back', 'knee'] },
  phases: [
    { name: 'укладка', cue: 'Пятка на опоре, спина прямая', tempo_s: 1 },
    { name: 'растяжка', cue: 'Наклон от таза, колено почти прямое', tempo_s: 30, stretch: true },
  ],
  dose: { sets: '2', reps: '30 с на ногу', rest_s: 15 },
  view: 'side',
  setup(T) {
    const { rig } = T;
    const db = legDist(rig, KNEE_B), Hy = rig.ankleH + Math.sqrt(db * db - BEHIND * BEHIND);
    T.M = new THREE.Vector3(0, Hy, -BEHIND);
    const df = legDist(rig, KNEE_F), dy = Hy - (BOX + HEEL);
    T.heel = new THREE.Vector3(-T.hipHalf, BOX + HEEL, -BEHIND + Math.sqrt(df * df - dy * dy));
    T.add(box(T));
  },
  motion(i, u) { return i === 0 ? 0 : smooth(clamp(u * 30 / 4, 0, 1)); }, // наклон за первые 4 с растяжки
  pose(T, { i, u, depth, t }) {
    const { rig } = T, lift = i === 0 ? smooth(u) : 1;
    T.phaseI = i; T.lift = lift;
    const breath = i === 1 ? 1.5 * Math.sin(2 * Math.PI * Math.max(0, t - 5) / 5) * depth : 0;
    stand(T);
    trunk(T, K, lerp(85, 45, depth) + breath);
    placeHips(T, T.M, null);
    // Опорная нога: стопа плоско на месте, колено вперёд.
    const Ab = new THREE.Vector3(sgn(BACK) * T.hipHalf, rig.ankleH, 0);
    legIK(T, BACK, Ab, new THREE.Vector3(0.1, 0, 1), new THREE.Quaternion().setFromAxisAngle(UPV, 0.07).multiply(T.footFlat[BACK]));
    // Передняя нога: щиколотка с пола дугой на тумбу, коленная чашка вверх, носок на себя.
    const A0 = new THREE.Vector3(sgn(FRONT) * T.hipHalf, rig.ankleH, 0);
    const A = A0.clone().lerp(T.heel, lift).addScaledVector(UPV, 0.12 * Math.sin(Math.PI * lift));
    const H = w(rig, FRONT + 'UpLeg'), shin = A.clone().sub(H);
    const foot = T.footFlat[FRONT].clone().slerp(footAlong(T, FRONT, shin, -DORSI), smooth(clamp(lift * 1.5 - 0.2, 0, 1)));
    legIK(T, FRONT, A, new THREE.Vector3(0, 0.6, 1), foot);
    for (const s of SIDES) { palmOnThigh(T, s); rig.grip(s, 0.1); }
    look(T, T.heel.clone().add(new THREE.Vector3(0, 0.2, 0.15)), 15);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [BACK + 'Foot'] }), a = rig.audit();
    if (r.m.torso < 40) r.bad.push(`корпус ниже 40°: ${r.m.torso}°`);
    if (r.m['knee' + FRONT[0]] > 20 && T.lift > 0.999) r.bad.push(`колено на тумбе согнуто на ${r.m['knee' + FRONT[0]]}°`);
    if (r.m['knee' + BACK[0]] > 25) r.bad.push(`опорное колено согнуто на ${r.m['knee' + BACK[0]]}°`);
    if (T.lift > 0.999) {
      const d = w(rig, FRONT + 'Foot').distanceTo(T.heel);
      r.m.heelOff = cm(d);
      if (d > 0.01) r.bad.push(`пятка не на тумбе (${cm(d)} см)`);
    }
    for (const s of SIDES) {
      const H = w(rig, s + 'UpLeg'), Kn = w(rig, s + 'Leg'), seg = Kn.clone().sub(H);
      r.m['wrist' + s[0]] = a[s].wrist;
      if (a[s].wrist > 50) r.bad.push(`${ruSide(s, true)} кисть: запястье согнуто на ${a[s].wrist}°`);
      const p = rig.palm(s), k = clamp(p.clone().sub(H).dot(seg) / seg.lengthSq(), 0, 1);
      const gap = p.distanceTo(H.clone().addScaledVector(seg, k)) - T.legR.thigh[Math.min(9, Math.floor(k * 10))];
      r.m['palmGap' + s[0]] = cm(gap); r.m['handAt' + s[0]] = Math.round(T.handU[s] * 100); // % от таза к колену
      if (Math.abs(gap) > 0.025) r.bad.push(`${ruSide(s, true)} ладонь не на бедре (${cm(gap)} см)`);
    }
    return r;
  },
};
