// Торможение в выпад в настоящем темпе (24.11.2026): разбег 4,5 м до 4,5 м/с (между опорами полёт), торможение за
// 1,8 м короткими шагами с опусканием таза, длинный шаг левой в выпад и замереть внизу (передняя голень отвесно, бедро
// около параллели, корпус прямой), толчок назад передней ногой, встать, разворот и трусцой назад на старт.
// Было: два шага по 0,5 м до 2,3 м/с без полёта и три шага спиной — ходьба, а упражнение про торможение после бега.
// Ведущая в выпаде всегда левая: поочерёдность удвоила бы цикл. Шаги бега раскладывает S.run (steps.js).
import { script, measureFeet, gait, legAudit, mod } from '../steps.js';
import { w, cm, sgn } from '../poses.js';

const C = 9.8; // = сумма tempo_s фаз: цикл показа берётся из фаз
const PI = Math.PI;

export function build(T) {
  const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, y = (k) => A + k * L, h = 0.1, z0 = 0;
  const S = script(C, { Left: { x: h, z: z0, yaw: 0 }, Right: { x: -h, z: z0, yaw: 0 } });
  const at = (c, th, s, r = h) => [c[0] + (s === 'Left' ? 1 : -1) * r * Math.cos(th), c[1] - (s === 'Left' ? 1 : -1) * r * Math.sin(th), th];
  // Разворот на месте в четыре шага (как в acceleration-5m): первой идёт нога со стороны поворота.
  const turn = (t, c, th0, th1, end) => {
    const m = (th0 + th1) / 2, a = th1 > th0 ? 'Left' : 'Right', b = a === 'Left' ? 'Right' : 'Left', q = [[a, m], [b, m], [a, th1], [b, th1]];
    q.forEach(([s, th], i) => S.step(s, t + 0.2 * i, t + 0.2 * i + 0.18, ...(i > 1 && end ? end[s] : at(c, th, s, 0.15)), { h: 0.05 }));
    return t + 0.8;
  };
  const last = (s) => S.plants[s][S.plants[s].length - 1];
  S.at(0, 0, z0).at(0.4, 0, z0);
  // разбег 4,5 м до 4,5 м/с, между опорами полёт
  const a = S.run({ side: 'Left', t0: 0.4, from: [0, z0], segs: [[3, 4.5, 0.2], [1.5, 4.5, 0.35]], cadence: 4, L });
  // Торможение: таз гасит 4,5 м/с до 1,35 за 0,7 с (−4,5 м/с²), короткие частые шаги, стопа встаёт на 0,3 м впереди таза и
  // отрывается, когда таз ушёл на 0,3 м за неё (дальше нога не достаёт). Последней встаёт правая — задняя нога выпада.
  const V = 4.5, DEC = 4.5, sAt = (t) => { const u = Math.min(t - a.t, 0.7); return a.z + V * u - (u > 0 ? DEC * u * u / 2 : 0); };
  const liftOf = (o, cap) => { let t = o.on + 0.08; while (t < cap && sAt(t) < o.z + 0.3) t += 0.01; return Math.min(t, cap); };
  let side = a.side, t = a.last, n = 0;
  while (n < 3 || side !== 'Left') {
    t += 0.19 + 0.01 * n; const o = last(side), z = sAt(t) + 0.3;
    S.step(side, liftOf(o, t - 0.12), t, sgn(side) * 0.09, z, 0, { h: 0.07, push: 0.3 }); S.at(t, 0, sAt(t));
    side = side === 'Left' ? 'Right' : 'Left'; n++;
  }
  const R = last('Right'); R.toe = 0.4; R.push = 0; // задняя нога выпада на подушечке
  const zR = R.z, zF = zR + rig.L1 + rig.L2 * 0.88, bz = zF - rig.L1 * 0.9, low = A + rig.L2 * 0.97, tR = t;
  const tL = tR + 0.26, ol = last('Left');
  S.step('Left', liftOf(ol, tL - 0.2), tL, h, zF, 0, { h: 0.09 }); // длинный шаг в выпад
  const tB = tL + 0.4, tH = tB + 1.0, tU = tH + 0.4; // опуститься, замереть, толчок назад
  S.at(tL, 0, Math.min(sAt(tL), bz - 0.08)).at(tB, 0, bz).at(tH, 0, bz).at(tU, 0, zR);
  S.step('Left', tH, tH + 0.32, h, zR, 0, { h: 0.08 }); // передняя толкается и встаёт к задней
  S.step('Right', tH + 0.42, tH + 0.58, -h, zR, 0, { h: 0.03 }); // задняя с носка на всю стопу
  const E = [0, zR], t1 = tH + 0.65; S.at(t1 + 0.8, ...E);
  const t2 = turn(t1, E, 0, PI);
  // обратно трусцой
  const D = zR - z0;
  const b = S.run({ side: 'Right', t0: t2, from: E, yaw: PI, segs: [[1, 3.2, 0.25], [D - 2.3, 3.2], [1.3, 0.9, 0.45]], cadence: 3.3, L });
  const B = [b.x, b.z], t3 = b.t + 0.15; S.at(t3 + 0.8, ...B);
  const t4 = turn(t3, B, PI, 0, { Left: [h, z0, 0], Right: [-h, z0, 0] });
  if (t4 > C - 0.3) throw new Error(`торможение в выпад: сценарий ${t4.toFixed(2)} с длиннее цикла ${C}`);
  const k = (t, o2) => S.key(t, { y: y(0.93), dx: 0, dz: 0, yaw: 0, hips: 0, torso: 0, elev: 84, run: 0, gait: 0, hang: 0, v: 4.5, ...o2 });
  const ta = a.steps.find((q) => q.v > 4)?.t ?? 1.4;
  k(0, { elev: 84 });
  k(0.4, { y: y(0.9), elev: 62 });
  k(0.65, { y: y(0.92), elev: 58, run: 1, gait: 1 });
  k(ta, { y: y(0.93), elev: 66, run: 1, gait: 1 });
  k(a.t, { y: y(0.92), elev: 68, run: 0.85, gait: 0.7 });
  k(tR, { y: y(0.84), elev: 82, run: 0.5, gait: 0.5, v: 2.5 }); // тормозит: таз ниже, корпус выпрямляется
  k(tL, { y: y(0.8), elev: 85, v: 2 });
  k(tB, { y: low, elev: 84, v: 2 });
  k(tH, { y: low, elev: 84, v: 2 });
  k(tU, { y: y(0.95), elev: 86, v: 3 });
  k(t1, { y: y(0.975), elev: 88, hang: 0.5, v: 3 });
  k(t1 + 0.38, { y: y(0.975), elev: 88, hang: 0.5, yaw: 90, v: 3 });
  k(t2 - 0.04, { y: y(0.97), elev: 87, yaw: 180, hang: 0.3, v: 3.2 });
  k(t2 + 0.5, { y: y(0.93), elev: 86, yaw: 180, run: 1, gait: 1, v: 3.2 });
  k(b.last - 0.5, { y: y(0.93), elev: 86, yaw: 180, run: 1, gait: 1, v: 3.2 });
  k(b.last, { y: y(0.96), elev: 87, yaw: 180, run: 0.4, gait: 0.6, v: 3 }); // остановка: таз не проседает на последнем шаге
  k(t3, { y: y(0.975), elev: 88, yaw: 180, hang: 0.5, v: 3 });
  k(t3 + 0.38, { y: y(0.975), elev: 88, yaw: 90, hang: 0.5, v: 3 });
  k(t4 - 0.22, { y: y(0.97), elev: 86, yaw: 20, hang: 0.4, v: 3 });
  k(t4 + 0.05, { y: y(0.975), elev: 86, yaw: 0, hang: 0.3 });
  S.marks = { ta, brake: a.t, tR, tL, tB, tH, tU, t1, t2, t3, t4 };
  return S.done();
}

