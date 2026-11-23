// Общее для поз упражнений тренера (сами упражнения — src/trainer/ex/<id>.js). Как в gym.js: ключ тела через Rig.pose,
// ступни в точки на полу (Rig.legs, двухзвенная кинематика), кисти на снаряд, снаряд кодом кладётся по ладоням.
// Всё меряем от костей модели при загрузке, ничего не привязано к конкретной сетке.
import * as THREE from 'three';
import { READY } from '../swing.js';

export const deg = THREE.MathUtils.degToRad, rad = THREE.MathUtils.radToDeg, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
export const smooth = (u) => u * u * (3 - 2 * u);
export const V = (x, y, z) => new THREE.Vector3(-x, y, z).normalize(); // x вправо, как в swing.js (у Mixamo правая в −X)
export const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1); // тело смотрит в +Z мира
export const LEAN0 = 6; // добавка наклона в Rig.pose (swing.js): ключ −6 даёт ровно ноль
export const SIDES = ['Right', 'Left'];
export const sgn = (s) => (s === 'Left' ? 1 : -1); // левая сторона модели в +X мира
export const ruSide = (s, f = false) => (s === 'Left' ? (f ? 'левая' : 'левый') : f ? 'правая' : 'правый');
export const w = (rig, n) => rig.b[n].getWorldPosition(new THREE.Vector3());
export const mid = (rig, a, b) => w(rig, a).add(w(rig, b)).multiplyScalar(0.5);
export const elev = (d) => rad(Math.atan2(d.y, Math.hypot(d.x, d.z))); // угол над горизонталью
export const elevF = (d, fwd = FWD) => rad(Math.atan2(d.y, d.dot(fwd))); // то же со знаком: больше 90 — откинут назад
export const key = (o) => ({ ...READY, lean: -LEAN0, nod: 0, look: 0, lh: -1, fist: 0, hips: 0, torso: 0, tilt: 0, ...o });

// ---------- Снаряды ----------
// Гантель 10 кг: шестигранные головы (описанный радиус 5,5 см, длина 8 см), ручка 13 см. Ось ручки — локальный X.
export const DB = { R: 0.055, apothem: 0.055 * Math.cos(Math.PI / 6), head: 0.08, grip: 0.13, handle: 0.016 };
export const rubber = () => new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: 0.75 });
export const steel = () => new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.85, roughness: 0.32 });
export const frameMat = () => new THREE.MeshStandardMaterial({ color: '#2f3339', metalness: 0.4, roughness: 0.55 });
export function shadows(g) { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }
export function dumbbell() {
  const g = new THREE.Group(), r = rubber(), s = steel();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(DB.handle, DB.handle, DB.grip + 0.01, 16), s); h.rotation.z = Math.PI / 2; g.add(h);
  for (const k of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(DB.R, DB.R, DB.head, 6), r);
    head.rotation.z = Math.PI / 2; head.rotation.x = Math.PI / 6; head.position.x = k * (DB.grip / 2 + DB.head / 2); g.add(head); // грань вниз
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 16), s); cap.rotation.z = Math.PI / 2; cap.position.x = k * (DB.grip / 2 + DB.head + 0.002); g.add(cap);
  }
  return shadows(g);
}
export function dumbbells(T) {
  T.db = { Left: dumbbell(), Right: dumbbell() };
  T.add(T.db.Left, T.db.Right);
}
// Гантель в ладонь: центр ручки — середина ладони, ось — вдоль ручки.
export function placeDB(T, s, axis) {
  const db = T.db[s];
  db.position.copy(T.rig.palm(s)); db.quaternion.setFromUnitVectors(X, axis.clone().normalize());
  db.updateMatrixWorld(true);
}

