// Общее для упражнений кисти, предплечья и плеча (23.11.2026, исполнитель «руки»): сгиб запястья, кисть на предмете
// или на руке, объём корпуса и головы для проверки «рука не проходит сквозь тело», посадка на скамью с упором для
// предплечий, якорь резинки и ручки. Всё меряется по костям и коже модели при загрузке.
import * as THREE from 'three';
import { w, mid, deg, rad, clamp, cm, SIDES, sgn, ruSide, UP, FWD, stand, trunk, armIK, frameMat, rubber, steel, shadows } from './poses.js';
import { floorSetup, lowest, legThrough } from './floor.js';

const _q = new THREE.Quaternion();
export const PALM_SKIN = 0.013; // от точки Rig.palm (ось ручки) до кожи ладони, м

// ---------- Кисть ----------
// Оси кисти в мире: r — к указательному, f — к пальцам, n — наружу из ладони.
export function handAxes(T, s) {
  const H = T.rig.hand[s], q = T.rig.b[s + 'Hand'].getWorldQuaternion(new THREE.Quaternion());
  return { r: H.r.clone().applyQuaternion(q), f: H.f.clone().applyQuaternion(q), n: H.n.clone().applyQuaternion(q) };
}
// Сгиб запястья на a градусов: плюс — к ладони (сгибание), минус — к тыльной стороне (разгибание). Ось «к указательному»,
// без скрутки: пронацию уже поделил Rig.orientHand.
export function flexWrist(T, s, a) {
  const { f, n } = handAxes(T, s);
  T.rig.turnWorld(T.rig.b[s + 'Hand'], _q.setFromAxisAngle(f.cross(n).normalize(), deg(a)));
}
// Запястье: сгиб (+ к ладони) и отклонение к указательному или мизинцу, градусы.
export function wristAngles(T, s) {
  const A = T.rig.dirW(s + 'ForeArm', s + 'Hand'), { r, f, n } = handAxes(T, s);
  return { flex: Math.round(rad(Math.atan2(-A.dot(n), A.dot(f)))), dev: Math.round(rad(Math.asin(clamp(-A.dot(r), -1, 1)))) };
}
// Ладонь в P, ручка или предмет вдоль R (к указательному), запястье согнуто на flex. Три прохода: ладонь сдвигается
// вместе с поворотом и сгибом кисти.
export function gripAt(T, s, P, R, flex = 0, pole = new THREE.Vector3(0, -1, 0)) {
  const { rig } = T;
  for (let i = 0; i < 3; i++) {
    armIK(T, s, P.clone().sub(rig.palm(s).sub(w(rig, s + 'Hand'))), pole);
    const A = rig.dirW(s + 'ForeArm', s + 'Hand');
    rig.orientHand(s, R.clone().addScaledVector(A, -R.dot(A)).normalize(), 1, false);
    if (flex) flexWrist(T, s, flex);
  }
}
// Проверка запястья вместо общей (у неё один предел 50° на всё). lim — предел сгиба по сторонам; отклонение до 25°.
export function wristAudit(T, r, lim = {}) {
  r.bad = r.bad.filter((b) => !/в запястье/.test(b));
  for (const s of SIDES) {
    const a = wristAngles(T, s), L = lim[s] ?? 50;
    r.m['flex' + s[0]] = a.flex; r.m['dev' + s[0]] = a.dev;
    if (Math.abs(a.flex) > L) r.bad.push(`${ruSide(s, true)} кисть: запястье ${a.flex > 0 ? 'согнуто' : 'разогнуто'} на ${Math.abs(a.flex)}° (предел ${L}°)`);
    if (Math.abs(a.dev) > 25) r.bad.push(`${ruSide(s, true)} кисть уведена вбок на ${Math.abs(a.dev)}°`);
  }
}

