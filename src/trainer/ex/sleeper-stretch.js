// Растяжка «спящего», правое (игровое) плечо. Лёжа на правом боку, корпус завален назад на ROLL (лежит на лопатке и
// задней поверхности плеча, а не строго на боку), ноги согнуты одна на другой, голова на подушке. Правая ключица выведена
// вперёд (лопатка протрагирована, shoulder.js: protract): иначе сустав модели остаётся над корпусом и дельта уходит в пол.
// Правое плечо вперёд под 90° к корпусу, лежит на коврике трицепсом, локоть 90°.
// «Укладка»: предплечье от наклона к голове встаёт отвесно, левая ладонь ложится на тыльную сторону правого запястья.
// «Растяжка»: левая ладонь мягко опускает предплечье к ногам и полу (поворот плеча внутрь) до IR от отвеса и держит.
import * as THREE from 'three';
import { V, UP, FWD, X, deg, rad, w, key, cm, smooth, clamp, stand, trunk, look, armIK, shadows, baseAudit } from '../poses.js';
import { mat, settle, center, lowest, gap, keep, kneeAudit, legThrough, footAlong, MAT } from '../floor.js';
import { palmOn } from '../kneel.js';
import { bodyShape, onLimb, palmGap, bodyAudit, wristAudit } from '../arms.js';
import { protract, clear, BODY, V3 } from '../shoulder.js';

// Ключ корпуса и рук до расстановки; ноги потом ставит legSetup.
const K = key({ rUp: V(0.12, -1, 0.05), rFo: V(0.05, -1, 0.15), lUp: V(-0.12, -1, 0.05), lFo: V(-0.05, -1, 0.15),
  rTh: V(-0.08, -0.7, 0.7), rSh: V(-0.01, -0.95, -0.3), lTh: V(0.08, -0.7, 0.7), lSh: V(0.01, -0.95, -0.3) });
// ROLL — корпус завален назад, PROT — правая ключица вперёд, IR — поворот плеча внутрь в конце (предплечье 35° над полом),
// START — наклон предплечья к голове в начале укладки, LIFT — тело над коврике после посадки (дельта при повороте плеча
// уходит в пол до 1,6 см, с подъёмом до 1,1), ELB — кожа у локтя на коврике, м.
const LIFT = 0.008, ELB = -0.003, ROLL = 25, PROT = 22, IR = 55, START = -30;
// На правый бок (голова к −X, грудь в +Z), потом корпус заваливается назад вокруг своей длинной оси: грудь к потолку.
const SIDE = new THREE.Quaternion().setFromAxisAngle(X, -deg(ROLL)).multiply(new THREE.Quaternion().setFromAxisAngle(FWD, Math.PI / 2));
const F = FWD, C = X; // вперёд (к груди) и к ногам
const n3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const CHEST = ['Spine2', 'RightShoulder']; // посадка: лопатка и плечевой пояс, поясница может чуть висеть
const SUPPORT = { chest: ['Spine1', 'Spine2', 'RightShoulder'], hip: ['Hips', 'RightUpLeg'] };