// ---------- Тело ----------
// Ключица в упражнении с весом: лопатки сведены и чуть опущены (T.retract — градусы сведения, по умолчанию 7),
// плечи не тянутся вперёд. В swing.js рука вперёд выводит ключицу вперёд — для удара, а не для тяги.
function retracted(T) {
  const rig = T.rig;
  return function (side) {
    const bone = rig.b[side + 'Shoulder'];
    bone.quaternion.copy(rig.rest.get(bone));
    const lat = new THREE.Vector3(side === 'Right' ? -1 : 1, 0, 0);
    rig.b.Spine2.updateWorldMatrix(true, false);
    const D = rig.toPlayer.clone().multiply(rig.b.Spine2.getWorldQuaternion(new THREE.Quaternion())).multiply(rig.chestRestInv), Di = D.clone().invert();
    const q = new THREE.Quaternion().setFromAxisAngle(lat.clone().cross(FWD), deg(-(T.retract ?? 7))) // назад
      .multiply(new THREE.Quaternion().setFromAxisAngle(lat.clone().cross(UP), deg(-(T.depress ?? 3)))); // вниз
    rig.rotate(bone, D.multiply(q).multiply(Di));
  };
}
// Один раз после загрузки: ключица, лицо и ступни в осях костей, ширина таза.
export function setupBody(T) {
  const { rig } = T;
  rig.clavicle = retracted(T);
  rig.root.updateMatrixWorld(true);
  T.hipHalf = Math.abs(w(rig, 'LeftUpLeg').x - w(rig, 'RightUpLeg').x) / 2;
  T.shoulderHalf = Math.abs(w(rig, 'LeftArm').x - w(rig, 'RightArm').x) / 2;
  const hq = rig.b.Head.getWorldQuaternion(new THREE.Quaternion()).invert();
  T.face = FWD.clone().applyQuaternion(hq); // «вперёд» лица в осях головы
  T.headUp = UP.clone().applyQuaternion(hq);
  // «Перед» бедра в осях его кости: туда на коже смотрит колено, голень сгибается только в обратную сторону. По нему
  // проверка колена не зависит от того, стоит тело, лежит или смотрит в пол (проверка Rig.audit меряет от пола и в упоре врёт).
  rig.legFront = {};
  for (const s of SIDES) rig.legFront[s] = FWD.clone().applyQuaternion(rig.b[s + 'UpLeg'].getWorldQuaternion(new THREE.Quaternion()).invert());
  T.footFlat = {}; // ступня плоско и носком в +Z в мире (поза покоя стоя)
  for (const s of SIDES) T.footFlat[s] = rig.b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion());
}
export const stand = (T, x = 0, y = 0, z = 0, q = null) => {
  T.wrap.position.set(x, y, z); if (q) T.wrap.quaternion.copy(q); else T.wrap.quaternion.identity(); T.wrap.updateMatrixWorld(true);
};
export const feet = (T, half, yaw = 0.07, z = 0) => ({
  Left: { pos: new THREE.Vector3(half, 0, z), lift: 0, yaw }, Right: { pos: new THREE.Vector3(-half, 0, z), lift: 0, yaw: -yaw }, crouch: 0 });

