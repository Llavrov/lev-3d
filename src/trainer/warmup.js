// Разминка (23.11.2026): общее для группы — шаг и бег на месте (высокое колено, захлёст, марш прямыми ногами), руки стоя
// (круги, объятия) и проверки, которых нет в общих помощниках: рука не в корпусе, руки не друг в друге, ноги не друг в друге.
// Поза — функция секунды цикла, как в jump.js: стопы по расписанию «стоит / летит», таз по ключам, ноги достаёт Rig.legs.
import * as THREE from 'three';
import { lerp, clamp, smooth, w, mid, SIDES, sgn, ruSide, cm, UP } from './poses.js';
import { body, arms, measureFloor, legAudit, mod, P3 } from './jump.js';
import { legsClear, runParams, runArmKey, mixArms, landPhase, runArmAudit } from './steps.js';
import { footAlong } from './kneel.js';

export { measureFloor, arms };
export const bump = (u) => Math.sin(Math.PI * clamp(u, 0, 1));
const deg = THREE.MathUtils.degToRad;

// Нога на месте: правая отрывается в начале цикла P, левая на полцикла позже; sw — доля цикла в воздухе.
export function legState(P, sw, s, t) {
  const tau = mod(t - (s === 'Left' ? P / 2 : 0), P);
  if (tau < sw * P) return { planted: false, u: tau / (sw * P), yaw: 0 };
  return { planted: true, t0: t - tau + sw * P, yaw: 0 };
}
// Щиколотка по бедру и колену в плоскости шага: a — бедро от отвеса вперёд, k — сгиб колена, градусы. От тазобедренного
// сустава, z вперёд, y вверх.
export const ankleBy = (rig, a, k) => {
  const A = deg(a), B = deg(a - k);
  return { z: rig.L1 * Math.sin(A) + rig.L2 * Math.sin(B), y: -rig.L1 * Math.cos(A) - rig.L2 * Math.cos(B) };
};

// Шаг на месте. c: P — цикл, sw — доля в воздухе, hip — высота тазобедренных в долях ноги (над щиколоткой стоя),
// bob(t) — добавка к высоте таза, toe — пятка опорной над полом (доля, 0,35 ≈ 2,5 см), swing(u, s) — щиколотка летящей
// ноги от тазобедренного сустава { z, y } (на краях u она обязана быть у пола: склейка), plant(u) — подошвенный сгиб
// летящей стопы, рад, el — корпус над горизонталью, arm(t) — ключ рук (jump.arms), shift — таз над опорной, м.
export function inPlace(T, t, c) {
  const { rig } = T, L = rig.L1 + rig.L2, st = {}, ft = {};
  for (const s of SIDES) st[s] = legState(c.P, c.sw, s, t);
  const y = rig.ankleH + c.hip * L + (c.bob?.(t) ?? 0);
  const lean = c.shift ? c.shift * Math.sin(2 * Math.PI * (t / c.P - c.sw / 2)) : 0; // таз к опорной: правая стоит во второй половине
  const M = new THREE.Vector3(-lean, y, 0);
  const stand0 = { z: 0, y: rig.ankleH - y };
  for (const s of SIDES) {
    const f = st[s], x = sgn(s) * T.hipHalf;
    if (f.planted) { ft[s] = { pos: P3(x, 0), lift: 0, yaw: sgn(s) * 0.06, toe: c.toe ?? 0 }; continue; }
    const k = smooth(clamp(Math.min(f.u, 1 - f.u) / 0.2, 0, 1)), a = c.swing(f.u, s);
    const p = { z: lerp(stand0.z, a.z, k), y: lerp(stand0.y, a.y, k) + 0.03 * Math.sqrt(bump(f.u)) * (1 - k) }; // сразу от пола: носок не чиркает
    ft[s] = { pos: P3(x, p.z), lift: Math.max(0, y + p.y - rig.ankleH), yaw: sgn(s) * 0.06, toe: (c.toe ?? 0) * (1 - k) };
  }
  // c.runArm — доля рук клипа бега (mocap.js): локти около 90°, кисть назад за бедро, против ног по фазе левой.
  let arm = c.arm(t);
  if (c.runArm) {
    const p = runParams(T, c.v ?? 3.5), ak = runArmKey(landPhase([[c.sw * c.P, 'Right'], [c.P / 2 + c.sw * c.P, 'Left']], c.P, t), p);
    arm = mixArms(arm, ak, c.runArm);
    T.runInfo = { run: c.runArm, ak, face: new THREE.Vector3(0, 0, 1), elev: c.el };
  } else T.runInfo = null;
  body(T, { M, ft, el: c.el, arm, grip: c.grip ?? 0.5 });
  // Летящая стопа: Rig.legs держит её плоско, как на полу. В полёте она идёт за голенью с подошвенным сгибом plant.
  for (const s of SIDES) {
    if (st[s].planted) continue;
    const k = bump(st[s].u) ** 0.7, foot = rig.b[s + 'Foot'], q0 = foot.getWorldQuaternion(new THREE.Quaternion());
    const q1 = footAlong(T, s, w(rig, s + 'Foot').sub(w(rig, s + 'Leg')), c.plant?.(st[s].u) ?? 0);
    rig.setWorld(foot, q0.slerp(q1, k));
  }
  rig.root.updateMatrixWorld(true);
  T.st = st; T.M = M;
  return st;
}

