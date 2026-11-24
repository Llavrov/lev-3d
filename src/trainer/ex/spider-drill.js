// «Паук» в настоящем темпе (24.11.2026), поочерёдно (span 2): чётный цикл — к точке справа впереди, нечётный — слева
// впереди, точки в 4 м от центра, отмечены на полу. Из стойки в центре: разворот к точке, рывок до ~4,5 м/с, торможение,
// выпад ближней ногой и касание конуса ближней рукой (таз низко, спина прямая под 45°), толчок назад, разворот, бег в центр,
// разворот лицом вперёд в стойку. Было: точка в 0,8 м и три шага до 1,2 м/с — Лёва: «там не бег, там ходьба».
import * as THREE from 'three';
import { clamp, smooth, w, sgn, cm } from '../poses.js';
import { palmOn } from '../kneel.js';
import { script, measureFeet, gait, legAudit } from '../steps.js';

const CYCLE = 6.8, HALF = 0.25, PX = 2.8, PZ = 2.8; // цикл (= сумма tempo_s), полуширина стойки, точка касания: в сторону и вперёд, м
const PI = Math.PI;
const CONE = 0.38; // высота конуса на точке, м (обычный тренировочный)
const side = (t) => (Math.floor(t / CYCLE) % 2 ? 'Left' : 'Right');
const point = (s) => new THREE.Vector3(sgn(s) * PX, 0, PZ);
// Конус стоит сбоку от линии бега, снаружи: рука к нему идёт мимо колена, а стопы остаются каждая на своём следе.
const OUT = 0.4;
const cone = (s) => { const d = sgn(s), th = Math.atan2(d * PX, PZ); return new THREE.Vector3(d * PX + Math.cos(th) * d * OUT, 0, PZ - Math.sin(th) * d * OUT); };