// Корпус: ключ без наклона, спина прямая (грудной отдел продолжает линию таз → грудь), потом наклон из тазобедренных:
// таз с корпусом одним целым до угла elevDeg (таз → шея над горизонталью). Таз в покое по высоте — его ставит placeHips.
export function trunk(T, k, elevDeg = null) {
  const { rig } = T;
  rig.pose(k, k, 0, null);
  rig.root.updateMatrixWorld(true);
  const a = w(rig, 'Spine2').sub(w(rig, 'Hips')).normalize(), b = w(rig, 'Neck').sub(w(rig, 'Spine2')).normalize();
  rig.turnWorld(rig.b.Spine2, new THREE.Quaternion().setFromUnitVectors(b, a));
  if (elevDeg != null) {
    const fwd = FWD.clone().applyQuaternion(T.wrap.quaternion), side = X.clone().applyQuaternion(T.wrap.quaternion); // наклон вперёд — вокруг оси «влево» тела
    for (let i = 0; i < 2; i++) {
      rig.root.updateMatrixWorld(true);
      rig.turnWorld(rig.b.Hips, new THREE.Quaternion().setFromAxisAngle(side, deg(elevF(w(rig, 'Neck').sub(w(rig, 'Hips')), fwd) - elevDeg)));
    }
  }
  rig.b.Hips.position.copy(rig.hipsRest); rig.root.updateMatrixWorld(true);
}
// Середина тазобедренных суставов в точку M (двигаем всю модель), потом ноги в точки (Rig.legs).
export function placeHips(T, M, ft) {
  const { rig } = T;
  const m = mid(rig, 'LeftUpLeg', 'RightUpLeg');
  T.wrap.position.add(M.clone().sub(m)); T.wrap.updateMatrixWorld(true);
  if (ft) rig.legs(ft);
}
// Колени по линии носков: нога целиком поворачивается вокруг оси таз → щиколотка (щиколотка на месте), пока колено
// по горизонтали не встанет над линией носка от щиколотки; ступня возвращается как была. Rig.legs ставит колено между
// тазом и носком — в широкой стойке оно уходит внутрь.
export const kneeIn = (knee, ank, toeYaw, s) => { // градусы, + — колено внутрь от линии носка
  const k = knee.clone().sub(ank).setY(0), toe = FWD.clone().applyAxisAngle(UP, toeYaw);
  return -rad(Math.atan2(new THREE.Vector3().crossVectors(toe, k).y, toe.dot(k))) * sgn(s);
};
export function kneeOverToe(T, s, toeYaw) {
  const { rig } = T, hip = w(rig, s + 'UpLeg'), ank = w(rig, s + 'Foot'), knee = w(rig, s + 'Leg');
  const ax = ank.clone().sub(hip).normalize(), r0 = knee.clone().sub(hip), q = new THREE.Quaternion();
  let best = 0, bestE = Infinity;
  for (let a = -80; a <= 80; a += 1) {
    const K = hip.clone().add(r0.clone().applyQuaternion(q.setFromAxisAngle(ax, deg(a))));
    const e = Math.abs(kneeIn(K, ank, toeYaw, s)) + Math.abs(a) * 0.01;
    if (e < bestE) { bestE = e; best = a; }
  }
  const footQ = rig.b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion());
  rig.turnWorld(rig.b[s + 'UpLeg'], q.setFromAxisAngle(ax, deg(best)));
  rig.setWorld(rig.b[s + 'Foot'], footQ);
}
// Голова: шея продолжает линию спины (таз → шея), голова кивает к точке взгляда G не больше maxNod от нейтрали.
export function look(T, G, maxNod = 18) {
  const { rig } = T;
  for (const n of ['Neck', 'Head']) rig.b[n].quaternion.copy(rig.rest.get(rig.b[n]));
  rig.root.updateMatrixWorld(true);
  const spine = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), cerv = w(rig, 'Head').sub(w(rig, 'Neck')).normalize();
  rig.turnWorld(rig.b.Neck, new THREE.Quaternion().setFromUnitVectors(cerv, spine));
  if (!G) return;
  const hq = rig.b.Head.getWorldQuaternion(new THREE.Quaternion()), face = T.face.clone().applyQuaternion(hq);
  const eye = w(rig, 'Head').addScaledVector(face, 0.08).addScaledVector(T.headUp.clone().applyQuaternion(hq), 0.07);
  const want = G.clone().sub(eye).normalize(), ax = new THREE.Vector3().crossVectors(face, want);
  if (ax.lengthSq() < 1e-8) return;
  rig.turnWorld(rig.b.Head, new THREE.Quaternion().setFromAxisAngle(ax.normalize(), Math.min(face.angleTo(want), deg(maxNod))));
}
// Рука в точку: запястье в W, локоть сгибается в сторону pole (мир). Плечо и предплечье ставит Rig.arm (прокрут плеча
// к сгибу, скрутки), поэтому кожа локтя не выворачивается. Не достаёт — рука прямая к точке.
export function armIK(T, s, W, pole) {
  const { rig } = T, S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s];
  const d = W.clone().sub(S), len = clamp(d.length(), Math.abs(L1 - L2) + 0.01, (L1 + L2) * 0.999); d.normalize();
  const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-6) p.set(0, -1, 0).addScaledVector(d, d.y); p.normalize();
  const E = S.clone().addScaledVector(d, a).addScaledVector(p, h), T2 = S.clone().addScaledVector(d, len);
  rig.root.updateMatrixWorld(true);
  rig.arm(s, E.clone().sub(S).normalize().applyQuaternion(rig.toPlayer), T2.sub(E).normalize().applyQuaternion(rig.toPlayer));
}
// Ладонь на точку P ручки, ручка вдоль R (к указательному): три прохода, как grab в gym.js. Возвращает ось ручки.
export function palmTo(T, s, P, R, pole) {
  const { rig } = T;
  let C = new THREE.Quaternion();
  for (let i = 0; i < 3; i++) {
    const wr = w(rig, s + 'Hand'), W = P.clone().sub(rig.palm(s).sub(wr));
    if (pole) armIK(T, s, W, pole); else rig.armTo(s, W);
    C = rig.orientHand(s, R, 1, true);
  }
  return R.clone().applyQuaternion(C);
}
// Где рука, повиснув прямо от плеча, достанет до точки P: длина прямой руки до середины ладони.
export const reachOf = (T, s) => { const [L1, L2] = T.rig.armLen[s]; return (L1 + L2) * 0.997 + T.rig.palm(s).distanceTo(w(T.rig, s + 'Hand')); };

