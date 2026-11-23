// Румынская тяга на одной ноге с гантелью. Опорная левая (колено 20°, голень почти отвесно, стопа на месте весь цикл),
// гантель в правой руке висит отвесно под плечом. Корпус наклоняется из тазобедренного от 86° до 25° над горизонталью,
// свободная нога уходит назад одной линией с корпусом, колено почти прямое, носок в пол. Таз ровно: оба тазобедренных
// на одной высоте (trunk наклоняет таз вокруг поперечной оси, без крена).
import * as THREE from 'three';
import { V, X, deg, rad, lerp, smooth, w, mid, key, SIDES, cm, ruSide, dumbbells, placeDB, stand, feet, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { legTo, footAlong } from '../kneel.js';
import { hipsOver } from './romanian-deadlift-db.js';
import { pelvisRoll } from '../posterior.js';

const SUP = 'Left', FREE = 'Right', BOTTOM = 25, SHIFT = 0.035;
const K = key({ rUp: V(0.08, -1, 0.05), rFo: V(0.06, -1, 0.12), lUp: V(-0.08, -1, 0.05), lFo: V(-0.06, -1, 0.12),
  rTh: V(0.05, -1, 0), rSh: V(0.03, -1, 0), lTh: V(-0.05, -1, 0), lSh: V(-0.03, -1, 0) });

export default {
  id: 'single-leg-rdl-db',
  name: 'Румынская тяга на одной ноге',
  muscles: { work: ['hamstrings', 'glutes', 'hip_abductors'], stretch: ['hamstrings'], careful: ['hamstrings', 'ankle'] },
  phases: [
    { name: 'вниз', cue: 'Корпус и нога одной линией', tempo_s: 3, stretch: true },
    { name: 'низ', cue: 'Таз ровно, не раскрывай', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Встань через ягодицу', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8 на ногу', rest_s: 60 },
  mistakes: ['Таз раскрывается в сторону', 'Круглая спина'],
  view: 'side',
  setup(T) {
    dumbbells(T); T.db.Left.visible = false;
    T.feetAt = feet(T, T.hipHalf);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    stand(T);
    trunk(T, K, lerp(86, BOTTOM, depth));
    const M = hipsOver(T, lerp(18, 22, depth), lerp(3, -2, depth)); M.x = SHIFT; // опорный тазобедренный над стопой и чуть дальше
    placeHips(T, M, T.feetAt);
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, -lerp(0.3, 2.5, depth), 2.5)), 30);
    // Свободная нога продолжает линию шея → таз, колено чуть согнуто; у пола носок касается.
    const H = w(rig, FREE + 'UpLeg'), dir = H.clone().sub(w(rig, 'Neck')).setX(0).normalize();
    const A = H.clone().addScaledVector(dir, 0.97 * (rig.L1 + rig.L2));
    A.y = Math.max(A.y, rig.ankleH + 0.03);
    legTo(T, FREE, A, new THREE.Vector3(0, -1, 0.15));
    const sh = A.clone().sub(w(rig, FREE + 'Leg')).normalize();
    rig.setWorld(rig.b[FREE + 'Foot'], footAlong(T, FREE, sh, deg(lerp(25, 0, depth)))); rig.root.updateMatrixWorld(true);
    // Руки висят отвесно под плечами, гантель в правой.
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), P = S.clone().add(new THREE.Vector3(0, -reachOf(T, s) * 0.995, 0.02));
      const ax = palmTo(T, s, P, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)); // нейтральный хват: ладонь к бедру, гантель вдоль шага
      if (s === FREE) placeDB(T, s, ax);
    }
    rig.grip(FREE, 1); rig.relaxHand(SUP); rig.grip(SUP, 0.35);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [SUP + 'Foot', SUP + 'ToeBase'] });
    delete r.m.gripL;
    r.bad = r.bad.filter((b) => !/левая кисть не на рукояти/.test(b));
    r.m.roll = pelvisRoll(T);
    if (Math.abs(r.m.roll) > 3) r.bad.push(`таз раскрылся: крен ${r.m.roll}°`);
    // Свободная нога в линию с корпусом на нижней половине движения.
    const H = w(rig, FREE + 'UpLeg'), A = w(rig, FREE + 'Foot'), body = mid(rig, 'LeftUpLeg', 'RightUpLeg').sub(w(rig, 'Neck'));
    r.m.legLine = Math.round(rad(A.clone().sub(H).angleTo(body)));
    if (T.depth > 0.6 && r.m.legLine > 15) r.bad.push(`нога не в линию с корпусом: ${r.m.legLine}°`);
    r.m.freeY = cm(A.y - rig.ankleH);
    if (A.y < rig.ankleH - 0.01) r.bad.push('свободная стопа в полу');
    const k = r.m['knee' + SUP[0]];
    if (k > 30) r.bad.push(`опорное колено согнуто как в приседе: ${k}°`);
    const db = T.db[FREE].position;
    r.m.dbY = cm(db.y);
    if (db.y < 0.07) r.bad.push('гантель в полу');
    return r;
  },
};
