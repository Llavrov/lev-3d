// Сгибание ног на скольжении. Лёжа на спине на коврике (как ягодичный мост), пятки на двух плоских дисках-слайдерах.
// Мост: таз поднимается вокруг лопаток, колени 100°. От себя: диски медленно уезжают, ноги выпрямляются до 20°, таз
// остаётся над полом (опускается не больше чем на четверть подъёма). К себе: пятки подтягиваются, таз снова высоко.
// Вниз: таз на коврик. Голова и лопатки лежат, руки вдоль тела ладонями вниз, носки вверх, давят пятки.
import * as THREE from 'three';
import { X, deg, lerp, smooth, w, mid, key, V, SIDES, sgn, ruSide, cm, shadows, stand, trunk, look, armIK, baseAudit } from '../poses.js';
import { mat, floorSetup, settle, center, keep, turn, headOn, faceTo, legThrough, kneeAudit, gap, lowest, footAlong, MAT } from '../floor.js';

const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2); // грудь вверх, голова к −Z
const K = key({ rTh: V(0.06, 0, 1), rSh: V(0, -1, 0), lTh: V(-0.06, 0, 1), lSh: V(0, -1, 0) });
const LOW = 3, BENT = 100, STRAIGHT = 22, DROP = 0.25; // таз внизу, °; колено согнуто и почти прямое, °; доля опускания таза
const DISC = { R: 0.09, H: 0.012 };

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
// Нога с коленом knee° пяткой на диске: щиколотка на прямой от таза вперёд, по коже пятки.
function leg(T, s, knee) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), D = Math.sqrt(rig.L1 ** 2 + rig.L2 ** 2 + 2 * rig.L1 * rig.L2 * Math.cos(deg(knee))) * 0.995;
  let y = T.ankleY;
  for (let i = 0; i < 3; i++) {
    const dy = H.y - y, A = new THREE.Vector3(sgn(s) * T.footX, y, H.z + Math.sqrt(Math.max(0.0001, D * D - dy * dy)));
    const Kp = H.clone().lerp(A, 0.5).add(new THREE.Vector3(0, 0.5, 0));
    legThrough(T, s, Kp, A);
    const sh = A.clone().sub(w(rig, s + 'Leg')).normalize();
    rig.setWorld(rig.b[s + 'Foot'], footAlong(T, s, sh, new THREE.Vector3(0, 1, 0.35).normalize())); rig.root.updateMatrixWorld(true);
    const lo = lowest(T, [s + 'Foot']).y, want = MAT + DISC.H + 0.002;
    if (Math.abs(lo - want) < 0.002) break;
    y += want - lo;
  }
  const heel = lowest(T, [s + 'Foot']).p;
  T.disc[s].position.set(heel.x, MAT + DISC.H / 2, heel.z);
}

