// Выпад назад с гантелями, поочерёдно: чётный цикл шагает назад правая, нечётный — левая (span 2). Передняя стопа стоит,
// задняя уходит назад дугой и встаёт на носок; внизу оба колена около 90°: передняя голень отвесно, бедро параллельно
// полу, заднее бедро отвесно, колено не касается пола. Корпус почти отвесно, гантели висят по бокам нейтральным хватом.
import * as THREE from 'three';
import { V, FWD, UP, lerp, clamp, smooth, w, key, SIDES, sgn, ruSide, cm, dumbbells, placeDB, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit, legGap } from '../poses.js';

const K = key({ rUp: V(0.1, -1, 0), rFo: V(0.08, -1, 0.05), lUp: V(-0.1, -1, 0), lFo: V(-0.08, -1, 0.05) });
const stepper = (t) => (Math.floor(t / 4) % 2 ? 'Left' : 'Right'); // цикл 4 с
const other = (s) => (s === 'Left' ? 'Right' : 'Left');

export default {
  id: 'reverse-lunge-db',
  name: 'Выпад назад с гантелями',
  muscles: { work: ['quads', 'glutes', 'hamstrings'], stretch: ['hip_flexors'], careful: ['knee'] },
  phases: [
    { name: 'шаг назад', cue: 'Длинный шаг, корпус прямо', tempo_s: 2 },
    { name: 'низ', cue: 'Оба колена под 90°', tempo_s: 1, stretch: true },
    { name: 'возврат', cue: 'Толкай передней ногой', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8 на ногу', rest_s: 75 },
  mistakes: ['Переднее колено уходит внутрь', 'Толчок задней ногой'],
  view: 'side',
  span: 2,
  setup(T) { dumbbells(T); },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth, i, t }) {
    const { rig } = T, back = stepper(t), front = other(back), L1 = rig.L1, L2 = rig.L2;
    T.front = front; T.phaseI = i;
    // Ступня летит первой (к 60 % хода уже сзади), таз опускается следом.
    const going = i === 0, foot = going ? smooth(clamp(depth / 0.6, 0, 1)) : smooth(clamp((depth - 0.4) / 0.6, 0, 1));
    const sink = going ? smooth(clamp((depth - 0.2) / 0.8, 0, 1)) : smooth(clamp(depth / 0.8, 0, 1));
    const moving = foot > 0.001 && foot < 0.999;
    const ft = { crouch: 0 };
    ft[front] = { pos: new THREE.Vector3(sgn(front) * T.hipHalf, 0, 0), lift: 0, yaw: sgn(front) * 0.06 };
    ft[back] = { pos: new THREE.Vector3(sgn(back) * T.hipHalf, 0, -(L1 + L2 * 0.88) * foot), lift: moving ? 0.07 * Math.sin(Math.PI * foot) : 0, yaw: sgn(back) * 0.06, toe: 0.4 * foot }; // пятка вверх на 3 см: у модели стопа крутая, выше — подушечка отрывается от пола
    stand(T);
    trunk(T, K, lerp(86, 82, sink));
    const top = new THREE.Vector3(0, rig.ankleH + 0.975 * (L1 + L2), -0.02), bottom = new THREE.Vector3(0, rig.ankleH + L2 * 0.97, -L1 * 0.9);
    const M = top.clone().lerp(bottom, sink); M.z = lerp(top.z, bottom.z, smooth(clamp(sink * 1.6, 0, 1))); // таз сначала назад, потом вниз: передняя голень почти отвесно
    placeHips(T, M, ft);
    look(T, new THREE.Vector3(0, 1.2, 4)); // корпус почти отвесно: взгляд вперёд (точка на полу в 4 м после нейтрали шеи опустила голову в пол)
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), P = S.clone().addScaledVector(UP, -reachOf(T, s) * 0.985);
      P.x = sgn(s) * (Math.abs(S.x) + 0.09); // кисти чуть снаружи, гантели не задевают бёдра
      placeDB(T, s, palmTo(T, s, P, FWD));
    }
    rig.grip('Right', 1); rig.grip('Left', 1);
  },
  audit(T) {
    const { rig } = T, front = T.front, back = other(front);
    const r = baseAudit(T, { feet: [front + 'Foot'] }); // стоит передняя, задняя шагает
    const fk = w(rig, front + 'Leg'), fa = w(rig, front + 'Foot');
    r.m.frontKneeOverToe = cm(fk.z - fa.z);
    if (fk.z - fa.z > 0.12) r.bad.push(`переднее колено ушло за носок (${cm(fk.z - fa.z)} см)`);
    const toe = w(rig, back + 'ToeBase'), moving = Math.abs(w(rig, back + 'Foot').z - T.ref[back + 'Foot'].z) > 0.02 && T.phaseI !== 1;
    r.m.backToeY = cm(toe.y);
    if (!moving && toe.y > T.ref[back + 'ToeBase'].y + 0.015) r.bad.push(`задняя стопа висит над полом (${cm(toe.y)} см)`);
    const bk = w(rig, back + 'Leg');
    r.m.backKneeY = cm(bk.y);
    if (bk.y < 0.07) r.bad.push(`заднее колено бьётся в пол (${cm(bk.y)} см)`);
    if (r.m.torso < 75) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    for (const s of SIDES) {
      const g = legGap(T, s, T.db[s].position, true);
      r.m['gap' + s[0]] = cm(g);
      if (g < -0.015) r.bad.push(`${ruSide(s, true)} гантель в ноге (${cm(g)} см)`);
    }
    return r;
  },
};
