// Ускорение 5 метров в настоящем темпе (24.11.2026): старт из разножки, 5 м разгона до ~5,5 м/с (шаги растут
// от 0,5 до 1,6 м, между опорами полёт), торможение за 3 м, разворот и трусцой 3,6 м/с назад на старт.
// Было: три шага по 0,5 м и возврат шагом спиной вперёд — Лёва: «там не бег, там какая-то ходьба».
// Шаги бега раскладывает S.run (steps.js), камера едет за бегуном (follow).
import { script, measureFeet, gait, legAudit } from '../steps.js';

const C = 9.6; // = сумма tempo_s фаз: цикл показа берётся из фаз
const PI = Math.PI;

export function build(T) {
  const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, y = (k) => A + k * L, h = 0.1, z0 = -0.1;
  const S = script(C, { Left: { x: h, z: 0, yaw: 0 }, Right: { x: -h, z: -0.3, yaw: 0 } });
  const at = (c, th, s, r = h) => [c[0] + (s === 'Left' ? 1 : -1) * r * Math.cos(th), c[1] - (s === 'Left' ? 1 : -1) * r * Math.sin(th), th]; // стопа s у точки c при курсе th
  // Разворот на месте в четыре шага по 0,18 с, стопы шире (0,15): первой идёт нога со стороны поворота (бедро раскрывается,
  // колено не заваливается внутрь), вторая приставляется; четверть оборота и ещё четверть.
  const turn = (t, c, th0, th1, end) => {
    const m = (th0 + th1) / 2, A = th1 > th0 ? 'Left' : 'Right', B = A === 'Left' ? 'Right' : 'Left', q = [[A, m], [B, m], [A, th1], [B, th1]];
    q.forEach(([s, th], i) => S.step(s, t + 0.2 * i, t + 0.2 * i + 0.18, ...(i > 1 && end ? end[s] : at(c, th, s, 0.15)), { h: 0.05 }));
    return t + 0.8;
  };
  S.at(0, 0, z0).at(0.5, 0, z0);
  // туда: 5 м разгона, 2,4 м торможения
  const a = S.run({ side: 'Right', t0: 0.5, from: [0, z0], segs: [[1.5, 3.6, 0.2], [3.5, 5.5, 0.2], [3, 0.9, 0.6]], cadence: 5, L });
  const E = [a.x, a.z], t1 = a.t + 0.15; S.at(t1 + 0.8, ...E);
  const t2 = turn(t1, E, 0, PI);
  // обратно трусцой
  const b = S.run({ side: 'Right', t0: t2, from: E, yaw: PI, segs: [[1, 3.6, 0.25], [E[1] - z0 - 2.3, 3.6], [1.3, 0.9, 0.6]], cadence: 3.6, L });
  const B = [b.x, b.z], t3 = b.t + 0.15; S.at(t3 + 0.8, ...B);
  const t4 = turn(t3, B, PI, 0, { Left: [h, 0, 0], Right: [-h, z0, 0] });
  S.step('Right', t4 + 0.05, t4 + 0.27, -h, -0.3, 0, { h: 0.04 }); // правая назад: стартовая разножка
  if (t4 > C - 0.4) throw new Error(`ускорение: сценарий ${t4.toFixed(2)} с длиннее цикла ${C}`);
  // gait — нога в махе и таз по клипу, run — руки клипа, v — скорость для клипа
  const k = (t, o2) => S.key(t, { y: y(0.86), dx: 0, dz: 0, yaw: 0, hips: 0, torso: 0, elev: 50, run: 0, gait: 0, hang: 0, v: 4.5, ...o2 });
  const ta = a.steps.find((q) => q.v > 4)?.t ?? 1.5, tb = a.steps[a.steps.length - 1].t, br = (a.steps.findLast((q) => q.v > 5) ?? a.steps[a.steps.length - 3]).t + 0.1;
  k(0, { elev: 50 });
  k(0.5, { elev: 48 });
  k(0.75, { y: y(0.9), elev: 50, run: 1, gait: 1 });
  k(ta, { y: y(0.93), elev: 66, run: 1, gait: 1, v: 5 });
  k(br, { y: y(0.93), elev: 68, run: 1, gait: 1, v: 5 });
  k(br + 0.12, { y: y(0.93), elev: 72, run: 0.85, gait: 1, v: 5 });
  k(tb, { y: y(0.91), elev: 86, run: 0.5, gait: 0.8, v: 4 });
  k(t1, { y: y(0.975), elev: 88, hang: 0.5, v: 3 });
  k(t1 + 0.38, { y: y(0.975), elev: 88, hang: 0.5, yaw: 90, v: 3 });
  k(t2 - 0.04, { y: y(0.97), elev: 87, yaw: 180, hang: 0.3, v: 3.2 });
  k(t2 + 0.5, { y: y(0.93), elev: 86, yaw: 180, run: 1, gait: 1, v: 3.2 });
  k(b.last - 0.5, { y: y(0.93), elev: 86, yaw: 180, run: 1, gait: 1, v: 3.2 });
  k(b.last, { y: y(0.92), elev: 87, yaw: 180, run: 0.4, gait: 0.7, v: 3 });
  k(t3, { y: y(0.975), elev: 88, yaw: 180, hang: 0.5, v: 3 });
  k(t3 + 0.42, { y: y(0.98), elev: 88, yaw: 90, hang: 0.5, v: 3 });
  k(t4 - 0.22, { y: y(0.98), elev: 86, yaw: 32, hang: 0.4, v: 3 });
  k(t4 + 0.05, { y: y(0.96), elev: 86, yaw: 0, hang: 0.3 });
  k(t4 + 0.7, { y: y(0.86), elev: 50, yaw: 0 });
  S.marks = { ta, brake: br, t1, t2, tb: b.t, t3, t4 };
  return S.done();
}

export default {
  id: 'acceleration-5m',
  name: 'Ускорение 5 метров',
  muscles: { work: ['glutes', 'quads', 'calves', 'hamstrings'], stretch: [], careful: ['hamstrings', 'ankle'] },
  phases: [
    { name: 'старт', cue: 'Наклон вперёд, мощный толчок', tempo_s: 0.6 },
    { name: 'разгон', cue: 'Шаги растут, корпус выпрямляется постепенно', tempo_s: 1.7 },
    { name: 'торможение', cue: 'Мягко остановись', tempo_s: 1.4 },
    { name: 'возврат', cue: 'Трусцой назад на старт', tempo_s: 5.9 }, // сумма фаз = цикл сценария C
  ],
  mistakes: ['Выпрямление на первом шаге', 'Старт без разминки'],
  dose: { sets: '6', reps: '1 × 5 м', rest_s: 45 },
  view: 'quarter',
  flat: 'side',
  wide: true,
  follow: true, // камера едет за бегуном: путь 8 м
  runs: { s: 3, flight: 0.25 }, // обещание «это бег»: проверяет __trainer.run()
  pace: 'В жизни старт в полную силу, 5 м',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { T.tNow = t; gait(T, T.S, t); },
  audit(T) {
    const r = legAudit(T), tau = ((T.tNow % C) + C) % C;
    // Главное в старте: корпус наклонён на первых шагах (не выпрямиться сразу).
    if (tau > 0.75 && tau < 1.1 && r.m.torso > 72) r.bad.push(`корпус выпрямлен на первом шаге: ${r.m.torso}°`);
    return r;
  },
};
