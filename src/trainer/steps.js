// Шаги по полу для упражнений на работу ног (приставные, кариока, скрестный шаг, «паук», розыгрыш), 23.11.2026.
// Упражнение задаёт сценарий на цикл P секунд:
//   plants: { Left: [...], Right: [...] } — стоянки стоп по порядку: { on, off, x, z, yaw, toe?, push?, pivot?, h?, arc? }.
//     on..off — стопа стоит (секунды цикла, off может быть больше P), x, z — щиколотка на полу (мир), yaw — носок
//     от +Z к +X, радианы. toe — пятка над полом (доля, 0,4 = 3 см), push — пятка поднимается к отрыву (толчок).
//     pivot: [yaw1, t0, t1] — разворот на подушечке: носок от yaw до yaw1, подушечка на месте, щиколотка ходит вокруг.
//     h, arc { x, z } — высота и вынос (мир) дуги переноса В эту стоянку: кариока несёт стопу перед или за опорной.
//   body: [[t, { y, dx, dz, yaw, hips, torso, elev, run }], ...] — ключи тела: y — высота тазобедренных суставов,
//     dx, dz — сдвиг таза от середины стоп, yaw — куда смотрит тело (°), hips и torso — поворот таза и груди от тела (°),
//     elev — линия таз → шея над горизонталью (°), run — 0 руки в стойке перед собой, 1 мах руками, как на бегу,
//     hang — 1 руки висят вдоль тела (отдых).
// gait(T, S, t) ставит позу и кладёт в T.gait, что нужно проверке (footAudit).
import * as THREE from 'three';
import { deg, rad, lerp, clamp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, trunk, placeHips, look, armIK, baseAudit, UP } from './poses.js';

export const mod = (t, P) => ((t % P) + P) % P;
const yawV = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); // носок по углу

// Кубическая кривая по ключам на цикле: касательные по соседям, в экстремуме ноль — без перелёта за ключ,
// два одинаковых ключа подряд дают стоянку.
export function curve(keys, P) {
  const n = keys.length, names = Object.keys(keys[0][1]);
  const ext = []; // ключи с соседними циклами: время развёрнуто
  for (let k = -2; k < n + 2; k++) { const j = mod(k, n); ext.push([keys[j][0] + Math.floor(k / n) * P, { ...keys[0][1], ...keys[j][1] }]); }
  return (t) => {
    t = mod(t, P);
    let i = 0;
    while (i < ext.length - 3 && ext[i + 1][0] <= t) i++;
    const [[T0, a], [T1, b], [T2, c], [T3, d]] = [ext[i - 1] ?? ext[i], ext[i], ext[i + 1], ext[i + 2]];
    const u = clamp((t - T1) / Math.max(1e-6, T2 - T1), 0, 1), out = {};
    for (const f of names) {
      const p0 = a[f], p1 = b[f], p2 = c[f], p3 = d[f];
      const tan = (pa, pb, pc, ta, tc) => ((pb - pa) * (pc - pb) <= 0 ? 0 : (pc - pa) / (tc - ta) * (T2 - T1));
      const m1 = tan(p0, p1, p2, T0, T2), m2 = tan(p1, p2, p3, T1, T3);
      const u2 = u * u, u3 = u2 * u;
      out[f] = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
    }
    return out;
  };
}

// Сборка сценария по шагам: стопы стоят с начала цикла, step(s, отрыв, постановка, x, z, yaw, доп.) переносит стопу.
// Последняя стоянка каждой стопы должна совпасть с первой: цикл замыкается, она тянется через конец цикла.
export function script(P, start) {
  const plants = { Left: [], Right: [] }, body = [];
  for (const s of SIDES) plants[s].push({ on: 0, ...start[s] });
  const S = {
    P, plants, body,
    step(s, lift, land, x, z, yaw, extra = {}) { const L = plants[s]; L[L.length - 1].off = lift; L.push({ on: land, x, z, yaw, ...extra }); return S; },
    key(t, o) { body.push([t, o]); return S; },
    done() {
      for (const s of SIDES) {
        const L = plants[s];
        if (L.length === 1) { L[0].off = P; continue; }
        const last = L.pop(), first = L[0];
        if (Math.hypot(last.x - first.x, last.z - first.z) > 1e-6 || Math.abs(last.yaw - first.yaw) > 1e-6) throw new Error(`${s}: цикл не замкнут`);
        L[0] = { ...first, ...last, on: last.on, off: first.off + P, pivot: first.pivot ? first.pivot.map((v, i) => (i ? v + P : v)) : last.pivot };
        L.push(L.shift()); // по порядку времени: стоянка через конец цикла последней
      }
      body.sort((a, b) => a[0] - b[0]);
      S.curve = curve(body, P);
      return S;
    },
  };
  return S;
}