export default {
  id: 'deceleration-lunge',
  name: 'Торможение в выпад',
  muscles: { work: ['quads', 'glutes', 'hamstrings', 'adductors'], stretch: ['hamstrings'], careful: ['knee', 'ankle', 'hamstrings'] },
  phases: [
    { name: 'разбег', cue: 'Разгонись на 4–5 м', tempo_s: 2.1 },
    { name: 'торможение', cue: 'Короткие шаги, таз ниже', tempo_s: 0.7 },
    { name: 'выпад', cue: 'Длинный шаг, замри внизу', tempo_s: 1.8 },
    { name: 'возврат', cue: 'Толкнись назад, трусцой на старт', tempo_s: 5.2 }, // сумма фаз = цикл сценария C
  ],
  mistakes: ['Торможение на прямой ноге', 'Колено уходит внутрь', 'Корпус валится вперёд'],
  dose: { sets: '3', reps: '4 на ногу', rest_s: 60 },
  view: 'quarter', // спереди-сбоку: человек крупнее, чем при виде сбоку на весь путь
  flat: 'side',
  wide: true,
  follow: true, // камера едет за человеком: путь 6 м
  runs: { s: 1.5, flight: 0.2 }, // обещание «это бег»: проверяет __trainer.run()
  pace: 'В жизни разбег в полную силу, выпад держи 2 с',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { T.tNow = t; gait(T, T.S, t); },
  audit(T) {
    const { rig } = T, r = legAudit(T), m = T.S.marks, tau = mod(T.tNow, C);
    if (tau > m.tB - 0.05 && tau < m.tH + 0.05) { // низ выпада: голень отвесно, бедро около параллели, заднее колено не в пол, корпус прямой
      const fh = w(rig, 'LeftUpLeg'), fk = w(rig, 'LeftLeg'), fa = w(rig, 'LeftFoot');
      r.m.frontKneeOverToe = cm(fk.z - fa.z);
      if (fk.z - fa.z > 0.12) r.bad.push(`переднее колено ушло за носок (${cm(fk.z - fa.z)} см)`);
      r.m.frontThigh = Math.round(Math.atan2(fh.y - fk.y, Math.abs(fk.z - fh.z)) * 180 / PI);
      if (r.m.frontThigh > 30) r.bad.push(`бедро передней ноги высоко над параллелью: ${r.m.frontThigh}°`);
      r.m.backKneeY = cm(w(rig, 'RightLeg').y);
      if (w(rig, 'RightLeg').y < 0.07) r.bad.push(`заднее колено бьётся в пол (${r.m.backKneeY} см)`);
      if (r.m.torso < 72) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    }
    return r;
  },
};