// ---------- Объём тела ----------
// Корпус — стопка эллипсов по высоте от тазобедренных суставов до шеи (кожа костей Hips, Spine*, Neck), голова — шар.
// Меряется один раз в покое; в позе точка переводится в оси корпуса (вверх — таз → шея, поперёк — плечи).
function torsoFrame(T) {
  const { rig } = T, O = mid(rig, 'LeftUpLeg', 'RightUpLeg'), N = w(rig, 'Neck'), up = N.clone().sub(O), len = up.length(); up.normalize();
  const x = w(rig, 'LeftArm').sub(w(rig, 'RightArm')); x.addScaledVector(up, -x.dot(up)).normalize();
  return { O, up, x, z: new THREE.Vector3().crossVectors(x, up), len };
}
const BINS = 12;
export function bodyShape(T) {
  floorSetup(T);
  const { rig, mesh } = T, v = new THREE.Vector3();
  T.wrap.updateMatrixWorld(true);
  const F = torsoFrame(T), bins = Array.from({ length: BINS }, () => ({ x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }));
  for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck']) for (const i of T.skin[n] ?? []) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).sub(F.O);
    const h = v.dot(F.up) / F.len;
    if (h < 0 || h >= 1) continue;
    const b = bins[Math.floor(h * BINS)], x = v.dot(F.x), z = v.dot(F.z);
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
  }
  T.torso = bins.map((b, i) => (Number.isFinite(b.x0) ? b : bins[i - 1] ?? b));
  const hq = rig.b.Head.getWorldQuaternion(new THREE.Quaternion()).invert(), H = w(rig, 'Head'), pts = [];
  for (const i of T.skin.Head ?? []) pts.push(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).clone());
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));
  const d = pts.map((p) => p.distanceTo(c)).sort((a, b) => a - b);
  T.head = { c: c.sub(H).applyQuaternion(hq), r: d[Math.floor(d.length * 0.25)] ?? 0.09 }; // шар внутри головы: четверть кожи ближе
  T.limbR = {};
  for (const s of SIDES) for (const [a, b] of [[s + 'Arm', s + 'ForeArm'], [s + 'ForeArm', s + 'Hand']]) {
    const A = w(rig, a), B = w(rig, b), seg = B.clone().sub(A), dd = [];
    for (const i of T.skin[a] ?? []) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
      const t = v.clone().sub(A).dot(seg) / seg.lengthSq();
      if (t > 0.2 && t < 0.8) dd.push(v.clone().sub(A.clone().addScaledVector(seg, t)).length());
    }
    dd.sort((p, q) => p - q);
    T.limbR[a] = dd[Math.floor(dd.length / 2)] ?? 0.04;
  }
}
// Расстояние от точки до кожи корпуса или головы (приближённо), м: минус — точка внутри тела.
export function clearance(T, P) {
  const F = torsoFrame(T), p = P.clone().sub(F.O), h = p.dot(F.up) / F.len;
  let best = Infinity;
  if (h >= 0 && h < 1) {
    const b = T.torso[Math.floor(h * BINS)], cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const ax = Math.min((b.x1 - b.x0) / 2, T.shoulderHalf - 0.01); // у подмышки кожа корпуса — это уже дельты и широчайшие: не шире плечевых суставов
    const dx = p.dot(F.x) - cx, dz = p.dot(F.z) - cz, az = dz > 0 ? b.z1 - cz : cz - b.z0;
    const rho = Math.hypot(dx / ax, dz / az), d = Math.hypot(dx, dz);
    best = rho > 1e-6 ? d * (1 - 1 / rho) : -Math.min(ax, az);
  }
  const C = T.head.c.clone().applyQuaternion(T.rig.b.Head.getWorldQuaternion(_q)).add(w(T.rig, 'Head'));
  return Math.min(best, P.distanceTo(C) - T.head.r);
}
// Рука не входит в корпус и голову: ось плеча (дальние 0,3), предплечья и середина ладони. Плюс — зазор оси до кожи, м.
export function armClear(T, s) {
  const { rig } = T, S = w(rig, s + 'Arm'), E = w(rig, s + 'ForeArm'), Wr = w(rig, s + 'Hand');
  let m = { d: Infinity, at: '' };
  const test = (P, at, r) => { const d = clearance(T, P) - r; if (d < m.d) m = { d, at }; };
  for (const t of [0.7, 0.85, 1]) test(S.clone().lerp(E, t), 'плечо', T.limbR[s + 'Arm']); // ближе к суставу кожа плеча и груди общая
  for (const t of [0.25, 0.5, 0.75, 1]) test(E.clone().lerp(Wr, t), 'предплечье', T.limbR[s + 'ForeArm']);
  test(rig.palm(s), 'кисть', 0.02);
  return m;
}
// Обе руки: проверка «не сквозь тело», tol — сколько кожи руки может уйти в кожу тела, м. Плечу у бока прощается
// 4,5 см: корпус здесь эллипс по самым широким точкам (широчайшие, подмышка), а живое плечо прижимается к ним.
export function bodyAudit(T, r, tol = 0.025, armTol = 0.045) {
  for (const s of SIDES) {
    const c = armClear(T, s), lim = c.at === 'плечо' ? Math.max(tol, armTol) : tol;
    r.m['clear' + s[0]] = cm(c.d); r.m['clearAt' + s[0]] = c.at;
    if (c.d < -lim) r.bad.push(`${ruSide(s, true)} рука (${c.at}) входит в тело на ${cm(-c.d)} см`);
  }
  const nan = Object.keys(r.m).filter((k) => Number.isNaN(r.m[k]));
  if (nan.length) r.bad.push(`не посчиталось: ${nan.join(', ')}`);
}
// Расстояние от точки до кожи бёдер и голеней (ось минус радиус по замеру T.legR), м.
export function legClear(T, P) {
  let m = Infinity;
  for (const s of SIDES) for (const [a, b, R] of [[s + 'UpLeg', s + 'Leg', T.legR.thigh], [s + 'Leg', s + 'Foot', T.legR.shin]]) {
    const A = w(T.rig, a), B = w(T.rig, b), seg = B.clone().sub(A), t = clamp(P.clone().sub(A).dot(seg) / seg.lengthSq(), 0, 1);
    m = Math.min(m, P.distanceTo(A.clone().addScaledVector(seg, t)) - R[Math.min(9, Math.floor(t * 10))]);
  }
  return m;
}
// Ладонь лежит на сегменте A → B (рука, палка), радиус сегмента R: зазор от кожи ладони до кожи сегмента, см.
export function palmGap(T, s, A, B, R) {
  const P = T.rig.palm(s), seg = B.clone().sub(A), t = clamp(P.clone().sub(A).dot(seg) / seg.lengthSq(), 0, 1);
  return cm(P.distanceTo(A.clone().addScaledVector(seg, t)) - (R - PALM_SKIN));
}
// Кисть s ложится ладонью на сегмент кости a → b другой руки в доле t, со стороны side (мир, наружу от сегмента).
// Пальцы вдоль F. Возвращает точку для palmOn.
export function onLimb(T, a, b, t, side, R) {
  const A = w(T.rig, a), B = w(T.rig, b), axis = B.clone().sub(A).normalize(), n = side.clone().addScaledVector(axis, -side.dot(axis)).normalize();
  return A.lerp(B, t).addScaledVector(n, R - PALM_SKIN);
}

