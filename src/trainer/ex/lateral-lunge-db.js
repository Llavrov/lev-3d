// Боковой выпад с гантелью у груди, поочерёдно (span 2): чётный цикл шагает вправо правая, нечётный — влево левая.
// Шаг широко в сторону, стопа встаёт носком вперёд, потом таз назад и вниз над шагнувшей ногой, вторая нога прямая,
// обе стопы целиком на полу. Возврат: толчок шагнувшей ногой, стопа возвращается на место. Гантель у груди (гоблет):
// с гантелями в опущенных руках шагнувшее бедро уходит в гантель.
import * as THREE from 'three';
import { lerp, clamp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, trunk, placeHips, kneeOverToe, look, baseAudit } from '../poses.js';
import { valgus } from '../jump.js';
import { legsClear } from '../steps.js';
import { legsSetup, gobletSetup, goblet, gobletAudit, reachY, planted, onSpot, gaze } from '../legs.js';

const C = 4, H0 = 0.12, W = 0.62, XB = 0.45, ZB = -0.28, EL = 62, TOE = 0.08, K = key({});
const lead = (t) => (Math.floor(t / C) % 2 ? 'Left' : 'Right');
const other = (s) => (s === 'Left' ? 'Right' : 'Left');
const ss = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));

export default {
  id: 'lateral-lunge-db',
  name: 'Боковой выпад',
  muscles: { work: ['quads', 'glutes', 'adductors'], stretch: ['adductors'], careful: ['knee', 'adductors'] },
  phases: [
    { name: 'шаг', cue: 'Широкий шаг в сторону', tempo_s: 2 },
    { name: 'низ', cue: 'Таз назад, вторая нога прямая', tempo_s: 1, stretch: true },
    { name: 'возврат', cue: 'Оттолкнись и вернись', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8 на сторону', rest_s: 60 },
  mistakes: ['Колено уходит за носок', 'Стопа рабочей ноги разворачивается'],
  view: 'front',
  span: 2,
  setup(T) {
    legsSetup(T); gobletSetup(T);
    T.topY = T.rig.ankleH + 0.975 * (T.rig.L1 + T.rig.L2);
  },
  pose(T, { t }) {
    const { rig } = T, tau = ((t % C) + C) % C, L = lead(t), Tr = other(L), k = sgn(L);
    // Шагающая стопа: 0..0,9 с в сторону, 3,3..4 с обратно; таз: 0,6..2 с вниз, 3..3,7 с вверх.
    const out = ss(tau, 0, 0.9) - ss(tau, 3.3, 4), air = (tau > 0 && tau < 0.9) || (tau > 3.3 && tau < 4);
    const fly = tau < 0.9 ? Math.sin(Math.PI * tau / 0.9) : tau > 3.3 ? Math.sin(Math.PI * (tau - 3.3) / 0.7) : 0;
    const sink = ss(tau, 0.6, 2) - ss(tau, 3, 3.7);
    const ft = { crouch: 0 };
    ft[L] = { pos: new THREE.Vector3(k * lerp(H0, W, out), 0, 0), lift: air ? 0.05 * fly : 0, yaw: k * TOE };
    ft[Tr] = { pos: new THREE.Vector3(-k * H0, 0, 0), lift: 0, yaw: -k * TOE };
    T.ft = ft; T.lead = L; T.sink = sink;
    stand(T);
    trunk(T, K, lerp(86, EL, sink));
    const M = new THREE.Vector3(k * lerp((W - H0) / 2 * out, XB, sink), 0, ZB * sink); // с шагом таз между стоп, потом над шагнувшей
    M.y = Math.min(T.topY, reachY(T, M, ft, 0.98)); // глубина — сколько позволяет прямая вторая нога
    placeHips(T, M, ft);
    if (sink > 0.05) kneeOverToe(T, L, k * TOE);
    look(T, new THREE.Vector3(k * 0.3, 1.0, 3), 35);
    goblet(T, lerp(0, -0.02, sink));
  },
  audit(T) {
    const { rig } = T, L = T.lead, Tr = other(L), r = baseAudit(T, { feet: [] });
    for (const s of SIDES) if (T.ft[s].lift < 0.001) { planted(T, r, s); onSpot(T, r, s, T.ft[s].pos); }
    if (T.sink > 0.3) {
      const v = valgus(rig, L, T.ft[L].yaw); r.m.kneeIn = Math.round(v);
      if (v > 10) r.bad.push(`${ruSide(L)} колено заваливается внутрь: ${Math.round(v)}°`);
      const over = w(rig, L + 'Leg').z - w(rig, L + 'ToeBase').z - 0.05; r.m.kneeOverToe = cm(over); // кончик пальцев на 5 см впереди подушечки
      if (over > 0) r.bad.push(`колено ушло за носок (${cm(over)} см)`);
    }
    if (T.sink > 0.95 && r.m['knee' + Tr[0]] > 25) r.bad.push(`вторая нога согнута: ${r.m['knee' + Tr[0]]}°`);
    if (r.m.torso < 55) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    const c = legsClear(T); r.m.legGap = cm(c.gap);
    if (c.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${cm(c.gap)} см)`);
    gaze(T, r, -35);
    return gobletAudit(T, r);
  },
};
