// Разгибание рук с резинкой (французский жим вниз у блока, с эспандером). Стоя, стопы на ширине таза, колени мягкие
// (около 18°), корпус 84° над горизонталью: чуть вперёд из таза, спина прямая. Резинка закреплена на стойке впереди
// на 1,95 м, в руках две ручки, хват нейтральный (большие пальцы к плечам). Плечи стоят: чуть вперёд и наружу от
// отвеса, локти у боков. Двигается только предплечье, в плоскости вдоль тела: от 100° от отвеса (кисти у груди) до 15°
// (рука почти прямая, кисти перед бёдрами). Пауза внизу, медленно вверх.
import * as THREE from 'three';
import { key, w, SIDES, sgn, ruSide, cm, smooth, lerp, deg, stand, feet, trunk, placeHips, look, baseAudit } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';
import { band, stretch } from '../band.js';
import { bodyShape, anchor, handle, placeHandle, handleGap, bodyAudit, bandClear, clearance, legClear, wristAudit } from '../arms.js';

const K = key({}), TORSO = 84, KNEE = 18, SHIN = 2, TOP = 100, LOW = 15;
const ANCHOR = new THREE.Vector3(0, 1.95, 0.6);
const V3 = (...a) => new THREE.Vector3(...a);

function pose(T, { depth }) {
  const { rig } = T;
  stand(T);
  trunk(T, K, TORSO);
  placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
  look(T, V3(0, 1.0, 2.5), 18);
  const th = deg(lerp(TOP, LOW, depth));
  for (const s of SIDES) {
    const u = V3(sgn(s) * 0.12, -1, 0.14).normalize(), f = V3(sgn(s) * 0.04, -Math.cos(th), Math.sin(th)).normalize();
    rig.root.updateMatrixWorld(true);
    rig.arm(s, u.applyQuaternion(rig.toPlayer), f.applyQuaternion(rig.toPlayer));
    rig.relaxHand(s); rig.grip(s, 1);
    placeHandle(T, T.handles[s], s);
    stretch(T.bands[s], ANCHOR, T.handles[s].position);
  }
}

export default {
  id: 'band-triceps-extension',
  name: 'Разгибание рук с резинкой',
  muscles: { work: ['triceps'], stretch: [], careful: ['elbow'] },
  phases: [
    { name: 'вниз', cue: 'Локти прижаты, разогни', tempo_s: 1 },
    { name: 'низ', cue: 'Пауза внизу', tempo_s: 1 },
    { name: 'вверх', cue: 'Медленно согни', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '20', rest_s: 45 },
  mistakes: ['Локти гуляют', 'Наклон корпусом'],
  view: 'side',
  setup(T) {
    bodyShape(T);
    T.feetAt = feet(T, T.hipHalf);
    T.add(anchor(ANCHOR, V3(0, 0, 1)));
    T.handles = { Left: handle(), Right: handle() }; T.add(T.handles.Left, T.handles.Right);
    T.bands = { Left: band(T), Right: band(T) };
    pose(T, { depth: 0 });
    T.elbow0 = Object.fromEntries(SIDES.map((s) => [s, w(T.rig, s + 'ForeArm')]));
    T.len0 = T.handles.Left.position.distanceTo(ANCHOR);
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    wristAudit(T, r);
    bodyAudit(T, r);
    if (Math.abs(r.m.torso - TORSO) > 4) r.bad.push(`корпус наклонён: ${r.m.torso}°`);
    for (const s of SIDES) {
      const E = w(rig, s + 'ForeArm'), d = E.distanceTo(T.elbow0[s]), side = clearance(T, E) - T.limbR[s + 'Arm'];
      r.m['moveE' + s[0]] = cm(d); r.m['elbowSide' + s[0]] = cm(side);
      if (d > 0.01) r.bad.push(`${ruSide(s)} локоть сдвинулся на ${cm(d)} см`);
      if (side > 0.04) r.bad.push(`${ruSide(s)} локоть отошёл от бока на ${cm(side)} см`);
      const g = handleGap(T, T.handles[s], s), H = T.handles[s].position, len = H.distanceTo(ANCHOR), c = bandClear(T, ANCHOR, H);
      r.m['grip' + s[0]] = g; r.m['band' + s[0]] = cm(len - T.len0); r.m['bandClear' + s[0]] = cm(c);
      const lc = legClear(T, T.rig.palm(s)) - 0.025; // кулак толщиной 5 см
      r.m['handLeg' + s[0]] = cm(lc);
      if (lc < -0.01) r.bad.push(`${ruSide(s, true)} кисть в бедре (${cm(lc)} см)`);
      if (g > 2) r.bad.push(`${ruSide(s, true)} кисть не на ручке (${g} см)`);
      if (len < T.len0 - 0.01) r.bad.push(`${ruSide(s, true)} резинка провисла`);
      if (c < 0.01) r.bad.push(`${ruSide(s, true)} резинка проходит сквозь тело`);
    }
    return r;
  },
};
