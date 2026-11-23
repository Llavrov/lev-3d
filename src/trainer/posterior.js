// Общее для упражнений задней цепи (23.11.2026, исполнитель posterior): штанга в руках и на тазу, скамья поперёк,
// упор для стоп, диски-слайдеры, кожа над опорой. Позы собираются функциями poses.js, floor.js и kneel.js.
import * as THREE from 'three';
import { barbell, placeBar } from '../gym.js';
import { FWD, X, UP, rad, clamp, w, sgn, cm, SIDES, ruSide, shadows, frameMat, reachOf, palmTo } from './poses.js';

export const BAR_R = 0.0125; // гриф, м
const _v = new THREE.Vector3();

// ---------- Снаряды ----------
// Штанга из зала игры; plate — масштаб блина (1 — Ø45 см, 20 кг).
export function bar(T, plate = 1) {
  T.bar = barbell(); T.add(T.bar);
  if (plate !== 1) T.bar.traverse((o) => { if (o.isMesh && o.geometry.parameters?.radiusTop === 0.225) o.scale.set(plate, 1, plate); });
  T.plateR = 0.225 * plate;
  return T.bar;
}
export const barAt = (T) => T.bar.getWorldPosition(new THREE.Vector3());
export const barAxis = (T) => X.clone().applyQuaternion(T.bar.getWorldQuaternion(new THREE.Quaternion()));
// Ладони на грифе: расстояние середины ладони до оси грифа, см.
export function gripOnBar(T, r, lim = 0.025) {
  const c = barAt(T), ax = barAxis(T);
  for (const s of SIDES) {
    const d = T.rig.palm(s).sub(c), off = d.addScaledVector(ax, -d.dot(ax)).length();
    r.m['grip' + s[0]] = cm(off);
    if (off > lim) r.bad.push(`${ruSide(s, true)} кисть не на грифе (${cm(off)} см)`);
  }
}
// Плоская скамья: верх подушки top, длина len вдоль оси along (мир, горизонталь), глубина dep поперёк, центр верха в c (x, z).
export function bench(T, c, { top = 0.43, len = 1.2, dep = 0.3, pad = 0.06, along = X } = {}) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }), f = frameMat();
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); };
  add(new THREE.BoxGeometry(len, pad, dep), m, 0, top - pad / 2, 0);
  for (const k of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, top - pad, 0.05), f, k * (len / 2 - 0.08), (top - pad) / 2, 0);
    add(new THREE.BoxGeometry(0.06, 0.04, dep + 0.1), f, k * (len / 2 - 0.08), 0.02, 0);
  }
  g.position.set(c.x, 0, c.z); g.quaternion.setFromUnitVectors(X, along.clone().setY(0).normalize());
  T.add(shadows(g));
  return { g, top, under: top - pad, half: len / 2, dep, c: new THREE.Vector3(c.x, top, c.z), along: along.clone().setY(0).normalize() };
}
// Лежит ли точка над подушкой скамьи (в плане).
export function overBench(B, p) {
  const d = p.clone().sub(B.c).setY(0), a = d.dot(B.along), b = d.addScaledVector(B.along, -a).length();
  return Math.abs(a) <= B.half && b <= B.dep / 2;
}

// ---------- Кожа ----------
// Вершины кожи участка в мире (T.skin из floorSetup: каждая третья вершина по главной кости).
export function skin(T, bones, fn) {
  const { mesh } = T;
  T.wrap.updateMatrixWorld(true);
  for (const n of bones) for (const i of T.skin[n] ?? []) fn(mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld));
}
// Крайняя точка кожи участка по направлению dir (только вершины, где keep(p) — да).
export function extreme(T, bones, dir, keep = () => true) {
  let best = -Infinity, p = null;
  skin(T, bones, (v) => { if (!keep(v)) return; const d = v.dot(dir); if (d > best) { best = d; p = v.clone(); } });
  return p;
}
// Сколько кожи участка ушло ниже плоскости y внутри области keep: глубина, м (0 — не ушло).
export function sink(T, bones, y, keep = () => true) {
  let d = 0;
  skin(T, bones, (v) => { if (keep(v) && v.y < y) d = Math.max(d, y - v.y); });
  return d;
}
// Сколько кожи ушло выше плоскости y внутри области keep.
export function poke(T, bones, y, keep = () => true) {
  let d = 0;
  skin(T, bones, (v) => { if (keep(v) && v.y > y) d = Math.max(d, v.y - y); });
  return d;
}

