// Профилактика плеча (23.11.2026): вращение плеча при неподвижном локте, лопатки, диагональ. Общее для восьми упражнений
// группы: стойка с крюком для резинки, рукоять резинки со стропой, тело стоя, оси корпуса, рука «локоть у бока» с
// поворотом предплечья, кулак с прямым запястьем, проверки по коже (резинка и гантель не проходят сквозь тело, кисть
// не в животе, локоть не уходит).
// Вращение плеча задаётся направлением предплечья при неподвижном плече и локте: Rig.arm сам проворачивает плечевую кость
// к сгибу (скрутки twist.js берут часть угла), поэтому поворот предплечья наружу и внутрь и есть наружная и внутренняя ротация.
import * as THREE from 'three';
import { deg, rad, w, key, sgn, cm, frameMat, steel, rubber, shadows, stand, trunk, placeHips, feet, look, baseAudit } from './poses.js';
import { band, stretch } from './band.js';
import { floorSetup } from './floor.js';
import { hipsOver } from './ex/romanian-deadlift-db.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3();
const K = key({});

// ---------- Снаряды ----------
// Стойка с крюком: столб за точкой P (по направлению away от человека), крюк-кольцо в P, плита на полу.
export function post(T, P, away) {
  const g = new THREE.Group(), f = frameMat(), a = away.clone().setY(0).normalize(), c = P.clone().addScaledVector(a, 0.05);
  const h = P.y + 0.12;
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), f); col.position.set(c.x, h / 2, c.z); g.add(col);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.34), f); base.position.set(c.x, 0.015, c.z); g.add(base);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 16), steel()); hook.position.copy(P); hook.lookAt(P.clone().add(V3(0, 1, 0))); g.add(hook);
  T.add(shadows(g));
  return g;
}
// Рукоять резинки (ось — X) и две стропы от её концов к вершине, куда приходит резинка.
export function handle(T) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 12), rubber()); bar.rotation.z = Math.PI / 2; g.add(bar);
  T.add(shadows(g));
  return { g, straps: [band(T, '#202226', 0.003), band(T, '#202226', 0.003)], line: band(T) };
}
// Рукоять в ладонь по оси ax, резинка от крюка A к вершине стропы (6 см от ладони в сторону крюка).
export function pull(T, h, s, ax, A) {
  const p = T.rig.palm(s), dir = A.clone().sub(p).normalize(), apex = p.clone().addScaledVector(dir, 0.06);
  h.g.position.copy(p); h.g.quaternion.setFromUnitVectors(V3(1, 0, 0), ax.clone().normalize()); h.g.updateMatrixWorld(true);
  for (const k of [0, 1]) stretch(h.straps[k], p.clone().addScaledVector(ax, (k ? 1 : -1) * 0.055), apex);
  stretch(h.line, A, apex);
  h.A = A; h.apex = apex; h.ax = ax.clone();
}