// Сценарий к точке со стороны s (Right — в −X). Зеркало по x для левой.
function build(T, s) {
  const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, y = (k) => A + k * L, d = sgn(s), o = s === 'Left' ? 'Right' : 'Left';
  const th = Math.atan2(d * PX, PZ), back = th - d * PI, f = [Math.sin(th), Math.cos(th)], out = [-Math.cos(th) * -d, Math.sin(th) * -d];
  const start = { [s]: { x: d * HALF, z: 0, yaw: d * 0.1 }, [o]: { x: -d * HALF, z: 0, yaw: -d * 0.1 } }, S = script(CYCLE, start);
  const at = (c, a, sd, r = 0.15) => [c[0] + sgn(sd) * r * Math.cos(a), c[1] - sgn(sd) * r * Math.sin(a), a]; // стопа sd у точки c при курсе a
  // Разворот на месте: первой шагает нога со стороны поворота, шаги по 0,18 с; n = 2 — сразу на курс, 4 — в две четверти.
  const turn = (t, c, a0, a1, n, end) => {
    const m = (a0 + a1) / 2, F = a1 > a0 ? 'Left' : 'Right', B = F === 'Left' ? 'Right' : 'Left';
    const q = n === 1 ? [[F, a1]] : n === 2 ? [[F, a1], [B, a1]] : [[F, m], [B, m], [F, a1], [B, a1]];
    q.forEach(([sd, a], i) => S.step(sd, t + 0.2 * i, t + 0.2 * i + 0.18, ...(i >= q.length - 2 && end ? end[sd] : at(c, a, sd)), { h: 0.05 }));
    return t + 0.2 * q.length;
  };
  // туда: разворот к точке, рывок, торможение; бег кончается за 0,8 м до точки на ~1,4 м/с, дальше выпад
  S.at(0, 0, 0).at(0.3, 0, 0);
  // Выпад делает ближняя нога: число беговых шагов узнаём пробным прогоном и при нечётном разворачиваемся одним шагом.
  const D = Math.hypot(PX, PZ) - 0.8, go = { from: [0, 0], yaw: th, segs: [[D - 1.1, 4.5, 0.2], [1.1, 1.4, 0.6]], cadence: 4, L };
  const odd = script(CYCLE, start).run({ side: s, t0: 0.65, ...go }).side !== s;
  const t0 = turn(0.3, [0, 0], 0, th, odd ? 1 : 2);
  const a = S.run({ side: odd ? o : s, t0: t0 - 0.05, ...go });
  if (a.side !== s) throw new Error(`паук: выпад не ближней ногой (${a.side})`);
  const E = [a.x, a.z], tL = a.last + 0.27; // постановка выпада
  // Стопа выпада на своём следе у линии бега, конус снаружи от неё в 0,3 м. Было: касание внутри от стопы — рука шла
  // сквозь бедро на 10 см (Лёва 24.11: «рука дальняя через ногу проходит»).
  const foot = [PX * d + f[0] * 0.05 + out[0] * 0.09, PZ + f[1] * 0.05 + out[1] * 0.09];
  const own = S.plants[s].at(-1);
  S.step(s, own.on + (own.hold ?? 0.15), tL, ...foot, th, { h: 0.08 });
  const rear = S.plants[o].at(-1); rear.toe = 0.4; rear.yaw -= sgn(o) * 0.15; // задняя стопа выпада на носке, носок чуть внутрь за коленом
  const low = [PX * d - f[0] * 0.4, PZ - f[1] * 0.4]; // таз на линии бега, стопа выпада в 0,45 м впереди: задняя нога длинная
  S.at(tL + 0.2, ...low); const touch = [tL + 0.05, tL + 0.3, tL + 0.55, tL + 0.75]; // рука идёт к полу, касается, держит, уходит
  S.at(touch[2], ...low);
  // толчок назад: передняя нога под тело, разворот к центру
  const tP = touch[2] + 0.05, C2 = E;
  S.step(s, tP, tP + 0.25, ...at(C2, th, s), { h: 0.06 }); S.at(tP + 0.3, ...C2);
  const t2 = turn(tP + 0.3, C2, th, back, 4); S.at(t2, ...C2);
  // обратно: рывок к центру и остановка
  const Dc = Math.hypot(...C2);
  const b = S.run({ side: back > th ? 'Left' : 'Right', t0: t2 - 0.05, from: C2, yaw: back, segs: [[Dc - 1.4, 4.2, 0.2], [1.4, 0.9, 0.6]], cadence: 4, L });
  const B = [b.x, b.z], t3 = b.t + 0.15; S.at(t3 + 0.8, ...B);
  const t4 = turn(t3, B, back, 0, 4, { [s]: [d * HALF, 0, d * 0.1], [o]: [-d * HALF, 0, -d * 0.1] });
  S.at(t4 + 0.2, 0, 0);
  if (t4 > CYCLE - 0.3) throw new Error(`паук: сценарий ${t4.toFixed(2)} с длиннее цикла ${CYCLE}`);
  const k = (t, o2) => S.key(t, { y: y(0.86), dx: 0, dz: 0, yaw: 0, hips: 0, torso: 0, elev: 72, run: 0, gait: 0, hang: 0, v: 4.5, ...o2 });
  const Y = th * 180 / PI, Yb = back * 180 / PI, ta = a.steps.find((q) => q.v > 3.5)?.t ?? t0 + 0.4, tb = b.steps.find((q) => q.v > 3.5)?.t ?? t2 + 0.4;
  k(0, {}); k(0.2, {});
  k(t0, { y: y(0.93), elev: 74, yaw: Y, run: 1, gait: 1 }); // наклон на беге считает генератор (steps.js), здесь только вход
  k(ta, { y: y(0.92), elev: 62, yaw: Y, run: 1, gait: 1, v: 4.5 });
  k(a.last - 0.1, { y: y(0.92), elev: 78, yaw: Y, run: 0.7, gait: 1, v: 3.5 });
  k(tL - 0.1, { y: y(0.9), elev: 62, yaw: Y, run: 0.5, gait: 0.7, v: 3 });
  k(tL, { y: y(0.7), elev: 50, yaw: Y, run: 0.3, gait: 0.5, v: 3 });
  // Касание конуса (38 см), а не пола (24.11): до пола рука модели достаёт только с корпусом ниже 24° и тазом у колена —
  // Лёва: «тело просто всё скукоживает, скрючивает». К конусу — глубокий выпад, спина прямая под 45°, свободная рука вниз.
  k(touch[1], { y: y(0.6), elev: 42, yaw: Y, hang: 0.6 }); k(touch[2], { y: y(0.6), elev: 42, yaw: Y, hang: 0.6 });
  k(tP + 0.3, { y: y(0.95), elev: 84, yaw: Y, hang: 0.3 });
  k(t2 - 0.04, { y: y(0.96), elev: 84, yaw: Yb, hang: 0.3 });
  k(t2 + 0.25, { y: y(0.93), elev: 62, yaw: Yb, run: 1, gait: 1, v: 4 });
  k(tb, { y: y(0.93), elev: 68, yaw: Yb, run: 1, gait: 1, v: 4.2 });
  k(b.last - 0.1, { y: y(0.91), elev: 82, yaw: Yb, run: 0.6, gait: 0.9, v: 3.5 });
  k(t3, { y: y(0.975), elev: 86, yaw: Yb, hang: 0.4, v: 3 });
  k(t4 - 0.1, { y: y(0.96), elev: 80, yaw: 0, hang: 0.2 });
  k(t4 + 0.3, {});
  S.touch = touch;
  return S.done();
}

