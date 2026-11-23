// Паллоф-пресс у блока. Блок слева на высоте груди, человек стоит к нему боком в полуприседе (колени мягкие), обе кисти
// на короткой рукояти у груди. Жим: рукоять уходит прямо вперёд на прямые руки, пауза, возврат к груди. Трос тянет
// вбок, корпус и таз не поворачиваются к блоку. Трос крепится к левому концу рукояти, снаружи левой кисти.
import * as THREE from 'three';
import { V, w, mid, key, SIDES, ruSide, cm, rad, lerp, smooth, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { floorSetup } from '../floor.js';
import { band, stretch } from '../band.js';
import { station, handleBar, placeBar, onBar, skinGap, gazeAudit, HANDLE } from '../core.js';

const HALF = 0.27; // полуширина стойки, м
const K = key({ rUp: V(0.2, -1, 0.3), rFo: V(-0.3, 0.2, 1), lUp: V(-0.2, -1, 0.3), lFo: V(0.3, 0.2, 1) });
const AX = new THREE.Vector3(1, 0, 0); // ось рукояти, левая кисть в +X

function body(T) {
  const { rig } = T;
  stand(T);
  trunk(T, K);
  placeHips(T, new THREE.Vector3(0, rig.ankleH + 0.95 * (rig.L1 + rig.L2), -0.02),
    { crouch: 0, Left: { pos: new THREE.Vector3(HALF, 0, 0), lift: 0, yaw: 0.12 }, Right: { pos: new THREE.Vector3(-HALF, 0, 0), lift: 0, yaw: -0.12 } });
}
const yaw = (a, b) => { const d = b.clone().sub(a); return rad(Math.atan2(d.z, d.x)); }; // направление линии в плане, °

export default {
  id: 'pallof-press',
  name: 'Паллоф-пресс',
  muscles: { work: ['obliques', 'abs', 'glutes'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'жим', cue: 'Выжми руки вперёд', tempo_s: 1 },
    { name: 'держи', cue: 'Не дай развернуть корпус', tempo_s: 2 },
    { name: 'возврат', cue: 'Руки к груди', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '10 на сторону', rest_s: 45 },
  mistakes: ['Корпус поворачивается к блоку', 'Плечи поднимаются'],
  view: 'side', // спереди и спереди-сбоку руки уходят в камеру и жим не читается; блок за спиной виден
  flat: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    body(T);
    const M = mid(rig, 'LeftArm', 'RightArm');
    T.C0 = M.clone().add(new THREE.Vector3(0, -0.16, 0.2)); // у груди
    T.C1 = M.clone().add(new THREE.Vector3(0, -0.1, reachOf(T, 'Right') * 0.96)); // руки прямые вперёд
    T.pulley = new THREE.Vector3(1.15, T.C0.y, lerp(T.C0.z, T.C1.z, 0.5));
    T.add(station(T.pulley, new THREE.Vector3(0.08, 0, -0.04)));
    T.bar = handleBar(); T.add(T.bar);
    T.cable = band(T, '#111214', 0.004);
  },
  pose(T, { depth }) {
    const { rig } = T;
    body(T);
    const C = T.C0.clone().lerp(T.C1, depth);
    look(T, C.clone().add(new THREE.Vector3(0, -0.6, 2.5)), 35);
    const pole = new THREE.Vector3(0, -1, -0.3).lerp(new THREE.Vector3(0, -1, 0), depth);
    palmTo(T, 'Right', C.clone().addScaledVector(AX, -0.055), AX, pole);
    palmTo(T, 'Left', C.clone().addScaledVector(AX, 0.055), AX.clone().negate(), pole);
    rig.grip('Right', 1); rig.grip('Left', 1);
    placeBar(T, T.bar);
    T.hook = T.bar.position.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(T.bar.quaternion), HANDLE / 2);
    stretch(T.cable, T.hook, T.pulley);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    for (const s of SIDES) {
      r.m['grip' + s[0]] = onBar(T, s, T.bar);
      if (r.m['grip' + s[0]] > 2) r.bad.push(`${ruSide(s, true)} кисть не на рукояти (${r.m['grip' + s[0]]} см)`);
    }
    // Корпус и таз смотрят вперёд: линия плеч и линия таза в плане параллельны оси X.
    r.m.chestYaw = Math.round(yaw(w(rig, 'RightArm'), w(rig, 'LeftArm')));
    r.m.hipYaw = Math.round(yaw(w(rig, 'RightUpLeg'), w(rig, 'LeftUpLeg')));
    if (Math.abs(r.m.chestYaw) > 5 || Math.abs(r.m.hipYaw) > 5) r.bad.push(`корпус повёрнут: плечи ${r.m.chestYaw}°, таз ${r.m.hipYaw}°`);
    r.m.shrug = cm(mid(rig, 'LeftArm', 'RightArm').y - T.C0.y - 0.16);
    if (Math.abs(r.m.shrug) > 1.5) r.bad.push(`плечи поднялись на ${r.m.shrug} см`);
    gazeAudit(T, r);
    const g = skinGap(T, T.hook, T.pulley, 0.004, 0.03);
    r.m.cableGap = g.gap;
    if (g.gap < 0.5) r.bad.push(`трос сквозь тело (${g.bone}, ${g.gap} см)`);
    return r;
  },
};