// ---------- Руки со штангой стоя ----------
// Точка грифа на передней линии ноги: снаружи от кожи на радиус грифа и ещё off, сбоку на ширине хвата.
function frontOfLeg(T, s, u, off) {
  const { rig } = T, hip = w(rig, s + 'UpLeg'), knee = w(rig, s + 'Leg'), ank = w(rig, s + 'Foot');
  const l0 = hip.distanceTo(knee), l1 = knee.distanceTo(ank);
  let d = u * (l0 + l1), p = hip, q = knee, R = T.legR.thigh, len = l0;
  if (d > l0) { d -= l0; p = knee; q = ank; R = T.legR.shin; len = l1; }
  const t = Math.min(0.999, d / len), tau = q.clone().sub(p).normalize(), front = FWD.clone().addScaledVector(tau, -FWD.dot(tau)).normalize();
  return p.clone().lerp(q, t).addScaledVector(front, R[Math.floor(t * 10)] + BAR_R + off);
}
// Гриф висит на прямых руках у передней линии ног: первая точка линии на длине прямой руки (руки почти отвесно).
// Обе ладони на одной прямой: высота и вынос — среднее двух сторон. Хват ±gx, ладони к ногам (прямой хват).
export function hangBar(T, gx, off = 0.008) {
  const { rig } = T, hit = {};
  for (const s of SIDES) {
    const S = w(rig, s + 'Arm'), reach = reachOf(T, s);
    let P = null;
    for (let u = 0; u <= 1 && !P; u += 0.003) { const q = frontOfLeg(T, s, u, off); q.x = sgn(s) * gx; if (q.distanceTo(S) >= reach) P = q; }
    hit[s] = P ?? frontOfLeg(T, s, 1, off);
  }
  const y = (hit.Left.y + hit.Right.y) / 2, z = Math.max(hit.Left.z, hit.Right.z);
  for (const s of SIDES) palmTo(T, s, new THREE.Vector3(sgn(s) * gx, y, z), new THREE.Vector3(-sgn(s), 0, 0), new THREE.Vector3(sgn(s) * 0.3, 0, -1));
  rig.grip('Right', 1); rig.grip('Left', 1);
  placeBar(T, T.bar, T.gear);
}
// Зазор грифа до кожи ног в сагиттальной плоскости (минус — гриф в ноге), м.
export function barToLegs(T) {
  const { rig } = T, c = barAt(T);
  let gap = Infinity;
  for (const s of SIDES) {
    const hip = w(rig, s + 'UpLeg'), knee = w(rig, s + 'Leg'), ank = w(rig, s + 'Foot');
    for (const [a, b, R] of [[hip, knee, T.legR.thigh], [knee, ank, T.legR.shin]]) {
      const seg = b.clone().sub(a), t = clamp(c.clone().sub(a).dot(seg) / seg.lengthSq(), 0, 1), d = c.clone().sub(a.clone().addScaledVector(seg, t));
      d.x = 0;
      gap = Math.min(gap, d.length() - R[Math.min(9, Math.floor(t * 10))] - BAR_R);
    }
  }
  return gap;
}

// ---------- Проверки тела ----------
// Излом в тазобедренном: бедро (колено → таз) против корпуса (таз → шея), градусы.
export function hipBend(T, s = null) {
  const { rig } = T, H = s ? w(rig, s + 'UpLeg') : w(rig, 'LeftUpLeg').add(w(rig, 'RightUpLeg')).multiplyScalar(0.5);
  const K = s ? w(rig, s + 'Leg') : w(rig, 'LeftLeg').add(w(rig, 'RightLeg')).multiplyScalar(0.5);
  return Math.round(rad(H.clone().sub(K).angleTo(w(rig, 'Neck').sub(H))));
}
// Таз к горизонту поперёк тела, градусы со знаком (+ — левая сторона выше).
export const pelvisRoll = (T) => {
  const d = w(T.rig, 'LeftUpLeg').sub(w(T.rig, 'RightUpLeg'));
  return Math.round(rad(Math.atan2(d.y, Math.hypot(d.x, d.z))));
};
export { UP, FWD };
