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
import { deg, rad, lerp, clamp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, trunk, placeHips, look, armIK, baseAudit, UP } from './poses.js';
import { footAlong } from './kneel.js';
import { setGait, gaitReady, gaitParams, gaitPose, swingLeg } from '../mocap.js';
import gaitJson from '../../public/anim/gait.json' with { type: 'json' }; // статически: сборка тренера живёт под /trainer-app/, fetch по /anim/ туда не попадает

if (!gaitReady()) setGait(gaitJson); // prep правит объект на месте: один раз

export const mod = (t, P) => ((t % P) + P) % P;
const yawV = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); // носок по углу

// ---------- Бег и ходьба по мокапу (24.11.2026) ----------
// Клипы Walking и Running Meshy (public/anim/gait.json, src/mocap.js): руки, нога в махе и качание таза. Стоянки стоп
// остаются по сценарию упражнения: скольжения нет по построению.
// Фаза по касаниям: касание левой — 0, правой — 0,5, между ними равномерно. Так руки симметричны при любой доле
// опоры в сценарии (по доле опоры клипа на беге на месте с опорой 50 % правая рука стояла сзади втрое дольше левой).
// lands — [[секунда цикла, 'Left' | 'Right'], …], P — цикл.
export function landPhase(lands, P, t) {
  const L = lands.map(([a, s]) => [mod(a, P), s]).sort((x, y) => x[0] - y[0]), n = L.length;
  t = mod(t, P);
  let i = n - 1; for (let k = 0; k < n; k++) if (L[k][0] <= t) i = k;
  const [a, s] = L[i], [b, s2] = L[(i + 1) % n], span = mod(b - a, P) || P, from = s === 'Left' ? 0 : 0.5;
  return from + (s2 === s ? 1 : 0.5) * (mod(t - a, P) / span);
}
// Параметры клипа на скорости v (м/с) под ногу модели.
export const runParams = (T, v) => gaitParams(v, T.rig.L1 + T.rig.L2);
// Руки клипа на фазе ph как ключ jump.arms / Rig.pose (оси скелета: x влево, z вперёд). lean — насколько корпус
// упражнения наклонён вперёд сильнее клипа, градусы: руки поворачиваются вместе с ним.
export function runArmKey(ph, p, lean = 0) {
  // Плечо клипа ходит от 44° вперёд до 92° назад (в среднем 24° назад): у спринтера Meshy рука назад почти до горизонтали,
  // за пределом плеча нашей проверки. Сдвигаем мах вперёд на 25°, размах тот же.
  const g = gaitPose(ph, p), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg(Math.max(0, lean) - 25));
  const o = { gp: g };
  for (const k of ['rUp', 'rFo', 'lUp', 'lFo']) o[k] = g[k].clone().applyQuaternion(q);
  // Мах назад мягко ограничен 40° (дальше 30 % хода): плечо человека назад от корпуса на подъёме 50–60° уходит на ~50°.
  for (const c of ['r', 'l']) {
    const u = o[c + 'Up'], b = rad(Math.atan2(-u.z, -u.y)), lim = 40;
    if (b <= lim) continue;
    const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -deg(0.7 * (b - lim)));
    o[c + 'Up'] = u.clone().applyQuaternion(r); o[c + 'Fo'] = o[c + 'Fo'].clone().applyQuaternion(r);
  }
  // Локоть около 90°: у клипа на краях маха 64–121°, после ослабления размаха (трусца) ещё дальше от прямого угла.
  for (const c of ['r', 'l']) {
    const up = o[c + 'Up'], fo = o[c + 'Fo'], a = up.angleTo(fo), lim = clamp(a, deg(75), deg(105));
    if (Math.abs(a - lim) < 1e-4) continue;
    const ax = new THREE.Vector3().crossVectors(up, fo);
    if (ax.lengthSq() > 1e-8) o[c + 'Fo'] = up.clone().applyAxisAngle(ax.normalize(), lim);
  }
  return o;
}
// Смесь двух ключей рук (направления), k — доля второго.
export const mixArms = (a, b, k) => {
  const o = { ...a };
  for (const n of ['rUp', 'rFo', 'lUp', 'lFo']) o[n] = a[n].clone().lerp(b[n], k).normalize();
  return o;
};
// Летящая стопа идёт за голенью с подошвенным сгибом (Rig.legs держит её плоско, как на полу): k — доля.
export function footFollowShin(T, s, k, plant = 0.35) {
  if (k <= 0) return;
  const { rig } = T, foot = rig.b[s + 'Foot'], q0 = foot.getWorldQuaternion(new THREE.Quaternion());
  rig.setWorld(foot, q0.slerp(footAlong(T, s, w(rig, s + 'Foot').sub(w(rig, s + 'Leg')), plant), k));
}
// Где середина тазобедренных и сам сустав стороны s в секунду t по сценарию (стопы по старым дугам: без рекурсии).
function hipAt(T, S, t, s) {
  const b = S.curve(t), a = deg(b.yaw), c = centerAt(T, S, t, b);
  return new THREE.Vector3(c.x, b.y, c.z).add(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(sgn(s) * T.hipHalf));
}
// Середина таза на полу: по пути S.at (бег настоящим темпом: таз идёт ровно, а не посередине между стопами в полёте),
// без пути — середина стоп. dx, dz ключа тела прибавляются в обоих случаях.
function centerAt(T, S, t, b, f) {
  if (S.way) { const c = S.way(t); return { x: c.x + b.dx, z: c.z + b.dz }; }
  const L = f?.Left ?? footAt(T, 'Left', S, t), R = f?.Right ?? footAt(T, 'Right', S, t);
  return { x: (L.x + R.x) / 2 + b.dx, z: (L.z + R.z) / 2 + b.dz };
}
// Щиколотка ноги s в махе прямой кинематикой клипа: доля маха u, тело в секунду tt.
function fkAnkle(T, S, s, u, tt, p) {
  const { th, sh } = swingLeg(u, p), q = new THREE.Quaternion().setFromAxisAngle(UP, deg(S.curve(tt).yaw));
  if (s === 'Right') { th.x = -th.x; sh.x = -sh.x; }
  return hipAt(T, S, tt, s).addScaledVector(th.applyQuaternion(q), T.rig.L1).addScaledVector(sh.applyQuaternion(q), T.rig.L2);
}
// Нога в махе по клипу: от сустава бедром и голенью клипа, поправки «откуда оторвалась» (гаснет к трети маха) и
// «куда встанет» (растёт со середины) — как в игре (player.legFK). Возвращает { x, z, lift } для Rig.legs.
function swingFoot(T, S, s, f, t, p) {
  const { A, b, t0, t1 } = f.fl, u = f.u, ah = T.rig.ankleH;
  const c0 = new THREE.Vector3(A.x, ah, A.z).sub(fkAnkle(T, S, s, 0, t0, p));
  const c1 = new THREE.Vector3(b.x, ah, b.z).sub(fkAnkle(T, S, s, 1, t1, p));
  const P = fkAnkle(T, S, s, u, t, p).addScaledVector(c0, 1 - smooth(clamp(u / 0.33, 0, 1))).addScaledVector(c1, smooth(clamp((u - 0.5) / 0.5, 0, 1)));
  return { x: P.x, z: P.z, lift: Math.max(0, P.y - ah) };
}

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
  const plants = { Left: [], Right: [] }, body = [], way = [];
  for (const s of SIDES) plants[s].push({ on: 0, ...start[s] });
  const S = {
    P, plants, body,
    step(s, lift, land, x, z, yaw, extra = {}) { const L = plants[s]; L[L.length - 1].off = lift; L.push({ on: land, x, z, yaw, ...extra }); return S; },
    key(t, o) { body.push([t, o]); return S; },
    // Путь таза по полу: узлы (секунда, x, z), между ними кривая; два одинаковых узла подряд — стоит.
    at(t, x, z) { way.push([t, { x, z }]); return S; },
    // Бег настоящим темпом (24.11.2026). Лёва про первую версию: «там не бег, там какая-то ходьба». Сценарии ставили
    // три-четыре шага по 0,5 м руками, быстрее 2,5 м/с тело шло 0,2–0,4 с из цикла. Здесь шаги раскладываются сами:
    // таз идёт по прямой от from по курсу yaw, скорость по отрезкам segs [[путь, скорость в конце, вынос стопы], …]
    // равноускоренно; частота шагов и опора — как у людей на скорости (gaitParams, не медленнее cadence м/с),
    // стопа встаёт впереди таза на долю опорного пути (вынос: разгон 0,2, ровный бег 0,35, торможение 0,6),
    // между опорами полёт. Возвращает, где и когда всё кончилось, и какой ноге шагать дальше.
    run({ side, t0, from, yaw = 0, v0 = 0, segs, L, half = 0.09, first = 0.2, cadence = 3.3, push = 0.4, back = 0.3, front = 0.35 }) {
      const d = yawV(yaw), lat = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const parts = []; let v = v0, tt = t0, ss = 0;
      for (const [dist, v1, ahead] of segs) {
        const a = (v1 * v1 - v * v) / (2 * dist), dur = Math.abs(a) < 1e-6 ? dist / v : (v1 - v) / a;
        parts.push({ t: tt, s: ss, v, a, dur, ahead }); tt += dur; ss += dist; v = v1;
      }
      const end = tt, st = (t) => { const q = parts.findLast((r) => t >= r.t) ?? parts[0], u = clamp(t - q.t, 0, q.dur); return { s: q.s + q.v * u + q.a * u * u / 2, v: q.v + q.a * u, a: q.a, ahead: q.ahead }; };
      const pos = (s, k = 0) => [from[0] + d.x * s + lat.x * k, from[1] + d.z * s + lat.z * k];
      for (const q of parts) S.at(q.t, ...pos(q.s));
      let tl = t0 + first, prev = null; const steps = [];
      while (tl < end - 0.08) {
        const c = st(tl), p = gaitParams(Math.max(c.v, cadence), L), k = clamp(c.v / cadence, 0, 1);
        if (c.a < 0 && c.v < 1) break; // на остановке приставные шаги ставит упражнение
        // Опора: полшага минус полёт, но стопа остаётся позади таза не дальше back и встаёт впереди не дальше front —
        // дальше нога не достаёт (на спринте опора 0,1 с).
        const ah = c.ahead ?? 0.35, fly = Math.max(0, 0.5 * p.T - p.duty * p.T) * k;
        let hold = 0.5 * p.T - fly; const lim = Math.min(back / (1 - ah), front / ah), go = (h) => st(tl + h).s - c.s; // путь тела за опору h
        for (let i = 0; i < 4 && go(hold) > lim; i++) hold *= lim / go(hold);
        const travel = go(hold);
        const own = plants[side][plants[side].length - 1];
        const lift = prev == null ? t0 : Math.max(own.on + 0.08, own.hold ? own.on + own.hold : prev - fly);
        const [x, z] = pos(c.s + travel * ah, sgn(side) * half);
        S.step(side, lift, tl, x, z, yaw, { push, hold }); S.at(tl, ...pos(c.s));
        steps.push({ side, t: tl, v: c.v }); prev = tl; side = side === 'Left' ? 'Right' : 'Left'; tl += 0.5 * p.T;
      }
      const e = pos(ss); S.at(end, ...e);
      if (v < 1.2) { // остановка: приставить обе стопы в стойку у конца пути
        let t = prev + 0.14;
        for (const sd of [side, side === 'Left' ? 'Right' : 'Left']) {
          const own = plants[sd][plants[sd].length - 1], lift = Math.max(own.on + (own.hold ?? 0.1), t - 0.3); // не держать стопу позади: тело уже ушло
          t = Math.max(t, lift + 0.16); S.step(sd, lift, t, ...pos(ss + 0.02, sgn(sd) * half), yaw, { h: 0.04 }); t += 0.2;
        }
        S.at(t, ...e);
        return { t: t - 0.2, x: e[0], z: e[1], side, last: prev, steps };
      }
      return { t: end, x: e[0], z: e[1], side, last: prev, steps };
    },
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
      if (way.length) { way.sort((a, b) => a[0] - b[0]); S.way = curve(way.filter((k, i) => !i || k[0] - way[i - 1][0] > 1e-6), P); }
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
    const tt = t >= p.on ? t : t + P;
    return { planted: true, k, lift: 0, left: p.off - tt, stance: p.off - p.on, ...plantPose(T, s, S, p, tt) };
  }
  // В полёте: между стоянкой k (оторвалась в off) и k + 1 (встанет в on).
  for (let k = 0; k < n; k++) {
    const a = plan[k], b = plan[(k + 1) % n], end = k + 1 < n ? b.on : b.on + P;
    let t0 = a.off, tt = t;
    if (tt < t0) tt += P;
    if (tt > end) continue;
    const u = clamp((tt - t0) / (end - t0), 0, 1);
    const e = smooth(u), br = Math.sin(Math.PI * u), A = plantPose(T, s, S, a, a.off);
    const x = lerp(A.x, b.x, e) + (b.arc?.x ?? 0) * br, z = lerp(A.z, b.z, e) + (b.arc?.z ?? 0) * br;
    return { planted: false, k: -1, x, z, yaw: lerp(A.yaw, b.yaw, e), toe: 0, lift: (b.h ?? 0.06) * br, u, fl: { A, b, t0, t1: end } };
  }
  throw new Error(`${s}: дыра в расписании стоп на ${t.toFixed(2)} с`);
}

