// Тело на полу (23.11.2026): лёжа на спине, на животе, сидя. Расчёт ног «от пола» (Rig.legs) тут не годится — он считает
// «вперёд» и «вверх» от стоящего тела. Поэтому: тело ставится в положение целиком, наклон подбирается по двум участкам кожи,
// которые должны лечь на коврик, конечности ставятся двухзвенным расчётом. Касание меряется по вершинам кожи (линейный
// скиннинг three.js): сустав на полу не лежит, под ним мягкие ткани, и толщина у модели своя.
import * as THREE from 'three';
import { w, cm, rad, FWD, SIDES, legIK } from './poses.js';

export const MAT = 0.006; // верх коврика, м
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export function mat(T, len = 1.9, wid = 0.62, x = 0, z = 0, yaw = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(wid, MAT, len), new THREE.MeshStandardMaterial({ color: '#2b3a44', roughness: 0.95 }));
  m.position.set(x, MAT / 2, z); m.rotation.y = yaw; m.receiveShadow = true;
  T.add(m);
  return m;
}

// Один раз в setup упражнения (модель ещё в покое стоя): вершины кожи по главной кости (каждая третья) и «перед» бедра
// в осях кости — туда смотрит надколенник.
export function floorSetup(T) {
  const { rig, mesh } = T;
  T.kneeFront = {};
  for (const s of SIDES) T.kneeFront[s] = FWD.clone().applyQuaternion(rig.b[s + 'UpLeg'].getWorldQuaternion(_q).invert());
  if (T.skin || !mesh) return;
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, by = {};
  const names = mesh.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
  for (let i = 0; i < si.count; i += 3) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); if (wk > bw) { bw = wk; best = si.getComponent(i, k); } }
    (by[names[best]] ??= []).push(i);
  }
  T.skin = by;
}

// Нижняя точка кожи участка (кости по имени без префикса): y, точка в мире, кость и точка в её осях.
export function lowest(T, bones) {
  const { mesh } = T;
  T.wrap.updateMatrixWorld(true);
  let best = null;
  for (const n of bones) for (const i of T.skin[n] ?? []) {
    mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
    if (!best || _v.y < best.y) best = { y: _v.y, p: _v.clone(), bone: n };
  }
  return best;
}
// Зазор участка до коврика, см: плюс — висит, минус — ушёл в коврик.
export const gap = (T, bones) => cm(lowest(T, bones).y - MAT);

// Голова на коврик: шея сгибается вокруг мировой оси ax (плюс — подбородок к груди), пока затылок не ляжет на коврик
// с зазором g. Лёжа с поднятым тазом (мост) шея в линию спины увела бы голову в пол. Деление пополам: высота затылка
// растёт со сгибом монотонно (проверено от −45° до +45°).
export function headOn(T, ax, g = 0.004, lo = -0.3, hi = 0.9) {
  const { rig } = T, neck = rig.b.Neck, q0 = neck.quaternion.clone();
  const at = (a) => { neck.quaternion.copy(q0); rig.turnWorld(neck, new THREE.Quaternion().setFromAxisAngle(ax, a)); return lowest(T, ['Head']).y - MAT - g; };
  for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (at(m) > 0) hi = m; else lo = m; }
  at(hi);
  return hi;
}
// Лицо к направлению dir (мир): кивает только голова, не больше max градусов.
export function faceTo(T, dir, max = 30) {
  const { rig } = T, hq = rig.b.Head.getWorldQuaternion(new THREE.Quaternion()), face = T.face.clone().applyQuaternion(hq);
  const ax = new THREE.Vector3().crossVectors(face, dir);
  if (ax.lengthSq() < 1e-8) return;
  rig.turnWorld(rig.b.Head, new THREE.Quaternion().setFromAxisAngle(ax.normalize(), Math.min(face.angleTo(dir), max * Math.PI / 180)));
}
// Повернуть тело целиком (мировой поворот q) вокруг точки pivot.
export function turn(T, q, pivot) {
  T.wrap.position.sub(pivot).applyQuaternion(q).add(pivot);
  T.wrap.quaternion.premultiply(q); T.wrap.updateMatrixWorld(true);
}
// Тело целиком на коврик двумя участками A и B: наклон вокруг горизонтальной оси ax (мир) подбирается, пока нижние
// точки обоих не сравняются, потом тело опускается на коврик. Как боковая планка: 3–4 прохода хватает.
export function settle(T, A, B, ax, n = 4) {
  for (let i = 0; i < n; i++) {
    const a = lowest(T, A), b = lowest(T, B), arm = new THREE.Vector3().crossVectors(ax, b.p.clone().sub(a.p));
    if (Math.abs(arm.y) < 1e-4 || Math.abs(b.y - a.y) < 1e-4) break;
    turn(T, _q.setFromAxisAngle(ax, -(b.y - a.y) / arm.y), a.p);
  }
  T.wrap.position.y += MAT - Math.min(lowest(T, A).y, lowest(T, B).y); T.wrap.updateMatrixWorld(true);
}
// Тело по горизонтали: середина тазобедренных суставов в точку (x, z) пола.
export function center(T, x = 0, z = 0) {
  const m = w(T.rig, 'LeftUpLeg').add(w(T.rig, 'RightUpLeg')).multiplyScalar(0.5);
  T.wrap.position.x += x - m.x; T.wrap.position.z += z - m.z; T.wrap.updateMatrixWorld(true);
}
// Запомнить положение тела, найденное в setup, и вернуть его в pose (тело в позе собирается заново каждый кадр).
export const keep = (T) => ({ p: T.wrap.position.clone(), q: T.wrap.quaternion.clone() });

