// Полёт мяча: тяжесть, сопротивление воздуха, эффект Магнуса (кручёный ныряет вниз), отскок от грунта и сетка.
// Корт: z = 0 сетка, Лёва на стороне z > 0, соперник на z < 0.
import * as THREE from 'three';
import { COURT } from './court.js';

export const BALL_R = 0.0335;
const G = 9.81, DRAG = 0.019, MAGNUS = 0.0009;
// Грунт: упругость по вертикали и трение. Трение тормозит мяч и раскручивает его, пока тот не покатится;
// кручёный проскальзывает меньше — сохраняет скорость, резаный больше — тормозит и стелется.
const BOUNCE = 0.7, FRICTION = 0.62;
const HALF_SINGLE = COURT.single / 2, HALF_LEN = COURT.len / 2, POST = COURT.wide / 2 + 0.914;

export const netH = (x) => 0.914 + (1.07 - 0.914) * Math.min(1, (x / POST) ** 2);
export const inSingles = (p) => Math.abs(p.x) <= HALF_SINGLE + BALL_R && Math.abs(p.z) <= HALF_LEN + BALL_R;

// bounces — сколько раз мяч уже отскочил после последнего удара (ведёт игра).
export const makeBall = () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, live: false, bounces: 0 });
export const copyBall = (b) => ({ pos: b.pos.clone(), vel: b.vel.clone(), spin: b.spin, live: b.live, bounces: b.bounces ?? 0, lively: b.lively });

const UP = new THREE.Vector3(0, 1, 0), acc = new THREE.Vector3(), w = new THREE.Vector3(), hor = new THREE.Vector3();

// Шаг интегрирования. spin > 0 — верхнее вращение (кручёный), < 0 — нижнее (резаный).
// Возвращает событие: { type: 'bounce', pos } | { type: 'net' } | null.
export function step(b, dt) {
  const v = b.vel, speed = v.length();
  acc.set(0, -G, 0).addScaledVector(v, -DRAG * speed);
  hor.set(v.x, 0, v.z);
  const hl = hor.length();
  if (b.spin && hl > 1e-3) {
    w.crossVectors(UP, hor.divideScalar(hl)).multiplyScalar(b.spin); // ось вращения поперёк полёта
    acc.addScaledVector(w.cross(v), MAGNUS);
  }
  const z0 = b.pos.z;
  v.addScaledVector(acc, dt);
  b.pos.addScaledVector(v, dt);
  b.spin *= 1 - 0.05 * dt;
  let ev = null;
  if (Math.sign(z0) !== Math.sign(b.pos.z) && Math.abs(b.pos.x) < POST && b.pos.y < netH(b.pos.x) + BALL_R) {
    const cord = b.pos.y > netH(b.pos.x) - 0.03;
    if (cord && (b.rnd ?? Math.random)() < 0.5) {
      // Задел трос и перевалился: мяч гаснет и подпрыгивает над сеткой.
      v.set(v.x * 0.4, Math.abs(v.y) * 0.3 + 1.2, v.z * 0.25);
      b.pos.y = netH(b.pos.x) + BALL_R + 0.01;
      b.spin *= 0.3;
      ev = { type: 'cord' };
    } else {
      b.pos.z = Math.sign(z0) * (BALL_R + 0.02);
      v.set(v.x * 0.2, Math.min(v.y, 0) * 0.3, -v.z * 0.12);
      b.spin = 0;
      ev = { type: 'net' };
    }
  }
  if (b.pos.y < BALL_R && v.y < 0 && v.y > -0.6) { b.pos.y = BALL_R; v.y = 0; } // катится: это не отскок, звука и следа нет
  if (b.pos.y < BALL_R && v.y < 0) {
    b.pos.y = BALL_R;
    hor.set(v.x, 0, v.z);
    const sp = hor.length(), dir = sp > 1e-6 ? hor.divideScalar(sp) : hor.set(0, 0, 0);
    // Проскальзывание точки касания: скорость мяча минус скорость нижней точки от вращения.
    const e = BOUNCE * (b.lively ?? 1); // lively — новые мячи прыгают живее (outfit.js)
    const slip = sp - b.spin * BALL_R, jn = (1 + e) * Math.abs(v.y);
    const f = -Math.sign(slip) * Math.min(FRICTION * jn, 0.4 * Math.abs(slip)); // 0.4 — до качения у полого мяча
    const sp2 = Math.max(0, sp + f);
    b.spin -= 1.5 * f / BALL_R;
    const vy = Math.abs(v.y) < 0.6 ? 0 : -v.y * e;
    v.set(dir.x * sp2, vy, dir.z * sp2);
    ev = { type: 'bounce', pos: b.pos.clone() };
  }
  if (b.pos.y <= BALL_R + 1e-4 && v.y === 0) v.multiplyScalar(1 - 1.2 * dt); // катится
  return ev;
}

// Скорость вылета, чтобы мяч с данной скоростью и вращением упал в target. Подбираем угол вылета половинным делением
// (дальность растёт с углом); если не долетает даже при 40°, прибавляем скорость.
export function solveShot(from, target, speed, spin) {
  const dir = new THREE.Vector3(target.x - from.x, 0, target.z - from.z);
  const dist = dir.length(); dir.divideScalar(dist);
  const launch = (theta, s) => dir.clone().multiplyScalar(Math.cos(theta) * s).setY(Math.sin(theta) * s);
  const land = (theta, s) => {
    const b = { pos: from.clone(), vel: launch(theta, s), spin, live: true };
    for (let i = 0; i < 900; i++) {
      const ev = step(b, 1 / 200);
      if (ev?.type === 'net') return -1;
      if (ev?.type === 'bounce') return b.pos.clone().sub(from).setY(0).dot(dir);
    }
    return 1e3;
  };
  let s = speed;
  for (let k = 0; k < 6 && land(0.7, s) < dist; k++) s *= 1.15;
  let lo = -0.3, hi = 0.7;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (land(mid, s) < dist) lo = mid; else hi = mid; }
  return launch(hi, s);
}

// Свеча: угол вылета задан (выше угол — выше свеча), скорость подбираем половинным делением, чтобы мяч упал в target.
export function solveLob(from, target, theta, spin) {
  const dir = new THREE.Vector3(target.x - from.x, 0, target.z - from.z), dist = dir.length(); dir.divideScalar(dist);
  const launch = (s) => dir.clone().multiplyScalar(Math.cos(theta) * s).setY(Math.sin(theta) * s);
  const land = (s) => { const b = { pos: from.clone(), vel: launch(s), spin, live: true };
    for (let i = 0; i < 1500; i++) { const ev = step(b, 1 / 200); if (ev?.type === 'net') return -1; if (ev?.type === 'bounce') return b.pos.clone().sub(from).setY(0).dot(dir); }
    return 1e3; };
  let lo = 4, hi = 35;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (land(mid) < dist) lo = mid; else hi = mid; }
  return launch(hi);
}

// Насколько мяч разминулся с точкой за кадр (за кадр он пролетает до полуметра — ловим на всём пути).
// Промах по высоте прощаем сильнее, чем вбок: рука легко поднимает и опускает ракетку.
export function distToSegment(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
  const d = a.clone().addScaledVector(ab, t).sub(p);
  return Math.hypot(d.x, d.z, d.y * 0.6);
}