// Поза в секунду t по сценарию S. Возвращает состояние для проверки и для своих добавок упражнения (руки, взгляд).
export function gait(T, S, t, opt = {}) {
  const { rig } = T, b = S.curve(t), f = {};
  for (const s of SIDES) f[s] = footAt(T, s, S, t);
  // Мокап: gait — доля ноги в махе и качания таза по клипу (0 — старая дуга), run — доля рук клипа, v — скорость (м/с)
  // для выбора клипа и размаха: шаг ~1,4, трусца ~3, разгон 4–5.
  const gw = clamp(b.gait ?? 0, 0, 1), run = clamp(b.run ?? 0, 0, 1);
  const p = runParams(T, b.v ?? S.speed ?? 3.5), ph = landPhase(S.lands ??= SIDES.flatMap((s) => S.plants[s].map((q) => [q.on, s])), S.P, t);
  const yaw = deg(b.yaw), q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const gp = gaitPose(ph, p);
  stand(T, 0, 0, 0, q);
  const hips = b.hips + gp.hips * Math.max(gw, run), kk = key({ hips, torso: b.torso + 0.8 * gp.torso * Math.max(gw, run), ...(opt.key ?? {}) });
  trunk(T, kk, b.elev);
  const ft = { crouch: 0 };
  for (const s of SIDES) {
    if (!f[s].planted && gw > 0) { // нога в махе по клипу: колено вверх, пятка к ягодице, а не синус над полом
      const m = swingFoot(T, S, s, f[s], t, p);
      f[s].x = lerp(f[s].x, m.x, gw); f[s].z = lerp(f[s].z, m.z, gw); f[s].lift = lerp(f[s].lift, m.lift, gw);
    }
    // Перекат: к отрыву опорная встаёт на подушечку (шаг — последние 55 % опоры, не дольше 0,45 с: пятка у живого отрывается с середины опоры; бег — 40 %, 0,3 с), а не тянется пяткой
    // по полу за уехавшим тазом — иначе Rig.legs сам поднимает пятку и щиколотка едет. Пятка не выше 0,4 (3 см): выше
    // Rig.legs приближённо крутит стопу и подушечка отрывается от пола на 1,5–2 см.
    else if (f[s].planted && gw > 0) { const r = Math.min(lerp(0.45, 0.3, p.run), f[s].stance * lerp(0.55, 0.4, p.run)); f[s].toe = Math.max(f[s].toe, gw * 0.4 * smooth(clamp(1 - f[s].left / r, 0, 1))); }
    ft[s] = { pos: new THREE.Vector3(f[s].x, 0, f[s].z), lift: f[s].lift, yaw: f[s].yaw - yaw - 0.55 * deg(hips), toe: f[s].toe };
  }
  const { x: mx, z: mz } = centerAt(T, S, t, b, f);
  const bob = gp.hipH * (rig.ankleH + 0.975 * (rig.L1 + rig.L2)) * gw * lerp(0.5, 1, p.run); // на шаге половина: у Meshy щиколотка высоко, задняя нога иначе не достаёт пола // таз выше в полёте и в середине шага, ниже в опоре бега
  placeHips(T, new THREE.Vector3(mx, b.y + bob - (opt.dy ?? 0), mz), ft);
  for (const s of SIDES) if (!f[s].planted) footFollowShin(T, s, gw * Math.sin(Math.PI * f[s].u) ** 0.7, lerp(0.15, 0.45, p.run));
  rig.root.updateMatrixWorld(true);
  const face = yawV(yaw + deg(b.torso)), side = new THREE.Vector3(face.z, 0, -face.x); // side — влево от тела (+X при yaw 0)
  look(T, opt.lookAt ?? w(rig, 'Head').setY(1.2).addScaledVector(face, 5));
  // Руки: в стойке кисти перед животом, локти согнуты и смотрят вниз-наружу; на бегу — клип: запястье в точку клипа,
  // локоть в сторону плеча клипа (двухзвенная кинематика даёт тот же сгиб).
  const toWorld = rig.root.getWorldQuaternion(new THREE.Quaternion()), lean = 0.5 * (90 - b.elev - 8); // 8° — средний наклон бега клипа; руки поворачиваются с корпусом наполовину: целиком мах назад выходит за предел плеча
  const ak = runArmKey(ph, p, lean);
  for (const s of SIDES) {
    if (opt.skipArm === s) continue;
    const Sh = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s], c = s[0].toLowerCase();
    let W = Sh.clone().addScaledVector(UP, -0.25).addScaledVector(face, 0.36).addScaledVector(side, -sgn(s) * 0.03);
    let pole = UP.clone().negate().addScaledVector(side, sgn(s) * 0.5).addScaledVector(face, -0.4);
    if (run > 0) {
      const up = ak[c + 'Up'].clone().applyQuaternion(toWorld), fo = ak[c + 'Fo'].clone().applyQuaternion(toWorld);
      W.lerp(Sh.clone().addScaledVector(up, L1).addScaledVector(fo, L2), run);
      pole.lerp(up.clone().addScaledVector(side, sgn(s) * 0.15), run);
    }
    if (b.hang) W.lerp(Sh.clone().addScaledVector(UP, -0.5).addScaledVector(face, 0.08).addScaledVector(side, sgn(s) * 0.05), b.hang); // отдых: руки висят
    armIK(T, s, W, pole);
    rig.relaxHand(s); rig.grip(s, 0.45);
  }
  T.gait = { f, b, yaw, t, P: S.P, p, ph, gw, run, ak, S };
  T.runInfo = { run, ak, face, elev: b.elev };
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
  // Бег и ходьба по клипу: нога в махе складывается, таз не в полуприседе посреди опоры.
  // Пороги по клипам (test-out/run/clip.mjs): пик сгиба колена в махе — бег 149°, трусца в показе ~95–110°, шаг 77°;
  // таз в середине опоры бега 0,94–0,96 стойки (около 0,9 длины ноги над щиколоткой), шага — выше стойки.
  if (g.gw > 0.7) {
    const L = rig.L1 + rig.L2, runny = g.p.run > 0.5;
    for (const s of SIDES) {
      const f = g.f[s], o = g.f[s === 'Left' ? 'Right' : 'Left'];
      const c = lerp(0.22, 0.5, g.p.run); // пик сгиба в махе: у шага в начале маха (клип: u ≈ 0,1–0,35), у бега в середине
      if (!f.planted && Math.abs(f.u - c) < 0.13 && Math.hypot(f.fl.b.x - f.fl.A.x, f.fl.b.z - f.fl.A.z) > 0.3) { // переступ на развороте — не шаг
        const k = r.m['knee' + s[0]], lim = runny ? 75 : 40; r.m.swingKnee = k;
        if (k < lim) r.bad.push(`${ruSide(s)} колено в махе почти прямое: ${k}° (на ${runny ? 'бегу' : 'шаге'} от ${lim}°)`);
      }
      if (!g.S.low && f.planted && !o.planted && o.u > 0.3 && o.u < 0.7) { // S.low — игровая стойка (скрестный шаг, выход к мячу): таз низко законно
        const h = (mid(rig, 'LeftUpLeg', 'RightUpLeg').y - rig.ankleH) / L, lim = runny ? 0.88 : 0.9; r.m.hipMid = +h.toFixed(3);
        if (h < lim) r.bad.push(`таз в полуприседе посреди опоры: ${h.toFixed(2)} длины ноги (от ${lim})`);
      }
    }
  }
  runArmAudit(T, r);
  const c = legsClear(T); r.m.legGap = cm(c.gap);
  if (c.gap < -0.01) { const [a, b] = c.where.split('/'); r.bad.push(`ноги проходят друг сквозь друга: левая ${NAME[a]} и правая ${NAME[b]} (${cm(c.gap)} см)`); }
  return r;
}
// Руки на бегу (T.runInfo ставят gait, warmup.inPlace и упражнения с разбегом): сгиб локтя 70–110° (клип бега 64–121°,
// в среднем 95°; у трусцы размах 65 %, крайние уходят внутрь), на махе назад кисть у линии тазобедренных или позади (до 3 см
// впереди) — когда плечо клипа (после сдвига вперёд, runArmKey) ушло назад на 30° и больше; корпус почти прямой, иначе
// плечо само впереди таза. Было: кисти сцеплены перед животом, на «беге» ходили ±20 см перед корпусом.
export function runArmAudit(T, r) {
  const R = T.runInfo, { rig } = T;
  if (!R || R.run < 0.9) return r; // переход из стойки в мах — не бег
  const hip = mid(rig, 'LeftUpLeg', 'RightUpLeg');
  for (const s of SIDES) {
    const e = r.m['elbow' + s[0]] ?? rig.audit()[s].elbow, c = s[0].toLowerCase();
    if (e < 70 || e > 110) r.bad.push(`${ruSide(s, true)} рука на бегу: локоть ${e}° (70–110°)`);
    if (R.ak[c + 'Up'].z < -0.5 && R.elev > 70) { // плечо клипа на 30° и больше назад: крайняя точка маха
      const d = w(rig, s + 'Hand').sub(hip).dot(R.face); r.m['handBack' + s[0]] = cm(d);
      if (d > 0.03) r.bad.push(`${ruSide(s, true)} кисть на махе назад перед бедром (${cm(d)} см)`);
    }
  }
  return r;
}
// Общие проверки тела (стопы — свои, по стоянкам, а не по эталону начала цикла) плюс проверки ног.
export const legAudit = (T, opt = {}) => footAudit(T, baseAudit(T, { feet: [], ...opt }));
