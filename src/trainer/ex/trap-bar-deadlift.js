// Становая тяга с трэп-грифом. Человек стоит внутри шестигранной рамы, стопы на ширине таза, рукояти по бокам
// (нейтральный хват), руки висят прямо, плечи над рукоятями. Внизу блины на полу; подъём: ноги толкают пол, таз и
// плечи идут вверх вместе, спина прямая; вверху таз вперёд, плечи вниз. Опускание: таз назад, гриф вдоль ног.
// Рукояти высокие (на 17,5 см над втулкой, блины Ø30 см): с низкими у модели с короткими руками таз внизу уходил ниже колен.
import * as THREE from 'three';
import { FWD, UP, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, feet, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { valgus } from '../jump.js';
import { legsSetup, trapBar, trapGrip, trapRails, skinGap, TB, gaze } from '../legs.js';

const ZH = 0.04, ELB = 42, K = key({}); // рукояти над серединой стопы; корпус внизу над горизонталью, °
const LEGS = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];

// Тело при угле корпуса el и высоте рукоятей hy: плечи над рукоятями на длину прямой руки.
function body(T, el, hy) {
  const { rig } = T;
  stand(T);
  trunk(T, K, el);
  const sh = mid(rig, 'LeftArm', 'RightArm'), off = sh.clone().sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'));
  const dx = TB.HX - T.shoulderHalf, drop = Math.sqrt((reachOf(T, 'Left') * 0.98) ** 2 - dx * dx);
  placeHips(T, new THREE.Vector3(0, hy + drop, ZH).sub(off), T.feetAt);
}

export default {
  id: 'trap-bar-deadlift',
  name: 'Становая с трэп-грифом',
  muscles: { work: ['glutes', 'quads', 'hamstrings', 'lower_back', 'traps'], stretch: ['hamstrings'], careful: ['lower_back'] },
  phases: [
    { name: 'подъём', cue: 'Толкай пол, спина нейтральна', tempo_s: 1 },
    { name: 'верх', cue: 'Таз вперёд, плечи вниз', tempo_s: 1 },
    { name: 'вниз', cue: 'Таз назад, гриф по ногам', tempo_s: 2, stretch: true },
  ],
  dose: { sets: '4', reps: '4–6', rest_s: 150 },
  mistakes: ['Круглая спина в начале', 'Рывок руками вместо ног'],
  view: 'quarter', // спереди-сбоку: строго сбоку ближний блин закрывает таз и ноги
  flat: 'side',
  setup(T) {
    const { rig } = T;
    legsSetup(T);
    T.bar = trapBar(); T.add(T.bar);
    T.feetAt = feet(T, 0.12, 0.08);
    T.depress = 6; // плечи вниз
    T.hyLow = TB.PLATE + TB.RISE; // блины на полу
    // Вверху: ноги почти прямые — высота рукоятей та, на которой таз встаёт на свою высоту стоя.
    body(T, 86, 0);
    const top = rig.ankleH + 0.975 * (rig.L1 + rig.L2);
    T.hyTop = top - mid(rig, 'LeftUpLeg', 'RightUpLeg').y;
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? 1 - e : i === 1 ? 0 : e; },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    const hy = lerp(T.hyTop, T.hyLow, depth);
    body(T, lerp(86, ELB, depth), hy);
    look(T, new THREE.Vector3(0, 0.6, lerp(3, 1.6, depth)), 35);
    const c = new THREE.Vector3(0, hy, ZH);
    T.bar.position.copy(c); T.bar.updateMatrixWorld(true);
    for (const s of SIDES) {
      const out = new THREE.Vector3(sgn(s), 0, 0);
      palmTo(T, s, trapGrip(c, s), FWD, UP.clone().negate().addScaledVector(FWD, -0.4).addScaledVector(out, 0.3));
      rig.grip(s, 1);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] }), c = T.bar.position;
    for (const s of SIDES) {
      const d = rig.palm(s).sub(trapGrip(c, s)).setZ(0).length(); // вдоль рукояти кисть может стоять где угодно
      r.m['grip' + s[0]] = cm(d);
      if (d > 0.02) r.bad.push(`${ruSide(s, true)} кисть не на рукояти (${cm(d)} см)`);
      if (r.m['knee' + s[0]] > 40) {
        const v = valgus(rig, s, sgn(s) * 0.08); r.m['kneeIn' + s[0]] = Math.round(v);
        if (v > 10) r.bad.push(`${ruSide(s)} колено заваливается внутрь: ${Math.round(v)}°`);
      }
    }
    const plate = c.y - TB.RISE - TB.PLATE; r.m.plateY = cm(plate);
    if (plate < -0.005) r.bad.push(`блины в полу (${cm(plate)} см)`);
    if (T.depth > 0.99 && plate > 0.01) r.bad.push(`внизу блины не на полу (${cm(plate)} см)`);
    // Плечи над рукоятями: иначе тянут руки, а не ноги.
    const sz = mid(rig, 'LeftArm', 'RightArm').z - c.z; r.m.shoulderOverBar = cm(sz);
    if (Math.abs(sz) > 0.06) r.bad.push(`плечи не над рукоятями (${cm(sz)} см)`);
    // Рама и рукояти не проходят сквозь ноги (по вершинам кожи).
    let g = Infinity;
    for (const [a, b] of trapRails(T.bar)) g = Math.min(g, skinGap(T, LEGS, a, b, TB.R));
    for (const s of SIDES) { const p = trapGrip(c, s), d = new THREE.Vector3(0, 0, 0.2); g = Math.min(g, skinGap(T, LEGS, p.clone().sub(d), p.clone().add(d), 0.016)); }
    r.m.barLegGap = cm(g);
    if (g < -0.005) r.bad.push(`гриф в ноге (${cm(g)} см)`);
    r.m.hipsY = cm(mid(rig, 'LeftUpLeg', 'RightUpLeg').y);
    gaze(T, r, -55);
    return r;
  },
};
