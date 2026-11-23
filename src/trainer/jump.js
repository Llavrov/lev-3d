// Прыжки и шаги для упражнений на работу ног (сплит-степ, боковые прыжки, торможение в выпад, баланс), 23.11.2026.
// Поза — функция секунды цикла: стопы по расписанию опор (стоит или летит по дуге), таз по ключам, полёт по параболе,
// руки в игровой стойке с махом. Проверка: опорная подушечка не скользит от момента постановки, стоит на полу,
// в полёте обе стопы над полом, приземление на согнутое колено, колено не внутрь.
import * as THREE from 'three';
import { V, lerp, clamp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, trunk, placeHips, kneeOverToe, look, baseAudit } from './poses.js';

export const mod = (t, P) => ((t % P) + P) % P;
export const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
export const ss = (t, a, b) => smooth(seg(t, a, b));
export const hop = (u) => 4 * u * (1 - u); // парабола полёта: 0 → 1 → 0
export const other = (s) => (s === 'Left' ? 'Right' : 'Left');
const P3 = (x, z) => new THREE.Vector3(x, 0, z);

// Руки в игровой стойке: плечо вниз и чуть наружу, локоть согнут на bend°, кисти перед собой.
// a — мах плеча вперёд (+) или назад (−), градусы, у каждой руки свой; out — насколько локти наружу.
export function arms({ r = 0, l = 0, out = 0.2, bend = 95, inward = 0.15, fwd = 15 } = {}) {
  const up = (x, a) => V(x, -Math.cos(a), Math.sin(a)), fo = (x, a) => V(x, -Math.cos(a), Math.sin(a));
  const ra = ((r + fwd) * Math.PI) / 180, la = ((l + fwd) * Math.PI) / 180, b = (bend * Math.PI) / 180;
  return { rUp: up(out, ra), rFo: fo(-inward, ra + b), lUp: up(-out, la), lFo: fo(inward, la + b) };
}

// Кривая по ключам [[t, {поле: число}], …] на цикле P: кубическая, касательная по соседям, на экстремуме ноль
// (таз не перелетает ключ). Ключи по возрастанию времени, первый в 0; цикл замыкается сам.
export function track(keys, P) {
  const n = keys.length, ext = [];
  for (let k = -2; k < n + 2; k++) { const j = mod(k, n); ext.push([keys[j][0] + Math.floor(k / n) * P, keys[j][1]]); }
  const names = Object.keys(keys[0][1]);
  return (t) => {
    t = mod(t, P);
    let i = 2;
    while (i < n + 1 && ext[i + 1][0] <= t) i++;
    const [T0, a] = ext[i - 1], [T1, b] = ext[i], [T2, c] = ext[i + 1], [T3, d] = ext[i + 2], dt = T2 - T1;
    const u = clamp((t - T1) / dt, 0, 1), u2 = u * u, u3 = u2 * u, out = {};
    for (const f of names) {
      const tan = (pa, pb, pc, ta, tc) => ((pb - pa) * (pc - pb) <= 0 ? 0 : ((pc - pa) / (tc - ta)) * dt);
      const m1 = tan(a[f], b[f], c[f], T0, T2), m2 = tan(b[f], c[f], d[f], T1, T3);
      out[f] = (2 * u3 - 3 * u2 + 1) * b[f] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * c[f] + (u3 - u2) * m2;
    }
    return out;
  };
}

// Стопа по расписанию опор на цикле P: plants — [{ a, b, x, z, yaw }] по времени (a..b — стоит; b может выйти за P,
// тогда стоянка продолжается в начале следующего цикла). Между стоянками стопа летит дугой высотой h (h у следующей
// стоянки, по умолчанию 8 см). Возвращает ступню для Rig.legs и { planted, t0 } для проверки.
export function footAt(plants, P, t, h0 = 0.08) {
  t = mod(t, P);
  const n = plants.length;
  for (const p of plants) {
    if (t >= p.a && t <= p.b) return { pos: P3(p.x, p.z), lift: 0, yaw: p.yaw ?? 0, planted: true, t0: p.a };
    if (p.b > P && t + P <= p.b) return { pos: P3(p.x, p.z), lift: 0, yaw: p.yaw ?? 0, planted: true, t0: p.a - P };
  }
  // в воздухе: между последней стоянкой, что кончилась до t, и следующей
  let k = n - 1;
  for (let i = 0; i < n; i++) if (plants[i].b <= t) k = i;
  const A = plants[k], B = plants[(k + 1) % n], bEnd = A.b > t ? A.b - P : A.b, bOn = B.a < bEnd ? B.a + P : B.a;
  const u = seg(t, bEnd, bOn), e = smooth(u), h = B.h ?? h0;
  return { pos: P3(lerp(A.x, B.x, e), lerp(A.z, B.z, e)), lift: h * Math.sin(Math.PI * u), yaw: lerp(A.yaw ?? 0, B.yaw ?? 0, e), planted: false, u };
}

// Поза стоя или в полёте. M — середина тазобедренных (мир), ft — ступни { Left, Right } для Rig.legs (pos, lift, yaw, toe),
// el — корпус над горизонталью, arm — ключ рук (arms), knees — опорные ноги, колено которых довести до линии носка.
export function body(T, { M, ft, el = 76, arm = arms(), knees = [], grip = 0.5 }) {
  const { rig } = T;
  stand(T);
  trunk(T, key(arm), el);
  placeHips(T, M, { ...ft, crouch: 0 });
  for (const s of knees) kneeOverToe(T, s, ft[s].yaw ?? 0);
  // Взгляд вперёд чуть вниз. Шея в линию спины у этой модели задирает лицо на 20–30° (шейная кость в покое
  // наклонена вперёд), поэтому кивок до 35°: с пределом 10° лицо смотрело в потолок.
  look(T, M.clone().add(new THREE.Vector3(0, 0.45, 4)), 35);
  for (const s of SIDES) { rig.relaxHand(s); rig.grip(s, grip); }
}

