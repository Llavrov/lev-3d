// Подъём на носок на одной ноге со ступеньки. Правая стоит подушечкой на краю ступеньки (15 см), пятка свисает;
// левая согнута и заведена за правую щиколотку, руки держат перила для равновесия. Цикл с низа: пятка ниже края
// (икра тянется) → высоко на носок → пауза → медленно вниз. Колено почти прямое, таз над стопой и ровно.
// Стопу наклоняет помощник (pitchFoot): Rig.legs поднимает пятку только на 3 см и опускать ниже подушечки не умеет.
import * as THREE from 'three';
import { V, lerp, w, key, SIDES, ruSide, cm, stand, trunk, placeHips, look, palmTo, baseAudit } from '../poses.js';
import { legsClear } from '../steps.js';
import { pelvisTilt } from '../jump.js';
import { box, wall, rail, measureFoot, ankleFor, heelAt, pitchFoot, reachAudit, gazeAudit } from '../bandlegs.js';

const H = 0.15, LOW = -0.26, HIGH = 0.6; // высота ступеньки, м; наклон стопы внизу и вверху, рад (−15° и +34°)
const ON = 'Right', OFF = 'Left';
const K = key({ rUp: V(0.2, -0.6, 0.6), rFo: V(0.1, 0.3, 1), lUp: V(-0.2, -0.6, 0.6), lFo: V(-0.1, 0.3, 1) });

export default {
  id: 'single-leg-calf-raise',
  name: 'Подъём на носок на одной ноге',
  muscles: { work: ['calves'], stretch: ['calves'], careful: ['ankle'] },
  phases: [
    { name: 'вверх', cue: 'Встань высоко на носок', tempo_s: 1 },
    { name: 'верх', cue: 'Пауза, пятка не заваливается', tempo_s: 1 },
    { name: 'вниз', cue: 'Пятка ниже края медленно', tempo_s: 3, stretch: true },
  ],
  dose: { sets: '3', reps: '12–15 на ногу', rest_s: 45 },
  mistakes: ['Неполная амплитуда', 'Стопа заваливается наружу'],
  view: 'side',
  flat: 'side',
  setup(T) {
    const { rig } = T;
    stand(T); trunk(T, K, 88);
    placeHips(T, new THREE.Vector3(0, rig.ankleH + 0.975 * (rig.L1 + rig.L2), 0), { Left: { pos: new THREE.Vector3(T.hipHalf, 0, 0), lift: 0, yaw: 0 }, Right: { pos: new THREE.Vector3(-T.hipHalf, 0, 0), lift: 0, yaw: 0 }, crouch: 0 });
    measureFoot(T);
    const x = -0.75 * T.hipHalf, edge = 0;
    T.cr = { x, edge, ball: new THREE.Vector3(x, H + T.flatFoot[ON].ballY, edge + 0.03), wallZ: edge + 0.45 };
    box(T, { x0: -0.45, x1: 0.45, z0: edge, z1: edge + 0.35, h: H });
    wall(T, T.cr.wallZ);
    T.cr.rail = rail(T, H + 1.02, edge + 0.3, T.cr.wallZ);
  },
  motion(i, u) { const e = u * u * (3 - 2 * u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, c = T.cr, pitch = lerp(LOW, HIGH, depth);
    T.pitch = pitch;
    const A = ankleFor(T, ON, c.ball, pitch);
    stand(T); trunk(T, K, 88);
    // Таз над опорной стопой: тазобедренный правой над серединой щиколотка–подушечка, нога почти прямая.
    const top = A.y + 0.98 * (rig.L1 + rig.L2);
    const M = new THREE.Vector3(A.x + T.hipHalf, top, (A.z + c.ball.z) / 2 - 0.02);
    const free = new THREE.Vector3(A.x + 0.1, 0, A.z - 0.2); // левая за правой щиколоткой, голень назад
    placeHips(T, M, { [ON]: { pos: A.clone().setY(A.y - rig.ankleH), lift: 0, yaw: 0 }, [OFF]: { pos: free.setY(A.y - rig.ankleH), lift: 0.12, yaw: 0 }, crouch: 0 });
    pitchFoot(T, ON, pitch);
    look(T, new THREE.Vector3(0, 1.5, 3), 35);
    for (const s of SIDES) { // кисти на перилах хватом сверху, локти вниз-наружу
      const out = new THREE.Vector3(s === 'Left' ? 1 : -1, 0, 0);
      palmTo(T, s, new THREE.Vector3(out.x * 0.2, c.rail.y, c.rail.z), out.clone().negate(), new THREE.Vector3(out.x * 0.6, -1, -0.2));
      rig.grip(s, 1);
    }
  },
  audit(T) {
    const { rig } = T, c = T.cr, r = baseAudit(T, { feet: [] });
    const B = w(rig, ON + 'ToeBase'), A = w(rig, ON + 'Foot');
    r.m.ballSlide = cm(Math.hypot(B.x - c.ball.x, B.z - c.ball.z)); r.m.ballY = cm(B.y - c.ball.y);
    if (r.m.ballSlide > 1) r.bad.push(`подушечка съехала с края: ${r.m.ballSlide} см`);
    if (Math.abs(B.y - c.ball.y) > 0.01) r.bad.push(`подушечка ${B.y > c.ball.y ? 'висит над' : 'в'} ступеньке: ${r.m.ballY} см`);
    // Пятка: подъём от «стоит на ступеньке плоско»; пока пятка ниже верха ступеньки, она позади края.
    const heel = heelAt(T, ON, A, T.pitch), flat = H + 0.012; r.m.heel = cm(heel.y - flat);
    if (heel.y < flat + 0.01 && heel.z > c.edge - 0.01) r.bad.push(`пятка в ступеньке: ${cm(heel.z - c.edge)} см от края`);
    if (T.pitch > HIGH - 0.01 && r.m.heel < 5) r.bad.push(`мало подъёма: пятка выше на ${r.m.heel} см`);
    if (T.pitch < LOW + 0.01 && r.m.heel > -2) r.bad.push(`пятка не ниже края: ${r.m.heel} см`);
    if (r.m['knee' + ON[0]] > 25) r.bad.push(`опорное колено согнуто: ${r.m['knee' + ON[0]]}°`);
    const fa = w(rig, OFF + 'Foot'); r.m.freeY = cm(fa.y - H);
    if (fa.y < H + 0.08) r.bad.push(`свободная стопа на ступеньке: ${r.m.freeY} см`);
    r.m.tilt = pelvisTilt(rig);
    if (r.m.tilt > 4) r.bad.push(`таз не ровно: ${r.m.tilt}°`);
    const hip = w(rig, ON + 'UpLeg'); r.m.hipOverFoot = cm(hip.x - A.x);
    if (Math.abs(hip.x - A.x) > 0.06) r.bad.push(`таз не над опорной стопой: ${r.m.hipOverFoot} см`);
    const g = legsClear(T); r.m.legGap = cm(g.gap);
    if (g.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${g.where}, ${cm(g.gap)} см)`);
    for (const s of SIDES) { // ладонь на перилах
      const p = rig.palm(s), d = Math.hypot(p.y - c.rail.y, p.z - c.rail.z); r.m['grip' + s[0]] = cm(d);
      if (d > 0.025) r.bad.push(`${ruSide(s, true)} кисть не на перилах (${cm(d)} см)`);
    }
    return gazeAudit(T, reachAudit(T, r));
  },
};