function marks(T) {
  const mat = new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.9 });
  for (const [i, p] of [new THREE.Vector3(0, 0, 0), cone('Right'), cone('Left')].entries()) {
    const h = i ? CONE : 0.004, m = new THREE.Mesh(new THREE.CylinderGeometry(i ? 0.025 : 0.09, i ? 0.1 : 0.09, h, 24), mat); // центр — метка, точки — конусы
    m.position.copy(p).setY(h / 2); m.castShadow = true; m.receiveShadow = true; T.gear.parent.add(m); // не в T.add: снаряды входят в рамку камеры, а точки в 4 м делали человека крошечным
  }
}

export default {
  id: 'spider-drill',
  name: 'Паук',
  muscles: { work: ['quads', 'glutes', 'calves', 'adductors'], stretch: [], careful: ['ankle', 'knee'] },
  phases: [
    { name: 'рывок', cue: 'Развернись и рывком к точке', tempo_s: 2.1 },
    { name: 'касание', cue: 'Выпад, коснись конуса и тормози', tempo_s: 0.8 },
    { name: 'возврат', cue: 'Толчок, разворот, бегом в центр', tempo_s: 3.9 }, // сумма фаз = цикл CYCLE
  ],
  dose: { sets: '4', reps: '1 круг (5 точек)', rest_s: 60 },
  mistakes: ['Широкие повороты без торможения', 'Высокая стойка', 'Колено уходит внутрь'],
  view: 'front',
  pace: 'В жизни бегом, на максимуме',
  wide: true,
  follow: true, // камера едет за человеком: путь 4 м туда и обратно
  runs: { s: 2, flight: 0.2 }, // обещание «это бег» за оба цикла span
  flat: 'front',
  span: 2,
  setup(T) { measureFeet(T); T.Sp = { Right: build(T, 'Right'), Left: build(T, 'Left') }; marks(T); },
  pose(T, { t }) {
    const s = side(t), tt = ((t % CYCLE) + CYCLE) % CYCLE, [a, b, c, e] = T.Sp[s].touch;
    const k = tt < a || tt > e ? 0 : tt < b ? smooth((tt - a) / (b - a)) : tt < c ? 1 : 1 - smooth((tt - c) / (e - c));
    const fwd = new THREE.Vector3(0, 1.2, 0).add(point(s).multiplyScalar(2));
    const opt = { skipArm: k > 0 ? s : null, lookAt: k > 0 ? cone(s).lerp(fwd, 1 - k) : null, dy: 0 };
    let g = gait(T, T.Sp[s], tt, opt);
    // Таз опускается, пока рука от плеча достаёт до точки касания: длина руки своя у модели, на глаз не подобрать.
    for (let i = 0; k > 0 && i < 8; i++) {
      const [L1, L2] = T.rig.armLen[s], need = w(T.rig, s + 'Arm').distanceTo(cone(s).setY(CONE + 0.09)) - 0.96 * (L1 + L2);
      if (Math.abs(need) < 0.005 || (need < 0 && opt.dy <= 0)) break;
      opt.dy = clamp(opt.dy + need * 0.8 * k, 0, 0.08); // к конусу таз почти не опускается: с запасом 0,3 задняя нога складывалась под себя g = gait(T, T.Sp[s], tt, opt);
    }
    T.drop = opt.dy;
    T.touch = { s, k };
    if (k > 0) {
      const { rig } = T, yaw = g.yaw, pitch = 1.2; // кисть пальцами вниз к полу, к точке
      const F = new THREE.Vector3(0, -Math.sin(pitch), Math.cos(pitch)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const N = new THREE.Vector3(0, -Math.cos(pitch), -Math.sin(pitch)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const P = cone(s).setY(CONE + 0.08); // середина ладони: кончики пальцев у верхушки конуса
      const Sh = w(rig, s + 'Arm'), ready = Sh.clone().add(new THREE.Vector3(0, -0.3, 0)).addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 0.3);
      palmOn(T, s, ready.lerp(P, k), F, N, new THREE.Vector3(sgn(s) * 0.6, 0.2, -0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      rig.relaxHand(s);
    }
  },
  audit(T) {
    const r = legAudit(T), { rig } = T, { s, k } = T.touch;
    if (k > 0.999) {
      const m2 = w(rig, s + 'HandMiddle2'), tip = w(rig, s + 'HandMiddle3').multiplyScalar(2).sub(m2).y; // кончик ≈ третья фаланга дальше на свою длину
      r.m.fingerY = cm(tip - CONE);
      if (tip - CONE > 0.035) r.bad.push(`рука не достала конус (${cm(tip - CONE)} см)`);
      if (tip - CONE < -0.03) r.bad.push(`рука в конусе (${cm(tip - CONE)} см)`);
      if (r.m.torso < 35) r.bad.push(`на касании корпус завален: ${r.m.torso}° (от 35°)`); // скрюченное касание
      const a = rig.audit()[s]; if (a.wrist > 50) r.bad.push(`запястье ${a.wrist}°`);
    }
    if (r.m.torso < 20) r.bad.push(`корпус завален: ${r.m.torso}°`);
    return r;
  },
};