function body(T) {
  stand(T, 0, 0, 0, SIDE);
  trunk(T, K);
  look(T, null);
  if (T.place) { T.wrap.position.copy(T.place.p); T.wrap.quaternion.copy(T.place.q); T.wrap.updateMatrixWorld(true); }
  if (T.legs) for (const s of ['Right', 'Left']) legThrough(T, s, T.legs[s].K, T.legs[s].A, footAlong(T, s, T.legs[s].A.clone().sub(T.legs[s].K), T.legs.toe));
}
// Ноги на коврике (тело завалено назад, расчёт от ключа уводил нижнюю стопу в пол на 12 см): бедро вперёд на HIP от
// длинной оси тела, колено согнуто на KNEE, всё в плоскости пола. Нижняя нога лежит на коврике наружной стороной колена
// и щиколотки, верхняя на ней.
const HIP = 50, KNEE = 80;
function legSetup(T) {
  const { rig } = T, c = w(rig, 'Hips').sub(w(rig, 'Neck')).setY(0).normalize(), a = new THREE.Vector3().crossVectors(UP, c).normalize();
  if (a.dot(F) < 0) a.negate(); // вперёд (к груди)
  const dir = (th) => c.clone().multiplyScalar(Math.cos(deg(th))).addScaledVector(a, Math.sin(deg(th)));
  const at = (P, d, L, y) => { const h = Math.sqrt(Math.max(0, L * L - (P.y - y) ** 2)); return P.clone().addScaledVector(d, h).setY(y); };
  let kh = 0.055, ah = 0.06;
  for (let k = 0; k < 3; k++) {
    const KR = at(w(rig, 'RightUpLeg'), dir(HIP), rig.L1, MAT + kh), AR = at(KR, dir(HIP - KNEE), rig.L2, MAT + ah);
    T.legs = { Right: { K: KR, A: AR }, Left: { K: KR.clone().add(V3(0, 0.1, 0)), A: AR.clone().add(V3(0, 0.075, 0)) },
      toe: dir(HIP - KNEE + 70) };
    body(T);
    kh -= lowest(T, ['RightLeg']).y - MAT; ah -= lowest(T, ['RightFoot', 'RightToeBase']).y - MAT;
  }
}
// Плечо: вперёд по горизонтали поперёк длинной оси тела, опущено на dip к коврику.
function upper(T, dip) {
  const ax = w(T.rig, 'Neck').sub(w(T.rig, 'Hips')).normalize(), f = F.clone().addScaledVector(ax, -F.dot(ax)).setY(0).normalize();
  return f.multiplyScalar(Math.cos(dip)).add(new THREE.Vector3(0, -Math.sin(dip), 0));
}
// Предплечье: угол phi от отвеса к ногам в плоскости поперёк плеча; phi < 0 — к голове.
function forearm(u, phi) {
  const e1 = UP.clone().addScaledVector(u, -UP.dot(u)).normalize(), e2 = new THREE.Vector3().crossVectors(u, e1).normalize();
  if (e2.dot(C) < 0) e2.negate(); // к ногам
  return e1.multiplyScalar(Math.cos(deg(phi))).addScaledVector(e2, Math.sin(deg(phi)));
}
// Правая рука: плечо опущено на dip, предплечье на phi от отвеса. Rig.arm при повороте плеча внутрь дальше предела уводит
// локоть по кругу (локоть уходил в пол на 10 см): рука ставится в нейтраль, поворот плеча вокруг своей оси отдельно.
function rightArm(T, dip, phi) {
  const { rig } = T, u = upper(T, dip), f0 = forearm(u, 0);
  rig.root.updateMatrixWorld(true);
  rig.arm('Right', u.clone().applyQuaternion(rig.toPlayer), f0.clone().applyQuaternion(rig.toPlayer));
  const q = new THREE.Quaternion().setFromUnitVectors(f0, forearm(u, phi));
  rig.turnWorld(rig.b.RightArm, q);
  // Скрутка у сустава возвращает 0,6 поворота, как в Rig.arm (twist.js): кожа над суставом не проворачивается целиком.
  if (rig.b.RightArmTwist) rig.turnWorld(rig.b.RightArmTwist, new THREE.Quaternion().slerp(q.clone().invert(), 0.6));
  rig.root.updateMatrixWorld(true);
  return u;
}
const ARM = ['RightArm', 'RightArmTwist', 'RightForeArm'];
// Нижняя точка кожи у локтя: вершины руки дальше 0,6 длины плеча от сустава (у сустава кожа под ним, наклон плеча её не опускает).
function elbowLow(T, u) {
  const S = w(T.rig, 'RightArm'), L = T.rig.armLen.Right[0], v = new THREE.Vector3();
  T.wrap.updateMatrixWorld(true);
  let best = null;
  for (const n of ARM) for (const i of T.skin[n] ?? []) {
    T.mesh.getVertexPosition(i, v).applyMatrix4(T.mesh.matrixWorld);
    const d = v.clone().sub(S).dot(u);
    if (d > 0.6 * L && d < 1.25 * L && (!best || v.y < best.y)) best = { y: v.y, d };
  }
  return best;
}

