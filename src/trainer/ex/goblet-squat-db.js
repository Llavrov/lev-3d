// Гоблет-присед: одна гантель отвесно у груди, ладони чашей под верхней головой, локти вниз. Стопы чуть шире плеч,
// носки наружу на 20°, колени по линии носков, таз вниз до бедра чуть ниже параллели, корпус прямее, чем со штангой
// на спине (вес спереди): плечи над серединой стопы. Локти до коленей не достают (руки модели короткие), поэтому
// подсказка низа «колени наружу», а не «раздвинь колени локтями».
import * as THREE from 'three';
import { lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, feet, trunk, placeHips, kneeOverToe, look, baseAudit } from '../poses.js';
import { valgus } from '../jump.js';
import { legsSetup, gobletSetup, goblet, gobletAudit, gaze } from '../legs.js';

const TOE = 0.35, MIDFOOT = 0.05, K = key({});
const EL1 = 62, DEEP = 0.02; // корпус внизу над горизонталью, °; таз ниже колена внизу, м
const thighDrop = (rig) => SIDES.reduce((a, s) => a + w(rig, s + 'UpLeg').y - w(rig, s + 'Leg').y, 0) / 2; // таз выше колена на …

function body(T, y, el) {
  const { rig } = T;
  stand(T);
  trunk(T, K, el);
  const off = mid(rig, 'LeftArm', 'RightArm').sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'));
  placeHips(T, new THREE.Vector3(0, y, MIDFOOT - off.z), T.feetAt);
  for (const s of SIDES) kneeOverToe(T, s, sgn(s) * TOE);
}

export default {
  id: 'goblet-squat-db',
  name: 'Гоблет-присед',
  muscles: { work: ['quads', 'glutes', 'adductors', 'abs'], stretch: ['adductors'], careful: ['knee'] },
  phases: [
    { name: 'вниз', cue: 'Гантель у груди, локти вниз', tempo_s: 3 },
    { name: 'низ', cue: 'Колени наружу, по носкам', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Встань, грудь вверх', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '10–12', rest_s: 90 },
  mistakes: ['Гантель уходит от груди', 'Наклон корпуса вперёд'],
  view: 'side',
  setup(T) {
    const { rig } = T;
    legsSetup(T); gobletSetup(T);
    T.feetAt = feet(T, T.shoulderHalf + 0.04, TOE);
    T.topY = rig.ankleH + 0.975 * (rig.L1 + rig.L2);
    let y = rig.ankleH + rig.L2;
    for (let i = 0; i < 10; i++) { body(T, y, EL1); y -= (thighDrop(rig) + DEEP) * 0.9; }
    T.bottomY = y;
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    body(T, lerp(T.topY, T.bottomY, depth), lerp(86, EL1, depth));
    look(T, new THREE.Vector3(0, 1.0, 3), 35);
    goblet(T, lerp(0.0, -0.02, depth));
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] });
    for (const s of SIDES) {
      if (r.m['knee' + s[0]] < 40) continue;
      const v = valgus(rig, s, sgn(s) * TOE);
      r.m['kneeIn' + s[0]] = Math.round(v);
      if (v > 10) r.bad.push(`${ruSide(s)} колено заваливается внутрь: ${Math.round(v)}°`);
    }
    r.m.thigh = cm(thighDrop(rig));
    if (r.m.torso < 55) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    gaze(T, r, -35);
    return gobletAudit(T, r);
  },
};