// Крайняя точка кожи участка по направлению dir (мир): наибольшее p·dir.
export function extreme(T, bones, dir) {
  const v = new THREE.Vector3(); let best = -Infinity, P = null;
  T.wrap.updateMatrixWorld(true);
  for (const n of bones) for (const i of T.skin[n] ?? []) {
    T.mesh.getVertexPosition(i, v).applyMatrix4(T.mesh.matrixWorld);
    if (v.dot(dir) > best) { best = v.dot(dir); P = v.clone(); }
  }
  return P;
}
// Стена за спиной: плоскость z = z0, лицом к +Z.
export function wall(z0, wd = 1.6, h = 2.3) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, 0.06), new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.95 }));
  m.position.set(0, h / 2, z0 - 0.03); m.receiveShadow = true;
  return m;
}

// ---------- Посадка ----------
// Сидя на скамье: таз (середина тазобедренных) на высоте T.seatY над точкой (0, z), корпус elev над горизонталью,
// бёдра вперёд почти горизонтально, голени отвесно, стопы на полу. T.seatY подбирает seatSetup: седалище на подушке.
export const SEAT = { pad: 0.44, z: -0.05 }; // верх подушки скамьи, м; центр таза над ней по глубине
export function seatBody(T, K, elev) {
  const { rig } = T;
  stand(T);
  trunk(T, K, elev);
  T.wrap.position.add(new THREE.Vector3(0, T.seatY, SEAT.z).sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'))); T.wrap.updateMatrixWorld(true);
  for (const s of SIDES) {
    const H = w(rig, s + 'UpLeg'), x = H.x + sgn(s) * 0.05;
    const A = new THREE.Vector3(x, rig.ankleH, 0), dy = H.y - rig.ankleH;
    // Колено: бедро длиной L1 от таза, голень L2 до щиколотки, щиколотка под коленом чуть впереди.
    const kz = H.z + Math.sqrt(Math.max(0.01, rig.L1 ** 2 - (dy - rig.L2 * 0.98) ** 2));
    A.z = kz + rig.L2 * 0.2; const Kp = new THREE.Vector3(x, rig.ankleH + Math.sqrt(rig.L2 ** 2 - (rig.L2 * 0.2) ** 2), kz);
    legThrough(T, s, Kp, A, new THREE.Quaternion().setFromAxisAngle(UP, sgn(s) * 0.12).multiply(T.footFlat[s]));
  }
}
export function seatSetup(T, K, elev) {
  T.seatY = SEAT.pad + 0.1;
  for (let i = 0; i < 3; i++) { seatBody(T, K, elev); T.seatY += SEAT.pad - lowest(T, ['Hips', 'LeftUpLeg', 'RightUpLeg']).y; }
}
const box = (g, wd, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
// Скамья под тазом: подушка поперёк, верх на SEAT.pad.
export function seatBench() {
  const g = new THREE.Group(), pad = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }), f = frameMat();
  box(g, 1.1, 0.07, 0.3, pad, 0, SEAT.pad - 0.035, SEAT.z - 0.06);
  for (const x of [-0.45, 0.45]) { box(g, 0.06, SEAT.pad - 0.07, 0.06, f, x, (SEAT.pad - 0.07) / 2, SEAT.z - 0.06); box(g, 0.07, 0.04, 0.4, f, x, 0.02, SEAT.z - 0.06); }
  return shadows(g);
}
// Упор для предплечий (скамья Скотта, выставленная ровно): подушка верхом на y, от z0 до z1, на двух стойках по бокам.
export function armPad(y, z0, z1, half = 0.32) {
  const g = new THREE.Group(), pad = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }), f = frameMat();
  box(g, half * 2, 0.06, z1 - z0, pad, 0, y - 0.03, (z0 + z1) / 2);
  for (const x of [-half - 0.04, half + 0.04]) { box(g, 0.05, y - 0.06, 0.05, f, x, (y - 0.06) / 2, (z0 + z1) / 2); box(g, 0.06, 0.04, 0.45, f, x, 0.02, (z0 + z1) / 2); }
  return shadows(g);
}