// ---------- Проверка ----------
export const cm = (x) => +(x * 100).toFixed(1);
// Общие проверки: локти и колени не назад, шея в линию спины, спина прямая, стопы на месте, кисти на ручках гантелей.
// opt.back = false — не проверять прямую спину; opt.feet — какие кости стоп должны стоять (имя кости → эталон в T.ref).
export function baseAudit(T, opt = {}) {
  const { rig } = T, bad = [], m = {}, a = rig.audit();
  for (const s of SIDES) {
    if (a[s].elbowBack) bad.push(`${ruSide(s)} локоть гнётся назад`);
    const hip = w(rig, s + 'UpLeg'), knee = w(rig, s + 'Leg'), ank = w(rig, s + 'Foot');
    const th = knee.clone().sub(hip).normalize(), sh = ank.clone().sub(knee).normalize(), bend = sh.clone().addScaledVector(th, -sh.dot(th));
    const kf = rig.legFront[s].clone().applyQuaternion(rig.b[s + 'UpLeg'].getWorldQuaternion(new THREE.Quaternion())); kf.addScaledVector(th, -kf.dot(th)).normalize();
    m['kneeFace' + s[0]] = bend.lengthSq() > 1e-6 ? +bend.clone().normalize().dot(kf).toFixed(2) : 0; // −1: голень уходит ровно назад от колена, +1: вперёд
    if (rad(th.angleTo(sh)) > 12 && m['kneeFace' + s[0]] > 0.3) bad.push(`${ruSide(s)} колено гнётся назад`);
    m['knee' + s[0]] = Math.round(rad(knee.clone().sub(hip).angleTo(ank.clone().sub(knee))));
    m['elbow' + s[0]] = a[s].elbow;
    const db = T.db?.[s];
    if (db?.visible) {
      const ax = X.clone().applyQuaternion(db.quaternion), rel = rig.palm(s).sub(db.position), along = rel.dot(ax), off = rel.addScaledVector(ax, -along).length();
      m['grip' + s[0]] = cm(off);
      if (off > 0.02 || Math.abs(along) > DB.grip / 2) bad.push(`${ruSide(s, true)} кисть не на рукояти (${cm(off)} см)`);
    }
  }
  // Плечевой сустав. th — подъём плеча от «висит вдоль корпуса» (0°) через «в сторону или вперёд» (90°) до «вверх» (180°),
  // back — насколько плечо позади плоскости корпуса. У человека назад рука идёт на 50–60° только опущенной; на уровне плеча
  // уже около 30°, над головой около 15°. Присед 23.11: локоть стоял позади плеча на 79° при подъёме 101° — «руки заломлены».
  const axis = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), across = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).normalize();
  const front = new THREE.Vector3().crossVectors(across, axis).normalize();
  for (const s of SIDES) {
    const u = w(rig, s + 'ForeArm').sub(w(rig, s + 'Arm')).normalize();
    const th = rad(u.angleTo(axis.clone().negate())), back = rad(Math.asin(clamp(-u.dot(front), -1, 1)));
    const lim = th < 45 ? 55 : th < 110 ? lerp(55, 30, (th - 45) / 65) : lerp(30, 15, Math.min(1, (th - 110) / 50));
    m['armUp' + s[0]] = Math.round(th); m['armBack' + s[0]] = Math.round(back);
    if (back > lim) bad.push(`${ruSide(s, true)} рука заломлена назад: плечо на ${Math.round(back)}° позади корпуса при подъёме ${Math.round(th)}° (предел ${Math.round(lim)}°)`);
    if (a[s].wrist > 50) bad.push(`${ruSide(s, true)} кисть сломана в запястье: ${a[s].wrist}°`);
    m['wrist' + s[0]] = a[s].wrist;
  }
  for (const n of opt.feet ?? ['LeftFoot', 'RightFoot']) {
    const ref = T.ref?.[n];
    if (!ref) continue;
    const d = w(rig, n).distanceTo(ref);
    m['slide' + n.replace('Foot', '').replace('ToeBase', 'Toe')] = cm(d);
    if (d > 0.01) bad.push(`${n} сдвинулась на ${cm(d)} см`);
  }
  const hips = w(rig, 'Hips'), chest = w(rig, 'Spine2'), neck = w(rig, 'Neck'), head = w(rig, 'Head');
  m.back = Math.round(rad(chest.clone().sub(hips).angleTo(neck.clone().sub(chest))));
  if (opt.back !== false && m.back > 12) bad.push(`спина не прямая: ${m.back}°`);
  m.neck = Math.round(rad(head.clone().sub(neck).angleTo(neck.clone().sub(hips))));
  if (m.neck > 15) bad.push(`голова не в линию спины: ${m.neck}°`);
  m.torso = Math.round(elevF(neck.clone().sub(hips), FWD.clone().applyQuaternion(T.wrap.quaternion)));
  return { bad, m };
}
// Зазор от грани гантели до кожи ноги (ось ноги минус радиус спереди): отрицательный — гантель в ноге.
export function legGap(T, s, p, lateral = false) {
  const { rig } = T, hip = w(rig, s + 'UpLeg'), knee = w(rig, s + 'Leg'), ank = w(rig, s + 'Foot');
  let gap = Infinity;
  for (const [a, b, R] of [[hip, knee, T.legR.thigh], [knee, ank, T.legR.shin]]) {
    const seg = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(seg) / seg.lengthSq(), 0, 1);
    const d = p.clone().sub(a.clone().addScaledVector(seg, t));
    if (!lateral) d.x = 0; // хват сбоку от оси ноги на ширину ладони — считаем в сагиттальной плоскости
    gap = Math.min(gap, d.length() - R[Math.min(9, Math.floor(t * 10))] - DB.apothem);
  }
  return gap;
}

