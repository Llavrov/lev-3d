// Тяги и жимы с хватом (23.11.2026, исполнитель «pulls»): турник, низкая перекладина, блок с тросом, рукоять, скамья,
// и проверки, общие для группы: кисть на снаряде, трос или перекладина не проходят сквозь кожу.
// Кожа меряется по вершинам (floor.js, floorSetup): отрезок, который прошёл сквозь тело, проходит ближе 1 см от вершины.
import * as THREE from 'three';
import { X, cm, shadows, frameMat, steel, rubber } from './poses.js';
import { floorSetup } from './floor.js';
import { band } from './band.js';

export const BAR_R = 0.016; // перекладина и рукоять, радиус, м
const _v = new THREE.Vector3();

// Перекладина вдоль X на высоте y, центр (0, y, z), на двух стойках. Стойки вынесены вперёд на ahead и держат перекладину
// кронштейнами: сбоку стойка не встаёт между камерой и телом. Возвращает центр перекладины.
export function pullBar(T, y, z = 0, half = 0.65, ahead = 0.45) {
  const g = new THREE.Group(), f = frameMat();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, 2 * half + 0.1, 16), steel()); bar.rotation.z = Math.PI / 2; bar.position.set(0, y, z); g.add(bar);
  for (const k of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, y + 0.08, 0.06), f); post.position.set(k * half, (y + 0.08) / 2, z + ahead); g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, ahead + 0.03), f); arm.position.set(k * half, y + 0.04, z + ahead / 2); g.add(arm);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.7), f); foot.position.set(k * half, 0.02, z + ahead); g.add(foot);
  }
  T.add(shadows(g));
  return new THREE.Vector3(0, y, z);
}
// Стойка блока: колонна, ролик в точке P, стопка плит внизу. Ролик смотрит осью по X (трос уходит в плоскости YZ).
export function station(T, P, axisY = 0) {
  const g = new THREE.Group(), f = frameMat(), h = P.y + 0.15;
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), f); col.position.set(P.x, h / 2, P.z); g.add(col);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.5), f); base.position.set(P.x, 0.02, P.z); g.add(base);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.12), rubber()); stack.position.set(P.x, 0.27, P.z); g.add(stack);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 20), steel()); wheel.position.copy(P); wheel.rotation.y = Math.PI / 2 + axisY; g.add(wheel);
  T.add(shadows(g));
}
// Трос: тонкий тёмный шнур (тянуть — stretch из band.js).
export const cable = (T) => band(T, '#111214', 0.004);
// Рукоять: короткая перекладина вдоль локального X длиной len.
export function grip(T, len = 0.12) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, len, 12), rubber()); bar.rotation.z = Math.PI / 2; g.add(bar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), steel()); ring.position.y = 0; ring.rotation.y = Math.PI / 2; g.add(ring);
  T.add(shadows(g));
  g.userData.len = len;
  return g;
}
export function placeGrip(g, P, axis) { g.position.copy(P); g.quaternion.setFromUnitVectors(X, axis.clone().normalize()); g.updateMatrixWorld(true); }

// ---------- Проверки ----------
// Середина ладони до оси снаряда (центр C, ось ax): поперёк оси и вдоль неё. Хват — до 2 см от оси, не дальше half вдоль.
export function onAxis(T, s, C, ax, half = Infinity) {
  const rel = T.rig.palm(s).sub(C), along = rel.dot(ax), off = rel.addScaledVector(ax, -along).length();
  return { off, along, ok: off <= 0.02 && Math.abs(along) <= half };
}
// Вершины кожи по главной кости (один раз в setup). Вызывать в setup до первой позы.
export const skinSetup = (T) => floorSetup(T);
// Наименьшее расстояние от отрезка a–b до кожи костей bones, м. Меньше 1 см — отрезок касается кожи или прошёл сквозь.
export function skinGap(T, a, b, bones) {
  const { mesh } = T, ab = b.clone().sub(a), L2 = ab.lengthSq();
  T.wrap.updateMatrixWorld(true);
  let best = Infinity;
  for (const n of bones) for (const i of T.skin?.[n] ?? []) {
    mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
    const t = Math.max(0, Math.min(1, _v.clone().sub(a).dot(ab) / L2));
    best = Math.min(best, _v.distanceTo(a.clone().addScaledVector(ab, t)));
  }
  return best;
}
// Кости тела без кистей и предплечий: то, сквозь что не должен пройти трос или перекладина.
export const TORSO = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder'];
export const LEGS = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
export const upper = (s) => [s + 'Arm'];
// Нижняя точка кожи участка, y (м).
export function lowSkin(T, bones) {
  const { mesh } = T;
  T.wrap.updateMatrixWorld(true);
  let y = Infinity;
  for (const n of bones) for (const i of T.skin?.[n] ?? []) y = Math.min(y, mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld).y);
  return y;
}
// Проверка «трос или перекладина не в теле» в общий список нарушений.
export function clearOf(T, r, name, a, b, bones, lim = 0.01) {
  const g = skinGap(T, a, b, bones);
  r.m['gap_' + name] = cm(g);
  if (g < lim) r.bad.push(`${name} в теле (${cm(g)} см)`);
  return g;
}
