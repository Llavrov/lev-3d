// Сила ног со снарядами (23.11.2026, волна 2, ноги): общие снаряды и проверки для гоблет-приседа, болгарского приседа,
// бокового выпада, зашагивания, приседа на одной ноге на тумбу, становой с трэп-грифом и прогулки фермера.
// Снаряды: тумба, скамья, гантель у груди (гоблет), гантели в опущенных руках, трэп-гриф. Проверки: опорная стопа
// стоит на своей поверхности (пол или тумба), стопа не в тумбе, снаряд не в теле (по вершинам кожи).
import * as THREE from 'three';
import { X, UP, FWD, DB, w, SIDES, sgn, ruSide, cm, shadows, frameMat, rubber, steel, dumbbell, placeDB, palmTo, reachOf } from './poses.js';
import { floorSetup } from './floor.js';

const _v = new THREE.Vector3();
const wood = () => new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.8 });
const padMat = () => new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.8 }); // светлее пола: на тёмном фоне чёрная подушка пропадает

// ---------- Опоры ----------
// Тумба (степ): фанерный ящик с резиновым верхом. Габарит по X от x0 до x1, по Z от z0 до z1, верх на высоте h.
export function box(T, h, x0, x1, z0, z1) {
  const g = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h - 0.012, z1 - z0), wood());
  b.position.set((x0 + x1) / 2, (h - 0.012) / 2, (z0 + z1) / 2); g.add(b);
  const top = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.012, z1 - z0), padMat());
  top.position.set((x0 + x1) / 2, h - 0.006, (z0 + z1) / 2); g.add(top);
  T.add(shadows(g));
  return { h, x0, x1, z0, z1 };
}
// Скамья вдоль Z: подушка шириной 0,3 м, верх на высоте h, от z0 до z1, по центру x.
export function bench(T, h, x, z0, z1) {
  const g = new THREE.Group(), f = frameMat();
  const add = (wd, ht, d, m, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, d), m); o.position.set(px, py, pz); g.add(o); };
  add(0.3, 0.07, z1 - z0, padMat(), x, h - 0.035, (z0 + z1) / 2);
  for (const z of [z0 + 0.12, z1 - 0.12]) { add(0.06, h - 0.07, 0.06, f, x, (h - 0.07) / 2, z); add(0.4, 0.04, 0.07, f, x, 0.02, z); }
  T.add(shadows(g));
  return { h, x0: x - 0.15, x1: x + 0.15, z0, z1 };
}
export const over = (b, p, m = 0) => p.x > b.x0 - m && p.x < b.x1 + m && p.z > b.z0 - m && p.z < b.z1 + m;

// ---------- Стопы ----------
// Один раз в setup (тело в покое стоя): высота щиколотки и подушечки плоской стопы над полом, вершины кожи по костям.
export function legsSetup(T) {
  const { rig } = T;
  rig.root.updateMatrixWorld(true);
  const y0 = T.wrap.position.y;
  T.flat = { ank: w(rig, 'LeftFoot').y - y0, toe: w(rig, 'LeftToeBase').y - y0 };
  floorSetup(T);
}
// Опорная стопа плоско на поверхности высотой y: щиколотка и подушечка на своих высотах (1 и 1,5 см).
export function planted(T, r, s, y = 0, name = '') {
  const A = w(T.rig, s + 'Foot'), B = w(T.rig, s + 'ToeBase'), L = s[0] + name;
  const da = A.y - y - T.flat.ank, db = B.y - y - T.flat.toe;
  r.m['ankY' + L] = cm(da); r.m['toeY' + L] = cm(db);
  const where = y > 0.01 ? 'на тумбе' : 'на полу';
  if (da > 0.01 || db > 0.015) r.bad.push(`${ruSide(s, true)} стопа висит ${where} (${cm(Math.max(da, db))} см)`);
  if (da < -0.01 || db < -0.015) r.bad.push(`${ruSide(s, true)} стопа провалилась ${where === 'на полу' ? 'в пол' : 'в тумбу'} (${cm(Math.min(da, db))} см)`);
}
// Стопа не в опоре и не в полу: щиколотка и подушечка не ниже своей плоской высоты над поверхностью, на которой стоят.
export function footClear(T, r, s, boxes) {
  for (const [n, h0] of [['Foot', T.flat.ank], ['ToeBase', T.flat.toe]]) {
    const p = w(T.rig, s + n), surf = Math.max(0, ...boxes.filter((b) => over(b, p, 0.02)).map((b) => b.h));
    if (p.y - surf - h0 < -0.015) r.bad.push(`${ruSide(s, true)} стопа ${surf ? 'в тумбе' : 'в полу'} (${cm(p.y - surf - h0)} см)`);
  }
  const K = w(T.rig, s + 'Leg');
  for (const b of boxes) if (over(b, K, 0.04) && K.y < b.h + 0.05) r.bad.push(`${ruSide(s)} колено в тумбе`);
}

