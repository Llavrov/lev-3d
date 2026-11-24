// Торможение в выпад: два шага разгона, два коротких тормозящих шага с опусканием таза (второй встаёт задней ногой
// выпада), длинный шаг левой в выпад, замереть внизу (как в выпаде назад: передняя голень отвесно, бедро параллельно
// полу), толчок назад передней ногой и три шага спиной на старт. Вид сбоку. Ведущая всегда левая: поочерёдность удвоила бы цикл до 12 с.
import * as THREE from 'three';
import { lerp, clamp, w, cm } from '../poses.js';
import { mod, ss, arms, track, footAt, body, measureFloor, legAudit } from '../jump.js';
import { runParams, runArmKey, mixArms, landPhase, runArmAudit } from '../steps.js';

const C = 4.6;

export default {
  id: 'deceleration-lunge',
  name: 'Торможение в выпад',
  muscles: { work: ['quads', 'glutes', 'hamstrings', 'adductors'], stretch: ['hamstrings'], careful: ['knee', 'ankle', 'hamstrings'] },
  phases: [
    { name: 'разгон', cue: 'Два быстрых шага', tempo_s: 0.75 },
    { name: 'торможение', cue: 'Короткие шаги, ниже таз', tempo_s: 0.75 },
    { name: 'выпад', cue: 'Замри в выпаде', tempo_s: 1.4 },
    { name: 'возврат', cue: 'Толкнись назад, шаги спиной', tempo_s: 1.7 },
  ],
  mistakes: ['Торможение на прямой ноге', 'Колено уходит внутрь', 'Корпус валится вперёд'],
  dose: { sets: '3', reps: '4 на ногу', rest_s: 60 },
  view: 'quarter', // спереди-сбоку: человек крупнее, чем при виде сбоку на весь путь
  pace: 'Разгон быстрый, выпад держи 2 с', // показ идёт медленнее или короче, чем делают в жизни
  wide: true,
  follow: true, // камера едет за человеком: весь путь в кадре делал его мелким на телефоне
  flat: 'side',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, x = T.hipHalf;
    // Путь вперёд не длиннее 2 м: камера держит весь путь, а в туман сцены (7–16 м) телефон 375 px упирается при 3 м.
    const zR = 1.25, zF = zR + rig.L1 + rig.L2 * 0.88; // задняя стопа выпада и передняя: шаг выпада как в выпаде назад
    T.dlPlan = {
      Right: [{ a: 0, b: 0.2, x: -x, z: 0 }, { a: 0.45, b: 0.75, x: -x, z: 0.5, h: 0.1 }, { a: 1.05, b: 3.4, x: -x, z: zR, h: 0.08 },
        { a: 3.66, b: 3.96, x: -x, z: 0.62, h: 0.06 }, { a: 4.22, b: C + 0.2, x: -x, z: 0, h: 0.06 }],
      Left: [{ a: 0, b: 0.45, x, z: 0 }, { a: 0.75, b: 1.05, x, z: 1.0, h: 0.1 }, { a: 1.5, b: 3.15, x, z: zF, h: 0.09 },
        { a: 3.4, b: 3.68, x, z: zR, h: 0.07 }, { a: 3.94, b: C + 0.45, x, z: 0, h: 0.06 }],
    };
    T.dlLand = { Left: [0.75, 1.5], Right: [1.05] }; // постановки, где нога гасит скорость: колено обязано быть согнуто
    const Y = (k) => A + k * L, low = A + rig.L2 * 0.97, bz = zF - rig.L1 * 0.9;
    T.dlHips = track([[0, { z: 0, y: Y(0.95), el: 84 }], [0.2, { z: 0.03, y: Y(0.95), el: 82 }], [0.45, { z: 0.25, y: Y(0.93), el: 79 }],
      [0.75, { z: 0.72, y: Y(0.88), el: 81 }], [1.05, { z: 1.05, y: Y(0.82), el: 85 }], [1.5, { z: zF - 0.35, y: Y(0.78), el: 85 }],
      [1.9, { z: bz, y: low, el: 83 }], [2.9, { z: bz, y: low, el: 83 }], [3.15, { z: zF - 0.38, y: Y(0.8), el: 85 }],
      [3.4, { z: zR, y: Y(0.9), el: 86 }], [3.66, { z: 0.88, y: Y(0.88), el: 86 }], [3.94, { z: 0.3, y: Y(0.88), el: 86 }],
      [4.22, { z: 0.05, y: Y(0.93), el: 85 }], [C - 0.01, { z: 0, y: Y(0.95), el: 84 }]], C);
  },
  feet(T, t) {
    const tau = mod(t, C), base = t - tau, st = {};
    for (const s of ['Left', 'Right']) {
      const f = footAt(T.dlPlan[s], C, tau);
      if (f.planted) { f.t0 += base; f.land = T.dlLand[s].some((a) => tau >= a && tau < a + 0.3); }
      f.toe = 0;
      st[s] = f;
    }
    if (tau > 1.5 && tau < 3.15) st.Right.toe = 0.4 * ss(tau, 1.5, 1.9) * (1 - ss(tau, 2.9, 3.15)); // задняя в выпаде на носке
    return st;
  },
  pose(T, { t }) {
    T.tNow = t;
    const tau = mod(t, C), st = this.feet(T, t), h = T.dlHips(tau);
    const ft = {};
    for (const s of ['Left', 'Right']) ft[s] = { pos: st[s].pos, lift: st[s].lift, yaw: 0, toe: st[s].toe };
    // мах рук на бегу: рука вперёд против ноги впереди; в выпаде руки в стойке
    // На разгоне руки клипа бега (локти ~90°, против ног по касаниям), в выпаде и на возврате спиной — стойка.
    const run = 1 - ss(tau, 1.05, 1.5), p = runParams(T, 3.5);
    const ak = runArmKey(landPhase(T.dlLands ??= ['Left', 'Right'].flatMap((s) => T.dlPlan[s].map((q) => [q.a, s])), C, tau), p, 0.5 * (90 - h.el - 8));
    T.runInfo = { run, ak, face: new THREE.Vector3(0, 0, 1), elev: h.el };
    body(T, { M: new THREE.Vector3(0, h.y, h.z), ft, el: h.el, arm: mixArms(arms(), ak, run) });
  },
  audit(T) {
    const { rig } = T, r = legAudit(T, this, T.tNow), tau = mod(T.tNow, C);
    if (tau > 1.85 && tau < 2.95) { // низ выпада: переднее колено не за носок, заднее не в пол, корпус не валится
      const fk = w(rig, 'LeftLeg'), fa = w(rig, 'LeftFoot');
      r.m.frontKneeOverToe = cm(fk.z - fa.z);
      if (fk.z - fa.z > 0.12) r.bad.push(`переднее колено ушло за носок (${cm(fk.z - fa.z)} см)`);
      r.m.backKneeY = cm(w(rig, 'RightLeg').y);
      if (w(rig, 'RightLeg').y < 0.07) r.bad.push(`заднее колено бьётся в пол (${r.m.backKneeY} см)`);
    }
    if (r.m.torso < 72) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    return runArmAudit(T, r);
  },
};
