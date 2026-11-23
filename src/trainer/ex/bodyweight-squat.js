// Присед без веса. Стопы чуть шире плеч, носки наружу на 20°, таз назад и вниз до параллели бедра с полом, колени
// по линии носков, пятки на полу. Руки идут вперёд до уровня плеч вместе с опусканием: противовес тазу, корпус
// остаётся круче, чем в приседе со штангой. Плечи над серединой стопы.
import * as THREE from 'three';
import { V, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, feet, trunk, placeHips, kneeOverToe, kneeIn, look, armIK, baseAudit, UP, FWD } from '../poses.js';
import { reachAudit, gazeAudit } from '../bandlegs.js';

const TOE = 0.35, MIDFOOT = 0.05;
const K = key({ rUp: V(0.1, -1, 0.1), rFo: V(0.05, -1, 0.2), lUp: V(-0.1, -1, 0.1), lFo: V(-0.05, -1, 0.2) });
const thighDrop = (rig) => SIDES.reduce((a, s) => a + w(rig, s + 'UpLeg').y - w(rig, s + 'Leg').y, 0) / 2;

function body(T, y, el) {
  const { rig } = T;
  stand(T);
  trunk(T, K, el);
  const off = mid(rig, 'LeftArm', 'RightArm').sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'));
  placeHips(T, new THREE.Vector3(0, y, MIDFOOT + 0.04 - off.z), T.feetAt); // плечи над серединой стопы, чуть впереди: руки вперёд — противовес
  for (const s of SIDES) kneeOverToe(T, s, sgn(s) * TOE);
}

export default {
  id: 'bodyweight-squat',
  name: 'Присед без веса',
  muscles: { work: ['quads', 'glutes'], stretch: [], careful: ['knee'] },
  phases: [
    { name: 'вниз', cue: 'Таз назад, руки вперёд', tempo_s: 2 },
    { name: 'вверх', cue: 'Встань, колени наружу', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '20', rest_s: 45 },
  mistakes: ['Пятки отрываются', 'Неполная глубина', 'Колени сводятся внутрь'],
  view: 'side',
  setup(T) {
    const { rig } = T;
    T.feetAt = feet(T, T.shoulderHalf + 0.04, TOE);
    T.topY = rig.ankleH + 0.96 * (rig.L1 + rig.L2); // стопы шире таза: выше нога не достаёт
    let y = rig.ankleH + rig.L2;
    for (let i = 0; i < 8; i++) { body(T, y, 55); y -= thighDrop(rig) * 0.9; }
    T.bottomY = y;
  },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    body(T, lerp(T.topY, T.bottomY, depth), lerp(84, 55, depth));
    look(T, new THREE.Vector3(0, 0.6, 3), 35);
    // Руки: внизу висят вдоль тела, к низу приседа поднимаются дугой вперёд до уровня плеч, почти прямые.
    const a = smooth(Math.min(1, depth * 1.3)), th = a * 1.5;
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), dir = new THREE.Vector3(sgn(s) * lerp(0.08, -0.06, a), -Math.cos(th), 0.12 + Math.sin(th)).normalize();
      armIK(T, s, S.clone().addScaledVector(dir, 0.97 * (rig.armLen[s][0] + rig.armLen[s][1])), new THREE.Vector3(sgn(s) * 0.5, -1, -0.3));
      rig.relaxHand(s); rig.grip(s, 0.3);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] }); // пятки и носки на месте
    for (const s of SIDES) {
      if (r.m['knee' + s[0]] < 40) continue;
      const inward = kneeIn(w(rig, s + 'Leg'), w(rig, s + 'Foot'), sgn(s) * TOE, s);
      r.m['kneeIn' + s[0]] = Math.round(inward);
      if (inward > 10) r.bad.push(`${ruSide(s)} колено заваливается внутрь: ${Math.round(inward)}°`);
    }
    r.m.thigh = cm(thighDrop(rig));
    if (T.depth > 0.99 && r.m.thigh > 4) r.bad.push(`неполная глубина: таз выше колена на ${r.m.thigh} см`);
    const sh = mid(rig, 'LeftArm', 'RightArm').z; r.m.shoulderZ = cm(sh);
    if (Math.abs(sh - MIDFOOT) > 0.12) r.bad.push(`плечи не над стопой: ${cm(sh - MIDFOOT)} см`);
    if (r.m.torso < 45) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    return gazeAudit(T, reachAudit(T, r));
  },
};