function pose(T, { i = 0, depth = 0 }) {
  const { rig } = T;
  body(T);
  const phi = i === 0 ? START * (1 - depth) : IR * depth;
  // Плечо лежит на коврике: опускается или приподнимается вокруг сустава, пока нижняя кожа плеча и локтя не встанет на ELB.
  let dip = T.dip, u = rightArm(T, dip, phi);
  for (let k = 0; k < 2; k++) {
    const lo = elbowLow(T, u);
    dip += Math.atan2(lo.y - MAT - ELB, lo.d); u = rightArm(T, dip, phi);
  }
  rig.relaxHand('Right'); rig.grip('Right', 0.3);
  T.phi = phi;
  // Левая ладонь на тыльной стороне правого запястья со стороны головы, давит к ногам и вниз.
  const push = forearm(u, phi + 90), N = push.clone().addScaledVector(UP, -1).normalize();
  const P = onLimb(T, 'RightForeArm', 'RightHand', 0.8, N.clone().negate(), T.limbR.RightForeArm);
  const on = i === 0 ? clamp(depth * 2 - 1, 0, 1) : 1, pole = T.pole;
  const hold = () => {
    palmOn(T, 'Left', P, T.fing, N, pole);
    const A = rig.dirW('LeftForeArm', 'LeftHand'); palmOn(T, 'Left', P, A.addScaledVector(N, -A.dot(N)), N, pole);
  };
  T.leftOn = on === 1;
  if (on === 1) { hold(); rig.grip('Left', 0.35); return; }
  // До касания левая рука лежит вдоль бока; подход — запястье дугой над телом.
  const side = () => { rig.arm('Left', n3(1, 0.05, 0.2).applyQuaternion(rig.toPlayer), n3(1, 0.05, 0.5).applyQuaternion(rig.toPlayer)); rig.relaxHand('Left'); rig.grip('Left', 0.3); };
  side();
  if (on > 0) {
    const W0 = w(rig, 'LeftHand'); hold(); const W1 = w(rig, 'LeftHand');
    armIK(T, 'Left', W0.lerp(W1, smooth(on)).add(new THREE.Vector3(0, 0.3 * Math.sin(Math.PI * on), 0.1 * Math.sin(Math.PI * on))), pole);
    rig.relaxHand('Left'); rig.grip('Left', 0.3);
  }
}

// Угол между отрезками (градусы).
const ang = (a, b) => Math.round(rad(a.angleTo(b)));

