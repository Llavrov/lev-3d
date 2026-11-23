// Присед на одной ноге на тумбу: стоит правая, левая вытянута вперёд над полом, руки вперёд для равновесия. Вниз
// медленно, таз назад, корпус вперёд, колено над носком; внизу ягодицы только касаются тумбы (зазор по коже до 1,5 см)
// и сразу вверх. Тумба 0,46 м: у модели бедро короткое, на ней бедро чуть выше параллели.
import * as THREE from 'three';
import { UP, lerp, smooth, w, key, ruSide, cm, stand, trunk, placeHips, look, armIK, baseAudit, SIDES } from '../poses.js';
import { valgus, pelvisTilt } from '../jump.js';
import { legsClear } from '../steps.js';
import { lowest, legThrough } from '../floor.js';
import { legsSetup, box, planted, footClear, torso, gaze } from '../legs.js';

const H = 0.46, XS = -0.06, K = key({});
const STAND = 'Right', FREE = 'Left';

function body(T, depth, yB) {
  const { rig } = T;
  stand(T);
  trunk(T, K, lerp(84, 52, depth));
  const ft = { crouch: 0 };
  ft[STAND] = { pos: new THREE.Vector3(XS, 0, 0), lift: 0, yaw: -0.06 };
  ft[FREE] = { pos: new THREE.Vector3(0.12, 0, 0.3), lift: 0.3, yaw: 0.06 }; // свободную ставим сами
  placeHips(T, new THREE.Vector3(-0.02, lerp(T.topY, yB, depth), lerp(0, -0.2, depth)), ft);
  // Свободная нога вперёд, колено чуть согнуто и смотрит вверх, стопа на 14–20 см над полом: ниже на листе сбоку она читается стоящей.
  const hip = w(rig, FREE + 'UpLeg');
  legThrough(T, FREE, hip.clone().add(new THREE.Vector3(0, 0.3, 0.3)), new THREE.Vector3(0.12, rig.ankleH + lerp(0.14, 0.2, depth), hip.z + lerp(0.42, 0.72, depth)), T.footFlat[FREE]); // бедро доворачивается: надколенник вверх
  look(T, new THREE.Vector3(0, 1.0, 3), 35);
  // Руки вперёд почти прямо, кисти на высоте груди на ширине плеч (сведённые спереди читались ладонями на груди).
  const { across } = torso(rig);
  for (const s of SIDES) {
    const S = w(rig, s + 'Arm'), fwd = new THREE.Vector3(0, 0, 1);
    const P = S.clone().addScaledVector(fwd, 0.42).addScaledVector(UP, -0.08);
    armIK(T, s, P, UP.clone().negate().addScaledVector(across, s === 'Left' ? 0.3 : -0.3));
    rig.relaxHand(s); rig.grip(s, 0.4);
  }
}

export default {
  id: 'single-leg-box-squat',
  name: 'Присед на одной ноге на тумбу',
  muscles: { work: ['quads', 'glutes', 'hip_abductors'], stretch: [], careful: ['knee', 'ankle'] },
  phases: [
    { name: 'вниз', cue: 'Сядь на тумбу на одной', tempo_s: 3 },
    { name: 'касание', cue: 'Лишь коснись, не падай', tempo_s: 1 },
    { name: 'вверх', cue: 'Колено над вторым пальцем', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '6–8 на ногу', rest_s: 60 },
  mistakes: ['Колено уходит внутрь', 'Падение на тумбу'],
  view: 'quarter', // спереди-сбоку: видно и колено над носком, и вытянутую вперёд свободную ногу, и касание тумбы
  flat: 'side',
  setup(T) {
    const { rig } = T;
    legsSetup(T);
    T.box = box(T, H, -0.25, 0.22, -0.62, -0.14); T.boxes = [T.box];
    T.topY = rig.ankleH + 0.975 * (rig.L1 + rig.L2);
    // Низ: таз опускается, пока кожа ягодиц не встанет на тумбу с зазором 0,5 см.
    let y = H + 0.12;
    for (let i = 0; i < 6; i++) { body(T, 1, y); y -= lowest(T, ['Hips']).y - H - 0.005; }
    T.bottomY = y;
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) { T.depth = depth; body(T, depth, T.bottomY); },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [STAND + 'Foot', STAND + 'ToeBase'] });
    planted(T, r, STAND, 0);
    for (const s of SIDES) footClear(T, r, s, T.boxes);
    if (r.m['knee' + STAND[0]] > 25) {
      const v = valgus(rig, STAND, -0.06); r.m.kneeIn = Math.round(v);
      if (v > 10) r.bad.push(`${ruSide(STAND)} колено заваливается внутрь: ${Math.round(v)}°`);
    }
    const fa = w(rig, FREE + 'Foot'); r.m.freeFootY = cm(fa.y - T.flat.ank);
    if (fa.y - T.flat.ank < 0.02) r.bad.push(`свободная стопа на полу (${cm(fa.y - T.flat.ank)} см)`);
    const seat = lowest(T, ['Hips']), onBox = seat.p.z < T.box.z1 && seat.p.z > T.box.z0;
    r.m.seat = cm(seat.y - H);
    if (onBox && seat.y < H - 0.01) r.bad.push(`таз провалился в тумбу (${cm(seat.y - H)} см)`);
    if (T.depth > 0.99 && (!onBox || seat.y > H + 0.015)) r.bad.push(`внизу нет касания тумбы (${cm(seat.y - H)} см)`);
    r.m.pelvis = pelvisTilt(rig);
    if (r.m.pelvis > 8) r.bad.push(`таз перекошен: ${r.m.pelvis}°`);
    const c = legsClear(T); r.m.legGap = cm(c.gap);
    if (c.gap < -0.01) r.bad.push(`ноги проходят друг сквозь друга (${cm(c.gap)} см)`);
    if (r.m.torso < 45) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    gaze(T, r, -35);
    return r;
  },
};
