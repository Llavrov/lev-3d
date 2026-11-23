// Разведение руки лёжа на животе (Blackburn T), правая рука с лёгкой гантелью. Лёжа на высокой скамье, плечи у её края,
// голова за краем, лицо вниз, шея в линию спины. Правая рука висит отвесно (на 6° наружу, мимо края скамьи), большой палец
// к голове. Прямая рука уходит в сторону до горизонтали, по ходу поворачивается наружу: наверху большой палец вверх.
// Выше горизонтали рука не идёт (плечо ушло бы назад за корпус). На «держи» правая лопатка сводится (ключица назад
// с 7 до 16°). Левая рука висит. Высота скамьи подобрана так, чтобы гантель внизу была в 3 см над полом. Ракурс
// спереди, со стороны головы: дуга руки целиком в плоскости кадра.
import * as THREE from 'three';
import { X, UP, FWD, deg, rad, lerp, smooth, w, key, V, DB, sgn, stand, trunk, look, dumbbells, placeDB, shadows, frameMat } from '../poses.js';
import { settle, center, keep, lowest, faceTo, legThrough, footAlong, kneeAudit, MAT } from '../floor.js';
import { shoulderSetup, armW, fist, axes, armAudit, clear, baseAudit, BODY, V3 } from '../shoulder.js';

const PRONE = new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2); // грудь вниз, голова к +Z
const K = key({ rUp: V(0.1, -1, 0.05), rFo: V(0.1, -1, 0.05), lUp: V(-0.1, -1, 0.05), lFo: V(-0.1, -1, 0.05),
  rTh: V(0.02, -1, 0), rSh: V(0, -1, 0), lTh: V(-0.02, -1, 0), lSh: V(0, -1, 0) });
const OUT0 = 6, HALF = 0.13; // рука внизу наружу, °; полуширина скамьи, м

function body(T) {
  stand(T, T.base.p.x, T.base.p.y + T.lift, T.base.p.z, T.base.q);
  trunk(T, K);
  look(T, null);
  faceTo(T, new THREE.Vector3(0, -1, 0.1).normalize(), 5);
  // Ноги лежат на скамье: колено и щиколотка над подушкой (5,5 и 6,5 см), стопы свисают за край скамьи.
  if (T.pad == null) return;
  for (const s of ['Left', 'Right']) {
    const H = w(T.rig, s + 'UpLeg'), Kp = H.clone().add(V3(0, 0, -T.rig.L1)), A = Kp.clone().add(V3(0, 0, -T.rig.L2));
    Kp.y = T.pad + 0.055; A.y = T.pad + 0.065;
    const sh = A.clone().sub(Kp).normalize();
    legThrough(T, s, Kp, A, footAlong(T, s, sh, V3(0, -1, 0).multiplyScalar(Math.cos(deg(50))).addScaledVector(sh, Math.sin(deg(50)))));
  }
}
function pose(T, { i, depth }) {
  const { rig } = T;
  body(T);
  const out = V3(-1, 0, 0), down = V3(0, -1, 0), th = deg(lerp(OUT0, 90, depth));
  const d = down.clone().multiplyScalar(Math.cos(th)).addScaledVector(out, Math.sin(th)).addScaledVector(FWD, 0.04 * (1 - depth)).normalize();
  T.retract = 7 + 9 * (i === 1 ? 1 : i === 0 ? smooth(Math.max(0, depth * 2 - 1)) : depth); // лопатка сводится к верху
  armW(T, 'Right', d, d);
  T.retract = 7;
  armW(T, 'Left', V3(0.1, -1, 0.04), V3(0.1, -1, 0.12));
  rig.relaxHand('Left'); rig.grip('Left', 0.3);
  const thumb = FWD.clone().lerp(UP, depth).addScaledVector(d, 0); thumb.addScaledVector(d, -thumb.dot(d)).normalize();
  placeDB(T, 'Right', fist(T, 'Right', thumb));
  T.depth = depth;
}

