// Наружная ротация лёжа на боку с гантелью, правая рука. Лёжа на левом боку на коврике, голова к +X на подушке,
// ноги прямые одна на другой, нижняя рука вперёд по полу. Правый локоть прижат к боку через валик (плечо отведено на 20°),
// сгиб 90°. Предплечье поворачивается от «гантель перед животом» (−30°, локоть на 15° впереди корпуса, иначе гантель в животе) вверх до 70°: «чуть не до вертикали».
// Большой палец к голове. Ракурс со стороны ног: дуга предплечья в плоскости кадра.
import * as THREE from 'three';
import { FWD, X, UP, lerp, smooth, w, key, V, DB, SIDES, ruSide, stand, trunk, look, dumbbells, placeDB, shadows, armIK } from '../poses.js';
import { mat, settle, center, keep, lowest, gap, MAT } from '../floor.js';
import { shoulderSetup, elbowSide, armW, fist, axes, armAudit, clear, handIn, baseAudit, BODY, V3 } from '../shoulder.js';

const PHI = [-30, 70], ABD = 20, FLEX = 15;
const ON_LEFT = new THREE.Quaternion().setFromAxisAngle(FWD, -Math.PI / 2); // голова к +X, правый бок вверх, грудь к +Z
const K = key({ rUp: V(0.12, -1, 0.06), rFo: V(0.02, -1, 0.25), lUp: V(-0.12, -1, 0.06), lFo: V(0.02, -1, 0.25),
  rTh: V(-0.1, -1, 0.05), rSh: V(-0.01, -1, 0), lTh: V(0.1, -1, 0.05), lSh: V(0.01, -1, 0) }); // бёдра сведены, стопы одна на другой

function body(T) {
  stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q);
  trunk(T, K);
  look(T, null);
}
function pose(T, { depth }) {
  const { rig } = T;
  body(T);
  const { up, front } = axes(T);
  // Нижняя рука вперёд: плечо опускается от сустава к коврику (локоть на 4,5 см над ним), предплечье лежит к голове.
  const S = w(rig, 'LeftArm'), L1 = rig.armLen.Left[0], dy = S.y - (MAT + 0.045);
  const E = S.clone().addScaledVector(front, Math.sqrt(Math.max(0, L1 * L1 - dy * dy))); E.y = MAT + 0.045;
  armW(T, 'Left', E.sub(S), up.clone().addScaledVector(front, 0.25).setY(0));
  rig.relaxHand('Left'); rig.grip('Left', 0.3);
  elbowSide(T, 'Right', lerp(PHI[0], PHI[1], depth), ABD, FLEX);
  placeDB(T, 'Right', fist(T, 'Right', up));
}

export default {
  id: 'sidelying-er-db',
  name: 'Наружная ротация лёжа на боку',
  muscles: { work: ['rotator_cuff', 'delts_rear'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'вверх', cue: 'Валик под локтем, кисть вверх', tempo_s: 2 },
    { name: 'верх', cue: 'Чуть не до вертикали', tempo_s: 1 },
    { name: 'вниз', cue: 'Медленно опусти', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '15–20', rest_s: 30 },
  mistakes: ['Тяжёлая гантель', 'Корпус разворачивается'],
  view: 'side', // лежит вдоль X, камера со стороны ног: дуга гантели от живота вверх видна целиком (спереди она идёт в глубину кадра)
  flat: 'front', // лежит вдоль X: «спереди» здесь сбоку от тела
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    shoulderSetup(T); dumbbells(T); T.db.Left.visible = false;
    stand(T, 0, 0, 0, ON_LEFT); trunk(T, K);
    settle(T, ['Spine2', 'LeftShoulder'], ['Hips', 'LeftUpLeg'], FWD); center(T);
    mat(T, 2.0, 0.7, 0, 0, Math.PI / 2);
    T.base = keep(T);
    body(T);
    // Подушка под голову: верх у нижней точки кожи головы, шея в линию спины.
    const hd = lowest(T, ['Head']), ph = hd.y - MAT;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, ph, 0.26), new THREE.MeshStandardMaterial({ color: '#3d4a55', roughness: 0.9 }));
    pillow.position.set(hd.p.x, MAT + ph / 2, hd.p.z); T.add(shadows(pillow)); T.pillowY = MAT + ph;
    pose(T, { depth: 0 });
    T.elbow0 = { Right: w(rig, 'RightForeArm') };
    // Валик между локтем и рёбрами, вдоль «вперёд» тела.
    const { front, left } = axes(T), roll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#c9c2b4', roughness: 0.95 }));
    roll.position.copy(T.elbow0.Right).addScaledVector(left, 0.075); roll.quaternion.setFromUnitVectors(UP, front); T.add(shadows(roll));
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    armAudit(T, r, 'Right');
    r.m.chestGap = gap(T, ['Spine2', 'LeftShoulder']); r.m.leftArm = gap(T, ['LeftArm', 'LeftForeArm']);
    if (r.m.leftArm < -1) r.bad.push(`нижняя рука в полу: ${r.m.leftArm} см`); r.m.hipGap = gap(T, ['Hips', 'LeftUpLeg']);
    for (const [k, v] of [['корпус', r.m.chestGap], ['таз', r.m.hipGap]]) if (v < -1 || v > 1.5) r.bad.push(`${k} ${v < -1 ? 'в полу' : 'над полом'}: ${v} см`);
    r.m.headGap = +((lowest(T, ['Head']).y - T.pillowY) * 100).toFixed(1);
    if (Math.abs(r.m.headGap) > 1.5) r.bad.push(`голова не на подушке (${r.m.headGap} см)`);
    r.m.leftHand = gap(T, ['LeftHand']);
    if (r.m.leftHand < -1 || r.m.leftHand > 3) r.bad.push(`нижняя кисть не на коврике (${r.m.leftHand} см)`);
    // Гантель: ладонь на ручке (baseAudit), головы не в теле и не в коврике.
    const db = T.db.Right, ax = X.clone().applyQuaternion(db.quaternion);
    let g = Infinity, low = Infinity;
    for (const k of [-1, 1]) {
      const a = db.position.clone().addScaledVector(ax, k * DB.grip / 2), b = db.position.clone().addScaledVector(ax, k * (DB.grip / 2 + DB.head));
      g = Math.min(g, clear(T, a, b, DB.R, [...BODY.torso, ...BODY.legs]));
      low = Math.min(low, a.y - DB.R, b.y - DB.R);
    }
    r.m.dbGap = g; r.m.dbFloor = +((low - MAT) * 100).toFixed(1);
    if (g < 0.5) r.bad.push(`гантель в теле (${g} см)`);
    if (low < MAT) r.bad.push('гантель в коврике');
    r.m.handGap = handIn(T, 'Right', axes(T).front);
    if (r.m.handGap != null && r.m.handGap < 0.5) r.bad.push(`кисть в животе (${r.m.handGap} см)`);
    return r;
  },
};
