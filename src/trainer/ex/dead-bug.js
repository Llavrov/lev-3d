// Мёртвый жук, поочерёдно (span 2): чётный цикл — правая рука и левая нога, нечётный — левая рука и правая нога.
// Лёжа на спине на коврике: тело повёрнуто грудью вверх, наклон подобран так, что лопатки и крестец лежат на коврике
// (floor.settle), поясница не отрывается. Старт: руки отвесно над плечами, бёдра отвесно, колени 90°, голени над полом
// горизонтально. Вынос: рука по дуге за голову до запястья на 10 см над полом, разноимённая нога разгибается до колена 12°
// и бедра 8° над полом, пятка остаётся над полом. Вторая пара стоит. Голова на коврике, взгляд в потолок.
import * as THREE from 'three';
import { X, deg, lerp, smooth, w, key, V, SIDES, sgn, ruSide, cm, stand, trunk, look, armIK, baseAudit } from '../poses.js';
import { mat, floorSetup, settle, center, keep, legThrough, kneeAudit, gap, lowest, MAT, elevOf } from '../floor.js';

const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2); // грудь вверх, голова к −Z
const K = key({ rTh: V(0.06, 0, 1), rSh: V(0, -1, 0), lTh: V(-0.06, 0, 1), lSh: V(0, -1, 0) });
const WRIST_Y = 0.10, THIGH_END = 8, KNEE_END = 12; // запястье над полом в выносе, м; бедро над полом и сгиб колена в выносе, °
const sideOf = (T, t) => (((Math.floor(t / T.cycle) % 2) + 2) % 2 ? 'Left' : 'Right'); // рука этого цикла; нога — другая
const other = (s) => (s === 'Left' ? 'Right' : 'Left');

function body(T) {
  stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q);
  trunk(T, K);
  look(T, null);
  look(T, w(T.rig, 'Head').add(new THREE.Vector3(0, 2, 0)), 30);
}
// Рука: угол φ от «за головой вдоль пола» (0) до отвеса (90), запястье на длине почти прямой руки.
function arm(T, s, phi) {
  const { rig } = T, S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s], d = new THREE.Vector3(0, Math.sin(deg(phi)), -Math.cos(deg(phi)));
  armIK(T, s, S.clone().addScaledVector(d, (L1 + L2) * 0.985), new THREE.Vector3(sgn(s) * 0.3, Math.cos(deg(phi)), Math.sin(deg(phi))));
  rig.orientHand(s, new THREE.Vector3(0, -Math.cos(deg(phi)), -Math.sin(deg(phi))).lerp(new THREE.Vector3(0, 0, -1), 0.5).normalize(), 1, false); // большой палец к голове
  rig.relaxHand(s); rig.grip(s, 0.3);
}
// Нога: бедро на угол th над полом, колено согнуто на kn; голень уходит к стопам.
function leg(T, s, th, kn) {
  const { rig } = T, H = w(rig, s + 'UpLeg');
  const Kp = H.clone().add(new THREE.Vector3(0, Math.sin(deg(th)), Math.cos(deg(th))).multiplyScalar(rig.L1));
  const A = Kp.clone().add(new THREE.Vector3(0, Math.sin(deg(th - kn)), Math.cos(deg(th - kn))).multiplyScalar(rig.L2));
  legThrough(T, s, Kp, A);
}

export default {
  id: 'dead-bug',
  name: 'Мёртвый жук',
  muscles: { work: ['abs', 'obliques', 'hip_flexors'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'вынос', cue: 'Рука и другая нога к полу', tempo_s: 2 },
    { name: 'держи', cue: 'Поясница прижата к полу', tempo_s: 1 },
    { name: 'возврат', cue: 'Медленно, без прогиба', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '10 на сторону', rest_s: 30 },
  mistakes: ['Поясница отрывается', 'Слишком быстрый темп'],
  view: 'side',
  flat: 'side',
  span: 2,
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    floorSetup(T); mat(T, 1.9, 0.62, 0, -0.35);
    T.cycle = this.phases.reduce((a, p) => a + p.tempo_s, 0);
    stand(T, 0, 0, 0, LYING); trunk(T, K);
    settle(T, ['Spine2'], ['Hips'], X); center(T);
    T.wrap.position.y += 0.008; // мягкие ткани: в движении ягодица под ногой уходит в коврик на 1,5 см, голова на 1,2
    T.base = keep(T);
    // Рука в выносе: угол, на котором запястье на WRIST_Y над полом.
    body(T);
    const S = w(T.rig, 'RightArm'), [L1, L2] = T.rig.armLen.Right;
    T.phiEnd = THREE.MathUtils.radToDeg(Math.asin((WRIST_Y - S.y) / ((L1 + L2) * 0.97)));
  },
  pose(T, { t, depth }) {
    const s = sideOf(T, t), o = other(s);
    body(T);
    for (const a of SIDES) arm(T, a, a === s ? lerp(90, T.phiEnd, depth) : 90);
    for (const l of SIDES) l === o ? leg(T, l, lerp(90, THIGH_END, depth), lerp(90, KNEE_END, depth)) : leg(T, l, 90, 90);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r);
    // Спина на коврике: лопатки, поясница и крестец не висят и не проваливаются.
    r.m.backGap = gap(T, ['Spine2']); r.m.lumbarGap = gap(T, ['Spine', 'Spine1']); r.m.pelvisGap = gap(T, ['Hips']); r.m.headGap = gap(T, ['Head', 'HeadTop_End'].filter((n) => T.skin[n]));
    for (const [k, v, lo, hi] of [['лопатки', r.m.backGap, -1, 1.5], ['крестец', r.m.pelvisGap, -1, 1.5], ['поясница', r.m.lumbarGap, -1, 3], ['голова', r.m.headGap, -1, 4]])
      if (v < lo || v > hi) r.bad.push(`${k} ${v < lo ? 'в полу' : 'над полом'}: ${v} см`);
    // Стоящая пара: бедро отвесно, колено 90°. Кисти и пятки над полом.
    for (const s of SIDES) {
      r.m['hand' + s[0]] = gap(T, [s + 'Hand']);
      r.m['heel' + s[0]] = gap(T, [s + 'Foot', s + 'ToeBase'].filter((n) => T.skin[n]));
      r.m['thigh' + s[0]] = elevOf(T, s + 'UpLeg', s + 'Leg');
      if (r.m['hand' + s[0]] < 1) r.bad.push(`${ruSide(s, true)} кисть на полу`);
      if (r.m['heel' + s[0]] < 1) r.bad.push(`${ruSide(s, true)} стопа на полу`);
    }
    return r;
  },
};
