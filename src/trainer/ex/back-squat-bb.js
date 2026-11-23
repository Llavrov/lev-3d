// Присед со штангой на спине. Поза и гриф — как станция squat в gym.js (гриф на трапециях, кисти по grab, гриф по ладоням
// placeBar). Стопы чуть шире плеч, носки наружу на 20°, колени по линии носков, таз назад и вниз до параллели бедра с полом,
// корпус наклоняется ровно настолько, чтобы гриф стоял над серединой стопы, спина прямая, пятки на полу.
import * as THREE from 'three';
import { barbell, placeBar } from '../../gym.js';
import { V, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, feet, trunk, placeHips, kneeOverToe, kneeIn, look, palmTo, baseAudit } from '../poses.js';

const TOE = 0.35; // носки наружу, рад (20°)
const MIDFOOT = 0.05; // середина стопы впереди щиколотки, м
const K = key({ rUp: V(0.5, -0.8, -0.2), rFo: V(0.3, 0.9, 0.1), lUp: V(-0.5, -0.8, -0.2), lFo: V(-0.3, 0.9, 0.1) });
const GRIP = 0.42; // кисти от середины грифа, м

// Гриф на трапециях: середина плеч, чуть назад и вверх, как в gym.js.
function barPoint(rig) {
  const up = w(rig, 'Neck').sub(w(rig, 'Spine1')).normalize(), lat = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).normalize();
  const back = new THREE.Vector3().crossVectors(up, lat).normalize();
  return { c: mid(rig, 'LeftArm', 'RightArm').addScaledVector(back, 0.085).addScaledVector(up, 0.045), lat, up, back };
}
// Поза при высоте таза y (середина тазобедренных) и наклоне корпуса el: таз по горизонтали так, чтобы гриф был над серединой стопы.
function body(T, y, el) {
  const { rig } = T;
  stand(T);
  trunk(T, K, el);
  const off = barPoint(rig).c.sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'));
  placeHips(T, new THREE.Vector3(0, y, MIDFOOT - off.z), T.feetAt);
  for (const s of SIDES) kneeOverToe(T, s, sgn(s) * TOE);
}
const thighDrop = (rig) => SIDES.reduce((a, s) => a + w(rig, s + 'UpLeg').y - w(rig, s + 'Leg').y, 0) / 2; // таз выше колена на …

export default {
  id: 'back-squat-bb',
  name: 'Присед со штангой',
  muscles: { work: ['quads', 'glutes', 'adductors', 'lower_back'], stretch: ['glutes', 'adductors'], careful: ['knee', 'lower_back'] },
  phases: [
    { name: 'вниз', cue: 'Таз назад, колени над носками', tempo_s: 3 },
    { name: 'низ', cue: 'Спина ровная, пятки в полу', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Толкай пол всей стопой', tempo_s: 1 },
  ],
  dose: { sets: '4', reps: '5–6', rest_s: 150 },
  mistakes: ['Колени заваливаются внутрь', 'Пятки отрываются от пола', 'Круглая поясница внизу'],
  view: 'side',
  setup(T) {
    const { rig } = T;
    T.bar = barbell(); T.add(T.bar);
    // Блины поменьше (Ø 30 см, как железные по 10 кг): блин 45 см сбоку закрывает всю спину и голову.
    T.bar.traverse((o) => { if (o.isMesh && o.geometry.parameters?.radiusTop === 0.225) o.scale.set(0.66, 1, 0.66); });
    T.feetAt = feet(T, T.shoulderHalf + 0.04, TOE);
    // Высота таза вверху — ноги почти прямые; внизу подбираем так, чтобы бедро легло параллельно полу.
    T.topY = rig.ankleH + 0.975 * (rig.L1 + rig.L2);
    let y = rig.ankleH + rig.L2;
    for (let i = 0; i < 8; i++) { body(T, y, 50); y -= thighDrop(rig) * 0.9; }
    T.bottomY = y;
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T;
    body(T, lerp(T.topY, T.bottomY, depth), lerp(84, 50, depth));
    look(T, new THREE.Vector3(0, 0, 3));
    // Кисти на гриф, локти под грифом: вниз вдоль корпуса, чуть назад и наружу. Раньше локоть брался из исходной позы
    // (grab из gym.js) и вставал выше плеча позади него: плечо отведено назад на 79°, так человек не может.
    const { c, lat, up, back } = barPoint(rig);
    for (const s of SIDES) {
      const out = lat.clone().multiplyScalar(sgn(s)), pole = up.clone().negate().addScaledVector(back, 0.3).addScaledVector(out, 0.25);
      palmTo(T, s, c.clone().addScaledVector(out, GRIP), out.clone().negate(), pole);
    }
    rig.grip('Right', 1); rig.grip('Left', 1);
    placeBar(T, T.bar, T.gear);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] });
    // Колени по линии носков, когда колено согнуто заметно (на прямой ноге колено законно между тазом и щиколоткой).
    for (const s of SIDES) {
      if (r.m['knee' + s[0]] < 40) continue;
      const inward = kneeIn(w(rig, s + 'Leg'), w(rig, s + 'Foot'), sgn(s) * TOE, s);
      r.m['kneeIn' + s[0]] = Math.round(inward);
      if (inward > 10) r.bad.push(`${ruSide(s)} колено заваливается внутрь: ${Math.round(inward)}°`);
    }
    r.m.thigh = cm(thighDrop(rig)); // таз выше колена, см: внизу около нуля — параллель
    const bar = T.bar.getWorldPosition(new THREE.Vector3());
    r.m.barZ = cm(bar.z);
    if (Math.abs(bar.z - MIDFOOT) > 0.05) r.bad.push(`гриф не над серединой стопы: ${cm(bar.z - MIDFOOT)} см`);
    for (const s of SIDES) { const d = rig.palm(s).sub(bar); const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(T.bar.getWorldQuaternion(new THREE.Quaternion())); const off = d.addScaledVector(ax, -d.dot(ax)).length(); r.m['grip' + s[0]] = cm(off); if (off > 0.025) r.bad.push(`${ruSide(s, true)} кисть не на грифе`); }
    return r;
  },
};
