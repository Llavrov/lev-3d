// Жим блока одной рукой стоя. Блок сзади справа на высоте груди, человек стоит к нему спиной в разножке (левая нога
// впереди), правая рука выжимает рукоять вперёд от груди до прямой руки, в конце лопатка уходит вперёд (ключица вперёд).
// Корпус смотрит прямо и не разворачивается за рукой. Трос идёт от рукояти назад вдоль предплечья, под локтем, снаружи корпуса: ролик стоит на продолжении предплечья
// в начале жима (при ролике у плеча трос шёл сквозь подмышку).
import * as THREE from 'three';
import { V, FWD, lerp, smooth, w, key, cm, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { stretch } from '../band.js';
import { station, cable, grip, placeGrip, onAxis, skinSetup, clearOf, TORSO, LEGS } from '../pulls.js';

const PULLEY = new THREE.Vector3(-0.43, 0.92, -0.92), TORSO_EL = 86, SPLIT = 0.24; // ролик; корпус, °; ступни вперёд-назад, м
const K = key( // левая рука свободна, опущена вдоль корпуса
  { lUp: V(-0.12, -1, 0.05), lFo: V(-0.1, -0.6, 0.8) });

export default {
  id: 'single-arm-cable-press',
  name: 'Жим блока одной рукой стоя',
  muscles: { work: ['chest', 'delts_front', 'triceps', 'obliques'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'жим', cue: 'Выжми вперёд, корпус прямо', tempo_s: 1 },
    { name: 'вперёд', cue: 'Лопатка вперёд в конце', tempo_s: 1 },
    { name: 'возврат', cue: 'Медленно назад', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '10 на руку', rest_s: 60 },
  mistakes: ['Корпус разворачивается', 'Плечо уходит к уху'],
  view: 'side',
  setup(T) {
    const { rig } = T;
    skinSetup(T);
    station(T, PULLEY);
    T.cable = cable(T);
    T.handle = grip(T);
    T.feetAt = { crouch: 0,
      Left: { pos: new THREE.Vector3(T.hipHalf + 0.03, 0, SPLIT), lift: 0, yaw: 0.07 },
      Right: { pos: new THREE.Vector3(-T.hipHalf - 0.03, 0, -SPLIT), lift: 0, yaw: -0.2 } };
    T.hipY = rig.ankleH + 0.94 * (rig.L1 + rig.L2);
  },
  // Жим идёт до прямой руки (0,85 глубины), потом лопатка вперёд до 1.
  motion(i, u) { const e = smooth(u); return i === 0 ? 0.85 * e : i === 1 ? 0.85 + 0.15 * e : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, press = Math.min(1, depth / 0.85), prot = Math.max(0, (depth - 0.85) / 0.15);
    stand(T);
    trunk(T, K, TORSO_EL);
    placeHips(T, new THREE.Vector3(0, T.hipY, 0), T.feetAt);
    look(T, new THREE.Vector3(0, 1.3, 3), 35);
    rig.relaxHand('Left');
    // Правая: от груди (кисть у плеча, локоть назад-вниз-наружу) до прямой руки перед плечом на высоте груди.
    T.retract = lerp(8, -14, prot); T.depress = 3;
    const S = w(rig, 'RightArm');
    const P0 = S.clone().add(new THREE.Vector3(-0.08, -0.15, 0.15)), P1 = S.clone().add(new THREE.Vector3(0.04, -0.08, 0)).addScaledVector(FWD, reachOf(T, 'Right') * 0.96);
    const P = P0.lerp(P1, smooth(press)).addScaledVector(FWD, 0.05 * prot);
    const ax = palmTo(T, 'Right', P, new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.75, -0.5, -0.5)); // хват сверху, локоть назад, вниз и наружу: на середине жима локоть над тросом
    rig.grip('Right', 1);
    placeGrip(T.handle, rig.palm('Right'), ax);
    stretch(T.cable, PULLEY, rig.palm('Right'));
    T.d = depth;
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    if (Math.abs(r.m.torso - TORSO_EL) > 3) r.bad.push(`корпус гуляет: ${r.m.torso}°`);
    // Корпус не разворачивается: линия плеч поперёк (по X), разворот до 5°.
    const sh = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).setY(0).normalize();
    r.m.turn = Math.round(Math.abs(Math.atan2(sh.z, sh.x)) * 57.3);
    if (r.m.turn > 5) r.bad.push(`корпус развернулся на ${r.m.turn}°`);
    const g = T.handle, axis = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion), h = onAxis(T, 'Right', g.position, axis, 0.06);
    r.m.gripR = cm(h.off);
    if (!h.ok) r.bad.push('правая кисть не на рукояти');
    if (T.d > 0.84 && r.m.elbowR > 25) r.bad.push(`рука не выпрямилась: локоть ${r.m.elbowR}°`);
    const from = g.position.clone().addScaledVector(PULLEY.clone().sub(g.position).normalize(), 0.06);
    clearOf(T, r, 'трос', PULLEY, from, [...TORSO, ...LEGS, 'RightArm', 'LeftArm', 'LeftForeArm']);
    return r;
  },
};