// Подушечка относительно щиколотки в осях носка (x вбок к мизинцу не нужен: стопа почти прямая) — меряется в setup.
export function measureFeet(T) {
  const { rig } = T;
  stand(T); trunk(T, key({})); placeHips(T, new THREE.Vector3(0, rig.ankleH + 0.975 * (rig.L1 + rig.L2), 0), {
    Left: { pos: new THREE.Vector3(T.hipHalf, 0, 0), lift: 0, yaw: 0 }, Right: { pos: new THREE.Vector3(-T.hipHalf, 0, 0), lift: 0, yaw: 0 }, crouch: 0 });
  T.ball = {};
  for (const s of SIDES) {
    const d = w(rig, s + 'ToeBase').sub(w(rig, s + 'Foot'));
    T.ball[s] = { side: d.x, fwd: d.z, y: w(rig, s + 'ToeBase').y, ankleY: w(rig, s + 'Foot').y };
  }
}
// Подушечка стопы s, стоящей щиколоткой в (x, z) носком по yaw.
const ballAt = (T, s, x, z, yaw) => new THREE.Vector3(x, 0, z).addScaledVector(yawV(yaw), T.ball[s].fwd)
  .addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), T.ball[s].side);

// Стоянка p в секунду tt (развёрнутую от p.on): щиколотка, носок, пятка. Подушечка стоит, носок может крутиться:
// pivot — разворот по расписанию, follow — доля поворота таза (с телом) с момента постановки (кариока крутит таз на подушечках).
function plantPose(T, s, S, p, tt) {
  let yaw = p.yaw, toe = p.toe ?? 0, turn = 0;
  if (p.pivot) {
    const [y1, a, b] = p.pivot, k2 = smooth(clamp((tt - a) / (b - a), 0, 1));
    yaw = lerp(p.yaw, y1, k2);
    toe = Math.max(toe, 0.4 * Math.sin(Math.PI * k2)); // на развороте пятка над полом, крутится на подушечке
  }
  if (p.follow) { const a = S.curve(tt), b = S.curve(p.on); turn = p.follow * deg(a.hips + a.yaw - b.hips - b.yaw); yaw += turn; }
  const ball = ballAt(T, s, p.x, p.z, p.yaw), A = ballAt(T, s, 0, 0, yaw);
  if (p.push) toe = Math.max(toe, p.push * smooth(clamp((tt - (p.off - 0.16)) / 0.16, 0, 1)));
  return { x: ball.x - A.x, z: ball.z - A.z, yaw, toe, ball };
}
// Где стопа s в секунду t: стоит (щиколотка, носок, пятка) или летит между стоянками.
export function footAt(T, s, S, t) {
  const plan = S.plants[s], P = S.P;
  t = mod(t, P);
  const n = plan.length, inPlant = (p) => (t >= p.on && t <= p.off) || (t + P >= p.on && t + P <= p.off);
  for (let k = 0; k < n; k++) {
    const p = plan[k];
    if (!inPlant(p)) continue;
    return { planted: true, k, lift: 0, ...plantPose(T, s, S, p, t >= p.on ? t : t + P) };
  }
  // В полёте: между стоянкой k (оторвалась в off) и k + 1 (встанет в on).
  for (let k = 0; k < n; k++) {
    const a = plan[k], b = plan[(k + 1) % n], end = k + 1 < n ? b.on : b.on + P;
    let t0 = a.off, tt = t;
    if (tt < t0) tt += P;
    if (tt > end) continue;
    const u = clamp((tt - t0) / (end - t0), 0, 1), e = smooth(u), br = Math.sin(Math.PI * u), A = plantPose(T, s, S, a, a.off);
    const x = lerp(A.x, b.x, e) + (b.arc?.x ?? 0) * br, z = lerp(A.z, b.z, e) + (b.arc?.z ?? 0) * br;
    return { planted: false, k: -1, x, z, yaw: lerp(A.yaw, b.yaw, e), toe: 0, lift: (b.h ?? 0.06) * br };
  }
  throw new Error(`${s}: дыра в расписании стоп на ${t.toFixed(2)} с`);
}