export default {
  id: 'sleeper-stretch',
  name: 'Растяжка «спящего»',
  muscles: { work: ['rotator_cuff'], stretch: ['rotator_cuff', 'delts_rear'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'укладка', cue: 'Лёжа на плече, локоть 90°', tempo_s: 2 },
    { name: 'растяжка', cue: 'Мягко дави кисть вниз', tempo_s: 4, stretch: true },
  ],
  dose: { sets: '1', reps: '4 × 30 с', rest_s: 15 },
  mistakes: ['Давление до боли', 'Лопатка уходит с пола'],
  pace: 'В жизни держи 30 с, без боли',
  view: -75, // со стороны головы и чуть спереди: на телефоне человек втрое крупнее, чем вдоль тела, обе руки видны
  flat: 'front', // лежит вдоль X: «спереди» здесь сбоку от тела, видны обе руки
  // Крупный план мышцы ставит камеру туда, куда смотрит кожа: манжета смотрит в пол (камера под ковриком), задняя дельта
  // к голове (голова закрывает руки). Поэтому на фазах всё тело, как у упражнений на полу.
  wide: true,
  motion(i, u) { return i === 0 ? smooth(u) : smooth(Math.min(1, u * 2)); },
  setup(T) {
    bodyShape(T);
    protract(T, 'Right', PROT);
    T.pole = n3(-1, 0.5, 0); T.fing = n3(0, -0.3, 1); // левый локоть к голове и вверх: запястье разогнуто до 39° (с локтем вверх 51–54°)
    T.place = null; T.dip = 0.1; body(T);
    // Тело ложится плечевым поясом и тазом на коврик, плечо в pose опускается до кожи локтя; потом ноги и ещё одна посадка.
    for (let k = 0; k < 4; k++) {
      pose(T, { i: 1, depth: 0 });
      settle(T, CHEST, SUPPORT.hip, F);
      T.place = keep(T);
      pose(T, { i: 1, depth: 0 });
    }
    legSetup(T); pose(T, { i: 1, depth: 0 });
    settle(T, CHEST, SUPPORT.hip, F); T.wrap.position.y += LIFT; center(T); T.place = keep(T); legSetup(T);
    body(T); const H = w(T.rig, 'Hips');
    const mc = H.clone().addScaledVector(C, -0.25).addScaledVector(F, 0.12); mat(T, 1.9, 0.8, mc.x, mc.z, Math.PI / 2);
    pose(T, { i: 1, depth: 0 });
    T.pillowTop = lowest(T, ['Head']).y;
    const hd = lowest(T, ['Head']).p, ph = T.pillowTop - MAT;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, ph, 0.28), new THREE.MeshStandardMaterial({ color: '#3d4a55', roughness: 0.9 }));
    pillow.position.set(hd.x, MAT + ph / 2, hd.z); T.add(shadows(pillow));
    T.skinAll = Object.keys(T.skin).filter((n) => !/^Head|HeadTop/.test(n));
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r); wristAudit(T, r); bodyAudit(T, r);
    // Опора: бок груди, таз, локоть и задняя поверхность плеча на коврике (до 1,5 см над ним), голова на подушке.
    for (const [k, n, bones, top] of [['chest', 'бок груди', SUPPORT.chest, MAT], ['hip', 'таз', SUPPORT.hip, MAT],
      ['delt', 'правое плечо', ['RightArm'], MAT], ['head', 'голова', ['Head'], T.pillowTop]]) {
      const g = cm(lowest(T, bones).y - top); r.m[k + 'Gap'] = g;
      if (g > 1.5 || g < -1.5) r.bad.push(`${n} не на опоре (${g} см)`);
    }
    const el = cm(elbowLow(T, w(rig, 'RightForeArm').sub(w(rig, 'RightArm')).normalize()).y - MAT); r.m.elbowGap = el;
    if (el > 1.5 || el < -1.5) r.bad.push(`правый локоть не на коврике (${el} см)`);
    // Мягкий коврик: никакая кожа не глубже 1,5 см.
    const deep = lowest(T, T.skinAll); r.m.sink = cm(deep.y - MAT); r.m.sinkAt = deep.bone;
    if (deep.y - MAT < -0.015) r.bad.push(`${deep.bone} в полу на ${cm(MAT - deep.y)} см`);
    // Правая рука: локоть 90° ± 10, плечо под 90° ± 10 к длинной оси тела, предплечье не ниже предела внутренней ротации.
    const S = w(rig, 'RightArm'), E = w(rig, 'RightForeArm'), Wr = w(rig, 'RightHand'), axis = w(rig, 'Neck').sub(w(rig, 'Hips'));
    const e = ang(S.clone().sub(E), Wr.clone().sub(E)); r.m.elbowIn = 180 - e;
    if (Math.abs(e - 90) > 10) r.bad.push(`правый локоть ${e}°, нужно 80–100°`);
    const ua = ang(E.clone().sub(S), axis); r.m.armToBody = ua;
    if (Math.abs(ua - 90) > 10) r.bad.push(`правое плечо к корпусу ${ua}°, нужно 80–100°`);
    const fe = Math.round(rad(Math.asin(clamp(Wr.clone().sub(E).normalize().y, -1, 1)))); r.m.foreElev = fe; r.m.ir = Math.round(T.phi);
    if (fe < 28) r.bad.push(`предплечье у пола: ${fe}° над ним, предел 28°`);
    if (T.leftOn) {
      const g = palmGap(T, 'Left', E, Wr, T.limbR.RightForeArm); r.m.leftOnWrist = g;
      if (Math.abs(g) > 2) r.bad.push(`левая ладонь не на запястье (${g} см)`);
    }
    // Руки не проходят друг сквозь друга: левое плечо и предплечье (без кисти на запястье) против кожи правой руки.
    const LS = w(rig, 'LeftArm'), LE = w(rig, 'LeftForeArm'), LW = w(rig, 'LeftHand'), palm = rig.palm('Left');
    const c1 = clear(T, LS.clone().lerp(LE, 0.3), LE, T.limbR.LeftArm, BODY.limb('Right'));
    const c2 = clear(T, LE, LE.clone().lerp(LW, 0.75), T.limbR.LeftForeArm, BODY.limb('Right'), palm, 0.1);
    r.m.armsGap = Math.min(c1, c2);
    if (r.m.armsGap < -1) r.bad.push(`левая рука входит в правую на ${-r.m.armsGap} см`);
    return r;
  },
};