export default {
  id: 'prone-horizontal-abduction',
  name: 'Разведение руки лёжа на животе',
  muscles: { work: ['delts_rear', 'rhomboids', 'traps', 'rotator_cuff'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'подъём', cue: 'Рука в сторону, большой палец вверх', tempo_s: 2 },
    { name: 'держи', cue: 'Сведи лопатку', tempo_s: 2 },
    { name: 'вниз', cue: 'Медленно опусти', tempo_s: 2 },
  ],
  dose: { sets: '1–2', reps: '10–15', rest_s: 30 },
  mistakes: ['Плечо к уху', 'Тяжёлый вес'],
  view: 'front',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    shoulderSetup(T); dumbbells(T); T.db.Left.visible = false;
    stand(T, 0, 0, 0, PRONE); trunk(T, K);
    settle(T, ['Spine2'], ['Hips'], X); center(T, 0, -0.3);
    T.base = keep(T); T.lift = 0;
    pose(T, { i: 0, depth: 0 });
    const db = T.db.Right; db.updateMatrixWorld(true);
    const bottom = new THREE.Box3().setFromObject(db).min.y;
    T.lift = 0.03 - bottom; // скамья такой высоты, что гантель внизу в 3 см над полом
    T.pad = MAT + T.lift;
    body(T);
    const sz = w(rig, 'RightArm').z, kz = w(rig, 'RightFoot').z;
    const z0 = kz + 0.06, z1 = sz + 0.02, g = new THREE.Group(), f = frameMat(), padM = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 });
    const box = (wd, h, dp, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(wd, h, dp), m); o.position.set(x, y, z); g.add(o); };
    box(2 * HALF, 0.07, z1 - z0, padM, 0, T.pad - 0.035, (z0 + z1) / 2);
    for (const z of [z0 + 0.12, z1 - 0.12]) { box(0.06, T.pad - 0.07, 0.06, f, 0, (T.pad - 0.07) / 2, z); box(0.42, 0.04, 0.07, f, 0, 0.02, z); }
    T.add(shadows(g)); T.bench = { z0, z1 };
    pose(T, { i: 0, depth: 0 });
    T.neck0 = w(rig, 'Head').distanceTo(w(rig, 'LeftArm').add(w(rig, 'RightArm')).multiplyScalar(0.5));
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    armAudit(T, r, 'Right', { lo: 0, hi: 15 });
    r.m.chestPad = +((lowest(T, ['Spine2']).y - T.pad) * 100).toFixed(1); r.m.hipPad = +((lowest(T, ['Hips']).y - T.pad) * 100).toFixed(1);
    r.m.legsPad = +((lowest(T, ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']).y - T.pad) * 100).toFixed(1);
    if (r.m.legsPad < -1.5 || r.m.legsPad > 4) r.bad.push(`ноги ${r.m.legsPad < 0 ? 'в скамье' : 'висят над скамьёй'}: ${r.m.legsPad} см`);
    for (const [k, v] of [['грудь', r.m.chestPad], ['таз', r.m.hipPad]]) if (v < -1 || v > 1.5) r.bad.push(`${k} ${v < -1 ? 'в скамье' : 'над скамьёй'}: ${v} см`);
    // Рука и гантель мимо скамьи: ниже её верха кожа руки снаружи от края.
    let inside = -Infinity;
    T.wrap.updateMatrixWorld(true);
    for (const n of BODY.limb('Right')) for (const i of T.skin[n] ?? []) {
      const v = T.mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(T.mesh.matrixWorld);
      if (v.y < T.pad - 0.01 && v.z > T.bench.z0 && v.z < T.bench.z1) inside = Math.max(inside, v.x + HALF);
    }
    r.m.armInBench = inside === -Infinity ? null : +(inside * 100).toFixed(1);
    if (inside > 0) r.bad.push(`рука в скамье (${r.m.armInBench} см)`);
    const db = T.db.Right; db.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(db);
    r.m.dbFloor = +(bb.min.y * 100).toFixed(1);
    if (bb.min.y < 0.01) r.bad.push('гантель задевает пол');
    // Рука не выше горизонтали и наверху ровно в сторону.
    const u = w(rig, 'RightHand').sub(w(rig, 'RightArm')).normalize();
    r.m.armEl = Math.round(rad(Math.asin(u.y)));
    if (u.y > 0.12) r.bad.push(`рука выше горизонтали: ${r.m.armEl}°`);
    const dh = w(rig, 'Head').distanceTo(w(rig, 'LeftArm').add(w(rig, 'RightArm')).multiplyScalar(0.5));
    r.m.shrug = +((T.neck0 - dh) * 100).toFixed(1);
    if (T.neck0 - dh > 0.015) r.bad.push(`плечо к уху (${r.m.shrug} см)`);
    return r;
  },
};