// Предплечья sides на упоре: локти на одной высоте и глубине под плечами (плечи модели стоят несимметрично на 2 см,
// ширина локтя добирает длину плеча), предплечья горизонтально вперёд, запястье на edge за краем подушки. T.arm[s] —
// локоть E и запястье W; подушку кладёт по коже предплечья в позе, которую ставит poseFn.
export function padArms(T, sides, edge, poseFn) {
  const { rig } = T;
  T.arm = {};
  const S = Object.fromEntries(sides.map((s) => [s, w(rig, s + 'Arm')])), L = (s) => rig.armLen[s][0] * 0.999;
  const y = Math.max(...sides.map((s) => S[s].y - L(s) * 0.96));
  const z = Math.min(...sides.map((s) => S[s].z + Math.sqrt(L(s) ** 2 - 0.06 ** 2 - (S[s].y - y) ** 2)));
  let z0 = Infinity, z1 = Infinity;
  for (const s of sides) {
    const E = new THREE.Vector3(S[s].x + sgn(s) * Math.sqrt(L(s) ** 2 - (S[s].y - y) ** 2 - (z - S[s].z) ** 2), y, z);
    T.arm[s] = { E, W: E.clone().add(new THREE.Vector3(0, 0, rig.armLen[s][1])) };
    z0 = Math.min(z0, E.z - 0.08); z1 = Math.min(z1, T.arm[s].W.z - edge);
  }
  poseFn();
  T.padY = Math.min(...sides.map((s) => lowest(T, [s + 'ForeArm']).y)) + 0.008; T.padZ = z1; // кожа снизу предплечья сжата на 8 мм
  T.add(armPad(T.padY, z0, z1));
}
// Предплечье на упоре: нижняя кожа на подушке (до 2 см над ней, не глубже 1,5 см), локоть не сдвинулся больше 1 см.
export function padAudit(T, r, sides) {
  for (const s of sides) {
    const g = cm(lowest(T, [s + 'ForeArm']).y - T.padY), E = w(T.rig, s + 'ForeArm'), d = E.distanceTo(T.arm[s].E);
    r.m['pad' + s[0]] = g; r.m['moveE' + s[0]] = cm(d); r.m['past' + s[0]] = cm(w(T.rig, s + 'Hand').z - T.padZ);
    if (g > 2 || g < -1.5) r.bad.push(`${ruSide(s, true)} рука: предплечье не на упоре (${g} см)`);
    if (d > 0.01) r.bad.push(`${ruSide(s)} локоть сдвинулся на ${cm(d)} см`);
  }
}