// Поза в секунду t по сценарию S. Возвращает состояние для проверки и для своих добавок упражнения (руки, взгляд).
export function gait(T, S, t, opt = {}) {
  const { rig } = T, b = S.curve(t), f = {};
  for (const s of SIDES) f[s] = footAt(T, s, S, t);
  const yaw = deg(b.yaw), q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  stand(T, 0, 0, 0, q);
  const kk = key({ hips: b.hips, torso: b.torso, ...(opt.key ?? {}) });
  trunk(T, kk, b.elev);
  const ft = { crouch: 0 };
  for (const s of SIDES) ft[s] = { pos: new THREE.Vector3(f[s].x, 0, f[s].z), lift: f[s].lift, yaw: f[s].yaw - yaw - 0.55 * deg(b.hips), toe: f[s].toe };
  const mx = (f.Left.x + f.Right.x) / 2 + b.dx, mz = (f.Left.z + f.Right.z) / 2 + b.dz;
  placeHips(T, new THREE.Vector3(mx, b.y - (opt.dy ?? 0), mz), ft);
  const face = yawV(yaw + deg(b.torso)), side = new THREE.Vector3(face.z, 0, -face.x); // side — влево от тела (+X при yaw 0)
  look(T, opt.lookAt ?? w(rig, 'Head').setY(1.2).addScaledVector(face, 5));
  // Руки: в стойке кисти перед животом, локти согнуты и смотрят вниз-наружу; на бегу мах вперёд-назад против ног.
  const swing = opt.swing ?? Math.sin(2 * Math.PI * t / (S.stride ?? 0.6));
  for (const s of SIDES) {
    if (opt.skipArm === s) continue;
    const Sh = w(rig, s + 'Arm'), sw = -sgn(s) * swing * (b.run ?? 0);
    const W = Sh.clone().addScaledVector(UP, -lerp(0.25, 0.3, b.run ?? 0)).addScaledVector(face, lerp(0.36, 0.1 + 0.2 * sw, b.run ?? 0))
      .addScaledVector(side, -sgn(s) * lerp(0.03, 0.02, b.run ?? 0));
    if (b.hang) W.lerp(Sh.clone().addScaledVector(UP, -0.5).addScaledVector(face, 0.08).addScaledVector(side, sgn(s) * 0.05), b.hang); // отдых: руки висят
    const pole = UP.clone().negate().addScaledVector(side, sgn(s) * 0.5).addScaledVector(face, -0.4 - 0.4 * (b.run ?? 0));
    armIK(T, s, W, pole);
    rig.relaxHand(s); rig.grip(s, 0.45);
  }
  T.gait = { f, b, yaw, t, P: S.P };
  return T.gait;
}

