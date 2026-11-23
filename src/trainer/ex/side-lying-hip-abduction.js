// Отведение ноги лёжа на боку. Лёжа на правом боку на коврике, голова к −X лежит на вытянутой за голову правой руке,
// грудь вперёд (+Z), левая ладонь упирается в коврик перед грудью. Нижняя нога прямая вдоль тела. Верхняя нога лежит на
// нижней, поднимается в сторону до 35° чуть позади линии тела, колено почти прямое, носок вперёд, держит пять секунд и
// опускается. Таз стоит отвесно: левый тазобедренный над правым.
import * as THREE from 'three';
import { V, X, UP, FWD, deg, rad, lerp, smooth, w, mid, key, SIDES, cm, ruSide, stand, trunk, look, baseAudit } from '../poses.js';
import { mat, floorSetup, settle, lowest, gap, footAlong, kneeAudit, MAT } from '../floor.js';
import { legTo, palmOn, floorHand } from '../kneel.js';
import { legsClear } from '../steps.js';
import { extreme } from '../posterior.js';

const SIDE = new THREE.Quaternion().setFromAxisAngle(FWD, Math.PI / 2); // голова к −X, левый бок вверх
const K = key({ rUp: V(0.12, 1, 0.08), rFo: V(0.05, 1, 0.15), lUp: V(-0.3, -0.4, 0.9), lFo: V(0.1, -1, 0.3),
  rTh: V(0, -1, 0), rSh: V(0, -1, 0), lTh: V(0, -1, 0), lSh: V(0, -1, 0) });
const LIFT = 35, BACK = 8, ANKLE_SIDE = 0.075; // отведение вверху и уход ноги назад за линию тела, °

// Голова ложится на руку: шея сгибается вбок, пока висок не коснётся кожи плеча под ним.
function headOnArm(T) {
  const { rig } = T, neck = rig.b.Neck, q0 = neck.quaternion.clone(), ax = FWD.clone(); // плюс — висок к полу
  const below = (v) => Math.abs(v.x - T.headX) < 0.07 && Math.abs(v.z - T.headZ) < 0.08;
  const at = (a) => {
    neck.quaternion.copy(q0); rig.turnWorld(neck, new THREE.Quaternion().setFromAxisAngle(ax, a));
    const arm = extreme(T, ['RightHand', 'RightArm', 'RightForeArm'], UP, below), head = lowest(T, ['Head']);
    return head.y - (arm ? arm.y : MAT) - 0.004;
  };
  let lo = -0.2, hi = 0.6;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (at(m) > 0) lo = m; else hi = m; }
  at(lo);
}

