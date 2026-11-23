// Бросок медбола в пол. Вверх: мяч от груди поднимается над головой на почти прямых руках, тело вытягивается на носки.
// Вниз: таз назад, корпус наклоняется из тазобедренных со спиной прямой, руки с мячом идут вниз всем телом; выпуск
// у колен, мяч бьёт в пол в полуметре перед носками. Отскок: мяч подскакивает, руки ловят его у груди, тело встаёт.
// Сбоку видно вытяжение вверх, наклон без круглой спины и путь мяча до пола и обратно.
import * as THREE from 'three';
import { cm, sgn } from '../poses.js';
import { mod, ss, track, measureFloor, legAudit, P3 } from '../jump.js';
import { R, medball, arc, placeBall, body, hands, rel, frame, ballAudit } from '../medball.js';

const C = 2.6, TR = 1.38, TF = 1.55, TC = 2.3; // цикл, выпуск, удар о пол, ловля, с

export default {
  id: 'mb-overhead-slam',
  name: 'Бросок медбола в пол',
  muscles: { work: ['abs', 'lats', 'triceps'], stretch: ['abs', 'lats'], careful: ['lower_back'] },
  phases: [
    { name: 'вверх', cue: 'Мяч над головой, на носки', tempo_s: 1, stretch: true },
    { name: 'вниз', cue: 'Брось в пол со всей силы', tempo_s: 0.6 },
    { name: 'отскок', cue: 'Поймай мяч у груди', tempo_s: 1 },
  ],
  mistakes: ['Круглая спина', 'Бросок только руками'],
  dose: { sets: '2', reps: '8', rest_s: 60 },
  view: 'side',
  flat: 'side',
  pace: 'В жизни бросок взрывной, со всей силы',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, Hs = A + 0.96 * L;
    T.mb = medball(); T.add(T.mb);
    T.slHalf = T.hipHalf + 0.08;
    // Таз (y, z), корпус el; мяч в осях корпуса f, u; toe — пятки над полом.
    T.sl = track([[0, { y: Hs - 0.03, z: 0, el: 84, f: 0.36, u: -0.18, toe: 0 }],
      [0.3, { y: Hs - 0.01, z: 0.01, el: 86, f: 0.42, u: 0.08, toe: 0.1 }], [0.6, { y: Hs + 0.01, z: 0.01, el: 89, f: 0.24, u: 0.45, toe: 0.25 }],
      [0.9, { y: Hs + 0.03, z: 0.02, el: 92, f: 0.08, u: 0.53, toe: 0.4 }], [1.0, { y: Hs + 0.03, z: 0.02, el: 92, f: 0.08, u: 0.53, toe: 0.4 }],
      [1.2, { y: Hs - 0.06, z: -0.06, el: 66, f: 0.42, u: 0.16, toe: 0 }], [TR, { y: Hs - 0.15, z: -0.14, el: 46, f: 0.5, u: -0.12, toe: 0 }],
      [1.65, { y: Hs - 0.16, z: -0.15, el: 44, f: 0.45, u: -0.18, toe: 0 }],
      [2.0, { y: Hs - 0.08, z: -0.07, el: 66, f: 0.46, u: -0.1, toe: 0 }], [TC, { y: Hs - 0.04, z: -0.02, el: 80, f: 0.44, u: -0.15, toe: 0 }]], C);
    T.slRel = this.place(T, TR).H; T.slCatch = this.place(T, TC).H;
    T.slFloor = new THREE.Vector3(0, R, Math.max(0.5, T.slRel.z + 0.08));
    T.slDown = arc(T.slRel, T.slFloor, TF - TR, 2); // вниз мяч брошен, а не уронен: g меньше, скорость задаёт бросок
    T.slUp = arc(T.slFloor, T.slCatch, TC - TF);
  },
  feet(T, t) {
    const tau = mod(t, C), k = T.sl(tau), st = {};
    for (const [s, x] of [['Left', T.slHalf], ['Right', -T.slHalf]]) st[s] = { pos: P3(x, 0), lift: 0, yaw: Math.sign(x) * 0.1, toe: k.toe, planted: true, t0: t - tau };
    return st;
  },
  place(T, t) {
    const tau = mod(t, C), k = T.sl(tau), st = this.feet(T, t);
    const down = ss(tau, 1.05, 1.3) * (1 - ss(tau, 1.8, 2.2)); // в наклоне взгляд на мяч в полу
    body(T, { M: new THREE.Vector3(0, k.y, k.z), ft: st, el: k.el, knees: ['Left', 'Right'], lookAt: new THREE.Vector3(0, 1.3 - 0.9 * down, 3 - 1.6 * down), nod: 35 });
    const H = rel(T, k.f, k.u); H.x = 0;
    return { tau, H };
  },
  pose(T, { t }) {
    T.tNow = t;
    const { tau, H } = this.place(T, t), F = frame(T);
    const held = tau <= TR || tau >= TC;
    const hi = ss(tau, 0.25, 0.6) * (1 - ss(tau, 1.1, 1.3));
    const pole = (s) => F.front.clone().multiplyScalar(-0.2 + 0.6 * hi).addScaledVector(F.ax, -1 + 1.4 * hi).addScaledVector(F.across, sgn(s) * 0.5);
    hands(T, H, { across: F.across, fwd: F.front, beta: 15, pole, spread: held ? 0 : 0.02 + 0.015 * ss(tau, 1.9, 2.1) * (1 - ss(tau, 2.2, TC)) });
    T.held = held;
    if (held) placeBall(T, H);
    else if (tau < TF) placeBall(T, T.slDown(tau - TR), 0.5 * (tau - TR));
    else placeBall(T, T.slUp(tau - TF), 0.1 + 0.3 * (tau - TF));
  },
  audit(T) {
    const r = ballAudit(T, legAudit(T, this, T.tNow), T.held);
    // В наклоне шея в линию спины, взгляд на мяч в полу законно ниже −25° (предел legAudit для стойки): свой предел −50°.
    if (r.m.torso < 70) { r.bad = r.bad.filter((b) => !b.startsWith('взгляд в пол')); if (r.m.gaze < -50) r.bad.push(`взгляд в пол: ${r.m.gaze}°`); }
    r.m.ballY = cm(T.mb.position.y);
    if (T.mb.position.y < R - 0.005) r.bad.push(`мяч в полу: ${cm(T.mb.position.y - R)} см`);
    return r;
  },
};
