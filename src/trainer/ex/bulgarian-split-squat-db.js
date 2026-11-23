// Болгарский присед с гантелями, правая нога впереди (повторы подряд на одну ногу). Левая стопа подъёмом лежит
// на скамье позади, носок назад. Вниз: таз отвесно вниз, заднее колено к полу (у модели голень 0,4 м: при скамье 0,4 м
// колено останавливается в 14 см от пола), передняя голень почти отвесно, корпус чуть вперёд. Гантели висят по бокам.
import * as THREE from 'three';
import { FWD, X, lerp, smooth, w, key, ruSide, cm, stand, trunk, placeHips, look, baseAudit, legGap, legIK, dumbbells, SIDES } from '../poses.js';
import { valgus, pelvisTilt } from '../jump.js';
import { legsClear } from '../steps.js';
import { legsSetup, bench, hangDBs, reachY, planted, gaze } from '../legs.js';

const PAD = 0.4, ANK = 0.065, ZR = -0.72, XF = 0.1, K = key({}); // скамья, щиколотка над подушкой, задняя стопа по Z, полуширина
const FRONT = 'Right', REAR = 'Left';

export default {
  id: 'bulgarian-split-squat-db',
  name: 'Болгарский присед',
  muscles: { work: ['quads', 'glutes', 'adductors'], stretch: ['hip_flexors'], careful: ['knee'] },
  phases: [
    { name: 'вниз', cue: 'Задняя нога на скамье', tempo_s: 3 },
    { name: 'низ', cue: 'Колено почти у пола', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Толкай передней пяткой', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8 на ногу', rest_s: 90 },
  mistakes: ['Короткий шаг, колено далеко вперёд', 'Корпус валится в сторону'],
  view: 'side',
  setup(T) {
    legsSetup(T); dumbbells(T);
    T.bench = bench(T, PAD, XF, ZR - 0.5, ZR + 0.06); // короткая: длинная скамья растягивает кадр, человек мельче
    T.rearA = new THREE.Vector3(XF, PAD + ANK, ZR);
    T.topY = 0.84; // таз вверху: передняя нога почти прямая (дальше её не пускает reachY)
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    const ft = { crouch: 0 };
    ft[FRONT] = { pos: new THREE.Vector3(-XF, 0, 0), lift: 0, yaw: -0.05 };
    ft[REAR] = { pos: T.rearA.clone().setY(PAD), lift: 0.3, yaw: 0 }; // заднюю ставим сами: Rig.legs держит стопу плоско
    stand(T);
    trunk(T, K, lerp(82, 74, depth));
    const M = new THREE.Vector3(0, 0, lerp(-0.3, -0.43, depth));
    const R = 0.95 * (rig.L1 + rig.L2), H = M.clone().addScaledVector(X, T.hipHalf), d = Math.hypot(T.rearA.x - H.x, T.rearA.z - H.z);
    M.y = Math.min(lerp(T.topY, 0.48, depth), reachY(T, M, { [FRONT]: ft[FRONT] }, 0.975), T.rearA.y + Math.sqrt(R * R - d * d));
    placeHips(T, M, ft);
    legIK(T, REAR, T.rearA, new THREE.Vector3(0, -1, 0.25));
    // Стопа подъёмом на подушке, носок назад и вниз на угол a: плоская стопа повёрнута вокруг поперечной оси на π − a
    // (подошва вверх). Угол такой, чтобы подушечка легла на подушку (сустав подушечки на 3 см над ней); высота падает с углом монотонно.
    let lo = -0.6, hi = 1.5;
    const at = (a) => { rig.setWorld(rig.b[REAR + 'Foot'], new THREE.Quaternion().setFromAxisAngle(X, Math.PI - a).multiply(T.footFlat[REAR])); rig.root.updateMatrixWorld(true); return w(rig, REAR + 'ToeBase').y - PAD - 0.03; };
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (at(m) > 0) lo = m; else hi = m; }
    at(lo);
    look(T, new THREE.Vector3(0, 1.0, 4), 35);
    hangDBs(T, FWD, X);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [FRONT + 'Foot', FRONT + 'ToeBase'] });
    planted(T, r, FRONT, 0);
    const A = w(rig, REAR + 'Foot'), toe = w(rig, REAR + 'ToeBase'), kn = w(rig, REAR + 'Leg');
    r.m.rearAnk = cm(A.y - PAD); r.m.rearToe = cm(toe.y - PAD);
    // Голеностоп задней ноги: угол между голенью (колено → щиколотка) и стопой (щиколотка → подушечка). Стоя он 55°
    // (нейтраль), 0 — носок вытянут в линию голени (55° подошвенного сгиба, у человека до 50), больше 75 — стопа
    // заломлена к голени.
    const sh = A.clone().sub(kn).normalize(), fd = toe.clone().sub(A).normalize();
    r.m.rearAnkle = Math.round(THREE.MathUtils.radToDeg(sh.angleTo(fd)));
    if (r.m.rearAnkle > 75 || r.m.rearAnkle < 5) r.bad.push(`задняя стопа заломлена в голеностопе: ${r.m.rearAnkle}°`);
    if (A.distanceTo(T.rearA) > 0.01) r.bad.push(`задняя стопа сползла со скамьи (${cm(A.distanceTo(T.rearA))} см)`);
    if (toe.y < PAD + 0.01) r.bad.push(`носок задней стопы в скамье (${cm(toe.y - PAD)} см)`);
    if (toe.z > T.bench.z1) r.bad.push('задняя стопа не на скамье');
    r.m.rearKneeY = cm(kn.y);
    if (kn.y < 0.06) r.bad.push(`заднее колено бьётся в пол (${cm(kn.y)} см)`);
    if (kn.z < T.bench.z1 + 0.04 && kn.y < PAD + 0.05) r.bad.push('заднее колено в скамье');
    if (T.depth > 0.95 && kn.y > 0.2) r.bad.push(`заднее колено высоко внизу (${cm(kn.y)} см)`);
    if (r.m['knee' + FRONT[0]] > 25) {
      const v = valgus(rig, FRONT, -0.05); r.m.kneeIn = Math.round(v);
      if (v > 10) r.bad.push(`переднее колено заваливается внутрь: ${Math.round(v)}°`);
    }
    const over = w(rig, FRONT + 'Leg').z - w(rig, FRONT + 'ToeBase').z - 0.05; r.m.kneeOverToe = cm(over);
    if (over > 0) r.bad.push(`переднее колено за носком (${cm(over)} см)`);
    r.m.pelvis = pelvisTilt(rig);
    if (r.m.pelvis > 6) r.bad.push(`таз перекошен: ${r.m.pelvis}°`);
    for (const s of SIDES) {
      const g = legGap(T, s, T.db[s].position, true); r.m['gap' + s[0]] = cm(g);
      if (g < -0.015) r.bad.push(`${ruSide(s, true)} гантель в ноге (${cm(g)} см)`);
    }
    const c = legsClear(T); r.m.legGap = cm(c.gap);
    if (c.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${cm(c.gap)} см)`);
    if (r.m.torso < 68) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    gaze(T, r, -35);
    return r;
  },
};