// Наибольшая высота таза (середина тазобедренных, x и z из M), на которой обе стоящие стопы ещё достаются ногой длиной
// k суммы звеньев. Таз ровный, тело смотрит по yaw (поперёк — left). ft — ступни как для Rig.legs (pos.y — поверхность).
export function reachY(T, M, ft, k = 0.975, left = X) {
  const { rig } = T, R = k * (rig.L1 + rig.L2);
  let y = Infinity;
  for (const s of SIDES) {
    const f = ft[s]; if (!f || f.lift > 0.01) continue;
    const H = M.clone().addScaledVector(left, sgn(s) * T.hipHalf), dx = f.pos.x - H.x, dz = f.pos.z - H.z;
    y = Math.min(y, f.pos.y + rig.ankleH + Math.sqrt(Math.max(0, R * R - dx * dx - dz * dz)));
  }
  return y;
}
// Стоящая стопа на месте по горизонтали: щиколотка от заданной точки не дальше 1,5 см.
export function onSpot(T, r, s, P) {
  const A = w(T.rig, s + 'Foot'), d = Math.hypot(A.x - P.x, A.z - P.z);
  r.m['spot' + s[0]] = cm(d);
  if (d > 0.015) r.bad.push(`${ruSide(s, true)} стопа съехала (${cm(d)} см)`);
}

// Взгляд: лицо не вверх больше 8° и не в пол больше lo (на листе прогулки фермера 23.11 он шёл с подбородком вверх,
// а проверки не было). Стоя прямо общий baseAudit строже: от −20 до +8.
export function gaze(T, r, lo = -35) {
  const f = T.face.clone().applyQuaternion(T.rig.b.Head.getWorldQuaternion(new THREE.Quaternion()));
  r.m.gaze = Math.round(Math.asin(Math.max(-1, Math.min(1, f.y))) * 180 / Math.PI);
  if (r.m.gaze > 8 || r.m.gaze < lo) r.bad.push(`взгляд ${r.m.gaze > 0 ? 'вверх' : 'в пол'}: ${r.m.gaze}°`);
  return r;
}

// ---------- Кожа ----------
// Ближайшая к отрезку a–b вершина кожи участка: зазор до поверхности цилиндра радиуса rad, м (минус — снаряд в теле).
export function skinGap(T, bones, a, b, radius) {
  const { mesh } = T, ab = b.clone().sub(a), l2 = ab.lengthSq();
  T.wrap.updateMatrixWorld(true);
  let best = Infinity;
  for (const n of bones) for (const i of T.skin[n] ?? []) {
    mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
    const t = Math.max(0, Math.min(1, _v.clone().sub(a).dot(ab) / l2));
    best = Math.min(best, _v.distanceTo(a.clone().addScaledVector(ab, t)) - radius);
  }
  return best;
}
// Оси корпуса: вверх (таз → шея), поперёк (влево), вперёд (грудь).
export function torso(rig) {
  const up = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), across = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).normalize();
  return { up, across, front: new THREE.Vector3().crossVectors(across, up).normalize() };
}

// ---------- Гантель у груди (гоблет) ----------
// Гантель стоит отвесно, верхняя голова у груди, ладони снизу под ней чашей, локти вниз. Перед груди меряется по коже
// в покое: от кости Spine2 вперёд до кожи на её высоте.
const CUP = 0.035; // ладонь от оси гантели поперёк, м: кисти рядом, большие пальцы вокруг ручки
export function gobletSetup(T) {
  const { rig } = T;
  T.gob = dumbbell(); T.add(T.gob);
  rig.root.updateMatrixWorld(true);
  const c = w(rig, 'Spine2');
  let f = 0;
  for (const n of ['Spine1', 'Spine2']) for (const i of T.skin[n] ?? []) {
    T.mesh.getVertexPosition(i, _v).applyMatrix4(T.mesh.matrixWorld);
    if (Math.abs(_v.y - c.y) < 0.04 && Math.abs(_v.x - c.x) < 0.05) f = Math.max(f, _v.z - c.z);
  }
  T.chestFront = f;
}
// lift — верх головы гантели выше кости Spine2 вдоль корпуса, м.
export function goblet(T, lift = 0.0) {
  const { rig } = T, { up, across, front } = torso(rig);
  const head = w(rig, 'Spine2').addScaledVector(up, lift).addScaledVector(front, T.chestFront + DB.R - 0.008); // центр верхней головы
  const fh = front.clone().setY(0).normalize(), lat = across.clone().setY(0).normalize();
  const C = head.clone().addScaledVector(UP, -(DB.grip / 2 + DB.head / 2)); // центр ручки
  T.gobP = {};
  for (const s of SIDES) {
    const P = C.clone().addScaledVector(UP, DB.grip / 2 - 0.022).addScaledVector(lat, sgn(s) * CUP).addScaledVector(fh, 0.01);
    const pole = UP.clone().negate().addScaledVector(lat, sgn(s) * 0.35).addScaledVector(fh, -0.15);
    palmTo(T, s, P, lat.clone().multiplyScalar(-sgn(s)), pole);
    T.gobP[s] = P;
    rig.grip(s, 0.75);
  }
  T.gob.position.copy(C); T.gob.quaternion.setFromUnitVectors(X, UP); T.gob.updateMatrixWorld(true);
}
// Гантель у груди: ладони под верхней головой (2,5 см), гантель не в груди и не ушла от неё (до 5 см).
export function gobletAudit(T, r) {
  const { rig } = T, C = T.gob.position, ax = UP;
  for (const s of SIDES) {
    const d = rig.palm(s).distanceTo(T.gobP[s]);
    r.m['cup' + s[0]] = cm(d);
    if (d > 0.025) r.bad.push(`${ruSide(s, true)} кисть не под гантелью (${cm(d)} см)`);
  }
  const top = C.clone().addScaledVector(ax, DB.grip / 2 + DB.head), bot = C.clone().addScaledVector(ax, -(DB.grip / 2 + DB.head));
  const g = skinGap(T, ['Spine', 'Spine1', 'Spine2', 'Hips'], bot, top, DB.R);
  r.m.dbChest = cm(g);
  if (g < -0.01) r.bad.push(`гантель в груди (${cm(g)} см)`);
  if (g > 0.05) r.bad.push(`гантель ушла от груди (${cm(g)} см)`);
  return r;
}

