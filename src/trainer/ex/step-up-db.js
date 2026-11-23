// Зашагивание на тумбу с гантелями. Правая стопа всё время стоит на тумбе целиком (повторы на одну ногу подряд),
// левая на полу. Вверх: корпус чуть вперёд над тумбой, правая нога выпрямляется, левая не толкает — пятка поднимается
// и стопа уходит вверх дугой над краем тумбы, встаёт рядом. Вниз медленно: левая опускается за край на пол,
// правая сгибается. Гантели висят по бокам нейтральным хватом.
import * as THREE from 'three';
import { FWD, X, lerp, clamp, smooth, w, key, SIDES, ruSide, cm, stand, trunk, placeHips, look, baseAudit, legGap, dumbbells } from '../poses.js';
import { valgus } from '../jump.js';
import { legsClear } from '../steps.js';
import { legsSetup, box, hangDBs, reachY, planted, footClear, gaze } from '../legs.js';

const H = 0.32, ZB = 0.38, XF = 0.11, K = key({}); // высота тумбы, щиколотка на тумбе по Z, полуширина стоп
const LEAD = 'Right', TRAIL = 'Left';
const ss = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));

// Путь левой стопы между полом (u = 0) и тумбой (u = 1): сначала вверх, потом вперёд, над краем тумбы с запасом.
function trailAt(u) {
  return { pos: new THREE.Vector3(XF, H * ss(u, 0, 0.5), ZB * ss(u, 0.25, 1)), lift: 0.06 * Math.sin(Math.PI * u) };
}

export default {
  id: 'step-up-db',
  name: 'Зашагивание на тумбу',
  muscles: { work: ['quads', 'glutes'], stretch: [], careful: ['knee'] },
  phases: [
    { name: 'вверх', cue: 'Вся стопа на тумбе', tempo_s: 1 },
    { name: 'верх', cue: 'Выпрямись, не толкай нижней', tempo_s: 1 },
    { name: 'вниз', cue: 'Медленно опусти ногу', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '8 на ногу', rest_s: 75 },
  mistakes: ['Толчок нижней ногой', 'Колено заваливается внутрь'],
  view: 'side',
  setup(T) {
    legsSetup(T); dumbbells(T); T.box = box(T, H, -0.3, 0.3, 0.22, 0.62); T.boxes = [T.box];
    T.topY = T.rig.ankleH + 0.975 * (T.rig.L1 + T.rig.L2);
  },
  pose(T, { t }) {
    const { rig } = T, tau = ((t % 4) + 4) % 4;
    // Ход левой: 0,45..0,95 с на тумбу, 2,1..3,6 с обратно на пол; пятка поднимается перед отрывом.
    const u = tau < 2 ? ss(tau, 0.45, 0.95) : 1 - ss(tau, 2.1, 3.6);
    const air = u > 0.001 && u < 0.999, toe = tau < 0.45 ? 0.4 * ss(tau, 0.1, 0.45) : 0;
    const ft = { crouch: 0 };
    ft[LEAD] = { pos: new THREE.Vector3(-XF, H, ZB), lift: 0, yaw: -0.05 };
    const tr = trailAt(u);
    ft[TRAIL] = { pos: tr.pos, lift: air ? tr.lift : 0, yaw: 0.05, toe };
    T.ft = ft; T.air = air; T.u = u;
    const up = ss(tau, 0, 1) - ss(tau, 2, 4); // таз: 0 — внизу, 1 — стоит на тумбе
    stand(T);
    trunk(T, K, lerp(76, 86, up));
    const M = new THREE.Vector3(lerp(-0.04, 0, up), 0, lerp(0.1, ZB - 0.02, up));
    M.y = Math.min(lerp(T.topY - 0.02, H + T.topY, up), reachY(T, M, ft, 0.975));
    placeHips(T, M, ft);
    look(T, new THREE.Vector3(0, 1.3, 4), 35);
    hangDBs(T, FWD, X);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [LEAD + 'Foot', LEAD + 'ToeBase'] });
    planted(T, r, LEAD, H);
    if (!T.air && T.ft[TRAIL].toe < 0.01) planted(T, r, TRAIL, T.u > 0.5 ? H : 0);
    for (const s of SIDES) footClear(T, r, s, T.boxes);
    // Вся стопа на тумбе: пятка (7 см позади щиколотки) не за краем.
    const heel = w(rig, LEAD + 'Foot').z - 0.07; r.m.heelOnBox = cm(heel - T.box.z0);
    if (heel < T.box.z0 + 0.01) r.bad.push(`пятка свисает с тумбы (${cm(heel - T.box.z0)} см)`);
    if (r.m['knee' + LEAD[0]] > 25) {
      const v = valgus(rig, LEAD, -0.05); r.m.kneeIn = Math.round(v);
      if (v > 10) r.bad.push(`${ruSide(LEAD)} колено заваливается внутрь: ${Math.round(v)}°`);
    }
    for (const s of SIDES) {
      const g = legGap(T, s, T.db[s].position, true); r.m['gap' + s[0]] = cm(g);
      if (g < -0.015) r.bad.push(`${ruSide(s, true)} гантель в ноге (${cm(g)} см)`);
    }
    const c = legsClear(T); r.m.legGap = cm(c.gap);
    if (c.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${cm(c.gap)} см)`);
    if (r.m.torso < 70) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    gaze(T, r, -35);
    return r;
  },
};