// Проверочные позы рук для отладки скиннинга плеч (?debug, __trainer.pose): стоя, руки вверх над головой или вперёд
// на уровне плеч. Ключица здесь обычная (Rig.clavicle): рука выше плеча поднимает плечо, как у живого человека.
const ARMS = {
  overhead: { rUp: V(0.18, 1, 0.05), rFo: V(0.1, 1, 0.05), lUp: V(-0.18, 1, 0.05), lFo: V(-0.1, 1, 0.05) },
  forward: { rUp: V(0.08, 0, 1), rFo: V(0.04, 0, 1), lUp: V(-0.08, 0, 1), lFo: V(-0.04, 0, 1) },
};
export function testPose(T, name) {
  const { rig } = T, own = rig.clavicle;
  delete rig.clavicle;
  stand(T);
  const k = key(ARMS[name]);
  rig.pose(k, k, 0, feet(T, T.hipHalf));
  for (const s of SIDES) { rig.relaxHand(s); rig.grip(s, 0.3); }
  rig.clavicle = own;
  T.gear.visible = false;
}

// Нога в точку A (щиколотка, мир), колено в сторону pole — для поз, где Rig.legs не годится (лёжа, на боку): он считает
// «вперёд» и «вверх» от стоящего тела. Ступня ставится по foot (мировой поворот) или остаётся как есть.
export function legIK(T, s, A, pole, foot = null) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), L1 = rig.L1, L2 = rig.L2;
  const d = A.clone().sub(H), len = clamp(d.length(), Math.abs(L1 - L2) + 0.01, (L1 + L2) * 0.995); d.normalize();
  const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
  const K = H.clone().addScaledVector(d, a).addScaledVector(p, h);
  rig.root.updateMatrixWorld(true);
  rig.aim(s + 'UpLeg', s + 'Leg', K.clone().sub(H).normalize().applyQuaternion(rig.toPlayer));
  rig.b[s + 'Leg'].updateWorldMatrix(true, false);
  rig.aim(s + 'Leg', s + 'Foot', H.clone().addScaledVector(d, len).sub(w(rig, s + 'Leg')).normalize().applyQuaternion(rig.toPlayer));
  if (foot) rig.setWorld(rig.b[s + 'Foot'], foot);
  rig.root.updateMatrixWorld(true);
}