// ---------- Проверка ног ----------
// Ближайшее расстояние между отрезками [p1, q1] и [p2, q2].
function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb;
  let s = den > 1e-9 ? clamp((bb * f - c * e) / den, 0, 1) : 0, u = (bb * s + f) / e;
  if (u < 0) { u = 0; s = clamp(-c / a, 0, 1); } else if (u > 1) { u = 1; s = clamp((bb - c) / a, 0, 1); }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, u));
}
// Ноги как капсулы: бедро без верхней четверти (у паха бёдра сходятся и у живого), голень, стопа щиколотка → носок.
// Радиус бедра и голени — 0,8 переднего радиуса кожи (сбоку нога тоньше, чем спереди), стопа 4 см.
function legCaps(T, s) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), K = w(rig, s + 'Leg'), A = w(rig, s + 'Foot'), B = w(rig, s + 'ToeBase');
  const R = T.legR ?? { thigh: new Array(10).fill(0.08), shin: new Array(10).fill(0.05) };
  return {
    thigh: [H.clone().lerp(K, 0.3), K, 0.8 * R.thigh[6]],
    shin: [K, A, 0.8 * R.shin[4]],
    foot: [A, B.clone().addScaledVector(B.clone().sub(A), 0.45), 0.04],
  };
}
export function legsClear(T) {
  const L = legCaps(T, 'Left'), Rr = legCaps(T, 'Right');
  let worst = Infinity, where = '';
  for (const a of ['thigh', 'shin', 'foot']) for (const b of ['thigh', 'shin', 'foot']) {
    if (a === 'thigh' && b === 'foot' || a === 'foot' && b === 'thigh') continue;
    const g = segDist(L[a][0], L[a][1], Rr[b][0], Rr[b][1]) - L[a][2] - Rr[b][2];
    if (g < worst) { worst = g; where = `${a}/${b}`; }
  }
  return { gap: worst, where };
}
// Куда смотрит колено: сгиб (колено от линии таз → щиколотка) по горизонтали против носка, градусы, + — внутрь.
// Не kneeIn из poses.js: тот меряет колено от щиколотки и в широкой стойке с наклонной голенью видит «внутрь» там,
// где колено смотрит ровно по носку.
export function kneeDir(T, s, toeYaw) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), K = w(rig, s + 'Leg'), A = w(rig, s + 'Foot'), d = A.clone().sub(H).normalize();
  const b = K.clone().sub(H); b.addScaledVector(d, -b.dot(d)).setY(0);
  const toe = yawV(toeYaw), y = new THREE.Vector3().crossVectors(toe, b).y;
  return -rad(Math.atan2(y, toe.dot(b))) * sgn(s);
}
const NAME = { thigh: 'бедро', shin: 'голень', foot: 'стопа' };
// Опорная стопа: не скользит (щиколотка и подушечка в своей стоянке, 2 см), не висит и не проваливается (подушечка
// у пола 1,5 см, у плоской стопы щиколотка 1 см), колено опорной ноги не внутрь от носка больше 10° при сгибе от 25°.
// Ноги не проходят друг сквозь друга (зазор капсул не меньше −1 см: кожа мягкая).
export function footAudit(T, r) {
  const { rig } = T, g = T.gait;
  let slide = 0;
  for (const s of SIDES) {
    const f = g.f[s], A = w(rig, s + 'Foot'), Bl = w(rig, s + 'ToeBase'), L = s[0];
    if (!f.planted) { r.m['lift' + L] = cm(Math.min(A.y - T.ball[s].ankleY, Bl.y - T.ball[s].y)); continue; }
    const dBall = Math.hypot(Bl.x - f.ball.x, Bl.z - f.ball.z), dAnk = Math.hypot(A.x - f.x, A.z - f.z);
    const sl = f.toe > 0.02 ? dBall : Math.max(dBall, dAnk);
    slide = Math.max(slide, sl); r.m['slide' + L] = cm(sl);
    if (sl > 0.02) r.bad.push(`${ruSide(s, true)} опорная стопа скользит (${cm(sl)} см)`);
    const by = Bl.y - T.ball[s].y; r.m['ballY' + L] = cm(by);
    if (by > 0.015) r.bad.push(`${ruSide(s, true)} стопа висит над полом (${cm(by)} см)`);
    if (by < -0.015) r.bad.push(`${ruSide(s, true)} стопа в полу (${cm(by)} см)`);
    if (f.toe < 0.02) {
      const ay = A.y - T.ball[s].ankleY; r.m['heelY' + L] = cm(ay);
      if (Math.abs(ay) > 0.01) r.bad.push(`${ruSide(s, true)} пятка не на полу (${cm(ay)} см)`);
    }
    const hip = w(rig, s + 'UpLeg'), knee = w(rig, s + 'Leg'), bend = rad(knee.clone().sub(hip).angleTo(A.clone().sub(knee)));
    if (bend > 25) {
      const kin = kneeDir(T, s, f.yaw); r.m['kneeIn' + L] = Math.round(kin);
      if (kin > 10) r.bad.push(`${ruSide(s)} колено завалено внутрь: ${Math.round(kin)}°`);
    }
  }
  r.m.slide = cm(slide);
  const c = legsClear(T); r.m.legGap = cm(c.gap);
  if (c.gap < -0.01) { const [a, b] = c.where.split('/'); r.bad.push(`ноги проходят друг сквозь друга: левая ${NAME[a]} и правая ${NAME[b]} (${cm(c.gap)} см)`); }
  return r;
}
// Общие проверки тела (стопы — свои, по стоянкам, а не по эталону начала цикла) плюс проверки ног.
export const legAudit = (T, opt = {}) => footAudit(T, baseAudit(T, { feet: [], ...opt }));
