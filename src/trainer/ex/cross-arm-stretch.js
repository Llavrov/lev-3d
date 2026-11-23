// Растяжка правой руки через грудь, стоя спиной к стене. Стопы на ширине таза, колени почти прямые, корпус отвесно,
// лопатки и верх спины касаются стены (стена ставится по коже спины): лопатка не уезжает вперёд — ключица сведена,
// как во всех упражнениях с весом. «Укладка»: правая рука от виса идёт вперёд и поперёк груди чуть ниже плеча, локоть
// почти прямой. Левая ладонь ложится на правое плечо у локтя спереди. «Растяжка»: левая рука дожимает правую к груди
// ещё на 12° поперёк и держит. Подбородок над рукой, голова прямо.
import * as THREE from 'three';
import { key, w, SIDES, cm, smooth, clamp, armIK, stand, feet, trunk, placeHips, look, baseAudit } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';
import { palmOn } from '../kneel.js';
import { bodyShape, onLimb, palmGap, bodyAudit, wristAudit, extreme, wall } from '../arms.js';

const K = key({}), TORSO = 88, KNEE = 16, SHIN = 1;
const n3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const slerpV = (a, b, k) => a.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(a, b), k));
const HANG = { u: n3(-0.1, -1, 0.05), f: n3(-0.06, -1, 0.15) };
const CROSS = { u: n3(0.45, -0.15, 0.88), f: n3(0.88, -0.12, 0.46) };
const PULL = { u: n3(0.58, -0.15, 0.8), f: n3(0.95, -0.12, 0.29) };

// Левая ладонь на точку P правой руки, ладонью к ней: пальцы продолжают предплечье (второй проход по его направлению).
function hold(T, P) {
  const N = n3(0, 0.6, -1), pole = n3(1, -0.35, 0.55);
  palmOn(T, 'Left', P, n3(-0.8, 0.55, 0.25), N, pole);
  const A = T.rig.dirW('LeftForeArm', 'LeftHand');
  palmOn(T, 'Left', P, A.addScaledVector(N, -A.dot(N)), N, pole);
}

function pose(T, { i = 0, depth = 0 }) {
  const { rig } = T;
  stand(T);
  trunk(T, K, TORSO);
  placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
  look(T, new THREE.Vector3(0, 0.6, 3), 35); // шея в линию спины задирает лицо модели: взгляд ниже горизонта
  const a = i === 0 ? HANG : CROSS, b = i === 0 ? CROSS : PULL;
  const u = slerpV(a.u, b.u, depth), f = slerpV(a.f, b.f, depth);
  rig.root.updateMatrixWorld(true);
  rig.arm('Right', u.applyQuaternion(rig.toPlayer), f.applyQuaternion(rig.toPlayer));
  rig.relaxHand('Right'); rig.grip('Right', 0.4);
  // Левая ладонь спереди-снизу на правом плече у самого локтя, пальцы вверх и вправо, левый локоть вниз и наружу. До укладки (в начале фазы 0) — висит.
  const on = i === 0 ? clamp(depth * 1.6 - 0.6, 0, 1) : 1;
  const hang = () => { rig.arm('Left', n3(0.1, -1, 0.04).applyQuaternion(rig.toPlayer), n3(0.06, -1, 0.15).applyQuaternion(rig.toPlayer)); rig.relaxHand('Left'); rig.grip('Left', 0.4); };
  if (on === 0) { hang(); T.leftOn = false; return; }
  const P = onLimb(T, 'RightArm', 'RightForeArm', 0.92, new THREE.Vector3(0, -0.8, 1), T.limbR.RightArm);
  if (on < 1) { // подводим кисть от виса к руке, кисть свободная
    hang(); const W0 = w(rig, 'LeftHand');
    hold(T, P);
    const W1 = w(rig, 'LeftHand');
    armIK(T, 'Left', W0.lerp(W1, smooth(on)).add(new THREE.Vector3(0, 0, 0.12 * Math.sin(Math.PI * on))), n3(1, -0.35, 0.55)); // дугой вперёд, мимо живота rig.relaxHand('Left'); rig.grip('Left', 0.4);
    T.leftOn = false; return;
  }
  hold(T, P);
  rig.grip('Left', 0.35);
  T.leftOn = on === 1;
}

export default {
  id: 'cross-arm-stretch',
  name: 'Растяжка руки через грудь',
  muscles: { work: ['rotator_cuff'], stretch: ['delts_rear', 'rotator_cuff', 'rhomboids'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'укладка', cue: 'Лопатка к стене', tempo_s: 1.5 },
    { name: 'растяжка', cue: 'Тяни руку через грудь', tempo_s: 4, stretch: true },
  ],
  dose: { sets: '1', reps: '2–3 × 30 с', rest_s: 15 },
  mistakes: ['Лопатка уезжает вперёд', 'Боль спереди плеча'],
  pace: 'В жизни держи 30 с, без боли',
  view: 'front',
  motion(i, u) { return i === 0 ? smooth(u) : smooth(Math.min(1, u * 2)); },
  setup(T) {
    bodyShape(T);
    T.feetAt = feet(T, T.hipHalf);
    pose(T, {});
    T.wallZ = extreme(T, ['Spine1', 'Spine2'], new THREE.Vector3(0, 0, -1)).z - 0.004;
    T.add(wall(T.wallZ));
    T.shoulderY = w(T.rig, 'RightArm').y;
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    wristAudit(T, r);
    bodyAudit(T, r, 0.025, 0.085); // правое плечо прижато к груди: ось у самой кожи, по кадру сбоку рука на груди, а не в ней
    // Спина у стены: кожа лопаток касается стены (до 1,5 см), не уходит в неё.
    const back = extreme(T, ['Spine1', 'Spine2'], new THREE.Vector3(0, 0, -1)).z - T.wallZ;
    r.m.wall = cm(back);
    if (back > 0.015 || back < -0.01) r.bad.push(`спина не у стены (${cm(back)} см)`);
    // Плечо не поднимается к уху.
    const up = w(rig, 'RightArm').y - T.shoulderY;
    r.m.shrug = cm(up);
    if (up > 0.015) r.bad.push(`правое плечо поднялось на ${cm(up)} см`);
    if (T.leftOn) {
      const g = palmGap(T, 'Left', w(rig, 'RightArm'), w(rig, 'RightForeArm'), T.limbR.RightArm);
      r.m.leftOnArm = g;
      if (Math.abs(g) > 2) r.bad.push(`левая ладонь не на руке (${g} см)`);
    }
    return r;
  },
};
