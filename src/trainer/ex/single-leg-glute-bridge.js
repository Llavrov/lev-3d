// Ягодичный мост на одной ноге (левая опорная, правая вытянута — она ближе к камере сбоку справа). Лёжа на спине на коврике:
// тело кладётся как в мёртвом жуке (лопатки и крестец на коврике), потом поворачивается целиком вокруг точки касания лопаток,
// таз поднимается. Верх подобран так, что плечо, таз и колено опорной ноги на одной прямой при колене около 90°: тогда опорная
// стопа стоит плоско на коврике под коленом, это её место на весь цикл. Внизу таз опускается почти до коврика (1–3 см).
// Свободная нога прямая (колено 12°) и всё время продолжает линию опорного бедра. Голова и лопатки остаются на коврике: шея
// сгибается на подъём таза (к линии таз → шея до 49°), голова не отрывается, подбородок к груди. Руки лежат вдоль тела ладонями вниз.
import * as THREE from 'three';
import { X, UP, deg, rad, lerp, smooth, w, mid, key, V, SIDES, sgn, ruSide, cm, stand, trunk, look, armIK, baseAudit } from '../poses.js';
import { mat, floorSetup, settle, center, keep, turn, headOn, faceTo, legThrough, kneeAudit, gap, lowest, MAT } from '../floor.js';

const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2); // грудь вверх, голова к −Z
const K = key({ rTh: V(0.06, 0, 1), rSh: V(0, -1, 0), lTh: V(-0.06, 0, 1), lSh: V(0, -1, 0) });
const SUP = 'Left', FREE = 'Right', LOW = 3; // опорная и свободная нога; таз внизу поднят на LOW° от лёжа

// Тело, поднятое на угол th вокруг лопаток; голова остаётся на коврике.
function body(T, th) {
  const { rig } = T;
  stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q);
  trunk(T, K);
  turn(T, new THREE.Quaternion().setFromAxisAngle(X, -deg(th)), T.pivot);
  look(T, null);
  faceTo(T, new THREE.Vector3(0, 1, 0.15).normalize());
  headOn(T, X);
  rig.root.updateMatrixWorld(true);
}
// Опорная нога: колено продолжает линию плечо → таз, голень под прямым углом к бедру вниз (так стоит верх моста).
function topFoot(T, th) {
  body(T, th);
  const { rig } = T, H = w(rig, SUP + 'UpLeg'), u = H.clone().sub(mid(rig, 'LeftArm', 'RightArm')).setX(0).normalize();
  const Kp = H.clone().addScaledVector(u, rig.L1), n = new THREE.Vector3(0, -u.z, u.y);
  return Kp.addScaledVector(n, rig.L2);
}

