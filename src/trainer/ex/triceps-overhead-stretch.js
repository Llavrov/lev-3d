// Растяжка трицепса над головой, правая рука. Стоя, стопы на ширине таза, корпус отвесно, спина прямая (прогиба в
// пояснице нет: таз и грудь одной линией). «Укладка»: правая рука идёт через «вперёд-вверх» над головой, локоть
// сгибается, предплечье уходит за голову вниз, кисть к лопаткам. Левая рука поднимается, предплечье за затылком,
// ладонь сзади на правом локте. «Растяжка»: левая тянет локоть к голове и чуть назад, правое предплечье глубже за спину.
// Плечо над головой позади корпуса не дальше 15° (общая проверка), лицо вперёд.
import * as THREE from 'three';
import { key, w, cm, smooth, clamp, armIK, stand, feet, trunk, placeHips, look, baseAudit } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';
import { palmOn } from '../kneel.js';
import { bodyShape, onLimb, palmGap, bodyAudit, wristAudit } from '../arms.js';

const K = key({}), TORSO = 88, KNEE = 16, SHIN = 1;
const n3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const slerpV = (a, b, k) => a.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(a, b), k));
// Правая рука по ключам: вис → вперёд-вверх → над головой, предплечье назад → предплечье за голову вниз → дожим.
const KEYS = [
  { u: n3(-0.1, -1, 0.05), f: n3(-0.06, -1, 0.15) },
  { u: n3(-0.15, 0.25, 1), f: n3(-0.05, 0.9, 0.45) },
  { u: n3(-0.2, 1, 0.12), f: n3(-0.05, 0.25, -1) },
  { u: n3(-0.2, 1, 0.05), f: n3(0.25, -0.85, -0.45) },
  { u: n3(-0.08, 1, 0.02), f: n3(0.3, -0.85, -0.45) },
];
function along(keys, d) {
  const k = clamp(d, 0, 1) * (keys.length - 1), i = Math.min(keys.length - 2, Math.floor(k)), e = smooth(k - i);
  return { u: slerpV(keys[i].u, keys[i + 1].u, e), f: slerpV(keys[i].f, keys[i + 1].f, e) };
}
// Левая ладонь сзади на правом локте, пальцы продолжают предплечье (второй проход по его направлению).
const N = n3(-0.25, -0.2, 1), POLE = n3(1, 0.3, 0.45);
function hold(T, P) {
  palmOn(T, 'Left', P, n3(-1, 0.2, 0), N, POLE);
  const A = T.rig.dirW('LeftForeArm', 'LeftHand');
  palmOn(T, 'Left', P, A.addScaledVector(N, -A.dot(N)), N, POLE);
}

function pose(T, { i = 0, depth = 0 }) {
  const { rig } = T;
  stand(T);
  trunk(T, K, TORSO);
  placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
  look(T, new THREE.Vector3(0, 1.3, 3), 35); // взгляд вперёд (точку на 0,6 м ставили под задранное лицо)
  const { u, f } = i === 0 ? along(KEYS.slice(0, 4), depth) : along(KEYS.slice(3), depth);
  rig.root.updateMatrixWorld(true);
  rig.arm('Right', u.applyQuaternion(rig.toPlayer), f.applyQuaternion(rig.toPlayer));
  rig.relaxHand('Right'); rig.grip('Right', 0.3);
  const hang = () => { rig.arm('Left', n3(0.1, -1, 0.04).applyQuaternion(rig.toPlayer), n3(0.06, -1, 0.15).applyQuaternion(rig.toPlayer)); rig.relaxHand('Left'); rig.grip('Left', 0.4); };
  const on = i === 0 ? clamp(depth * 2.2 - 1.2, 0, 1) : 1;
  T.leftOn = false;
  if (on === 0) return hang();
  const P = onLimb(T, 'RightArm', 'RightForeArm', 0.96, n3(0.15, 0.1, -1), T.limbR.RightArm);
  if (on < 1) { // левая кисть от виса к локтю: вбок и вверх, кисть свободная
    hang(); const W0 = w(rig, 'LeftHand');
    hold(T, P); const W1 = w(rig, 'LeftHand');
    armIK(T, 'Left', W0.lerp(W1, smooth(on)).add(new THREE.Vector3(0.18, 0.05, 0.15).multiplyScalar(Math.sin(Math.PI * on))), POLE);
    rig.relaxHand('Left'); rig.grip('Left', 0.4);
    return;
  }
  hold(T, P);
  rig.grip('Left', 0.35);
  T.leftOn = true;
}

export default {
  id: 'triceps-overhead-stretch',
  name: 'Растяжка трицепса',
  muscles: { work: ['delts_front'], stretch: ['triceps', 'lats'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'укладка', cue: 'Локоть вверх, кисть за спину', tempo_s: 2 },
    { name: 'растяжка', cue: 'Мягко тяни локоть', tempo_s: 4, stretch: true },
  ],
  dose: { sets: '1', reps: '4 × 30 с', rest_s: 15 },
  mistakes: ['Прогиб в пояснице'],
  pace: 'В жизни держи 30 с, без боли',
  view: 'side',
  sideFrom: 'left', // слева видно локоть над головой и ладонь на нём, справа их закрывает голова
  motion(i, u) { return i === 0 ? smooth(u) : smooth(Math.min(1, u * 2)); },
  setup(T) {
    bodyShape(T);
    T.feetAt = feet(T, T.hipHalf);
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    wristAudit(T, r);
    bodyAudit(T, r);
    if (Math.abs(r.m.torso - TORSO) > 3) r.bad.push(`корпус отклонился: ${r.m.torso}°`);
    if (T.leftOn) {
      const g = palmGap(T, 'Left', w(rig, 'RightArm'), w(rig, 'RightForeArm'), T.limbR.RightArm);
      r.m.leftOnElbow = g;
      if (Math.abs(g) > 2) r.bad.push(`левая ладонь не на локте (${g} см)`);
    }
    return r;
  },
};