// ---------- Тело ----------
// Оси корпуса: up — таз → шея, left — от правого плеча к левому (поперёк up), front — куда смотрит грудь.
export function axes(T) {
  const { rig } = T, up = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), left = w(rig, 'LeftArm').sub(w(rig, 'RightArm'));
  left.addScaledVector(up, -left.dot(up)).normalize();
  return { up, left, front: new THREE.Vector3().crossVectors(left, up) };
}
// Стоя ровно: стопы на ширине таза, колени мягкие (18°), корпус почти отвесно, взгляд вперёд.
export function upright(T) {
  stand(T);
  trunk(T, K, 88);
  placeHips(T, hipsOver(T, 18, 0), T.feetAt);
  look(T, V3(0, 1.3, 4), 35); // у модели лицо в нейтрали смотрит вверх: кивок до 35°, как в jump.js
}
// Рука по направлениям в мире: плечо u, предплечье f.
export function armW(T, s, u, f) {
  const { rig } = T;
  rig.root.updateMatrixWorld(true);
  rig.arm(s, u.clone().normalize().applyQuaternion(rig.toPlayer), f.clone().normalize().applyQuaternion(rig.toPlayer));
}
// Локоть у бока, сгиб 90°: плечо вниз вдоль корпуса, отведено на abd (валик под локтем) и вперёд на flex; предплечье
// повёрнуто от «вперёд» на phi: плюс — наружу (наружная ротация), минус — к животу (внутренняя).
export function elbowSide(T, s, phi, abd = 10, flex = 5) {
  const { up, left, front } = axes(T), out = left.clone().multiplyScalar(sgn(s));
  const u = up.clone().negate().addScaledVector(out, Math.tan(deg(abd))).addScaledVector(front, Math.tan(deg(flex))).normalize();
  const f = front.clone().multiplyScalar(Math.cos(deg(phi))).addScaledVector(out, Math.sin(deg(phi)));
  f.addScaledVector(u, -f.dot(u)).normalize();
  armW(T, s, u, f);
}
// Свободная рука висит вдоль бока, локоть чуть согнут, кисть расслаблена.
export function rest(T, s) {
  const { up, left, front } = axes(T), out = left.clone().multiplyScalar(sgn(s));
  armW(T, s, up.clone().negate().addScaledVector(out, 0.12).addScaledVector(front, 0.04), up.clone().negate().addScaledVector(out, 0.06).addScaledVector(front, 0.3));
  T.rig.relaxHand(s); T.rig.grip(s, 0.3);
}
// Кулак на рукояти, запястье прямое: ручка лежит в ладони под 50° к предплечью (как у живого кулака), большой палец
// к thumb. orientHand с хватом сам кладёт ручку наискосок ладони на 40° — тогда пальцы продолжают предплечье.
// Возвращает ось ручки (к большому пальцу).
export function fist(T, s, thumb, amount = 1) {
  const { rig } = T, A = rig.dirW(s + 'ForeArm', s + 'Hand'), t = thumb.clone().addScaledVector(A, -thumb.dot(A)).normalize();
  const R = A.clone().multiplyScalar(Math.cos(deg(50))).addScaledVector(t, Math.sin(deg(50)));
  const C = rig.orientHand(s, R, 1, true);
  rig.grip(s, amount);
  return R.applyQuaternion(C);
}
// Один раз в setup: кожа по костям (floor.js) и полуширина стойки.
export function shoulderSetup(T) {
  floorSetup(T);
  T.feetAt = feet(T, T.hipHalf);
}

