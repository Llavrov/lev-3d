// Обратные скручивания. Лёжа на спине на коврике (как мёртвый жук: floor.settle по лопаткам и крестцу), руки вдоль
// тела ладонями вниз, колени согнуты на 90°. Старт: бёдра наклонены к стопам, пятки в 3 см над полом. Подъём: бёдра
// до отвеса и дальше к груди, потом таз подкручивается к рёбрам на 35°: крестец отрывается, лопатки лежат.
// Подкрут — поворот таза вокруг поперечной оси и обратный поворот трёх костей спины (45/35/20 %): грудь остаётся
// на коврике, поясница сгибается. Вниз — то же медленно, поясница прижата.
import * as THREE from 'three';
import { X, deg, rad, lerp, clamp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, trunk, look, baseAudit } from '../poses.js';
import { palmOn } from '../kneel.js';
import { mat, floorSetup, settle, center, keep, legThrough, kneeAudit, gap, lowest, MAT, faceTo, headOn } from '../floor.js';
import { solve } from '../core.js';

const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2); // грудь вверх, голова к −Z
const K = key({});
const CURL = 35, TOP = 100, HEEL = 3; // подкрут таза; бедро наверху от линии тела; пятки над полом внизу: °, °, см

function body(T, c) {
  const { rig } = T;
  stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q);
  trunk(T, K);
  if (c) {
    rig.turnWorld(rig.b.Hips, new THREE.Quaternion().setFromAxisAngle(X, deg(-c))); // ноги и таз к голове
    for (const [n, k] of [['Spine', 0.45], ['Spine1', 0.35], ['Spine2', 0.2]]) rig.turnWorld(rig.b[n], new THREE.Quaternion().setFromAxisAngle(X, deg(c * k)));
    rig.root.updateMatrixWorld(true);
    // Лопатки на месте: кость груди в ту же точку, грудь повёрнута как была (повороты спины в сумме возвращают её).
    T.wrap.position.add(T.chest.clone().sub(w(rig, 'Spine2'))); T.wrap.updateMatrixWorld(true);
  }
  if (c && T.neckQ) { // грудь лежит как лежала: шея и голова как без подкрута (их ставят от груди, а грудь вернулась на место)
    rig.b.Neck.quaternion.copy(T.neckQ); rig.b.Head.quaternion.copy(T.headQ); rig.root.updateMatrixWorld(true);
    return;
  }
  look(T, null);
  faceTo(T, new THREE.Vector3(0, 1, 0), 30);
  headOn(T, X, 0.01); // спина у модели прямая, без грудного изгиба: шея в нейтрали держала затылок в 5 см над ковриком, шея чуть разгибается
}
// Ноги: бедро под углом phi к линии тела (90 — отвесно, больше — к груди), колено 90°, всё повёрнуто вместе с тазом.
function legs(T, phi, c) {
  const { rig } = T, q = new THREE.Quaternion().setFromAxisAngle(X, deg(-c));
  const dir = (a) => new THREE.Vector3(0, Math.sin(deg(a)), Math.cos(deg(a))).applyQuaternion(q);
  for (const s of SIDES) {
    const H = w(rig, s + 'UpLeg'), Kn = H.clone().addScaledVector(dir(phi), rig.L1).add(new THREE.Vector3(sgn(s) * 0.03, 0, 0));
    legThrough(T, s, Kn, Kn.clone().addScaledVector(dir(phi - 90), rig.L2));
  }
}
function arms(T) {
  const { rig } = T;
  for (const s of SIDES) { palmOn(T, s, T.P[s], new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(sgn(s), 0.3, 0)); rig.grip(s, 0.15); }
}

