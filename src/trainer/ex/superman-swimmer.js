// Пловец лёжа на животе, поочерёдно (span 2): чётный цикл — правая рука и левая нога, нечётный — левая рука и правая нога.
// Тело повёрнуто грудью вниз, наклон подобран так, что грудь и таз лежат на коврике (floor.settle). Руки вытянуты за голову
// на 15° врозь, ладонями вниз, ноги прямые, стопы вытянуты на 50°: в покое предплечья, бёдра и подъёмы стоп лежат на коврике
// (угол подобран по коже). Подъём: разноимённые рука и нога поднимаются на 10° от плеча и от таза, это около 10–15 см
// у кисти и стопы, колено почти прямое. Шея почти в линию спины (разогнута на столько, чтобы лоб был в 1 см над ковриком), лицо к полу.
import * as THREE from 'three';
import { X, deg, lerp, w, key, V, SIDES, sgn, ruSide, stand, trunk, look, armIK, baseAudit } from '../poses.js';
import { mat, floorSetup, settle, center, keep, legThrough, kneeAudit, gap, lowest, footAlong, faceTo, headOn, MAT } from '../floor.js';

const PRONE = new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2); // грудь вниз, голова к +Z
const K = key({ rUp: V(0.25, 1, 0), rFo: V(0.25, 1, 0), lUp: V(-0.25, 1, 0), lFo: V(-0.25, 1, 0),
  rTh: V(0.04, -1, 0), rSh: V(0, -1, 0), lTh: V(-0.04, -1, 0), lSh: V(0, -1, 0) });
const NX = new THREE.Vector3(-1, 0, 0);
const SPREAD = 15, LIFT = 10, KNEE = 8, POINT = 50; // руки врозь; подъём руки и ноги; сгиб колена; носок вытянут, °
const sideOf = (T, t) => (((Math.floor(t / T.cycle) % 2) + 2) % 2 ? 'Left' : 'Right');
const other = (s) => (s === 'Left' ? 'Right' : 'Left');

function body(T) {
  stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q);
  trunk(T, K);
  look(T, null);
  faceTo(T, new THREE.Vector3(0, -1, 0.15).normalize(), 5); // взгляд в пол чуть впереди
  headOn(T, NX, 0.01); // грудь у модели толстая: шея в линию спины уводила лицо в коврик на 2,7 см, шея чуть разгибается
}
// Рука за голову: направление от плеча под углом el над горизонталью, врозь на SPREAD.
function arm(T, s, el) {
  const { rig } = T, S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s];
  const d = new THREE.Vector3(sgn(s) * Math.sin(deg(SPREAD)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(SPREAD)) * Math.cos(deg(el)));
  armIK(T, s, S.addScaledVector(d, (L1 + L2) * 0.985), new THREE.Vector3(0, -1, 0));
  rig.orientHand(s, new THREE.Vector3(-sgn(s), 0, 0), 1, false); // ладонь вниз, большой палец к середине
  rig.relaxHand(s); rig.grip(s, 0.15);
}
// Нога назад: бедро под углом el над горизонталью, колено чуть согнуто (голень выше), стопа вытянута.
function leg(T, s, el) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), dir = (a) => new THREE.Vector3(0, Math.sin(deg(a)), -Math.cos(deg(a)));
  const Kp = H.clone().addScaledVector(dir(el), rig.L1), sh = dir(el + KNEE), A = Kp.clone().addScaledVector(sh, rig.L2);
  const front = new THREE.Vector3(0, -Math.cos(deg(el + KNEE)), -Math.sin(deg(el + KNEE))); // перед голени — к полу
  legThrough(T, s, Kp, A, footAlong(T, s, sh, front.multiplyScalar(Math.cos(deg(POINT))).addScaledVector(sh, Math.sin(deg(POINT)))));
}
// Угол, при котором нижняя точка кожи участка bones касается коврика (деление пополам, el от −20 до 30°).
function touch(T, set, bones) {
  let lo = -20, hi = 30;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; body(T); set(m); if (lowest(T, bones).y > MAT) hi = m; else lo = m; }
  return hi;
}

export default {
  id: 'superman-swimmer',
  name: 'Пловец лёжа',
  muscles: { work: ['lower_back', 'glutes', 'delts_rear'], stretch: [], careful: ['lower_back', 'neck'] },
  phases: [
    { name: 'подъём', cue: 'Рука и другая нога вверх', tempo_s: 1 },
    { name: 'смена', cue: 'Плавно меняй стороны', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '20', rest_s: 30 },
  view: 'side',
  flat: 'side',
  span: 2,
  setup(T) {
    floorSetup(T); mat(T, 2.2, 0.7, 0, 0.15);
    T.cycle = this.phases.reduce((a, p) => a + p.tempo_s, 0);
    stand(T, 0, 0, 0, PRONE); trunk(T, K);
    settle(T, ['Spine2'], ['Hips'], X); center(T);
    T.base = keep(T);
    T.armEl = touch(T, (e) => arm(T, 'Right', e), ['RightForeArm', 'RightHand']);
    T.legEl = touch(T, (e) => leg(T, 'Right', e), ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'].filter((n) => T.skin[n]));
  },
  pose(T, { t, depth }) {
    const s = sideOf(T, t), o = other(s);
    body(T);
    for (const a of SIDES) arm(T, a, T.armEl + (a === s ? LIFT * depth : 0));
    for (const l of SIDES) leg(T, l, T.legEl + (l === o ? LIFT * depth : 0));
  },
  audit(T) {
    const r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r);
    r.m.chestGap = gap(T, ['Spine2']); r.m.pelvisGap = gap(T, ['Hips']); r.m.headGap = gap(T, ['Head']);
    for (const [k, v] of [['грудь', r.m.chestGap], ['таз', r.m.pelvisGap]]) if (v < -1 || v > 1.5) r.bad.push(`${k} ${v < -1 ? 'в полу' : 'над полом'}: ${v} см`);
    if (r.m.headGap < 0.5) r.bad.push(`лицо в полу: ${r.m.headGap} см`);
    for (const s of SIDES) {
      r.m['hand' + s[0]] = gap(T, [s + 'Hand']);
      r.m['foot' + s[0]] = gap(T, [s + 'Foot', s + 'ToeBase'].filter((n) => T.skin[n]));
      if (r.m['hand' + s[0]] < -1) r.bad.push(`${ruSide(s, true)} кисть в полу`);
      if (r.m['foot' + s[0]] < -1) r.bad.push(`${ruSide(s, true)} стопа в полу`);
      if (r.m['hand' + s[0]] > 20 || r.m['foot' + s[0]] > 20) r.bad.push(`${ruSide(s, true)} рука или нога выше 20 см`);
    }
    r.m.armEl = Math.round(T.armEl); r.m.legEl = Math.round(T.legEl);
    return r;
  },
};