// Пол один раз: подушечка и щиколотка в спокойной стойке (от них «стоит» и «висит»).
export function measureFloor(T) {
  const { rig } = T;
  body(T, { M: new THREE.Vector3(0, rig.ankleH + 0.975 * (rig.L1 + rig.L2), 0),
    ft: { Left: { pos: P3(T.hipHalf, 0), lift: 0, yaw: 0 }, Right: { pos: P3(-T.hipHalf, 0), lift: 0, yaw: 0 } } });
  T.floor = { toe: w(rig, 'LeftToeBase').y, ank: w(rig, 'LeftFoot').y };
}

// Колено внутрь (вальгус), градусы, + — внутрь: куда согнуто колено от линии таз → щиколотка против линии носка,
// обе в плоскости поперёк ноги. Горизонтальная мера kneeIn (poses.js) у отведённой ноги (стопа шире таза) врёт:
// колено там законно левее щиколотки, хотя смотрит по носку.
export function valgus(rig, s, yaw) {
  const hip = w(rig, s + 'UpLeg'), ank = w(rig, s + 'Foot'), ax = ank.clone().sub(hip).normalize();
  const perp = (v) => v.addScaledVector(ax, -v.dot(ax));
  const b = perp(w(rig, s + 'Leg').sub(hip)), toe = perp(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))).normalize();
  const out = perp(new THREE.Vector3(sgn(s), 0, 0)); out.addScaledVector(toe, -out.dot(toe)).normalize();
  return THREE.MathUtils.radToDeg(Math.atan2(-b.dot(out), b.dot(toe)));
}
const kneeAngle = (rig, s) => Math.round(THREE.MathUtils.radToDeg(w(rig, s + 'Leg').sub(w(rig, s + 'UpLeg')).angleTo(w(rig, s + 'Foot').sub(w(rig, s + 'Leg')))));

// Проверка ног. st — что ex.feet(t) сказал про стопы в момент t: { Left: { planted, t0, yaw, land? }, Right: … },
// land — стопа в первых долях секунды после приземления (колено обязано быть согнуто). Опорную стопу сверяем
// с ней же в момент постановки t0: позу ставим заново на t0, потом возвращаем на t.
export function legAudit(T, ex, t, opt = {}) {
  const { rig } = T, r = baseAudit(T, { feet: [], back: opt.back }), st = ex.feet(T, t);
  const at = {};
  for (const s of SIDES) if (st[s].planted) at[s] = w(rig, s + 'ToeBase');
  const back = {};
  for (const s of SIDES) if (st[s].planted && st[s].t0 < t - 1e-3) { ex.pose(T, { t: st[s].t0 }); back[s] = w(rig, s + 'ToeBase'); }
  if (Object.keys(back).length) ex.pose(T, { t });
  const air = SIDES.every((s) => !st[s].planted);
  for (const s of SIDES) {
    const toe = w(rig, s + 'ToeBase'), ank = w(rig, s + 'Foot'), k = kneeAngle(rig, s), S = s[0];
    if (st[s].planted) {
      const d = back[s] ? Math.hypot(at[s].x - back[s].x, at[s].z - back[s].z) : 0;
      r.m['slide' + S] = cm(d);
      if (d > 0.02) r.bad.push(`${ruSide(s, true)} опорная стопа скользит: ${cm(d)} см`);
      const dy = toe.y - T.floor.toe;
      r.m['toeY' + S] = cm(dy);
      if (dy > 0.015) r.bad.push(`${ruSide(s, true)} стопа висит над полом: ${cm(dy)} см`);
      if (dy < -0.015 || ank.y < T.floor.ank - 0.01) r.bad.push(`${ruSide(s, true)} стопа в полу: ${cm(Math.min(dy, ank.y - T.floor.ank))} см`);
      if (st[s].land && k < 25) r.bad.push(`${ruSide(s, true)} нога приземляется прямой: колено ${k}°`);
      if (k >= 25) {
        const inward = valgus(rig, s, st[s].yaw ?? 0);
        r.m['kneeIn' + S] = Math.round(inward);
        if (inward > 10) r.bad.push(`${ruSide(s)} колено заваливается внутрь: ${Math.round(inward)}°`);
      }
    } else if (!(st[s].u < 0.03 || st[s].u > 0.97)) { // в миг отрыва и касания стопа законно у пола
      const clear = Math.min(toe.y - T.floor.toe, ank.y - T.floor.ank);
      r.m['clear' + S] = cm(clear);
      if (clear < (air ? 0.01 : 0.003)) r.bad.push(`${ruSide(s, true)} стопа в воздухе задевает пол: ${cm(clear)} см`);
    }
  }
  const hq = rig.b.Head.getWorldQuaternion(new THREE.Quaternion()), face = T.face.clone().applyQuaternion(hq);
  r.m.gaze = Math.round(THREE.MathUtils.radToDeg(Math.asin(face.y)));
  if (r.m.gaze > 8 || r.m.gaze < -25) r.bad.push(`взгляд ${r.m.gaze > 0 ? 'вверх' : 'в пол'}: ${r.m.gaze}°`);
  r.m.air = air;
  return r;
}
// Таз ровно: линия тазобедренных к горизонту, градусы.
export const pelvisTilt = (rig) => {
  const d = w(rig, 'LeftUpLeg').sub(w(rig, 'RightUpLeg'));
  return +THREE.MathUtils.radToDeg(Math.atan2(Math.abs(d.y), Math.hypot(d.x, d.z))).toFixed(1);
};
export { P3 };
