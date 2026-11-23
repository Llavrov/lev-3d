// Тяга верхнего блока одной рукой стоя на колене. Правое колено на полу под тазом (бедро отвесно, голень и подъём стопы
// на полу), левая стопа впереди, голень отвесно. Ролик блока высоко впереди справа. Правая рука тянет рукоять от
// «вверх к ролику, рука прямая» до «кисть у плеча, локоть внизу у рёбер», нейтральным хватом. Корпус прямой и не
// скручивается, плечо не поднимается к уху (внизу ключица вниз). Показ сзади: видно широчайшую и путь локтя.
import * as THREE from 'three';
import { V, FWD, lerp, smooth, w, mid, key, cm, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { footAlong, legTo, KNEE_Y, ANKLE_Y } from '../kneel.js';
import { stretch } from '../band.js';
import { station, cable, grip, placeGrip, onAxis, skinSetup, clearOf, skinGap, TORSO } from '../pulls.js';

const PULLEY = new THREE.Vector3(-0.3, 2.25, 0.6), TORSO_EL = 90;
const K = key({ lUp: V(-0.15, -1, 0.05), lFo: V(-0.1, -0.9, 0.4) }); // левая рука свободна вдоль корпуса

// Полуприсед на колене: правое колено на полу под тазом, левая стопа впереди.
function kneel(T) {
  const { rig } = T;
  let H = w(rig, 'RightUpLeg');
  const Kn = new THREE.Vector3(H.x, KNEE_Y, H.z), dy = KNEE_Y - ANKLE_Y;
  const A = Kn.clone().add(new THREE.Vector3(0, -dy, -Math.sqrt(rig.L2 ** 2 - dy * dy)));
  legTo(T, 'Right', A, Kn.clone().sub(H).add(new THREE.Vector3(0, 0, 0.3)), footAlong(T, 'Right', A.clone().sub(Kn), Math.PI / 2));
  H = w(rig, 'LeftUpLeg');
  const ky = rig.ankleH + rig.L2 * 0.99, dz = Math.sqrt(Math.max(0, rig.L1 ** 2 - (ky - H.y) ** 2));
  const AL = new THREE.Vector3(H.x + 0.03, rig.ankleH, H.z + dz * 0.99);
  legTo(T, 'Left', AL, new THREE.Vector3(0, 1, 0.6), T.footFlat.Left);
}

export default {
  id: 'kneeling-lat-pulldown',
  name: 'Тяга верхнего блока стоя на колене',
  muscles: { work: ['lats', 'obliques', 'rhomboids'], stretch: ['lats'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'тяга', cue: 'Локоть вниз к рёбрам', tempo_s: 1 },
    { name: 'низ', cue: 'Корпус не скручивай', tempo_s: 1 },
    { name: 'вверх', cue: 'Рука вверх медленно', tempo_s: 2, stretch: true },
  ],
  dose: { sets: '3', reps: '12', rest_s: 60 },
  mistakes: ['Корпус наклоняется к блоку', 'Плечо поднимается'],
  view: 'back',
  setup(T) {
    skinSetup(T);
    station(T, PULLEY);
    T.cable = cable(T);
    T.handle = grip(T);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d = depth;
    stand(T);
    trunk(T, K, TORSO_EL);
    placeHips(T, new THREE.Vector3(0, KNEE_Y + rig.L1, 0));
    kneel(T);
    look(T, new THREE.Vector3(0, 0.9, 3), 35);
    rig.relaxHand('Left');
    T.retract = lerp(0, 14, d); T.depress = lerp(-6, 10, d); // вверху плечо тянется за рукой, внизу лопатка вниз
    const S = w(rig, 'RightArm');
    const top = S.clone().addScaledVector(PULLEY.clone().sub(S).normalize(), reachOf(T, 'Right') * 0.995);
    const low = S.clone().add(new THREE.Vector3(-0.06, -0.12, 0.15)); // кисть у плеча чуть ниже и впереди: при кисти на уровне плеча локоть складывался на 166°
    const ax = palmTo(T, 'Right', top.lerp(low, d).add(new THREE.Vector3(-0.14 * Math.sin(Math.PI * d), 0, 0)), FWD, // дугой наружу: по прямой кисть шла перед лицом
      new THREE.Vector3(-0.4, -1, 0.15)); // нейтральный хват, локоть вниз и чуть наружу
    rig.grip('Right', 1);
    placeGrip(T.handle, rig.palm('Right'), ax);
    stretch(T.cable, PULLEY, rig.palm('Right'));
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    if (Math.abs(r.m.torso - TORSO_EL) > 4) r.bad.push(`корпус наклоняется: ${r.m.torso}°`);
    const tilt = w(rig, 'LeftUpLeg').y - w(rig, 'RightUpLeg').y;
    const sh = mid(rig, 'LeftArm', 'RightArm').sub(mid(rig, 'LeftUpLeg', 'RightUpLeg')).normalize();
    r.m.sideLean = Math.round(Math.asin(sh.x) * 57.3);
    if (Math.abs(r.m.sideLean) > 5) r.bad.push(`корпус валится вбок: ${r.m.sideLean}°`);
    r.m.pelvis = cm(tilt);
    if (r.m.elbowR > 150) r.bad.push(`локоть сложен до упора: ${r.m.elbowR}°`);
    const kn = w(rig, 'RightLeg');
    r.m.kneeY = cm(kn.y);
    if (Math.abs(kn.y - KNEE_Y) > 0.01) r.bad.push('колено не на полу');
    const g = T.handle, axis = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion), h = onAxis(T, 'Right', g.position, axis, 0.06);
    r.m.gripR = cm(h.off);
    if (!h.ok) r.bad.push('правая кисть не на рукояти');
    const from = g.position.clone().addScaledVector(PULLEY.clone().sub(g.position).normalize(), 0.06);
    clearOf(T, r, 'трос', PULLEY, from, TORSO);
    const fg = skinGap(T, w(rig, 'RightForeArm'), rig.palm('Right'), ['Head', 'Neck']);
    r.m.handFace = cm(fg);
    if (fg < 0.06) r.bad.push(`кисть у лица (${cm(fg)} см)`);
    return r;
  },
};
