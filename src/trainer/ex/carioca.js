// Кариока: боком вправо две фазы и обратно две (цикл 3,2 с). Вправо скрещивается левая: шаг через перед правой
// (стопа несётся дугой перед голенью), правая выходит в сторону, потом левая через зад, правая снова в сторону.
// Обратно то же правой. Таз крутится навстречу скрещиванию (на 35°), плечи и голова смотрят вперёд, руки в стойке.
// Стопы на подушечках (пятки на 2 см): кариока идёт на носках, таз крутится вокруг подушечек.
import { deg } from '../poses.js';
import { script, curve, measureFeet, gait, legAudit } from '../steps.js';

const W = 0.3, C = 0.08, ZF = 0.1, ZB = -0.12, D = 0.8, HIP = 35, TOE = 0.28; // ширина, заход за опорную, вынос стопы перед и зад, фаза, °, пятка

// Пара фаз «перед, зад» в сторону dir от t0; pos — щиколотки { Left: { x, z, yaw }, Right: … }, меняется на месте.
export function cariocaPair(S, t0, pos, dir, d = D) {
  const cross = dir < 0 ? 'Left' : 'Right', out = cross === 'Left' ? 'Right' : 'Left';
  for (const [k, z, arc] of [[0, ZF, 0.16], [1, ZB, -0.16]]) {
    const t = t0 + k * d, front = k === 0, yc = (front ? 0.45 : -0.3) * dir;
    pos[cross] = { x: pos[out].x + dir * C, z, yaw: yc };
    S.step(cross, t, t + d * 0.38, pos[cross].x, z, yc, { h: 0.07, arc: { x: 0, z: arc }, toe: TOE, follow: 0.5 });
    pos[out] = { x: pos[cross].x + dir * W, z: 0, yaw: out === 'Left' ? 0.1 : -0.1 };
    S.step(out, t + d * 0.5, t + d * 0.85, pos[out].x, 0, pos[out].yaw, { h: 0.05, toe: TOE, follow: 0.5, out: true, arc: { x: 0, z: front ? -0.1 : 0.1 } }); // обходит скрещенную стопу
    S.key(t + d * 0.38, { hips: (front ? 1 : -1) * dir * HIP }); // таз навстречу скрещенной ноге
  }
  return pos;
}

export function build(T) {
  const { rig } = T, y = rig.ankleH + 0.86 * (rig.L1 + rig.L2);
  const R0 = 2 * (W + C) / 2 - W / 2; // путь вправо и обратно вокруг середины кадра
  const start = { Left: { x: R0 + W, z: 0, yaw: 0.1, toe: TOE, follow: 0.5 }, Right: { x: R0, z: ZB, yaw: -0.3, toe: TOE, follow: 0.5 } };
  const S = script(4 * D, start);
  const pos = { Left: { ...start.Left }, Right: { ...start.Right } };
  cariocaPair(S, 0, pos, -1);
  cariocaPair(S, 2 * D, pos, 1);
  S.body.forEach((k) => { k[1] = { y, dx: 0, dz: 0, yaw: 0, torso: 0, elev: 80, run: 0, ...k[1] }; });
  // Стопа, вышедшая в сторону, ставится носком наполовину по тазу в момент постановки: иначе колено смотрит внутрь.
  const hips = curve([...S.body].sort((a, b) => a[0] - b[0]), S.P);
  for (const s of ['Left', 'Right']) {
    const L = S.plants[s];
    for (const p of L.slice(1)) if (p.out) p.yaw += 0.5 * deg(hips(p.on).hips);
    L[0].yaw = L[L.length - 1].yaw; // цикл замыкается на последней стоянке
  }
  return S.done();
}

export default {
  id: 'carioca',
  name: 'Кариока',
  muscles: { work: ['obliques', 'calves', 'adductors', 'hip_flexors'], stretch: ['adductors'], careful: ['ankle'] },
  phases: [
    { name: 'перед', cue: 'Левая через перед, плечи прямо', tempo_s: D },
    { name: 'зад', cue: 'Левая скрестно сзади', tempo_s: D },
    { name: 'обратно', cue: 'Обратно: правая через перед', tempo_s: D },
    { name: 'зад', cue: 'Правая скрестно сзади', tempo_s: D },
  ],
  dose: { sets: '2', reps: '18 м на сторону', rest_s: 30 },
  mistakes: ['Плечи крутятся вместе с тазом', 'Ноги цепляются друг за друга'],
  view: 'front',
  pace: 'Начни в этом темпе, потом быстрее', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  flat: 'front',
  setup(T) { measureFeet(T); T.S = build(T); },
  pose(T, { t }) { gait(T, T.S, t); },
  audit(T) {
    const r = legAudit(T);
    if (Math.abs(r.m.torso - 80) > 6) r.bad.push(`корпус не держит наклон: ${r.m.torso}°`);
    return r;
  },
};