// Ступня в мире: в покое стоя голень вниз, носок вперёд (T.footFlat); здесь голень вдоль shin, носок к toe.
export function footAlong(T, s, shin, toe) {
  const y = shin.clone().negate().normalize(), z = toe.clone().addScaledVector(y, -toe.dot(y)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).multiply(T.footFlat[s]);
}
// Нога через колено K в щиколотку A (мир). legIK ставит колено, но не крутит бедро вокруг своей оси: лёжа и сидя
// с развёрнутым бедром надколенник смотрел бы куда попало и кожа колена скручивалась. Здесь бедро доворачивается так,
// чтобы надколенник смотрел против сгиба голени, потом голень снова в A. Ступня — по foot (мир) или за голенью.
export function legThrough(T, s, K, A, foot = null) {
  const { rig } = T;
  legIK(T, s, A, K.clone().sub(w(rig, s + 'UpLeg')));
  const H = w(rig, s + 'UpLeg'), Kn = w(rig, s + 'Leg'), u = Kn.clone().sub(H).normalize();
  const f = A.clone().sub(Kn).normalize(), want = f.clone().addScaledVector(u, -f.dot(u));
  if (want.length() > 0.08) {
    want.normalize().negate();
    const cur = T.kneeFront[s].clone().applyQuaternion(rig.b[s + 'UpLeg'].getWorldQuaternion(_q)); cur.addScaledVector(u, -cur.dot(u)).normalize();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(cur, want).dot(u), cur.dot(want));
    rig.turnWorld(rig.b[s + 'UpLeg'], new THREE.Quaternion().setFromAxisAngle(u, ang));
    rig.root.updateMatrixWorld(true);
    rig.aim(s + 'Leg', s + 'Foot', A.clone().sub(w(rig, s + 'Leg')).normalize().applyQuaternion(rig.toPlayer));
  }
  if (foot) rig.setWorld(rig.b[s + 'Foot'], foot);
  rig.root.updateMatrixWorld(true);
}
// Колено: угол сгиба и куда смотрит надколенник относительно сгиба (0 — ровно против, как у живого колена).
// back — голень ушла вперёд от надколенника (колено гнётся назад).
export function knee(T, s) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), K = w(rig, s + 'Leg'), A = w(rig, s + 'Foot');
  const u = K.clone().sub(H).normalize(), f = A.clone().sub(K).normalize(), flex = Math.round(rad(u.angleTo(f)));
  const front = T.kneeFront[s].clone().applyQuaternion(rig.b[s + 'UpLeg'].getWorldQuaternion(_q)); front.addScaledVector(u, -front.dot(u)).normalize();
  const bend = f.clone().addScaledVector(u, -f.dot(u));
  if (flex < 25 || bend.length() < 0.05) return { flex, twist: 0, back: false };
  bend.normalize();
  return { flex, twist: Math.round(rad(front.angleTo(bend.negate()))), back: front.dot(bend) < -0.3 };
}
// Проверка колен поверх baseAudit (его kneeBack меряет «вперёд» стоящего тела и лёжа молчит).
export function kneeAudit(T, r) {
  r.bad = r.bad.filter((b) => !/колено гнётся назад/.test(b));
  for (const s of SIDES) {
    const k = knee(T, s);
    r.m['knee' + s[0]] = k.flex; r.m['kneeTwist' + s[0]] = k.twist;
    if (k.back) r.bad.push(`${s === 'Left' ? 'левое' : 'правое'} колено гнётся назад`);
    else if (k.twist > 35) r.bad.push(`${s === 'Left' ? 'левое' : 'правое'} колено скручено на ${k.twist}°`);
  }
}
// Угол сегмента a → b над горизонталью, градусы.
export const elevOf = (T, a, b) => Math.round(rad(Math.asin(THREE.MathUtils.clamp(w(T.rig, b).sub(w(T.rig, a)).normalize().y, -1, 1))));