// ---------- Проверки по коже ----------
const TORSO = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
const LIMB = (s) => [s + 'Shoulder', s + 'Arm', s + 'ArmTwist', s + 'ForeArm', s + 'ForeArmTwist', s + 'Hand'];
const LEGS = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
export const BODY = { torso: TORSO, limb: LIMB, legs: LEGS };
const verts = (T, bones, f) => {
  const { mesh } = T;
  for (const n of bones) for (const i of T.skin[n] ?? []) f(mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld));
};
// Зазор от отрезка a–b радиуса r до кожи костей bones, см (меньше нуля — прошёл сквозь). skip — точка, у которой кожу
// не считаем (кисть, держащая резинку), радиус skipR.
export function clear(T, a, b, r, bones, skip = null, skipR = 0.09) {
  T.wrap.updateMatrixWorld(true);
  const ab = b.clone().sub(a), L2 = ab.lengthSq(), p = new THREE.Vector3();
  let best = Infinity;
  verts(T, bones, (v) => {
    if (skip && v.distanceTo(skip) < skipR) return;
    const t = THREE.MathUtils.clamp(v.clone().sub(a).dot(ab) / L2, 0, 1);
    best = Math.min(best, v.distanceTo(p.copy(a).addScaledVector(ab, t)) - r);
  });
  return cm(best);
}
// Где точка p относительно поверхности кожи bones вдоль dir: берём вершины в трубке радиуса rad вокруг луча через p,
// самая выступающая по dir — поверхность. Плюс — p снаружи (над кожей), минус — внутри тела. Нет вершин — null.
export function above(T, p, dir, bones, radius = 0.03) {
  T.wrap.updateMatrixWorld(true);
  let top = -Infinity;
  verts(T, bones, (v) => {
    const d = v.clone().sub(p), along = d.dot(dir);
    if (d.addScaledVector(dir, -along).length() < radius) top = Math.max(top, along);
  });
  return top === -Infinity ? null : cm(-top);
}
// Кожа кисти s (вершины кисти) против поверхности корпуса и ног: самая глубокая вершина кисти по направлению dir
// («наружу» от тела). Минус — кисть в теле.
export function handIn(T, s, dir, bones = [...TORSO, ...LEGS]) {
  let worst = Infinity;
  verts(T, [s + 'Hand'], (v) => { const a = above(T, v.clone(), dir, bones, 0.02); if (a != null) worst = Math.min(worst, a); });
  return worst === Infinity ? null : worst;
}
// Общие проверки руки «локоть на месте»: сгиб локтя в [lo, hi], локоть не дальше tol от эталона T.elbow0[s] (мир),
// запястье прямое (до 15°), ладонь на рукояти (до 2 см).
export function armAudit(T, r, s, { lo = 80, hi = 100, tol = 0.02, h = null } = {}) {
  const { rig } = T, a = rig.audit()[s], k = s[0];
  r.m['elbowAng' + k] = a.elbow;
  if (a.elbow < lo || a.elbow > hi) r.bad.push(`локоть согнут на ${a.elbow}°, нужно ${lo}–${hi}°`);
  if (T.elbow0?.[s]) {
    const d = w(rig, s + 'ForeArm').distanceTo(T.elbow0[s]);
    r.m['elbowDrift' + k] = cm(d);
    if (d > tol) r.bad.push(`локоть ушёл с места на ${cm(d)} см`);
  }
  if (a.wrist > 15) r.bad.push(`запястье не прямое: ${a.wrist}°`);
  if (h) {
    const rel = rig.palm(s).sub(h.g.position), off = rel.addScaledVector(h.ax, -rel.dot(h.ax)).length();
    r.m['grip' + k] = cm(off);
    if (off > 0.02) r.bad.push(`кисть не на рукояти (${cm(off)} см)`);
  }
}
// Резинка: длина (натянута — не короче min) и зазор до тела bones (кроме кисти на ней).
export function bandAudit(T, r, h, s, bones, min = 0.3, name = '') {
  const len = h.A.distanceTo(h.apex), gap = clear(T, h.A, h.apex, 0.008, bones, T.rig.palm(s), 0.1);
  r.m['band' + name] = +len.toFixed(3); r.m['bandGap' + name] = gap;
  if (len < min) r.bad.push(`резинка провисла: ${len.toFixed(2)} м`);
  if (gap < 0.5) r.bad.push(`резинка проходит сквозь тело (${gap} см)`);
}
// Плечи не тянутся к ушам: расстояние голова — середина плеч не короче, чем в начале цикла (T.neck0), больше чем на 1,5 см.
export function shrugAudit(T, r) {
  const { rig } = T, d = w(rig, 'Head').distanceTo(w(rig, 'LeftArm').add(w(rig, 'RightArm')).multiplyScalar(0.5));
  if (T.neck0 == null) return;
  r.m.shrug = cm(T.neck0 - d);
  if (T.neck0 - d > 0.015) r.bad.push(`плечи поднялись к ушам (${r.m.shrug} см)`);
}
export { baseAudit, rad, V3 };
// Лопатка одной руки вперёд (24.11.2026): ключица side выходит вперёд на deg градусов, другая сведена как обычно (T.retract).
// Лёжа на боку нижнее плечо выдвинуто вперёд, человек лежит на задней поверхности плеча и лопатке; со сведённой
// ключицей сустав модели оставался над корпусом, и дельта уходила в пол. Вызвать один раз в setup.
export function protract(T, side, deg = 22) {
  const own = T.rig.clavicle, keep = T.retract;
  T.rig.clavicle = (s, u) => { T.retract = s === side ? -deg : keep; own(s, u); T.retract = keep; };
}