export default {
  id: 'reverse-crunch',
  name: 'Обратные скручивания',
  muscles: { work: ['abs', 'hip_flexors'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'подъём', cue: 'Подкрути таз к рёбрам', tempo_s: 2 },
    { name: 'вниз', cue: 'Медленно опусти ноги', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '15–20', rest_s: 30 },
  mistakes: ['Мах ногами', 'Поясница отрывается при опускании'],
  view: 'side',
  flat: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T); mat(T, 1.9, 0.62, 0, -0.35);
    stand(T, 0, 0, 0, LYING); trunk(T, K);
    settle(T, ['Spine2'], ['Hips'], X); center(T);
    T.wrap.position.y += 0.008; // мягкие ткани, как у мёртвого жука
    T.base = keep(T);
    body(T, 0);
    T.chest = w(rig, 'Spine2'); T.neckQ = rig.b.Neck.quaternion.clone(); T.headQ = rig.b.Head.quaternion.clone();
    T.P = {};
    for (const s of SIDES) { const S = w(rig, s + 'Arm'); T.P[s] = new THREE.Vector3(S.x + sgn(s) * 0.07, MAT + 0.004, S.z + 0.55); }
    T.phi0 = solve((p) => { body(T, 0); legs(T, p, 0); return lowest(T, ['LeftFoot', 'RightFoot']).y - MAT - HEEL / 100; }, 20, 90);
  },
  pose(T, { depth }) {
    const d = depth, phi = lerp(T.phi0, TOP, smooth(clamp(d / 0.6, 0, 1))), c = CURL * smooth(clamp((d - 0.35) / 0.65, 0, 1));
    body(T, c); legs(T, phi, c); arms(T);
    T.c = c; T.phi = phi; T.d = d;
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [], back: false });
    delete r.m.torso;
    kneeAudit(T, r);
    // Голова: нижняя точка кожи затылка — волосы, они сминаются; допуск в коврик 2,5 см.
    r.m.blades = gap(T, ['Spine2']); r.m.pelvis = gap(T, ['Hips']); r.m.lumbar = gap(T, ['Spine', 'Spine1']); r.m.head = gap(T, ['Head']);
    if (r.m.blades < -1 || r.m.blades > 1.5) r.bad.push(`лопатки ${r.m.blades < 0 ? 'в полу' : 'над полом'}: ${r.m.blades} см`);
    if (r.m.head < -2.5 || r.m.head > 4) r.bad.push(`голова ${r.m.head < 0 ? 'в полу' : 'над полом'}: ${r.m.head} см`);
    if (r.m.pelvis < -1) r.bad.push(`таз в полу: ${r.m.pelvis} см`);
    if (T.d < 0.05 && (r.m.pelvis > 1.5 || r.m.lumbar > 3)) r.bad.push(`поясница оторвалась внизу: таз ${r.m.pelvis}, поясница ${r.m.lumbar} см`);
    if (T.c > CURL - 1 && r.m.pelvis < 3) r.bad.push(`таз не подкручен наверху: ${r.m.pelvis} см`);
    for (const s of SIDES) {
      r.m['heel' + s[0]] = gap(T, [s + 'Foot', s + 'ToeBase']);
      if (r.m['heel' + s[0]] < 1) r.bad.push(`${ruSide(s, true)} стопа на полу: ${r.m['heel' + s[0]]} см`);
      if (Math.abs(r.m['knee' + s[0]] - 90) > 12) r.bad.push(`${s === 'Left' ? 'левое' : 'правое'} колено ${r.m['knee' + s[0]]}° вместо 90°`);
      r.m['palm' + s[0]] = cm(rig.palm(s).distanceTo(T.P[s]));
      if (r.m['palm' + s[0]] > 1.5) r.bad.push(`${ruSide(s, true)} ладонь не на полу (${r.m['palm' + s[0]]} см)`);
    }
    // Сгиб спины: таз → грудь против груди → шея; в подкруте до 45°.
    const hips = w(rig, 'Hips'), chest = w(rig, 'Spine2'), neck = w(rig, 'Neck');
    r.m.flex = Math.round(rad(chest.clone().sub(hips).angleTo(neck.clone().sub(chest))));
    if (r.m.flex > 45) r.bad.push(`спина согнута на ${r.m.flex}°`);
    // Шея: baseAudit меряет её от нейтрали в осях груди (m.neck, предел 15°), подкрут поясницы на неё не влияет. До 24.11
    // здесь была своя мера «шейная кость в линию грудь → шея» (предел 15°): нейтраль шеи у модели наклонена к этой линии на 40°.
    r.m.curl = Math.round(T.c); r.m.phi = Math.round(T.phi);
    return r;
  },
};