export default {
  id: 'slider-leg-curl',
  name: 'Сгибание ног на скольжении',
  muscles: { work: ['hamstrings', 'glutes'], stretch: ['hamstrings'], careful: ['hamstrings'] },
  phases: [
    { name: 'мост', cue: 'Подними таз на пятках', tempo_s: 1 },
    { name: 'от себя', cue: 'Медленно выпрями ноги', tempo_s: 3, stretch: true },
    { name: 'к себе', cue: 'Подтяни пятки, таз высоко', tempo_s: 1 },
    { name: 'вниз', cue: 'Опусти таз на коврик', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8', rest_s: 60 },
  mistakes: ['Таз падает при выпрямлении', 'Слишком быстро от себя'],
  view: 'side',
  flat: 'side',
  motion(i, u) { return i + smooth(u); },
  setup(T) {
    const { rig } = T;
    floorSetup(T); mat(T, 1.9, 0.62, 0, -0.2);
    T.disc = {};
    for (const s of SIDES) {
      T.disc[s] = shadows(new THREE.Mesh(new THREE.CylinderGeometry(DISC.R, DISC.R, DISC.H, 32), new THREE.MeshStandardMaterial({ color: '#c2482f', roughness: 0.6 })));
      T.add(T.disc[s]);
    }
    stand(T, 0, 0, 0, LYING); trunk(T, K);
    settle(T, ['Spine2'], ['Hips'], X); center(T);
    T.wrap.position.y += 0.006;
    T.base = keep(T);
    T.pivot = mid(rig, 'LeftArm', 'RightArm').setY(MAT);
    T.footX = T.hipHalf + 0.02; T.ankleY = 0.1;
    // Верх моста: угол, при котором плечо, таз и колено на одной прямой при колене BENT.
    let best = 0, bestE = Infinity;
    for (let th = 5; th <= 40; th += 0.5) {
      body(T, th); leg(T, 'Left', BENT);
      const S = mid(rig, 'LeftArm', 'RightArm').setX(0), H = w(rig, 'LeftUpLeg').setX(0), Kn = w(rig, 'LeftLeg').setX(0);
      const e = H.clone().sub(S).angleTo(Kn.clone().sub(H));
      if (e < bestE) { bestE = e; best = th; }
    }
    T.thTop = Math.min(best, 26); // выше лопатки отрываются: шея модели сгибается за 50° (позвоночник из трёх звеньев)
  },
  pose(T, { depth }) {
    const { rig } = T, i = Math.min(3, Math.floor(depth)), u = depth - i;
    // h — подъём таза (0 — на коврике, 1 — мост), e — выпрямление ног.
    const h = i === 0 ? u : i === 1 ? 1 - DROP * u : i === 2 ? 1 - DROP * (1 - u) : 1 - u, e = i === 1 ? u : i === 2 ? 1 - u : 0;
    T.h = h; T.e = e; T.phase = i;
    body(T, lerp(LOW, T.thTop, h));
    for (const s of SIDES) leg(T, s, lerp(BENT, STRAIGHT, e));
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s];
      armIK(T, s, new THREE.Vector3(S.x + sgn(s) * 0.1, MAT + 0.035, S.z + (L1 + L2) * 0.96), new THREE.Vector3(sgn(s) * 0.5, -1, 0));
      rig.orientHand(s, new THREE.Vector3(-sgn(s), 0, 0), 1, false);
      rig.relaxHand(s); rig.grip(s, 0.2);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r);
    r.bad = r.bad.filter((b) => !/голова не в линию/.test(b));
    if (r.m.neck > 50) r.bad.push(`шея согнута на ${r.m.neck}°`);
    r.m.backGap = gap(T, ['Spine2', 'LeftShoulder', 'RightShoulder']); r.m.headGap = gap(T, ['Head']); r.m.pelvisGap = gap(T, ['Hips']);
    for (const [k, v, lo, hi] of [['лопатки', r.m.backGap, -1, 1.5], ['голова', r.m.headGap, -1, 3]]) if (v < lo || v > hi) r.bad.push(`${k} ${v < lo ? 'в полу' : 'над полом'}: ${v} см`);
    if (r.m.pelvisGap < -0.5) r.bad.push(`таз в полу: ${r.m.pelvisGap} см`);
    if (T.phase === 1 || T.phase === 2) if (r.m.pelvisGap < 6) r.bad.push(`таз упал при выпрямлении: ${r.m.pelvisGap} см`);
    for (const s of SIDES) {
      const heel = lowest(T, [s + 'Foot']), d = T.disc[s].position, top = d.y + DISC.H / 2;
      r.m['heel' + s[0]] = cm(heel.y - top);
      if (Math.abs(heel.y - top) > 0.012) r.bad.push(`${ruSide(s, true)} пятка не на диске (${cm(heel.y - top)} см)`);
      r.m['hand' + s[0]] = gap(T, [s + 'Hand']);
      if (r.m['hand' + s[0]] < -1 || r.m['hand' + s[0]] > 2) r.bad.push(`${ruSide(s, true)} кисть не на полу (${r.m['hand' + s[0]]} см)`);
    }
    r.m.pelvisTilt = cm(w(rig, 'LeftUpLeg').y - w(rig, 'RightUpLeg').y);
    if (Math.abs(r.m.pelvisTilt) > 1) r.bad.push(`таз перекошен на ${r.m.pelvisTilt} см`);
    r.m.thTop = Math.round(T.thTop);
    return r;
  },
};
