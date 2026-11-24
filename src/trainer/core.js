// Общее для упражнений на кор и толчок (23.11.2026): блок с тросом и рукоятью, проверка «трос не проходит сквозь тело»,
// прямое тело в упоре на носках (планка, отжимания) и проверка линии тела. Тело на полу — floor.js, упор — kneel.js.
import * as THREE from 'three';
import { UP, w, mid, cm, rad, sgn, shadows, frameMat, steel, rubber } from './poses.js';
import { prone, footAlong, toesTo } from './kneel.js';
import { MAT, lowest } from './floor.js';

// ---------- Блок ----------
// Стойка с роликом в точке P; out — куда от ролика стоит колонна (мир), чтобы она не лезла в человека.
export function station(P, out = new THREE.Vector3(-0.08, 0, -0.04)) {
  const g = new THREE.Group(), f = frameMat(), C = P.clone().add(out);
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.25, 0.12), f); col.position.set(C.x, 1.125, C.z); g.add(col);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.6), f); base.position.set(C.x, 0.02, C.z); g.add(base);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 24), steel()); wheel.position.copy(P); wheel.rotation.y = Math.PI / 2; g.add(wheel);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.14), rubber()); stack.position.set(C.x, 0.3, C.z + 0.08 * Math.sign(-out.z || 1)); g.add(stack);
  return shadows(g);
}
// Короткая рукоять на двух руках, ось — локальный X.
export const HANDLE = 0.22;
export function handleBar() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, HANDLE, 12), rubber()); bar.rotation.z = Math.PI / 2; g.add(bar);
  return shadows(g);
}
// Рукоять по ладоням: центр между ними, ось от правой к левой.
export function placeBar(T, bar) {
  const { rig } = T, R = rig.palm('Right'), L = rig.palm('Left');
  bar.position.copy(R).add(L).multiplyScalar(0.5); bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), L.sub(R).normalize());
  bar.updateMatrixWorld(true);
}
// Ладонь до оси рукояти, см.
export function onBar(T, s, bar) {
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(bar.quaternion), rel = T.rig.palm(s).sub(bar.position);
  return cm(rel.addScaledVector(ax, -rel.dot(ax)).length());
}

// ---------- Трос и тело ----------
// Насколько трос или резинка от a до b не доходит до кожи, см (минус — прошёл сквозь тело). Первые skip метров от a
// не меряем: там трос выходит из рукояти между кистями; кисти и пальцы не меряем до hands метров от a (пальцы обхватывают
// рукоять в сантиметре от точки крепления). Кожа — вершины из floorSetup (каждая третья).
const _v = new THREE.Vector3();
export function skinGap(T, a, b, r = 0.004, skip = 0.05, hands = 0.12) {
  const { mesh } = T, d = b.clone().sub(a), len = d.length(); d.divideScalar(len);
  const A = a.clone().addScaledVector(d, skip), L = len - skip;
  T.wrap.updateMatrixWorld(true);
  let best = Infinity, where = '';
  for (const [n, list] of Object.entries(T.skin)) for (const i of list) {
    mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
    const t = Math.min(L, Math.max(0, _v.clone().sub(A).dot(d)));
    if (t < hands - skip && /Hand/.test(n)) continue;
    const dist = _v.distanceTo(A.clone().addScaledVector(d, t));
    if (dist < best) { best = dist; where = n; }
  }
  return { gap: cm(best - r), bone: where };
}

// ---------- Прямое тело на носках ----------
// Тело лицом к полу одной прямой (ключ K), линия таз → шея поднята к голове на e°, стопы на подушечках, пальцы стоп
// подогнуты вперёд и лежат на коврике, середина носков в z = toeZ.
export function onToes(T, K, e, toeZ = 0) {
  const { rig } = T;
  prone(T, K, e, new THREE.Vector3(0, 1, 0));
  for (const s of ['Left', 'Right']) {
    rig.setWorld(rig.b[s + 'Foot'], footAlong(T, s, w(rig, s + 'Foot').sub(w(rig, s + 'Leg')), 0));
    toesTo(T, s, new THREE.Vector3(0, 0, 1));
  }
  rig.root.updateMatrixWorld(true);
  const lo = lowest(T, ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']), m = mid(rig, 'LeftToeBase', 'RightToeBase');
  T.wrap.position.x -= m.x; T.wrap.position.y += MAT - lo.y; T.wrap.position.z += toeZ - m.z;
  T.wrap.updateMatrixWorld(true);
}
// Угол e, при котором f(e) = 0 (f растёт с e): деление пополам на [lo, hi].
export function solve(f, lo = 0, hi = 60, n = 16) {
  for (let i = 0; i < n; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
// Линия тела: таз на прямой середина щиколоток → шея. sag — плюс, если таз провис к полу (или к стене: «вниз» = dn).
export function bodyLine(T, r, dn = new THREE.Vector3(0, -1, 0), max = 3) {
  const { rig } = T, F = mid(rig, 'LeftFoot', 'RightFoot'), neck = w(rig, 'Neck'), hip = mid(rig, 'LeftUpLeg', 'RightUpLeg');
  const line = neck.clone().sub(F), t = hip.clone().sub(F).dot(line) / line.lengthSq(), off = hip.clone().sub(F.clone().addScaledVector(line, t));
  r.m.sag = cm(off.dot(dn));
  r.m.bend = Math.round(rad(hip.clone().sub(F).angleTo(neck.clone().sub(hip))));
  if (Math.abs(r.m.sag) > max) r.bad.push(`таз ${r.m.sag > 0 ? 'провис' : 'задран'} на ${Math.abs(r.m.sag)} см`);
  if (r.m.bend > 10) r.bad.push(`тело не прямой линией: излом ${r.m.bend}°`);
}
// Локоть в сторону, °: насколько плечевая кость вышла из плоскости «вдоль тела» (локти прижаты к корпусу — до 35°,
// разведены в стороны — 60–90°). Прямая рука вниз к опоре даёт около нуля.
export function elbowOut(T, s) {
  const { rig } = T, u = w(rig, s + 'ForeArm').sub(w(rig, s + 'Arm')).normalize(), across = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).normalize();
  return Math.round(rad(Math.asin(Math.min(1, Math.abs(u.dot(across))))));
}
// Куда смотрит лицо стоя: угол над горизонталью, °. До 24.11 look() задирал лицо модели на 20–30°, отсюда кивок до 35°
// в помощниках; с нейтралью шеи (poses.js) лицо смотрит прямо, кивок до 35° просто дотягивает до точки взгляда.
export function gazeAudit(T, r, up = 8, down = -30) {
  const f = T.face.clone().applyQuaternion(T.rig.b.Head.getWorldQuaternion(new THREE.Quaternion()));
  r.m.gaze = Math.round(rad(Math.asin(f.y)));
  if (r.m.gaze > up || r.m.gaze < down) r.bad.push(`взгляд ${r.m.gaze > 0 ? 'вверх' : 'в пол'}: ${r.m.gaze}°`);
}