// Корпус стоя ровно: линия таз → шея над горизонталью в пределах [lo, hi] (наклон назад и завал вперёд — ошибки бега).
export function torsoCheck(r, lo, hi) {
  if (r.m.torso < lo) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
  if (r.m.torso > hi) r.bad.push(`корпус откинут назад: ${r.m.torso}°`);
}
// Ноги не проходят друг сквозь друга (капсулы steps.js, допуск на кожу 1 см).
export function legsCheck(T, r) {
  const c = legsClear(T); r.m.legGap = cm(c.gap);
  if (c.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${c.where}, ${cm(c.gap)} см)`);
}
// Проверка шага на месте: общие и ноги из jump.js (опорная не скользит, не висит, летящая не задевает пол) плюс свои.
export const stepAudit = (T, ex, t) => { const r = legAudit(T, ex, t); legsCheck(T, r); return runArmAudit(T, r); };

// ---------- Руки стоя ----------
// Корпус как эллиптический цилиндр от таза до шеи в осях груди: полуширина и полутолщина меряются по суставам на загрузке
// (у coach плечевые суставы на ±0,18 м, грудь от оси на 0,11 м). Точка внутри — рука прошла сквозь корпус.
export function torsoFrame(T) {
  const { rig } = T, hips = w(rig, 'Hips'), neck = w(rig, 'Neck'), up = neck.clone().sub(hips).normalize();
  const across = w(rig, 'LeftArm').sub(w(rig, 'RightArm')); across.addScaledVector(up, -across.dot(up)).normalize();
  const front = new THREE.Vector3().crossVectors(across, up).normalize();
  return { hips, neck, up, across, front, len: neck.distanceTo(hips) };
}
// Насколько точка P утоплена в корпус: > 0 — внутри (доля полуосей, 0,1 ≈ 1–2 см). Пояс от таза до низа шеи.
export function inTorso(F, P, half = 0.15, depth = 0.11, top) {
  const d = P.clone().sub(F.hips), h = d.dot(F.up);
  if (h < 0.05 || h > F.len * (top ?? 1)) return -1; // top < 1: без пояса плеч, там кисть лежит законно
  const x = d.dot(F.across) / half, z = d.dot(F.front) / depth;
  return 1 - Math.hypot(x, z);
}
// Предплечья и кисти (по 5 точек на сегмент) не внутри корпуса; плечо не проверяем: у подмышки оно законно касается.
export function armsOutOfTorso(T, r, opt = {}) {
  const { rig } = T, F = torsoFrame(T);
  let worst = -1, who = '';
  for (const s of SIDES) {
    const pts = [w(rig, s + 'ForeArm'), w(rig, s + 'Hand'), rig.palm(s)];
    for (let i = 0; i < 2; i++) for (let k = 1; k <= 4; k++) {
      const P = pts[i].clone().lerp(pts[i + 1], k / 4), v = inTorso(F, P, opt.half, opt.depth, opt.top);
      if (v > worst) { worst = v; who = s; const d = P.clone().sub(F.hips); r.m.armInTorsoAt = [cm(d.dot(F.across)), cm(d.dot(F.front)), +(d.dot(F.up) / F.len).toFixed(2), i, k]; }
    }
  }
  r.m.armInTorso = +worst.toFixed(2);
  if (worst > (opt.tol ?? 0.12)) r.bad.push(`${ruSide(who, true)} рука уходит в корпус (${Math.round(worst * 100)} %)`);
}
// Отрезки предплечий не ближе 2·радиус друг к другу (руки скрещены одна над другой, а не друг в друге).
function segDist(p1, q1, p2, q2) {
  let best = Infinity;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) best = Math.min(best, p1.clone().lerp(q1, i / 8).distanceTo(p2.clone().lerp(q2, j / 8)));
  return best;
}
export function armsApart(T, r, R = 0.04) {
  const { rig } = T, seg = (s, a, b) => [w(rig, s + a), b === 'palm' ? rig.palm(s) : w(rig, s + b)];
  let gap = Infinity;
  for (const [a, b] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand']]) for (const [c, d] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand']]) {
    const [p1, q1] = seg('Right', a, b), [p2, q2] = seg('Left', c, d);
    gap = Math.min(gap, segDist(p1, q1, p2, q2) - 2 * R);
  }
  r.m.armGap = cm(gap);
  if (gap < -0.01) r.bad.push(`руки проходят друг сквозь друга (${cm(gap)} см)`);
}
// Плечи к ушам: голова к середине плечевых суставов не ближе, чем в покое (замер в setup — T.neckToShoulder).
export function shrugCheck(T, r) {
  const sh = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm'));
  r.m.shrug = cm(T.neckToShoulder - sh);
  if (T.neckToShoulder - sh > 0.015) r.bad.push(`плечи поднялись к ушам (${r.m.shrug} см)`);
}
// Стоя прямо, руки задаёт упражнение: стопы на ширине таза, колени мягкие, взгляд вперёд.
export function standTall(T, armKey = {}) {
  const { rig } = T, L = rig.L1 + rig.L2;
  body(T, { M: new THREE.Vector3(0, rig.ankleH + 0.975 * L, 0), ft: { Left: { pos: P3(T.hipHalf, 0), lift: 0, yaw: 0.07 }, Right: { pos: P3(-T.hipHalf, 0), lift: 0, yaw: -0.07 } },
    el: 88, arm: armKey });
}
export { UP };