export default {
  id: 'side-lying-hip-abduction',
  name: 'Отведение ноги лёжа на боку',
  muscles: { work: ['hip_abductors', 'glutes'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'вверх', cue: 'Пятка ведёт, носок вперёд', tempo_s: 1 },
    { name: 'верх', cue: 'Держи пять секунд', tempo_s: 5 },
    { name: 'вниз', cue: 'Опусти медленно', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '10 на ногу', rest_s: 30 },
  mistakes: ['Носок смотрит в потолок', 'Таз заваливается назад'],
  view: 'front',
  flat: 'front',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    stand(T, 0, 0, 0, SIDE); trunk(T, K);
    settle(T, ['RightArm', 'RightShoulder'], ['Hips', 'RightUpLeg'], FWD);
    const m = mid(rig, 'LeftUpLeg', 'RightUpLeg'); T.wrap.position.x -= m.x; T.wrap.position.z -= m.z; T.wrap.updateMatrixWorld(true);
    T.base = { p: T.wrap.position.clone(), q: T.wrap.quaternion.clone() };
    mat(T, 0.62, 2.0, -0.2, 0);
    T.headX = w(rig, 'Head').x; T.headZ = w(rig, 'Head').z;
    // Нижняя щиколотка на коврике по линии тела; верхняя в покое лежит на нижней.
    const H = w(rig, 'RightUpLeg'), D = 0.975 * (rig.L1 + rig.L2);
    T.lowFoot = new THREE.Vector3(H.x + Math.sqrt(D * D - (H.y - ANKLE_SIDE) ** 2), ANKLE_SIDE, H.z);
    const HL = w(rig, 'LeftUpLeg');
    T.restDrop = Math.asin(THREE.MathUtils.clamp((HL.y - (ANKLE_SIDE + 0.15)) / D, -1, 1)); // угол ноги вниз от горизонтали в покое
    T.legD = D;
  },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q); trunk(T, K);
    look(T, null);
    rig.relaxHand('Right'); rig.grip('Right', 0.3);
    headOnArm(T);
    const toe = new THREE.Vector3(0, -0.15, 1).normalize();
    legTo(T, 'Right', T.lowFoot, FWD);
    rig.setWorld(rig.b.RightFoot, footAlong(T, 'Right', T.lowFoot.clone().sub(w(rig, 'RightLeg')), toe)); rig.root.updateMatrixWorld(true);
    // Верхняя нога: от покоя на нижней до LIFT° над горизонталью, чуть назад.
    const a = lerp(-T.restDrop, deg(LIFT), depth), b = deg(BACK) * depth, H = w(rig, 'LeftUpLeg');
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b));
    const A = H.clone().addScaledVector(dir, T.legD);
    legTo(T, 'Left', A, FWD);
    rig.setWorld(rig.b.LeftFoot, footAlong(T, 'Left', A.clone().sub(w(rig, 'LeftLeg')), toe)); rig.root.updateMatrixWorld(true);
    // Левая ладонь на коврике перед грудью, пальцы к голове.
    const S = w(rig, 'LeftArm'), h = floorHand(), P = new THREE.Vector3(S.x + 0.08, MAT + 0.004, S.z + 0.3);
    for (let i = 0; i < 4; i++) { // по коже ладони
      palmOn(T, 'Left', P, h.F, h.N, new THREE.Vector3(-0.3, 0.5, -1)); rig.relaxHand('Left'); rig.grip('Left', 0.2);
      const lo = lowest(T, ['LeftHand']).y; if (Math.abs(lo - MAT - 0.004) < 0.003) break; P.y += MAT + 0.004 - lo;
    }
      },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r);
    r.bad = r.bad.filter((b) => !/голова не в линию/.test(b));
    if (r.m.neck > 30) r.bad.push(`шея согнута на ${r.m.neck}°`);
    // Таз отвесно (не заваливается назад) и носок верхней ноги вперёд, а не в потолок.
    const hl = w(rig, 'LeftUpLeg').sub(w(rig, 'RightUpLeg'));
    r.m.pelvisBack = Math.round(rad(Math.atan2(-hl.z, hl.y)));
    if (Math.abs(r.m.pelvisBack) > 10) r.bad.push(`таз заваливается: ${r.m.pelvisBack}°`);
    // Носок: куда смотрит стопа поперёк голени (0 — вперёд, 90 — в потолок). Сам подъём ноги сюда не входит.
    const sh = w(rig, 'LeftFoot').sub(w(rig, 'LeftLeg')).normalize(), toe = w(rig, 'LeftToeBase').sub(w(rig, 'LeftFoot'));
    toe.addScaledVector(sh, -toe.dot(sh)); const up = UP.clone().addScaledVector(sh, -sh.y).normalize();
    r.m.toeUp = Math.round(rad(Math.atan2(toe.dot(up), toe.z)));
    if (r.m.toeUp > 25) r.bad.push(`носок смотрит вверх: ${r.m.toeUp}°`);
    const H = w(rig, 'LeftUpLeg'), A = w(rig, 'LeftFoot');
    r.m.lift = Math.round(rad(Math.asin((A.y - H.y) / A.distanceTo(H))));
    // На коврике: плечо, таз, нижняя нога, ладонь; голова на руке.
    r.m.hipGap = gap(T, ['Hips', 'RightUpLeg']); r.m.armGap = gap(T, ['RightArm', 'RightShoulder']); r.m.legGap = gap(T, ['RightLeg', 'RightFoot']); r.m.handL = gap(T, ['LeftHand']);
    for (const [k, v, hi] of [['таз', r.m.hipGap, 1.5], ['плечо', r.m.armGap, 1.5], ['нижняя нога', r.m.legGap, 1.5], ['левая ладонь', r.m.handL, 1.5]])
      if (v < -1 || v > hi) r.bad.push(`${k} ${v < -1 ? 'в полу' : 'над полом'}: ${v} см`);
    const below = (v) => Math.abs(v.x - T.headX) < 0.07 && Math.abs(v.z - T.headZ) < 0.08, arm = extreme(T, ['RightHand', 'RightArm', 'RightForeArm'], UP, below);
    r.m.headOnArm = cm(lowest(T, ['Head']).y - (arm ? arm.y : MAT));
    if (r.m.headOnArm > 2 || r.m.headOnArm < -1.5) r.bad.push(`голова не на руке: ${r.m.headOnArm} см`);
    const c = legsClear(T); r.m.legsGap = cm(c.gap);
    if (c.gap < -0.01) r.bad.push(`ноги друг в друге: ${c.where}`);
    return r;
  },
};