// ---------- Гантели в опущенных руках ----------
// Руки висят почти прямо, кисти чуть снаружи бёдер, ручка вдоль face (нейтральный хват). face и left — оси тела в мире.
export function hangDBs(T, face = FWD, left = X, out = 0.09) {
  const { rig } = T;
  for (const s of SIDES) {
    const S = w(rig, s + 'Arm'), P = S.clone().addScaledVector(UP, -reachOf(T, s) * 0.985);
    P.addScaledVector(left, sgn(s) * out); // кисти снаружи бёдер: гантели не задевают ноги
    placeDB(T, s, palmTo(T, s, P, face));
  }
  rig.grip('Right', 1); rig.grip('Left', 1);
}

// ---------- Трэп-гриф ----------
// Шестигранная рама в плоскости втулок, рукояти внутри по бокам подняты на RISE (высокие рукояти: у модели короткие
// руки, с низкими внизу таз ниже колен). Блины железные Ø30 см, как в приседе со штангой: блин 45 см сбоку закрывал
// таз и ноги на всём цикле. Высота рукоятей внизу та же, что у грифа с блинами 45 см и рукоятями +10 см (0,325 м). Начало координат грифа — середина между рукоятями на их высоте.
export const TB = { HX: 0.27, RISE: 0.175, PLATE: 0.15, R: 0.016, HEX: [[0.2, -0.38], [0.36, 0], [0.2, 0.38], [-0.2, 0.38], [-0.36, 0], [-0.2, -0.38]] };
export function trapBar() {
  const g = new THREE.Group(), s = steel(), f = frameMat(), r = rubber(), y = -TB.RISE;
  const rod = (a, b, rad, m) => {
    const d = b.clone().sub(a), o = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, d.length(), 12), m);
    o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); g.add(o);
  };
  const P = (x, z, yy = y) => new THREE.Vector3(x, yy, z);
  TB.HEX.forEach(([x, z], i) => { const [x2, z2] = TB.HEX[(i + 1) % 6]; rod(P(x, z), P(x2, z2), TB.R, f); });
  for (const k of [-1, 1]) {
    const zr = 0.38 * (1 - (TB.HX - 0.2) / 0.16); // где рукоять встречает наклонные стороны
    rod(P(k * TB.HX, -zr, 0), P(k * TB.HX, zr, 0), 0.016, s); // рукоять
    for (const z of [-zr, zr]) rod(P(k * TB.HX, z), P(k * TB.HX, z, 0.012), 0.012, f); // стойки рукояти
    rod(P(k * 0.36, 0), P(k * 0.62, 0), 0.025, s); // втулка (короткая: широкий гриф уменьшает человека в кадре спереди)
    for (const x of [0.46, 0.52]) { // два блина Ø30 см
      const p = new THREE.Mesh(new THREE.CylinderGeometry(TB.PLATE, TB.PLATE, 0.05, 32), r);
      p.rotation.z = Math.PI / 2; p.position.set(k * x, y, 0); g.add(p);
    }
  }
  return shadows(g);
}
// Точки рукоятей (середина хвата) у грифа с началом в c.
export const trapGrip = (c, s) => c.clone().add(new THREE.Vector3(sgn(s) * TB.HX, 0, 0));
// Отрезки рамы в мире (для проверки ног).
export function trapRails(bar) {
  const y = bar.position.y - TB.RISE;
  return TB.HEX.map(([x, z], i) => { const [x2, z2] = TB.HEX[(i + 1) % 6]; return [new THREE.Vector3(x, y, z).add(bar.position).setY(y), new THREE.Vector3(x2, y, z2).add(bar.position).setY(y)]; });
}