export default {
  id: 'single-leg-glute-bridge',
  name: 'Ягодичный мост на одной ноге',
  muscles: { work: ['glutes', 'hamstrings'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'вверх', cue: 'Толкай пяткой, таз ровно', tempo_s: 1 },
    { name: 'верх', cue: 'Плечи, таз и колено в линию', tempo_s: 2 },
    { name: 'вниз', cue: 'Опусти медленно', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '10 на ногу', rest_s: 45 },
  mistakes: ['Таз перекашивается', 'Прогиб в пояснице'],
  view: 'side',
  flat: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    floorSetup(T); mat(T, 1.9, 0.62, 0, -0.35);
    stand(T, 0, 0, 0, LYING); trunk(T, K);
    settle(T, ['Spine2'], ['Hips'], X); center(T);
    T.wrap.position.y += 0.006; // мягкие ткани, как в мёртвом жуке
    T.base = keep(T);
    T.pivot = mid(T.rig, 'LeftArm', 'RightArm').setY(MAT); // опора — верх лопаток под плечевыми суставами, середина спины в мосту отрывается
    // Верх: угол, при котором щиколотка опорной ноги (голень под 90° к бедру) на высоте стопы, стоящей плоско.
    let lo = 5, hi = 60;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (topFoot(T, m).y > T.rig.ankleH + MAT) hi = m; else lo = m; }
    T.thTop = (lo + hi) / 2;
    T.foot = topFoot(T, T.thTop); T.foot.y = T.rig.ankleH + MAT; T.foot.x = sgn(SUP) * T.hipHalf;
  },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    body(T, lerp(LOW, T.thTop, depth));
    legThrough(T, SUP, w(rig, SUP + 'UpLeg').add(new THREE.Vector3(0, 1, 0.6)), T.foot, T.footFlat[SUP]);
    // Свободная нога вдоль опорного бедра, колено почти прямое.
    const d = w(rig, SUP + 'Leg').sub(w(rig, SUP + 'UpLeg')).normalize(), H = w(rig, FREE + 'UpLeg');
    const Kp = H.clone().addScaledVector(d, rig.L1), sh = d.clone().applyAxisAngle(X, deg(12));
    legThrough(T, FREE, Kp, Kp.clone().addScaledVector(sh, rig.L2));
    // Руки на коврике вдоль тела, ладони вниз.
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s];
      armIK(T, s, new THREE.Vector3(S.x + sgn(s) * 0.1, MAT + 0.035, S.z + (L1 + L2) * 0.96), new THREE.Vector3(sgn(s) * 0.5, -1, 0));
      rig.orientHand(s, new THREE.Vector3(-sgn(s), 0, 0), 1, false);
      rig.relaxHand(s); rig.grip(s, 0.2);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [SUP + 'Foot'] });
    delete r.m.torso;
    kneeAudit(T, r);
    // Шея: голова лежит, шея сгибается на подъём таза; отдельная граница вместо «в линию спины».
    r.bad = r.bad.filter((b) => !/голова не в линию/.test(b));
    // Вверху шея к линии таз → шея 49°: таз поднят на 25°, лопатки лежат, основание шеи опускается к коврику на 6 см
    // (позвоночник модели — три жёстких звена, верх грудного отдела не скругляется). Граница 50°.
    if (r.m.neck > 50) r.bad.push(`шея согнута на ${r.m.neck}°`);
    // Опоры на коврике: лопатки, голова, опорная стопа, кисти.
    r.m.backGap = gap(T, ['Spine2', 'LeftShoulder', 'RightShoulder']); r.m.headGap = gap(T, ['Head']); r.m.footGap = gap(T, [SUP + 'Foot', SUP + 'ToeBase'].filter((n) => T.skin[n]));
    r.m.pelvisGap = gap(T, ['Hips']);
    for (const [k, v, lo, hi] of [['лопатки', r.m.backGap, -1, 1.5], ['голова', r.m.headGap, -1, 3], ['опорная стопа', r.m.footGap, -1, 1.5]])
      if (v < lo || v > hi) r.bad.push(`${k} ${v < lo ? 'в полу' : 'над полом'}: ${v} см`);
    if (r.m.pelvisGap < -0.5) r.bad.push(`таз в полу: ${r.m.pelvisGap} см`);
    for (const s of SIDES) { r.m['hand' + s[0]] = gap(T, [s + 'Hand']); if (r.m['hand' + s[0]] < -1 || r.m['hand' + s[0]] > 2) r.bad.push(`${ruSide(s, true)} кисть не на полу (${r.m['hand' + s[0]]} см)`); }
    // Линия плечо → таз → колено опорной ноги (вверху до 10°) и таз ровно.
    const S = mid(rig, 'LeftArm', 'RightArm').setX(0), H = mid(rig, 'LeftUpLeg', 'RightUpLeg').setX(0), Kn = w(rig, SUP + 'Leg').setX(0); // сбоку
    r.m.line = Math.round(rad(H.clone().sub(S).angleTo(Kn.clone().sub(H))));
    if (T.depth > 0.99 && r.m.line > 10) r.bad.push(`плечи, таз и колено не в линию: ${r.m.line}°`);
    r.m.pelvisTilt = cm(w(rig, 'LeftUpLeg').y - w(rig, 'RightUpLeg').y);
    if (Math.abs(r.m.pelvisTilt) > 1) r.bad.push(`таз перекошен на ${r.m.pelvisTilt} см`);
    r.m.thTop = Math.round(T.thTop);
    return r;
  },
};