// ---------- Резинка и ручки ----------
// Якорь резинки: стойка до пола, петля в точке P. dir — откуда стойка (от P назад, мир).
export function anchor(P, dir = new THREE.Vector3(0, 0, 1)) {
  const g = new THREE.Group(), f = frameMat(), d = dir.clone().setY(0).normalize(), c = P.clone().addScaledVector(d, 0.06);
  const top = Math.max(P.y + 0.25, 1.2);
  box(g, 0.08, top, 0.08, f, c.x, top / 2, c.z);
  box(g, 0.45, 0.04, 0.45, f, c.x, 0.02, c.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 20), steel()); ring.position.copy(P); ring.lookAt(c.x, P.y, c.z); g.add(ring);
  return shadows(g);
}
// Ручка резинки: обрезиненный цилиндр 12 см, ось — локальный X. Ставится в ладонь вдоль оси «к указательному».
export const HANDLE = { len: 0.12, r: 0.016 };
export function handle() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(HANDLE.r, HANDLE.r, HANDLE.len, 12), rubber()); m.rotation.z = Math.PI / 2;
  const g = new THREE.Group(); g.add(m); return shadows(g);
}
export function placeHandle(T, h, s) {
  h.position.copy(T.rig.palm(s)); h.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), handAxes(T, s).r); h.updateMatrixWorld(true);
}
// Ладонь до оси ручки (кольца), см.
export function handleGap(T, h, s) {
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(h.quaternion), rel = T.rig.palm(s).sub(h.position);
  return cm(rel.addScaledVector(ax, -rel.dot(ax)).length());
}
// Резинка не режет тело: точки на ней дальше от кожи, чем 1 см (кроме последних 12 см у кисти).
export function bandClear(T, A, B) {
  const len = A.distanceTo(B); let m = Infinity;
  for (let t = 0; t <= 1 - 0.12 / len; t += 0.05) m = Math.min(m, clearance(T, A.clone().lerp(B, t)));
  return m;
}
export { FWD };
