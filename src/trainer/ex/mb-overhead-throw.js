// Бросок медбола из-за головы в стену (как вбрасывание аута). Замах: мяч поднимается над головой и уходит за неё,
// локти вперёд, корпус чуть откинут от таза (прогиб), колени мягко согнуты. Бросок: ноги разгибаются и встают на носки,
// корпус идёт вперёд, руки последними выносят мяч над головой вперёд. Мяч отскакивает от стены (1,7 м) и прилетает
// дугой в руки перед грудью. Сбоку видна цепочка ноги → корпус → руки и путь мяча.
import * as THREE from 'three';
import { cm, sgn } from '../poses.js';
import { mod, ss, track, measureFloor, legAudit, P3 } from '../jump.js';
import { R, medball, wall, arc, placeBall, body, hands, rel, frame, ballAudit } from '../medball.js';

const C = 3, TR = 1.32, TW = 1.6, TC = 2.4, WALLZ = 1.7; // цикл, выпуск, стена, ловля (с), стена (м)

export default {
  id: 'mb-overhead-throw',
  name: 'Бросок медбола из-за головы',
  muscles: { work: ['lats', 'abs', 'triceps', 'chest', 'delts_front'], stretch: ['abs', 'lats'], careful: ['shoulder_joint', 'lower_back'] },
  phases: [
    { name: 'замах', cue: 'Мяч за головой, прогиб', tempo_s: 1, stretch: true },
    { name: 'бросок', cue: 'Толкни ногами, брось вперёд', tempo_s: 0.6 },
    { name: 'ловля', cue: 'Поймай отскок перед грудью', tempo_s: 1.4 },
  ],
  mistakes: ['Бросок одними руками', 'Тяжёлый мяч, медленно'],
  dose: { sets: '2–3', reps: '8–10', rest_s: 120 },
  view: 'side',
  flat: 'side',
  pace: 'В жизни бросок взрывной, изо всех сил',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, Hs = A + 0.96 * L;
    T.mb = medball(); T.add(T.mb);
    wall(T, new THREE.Vector3(0, 1.6, WALLZ), new THREE.Vector3(0, 0, -1));
    T.ohHalf = T.hipHalf + 0.07;
    // Таз (y, z), корпус el; мяч в осях корпуса: f вперёд, u вверх от середины плеч; toe — пятки над полом.
    T.oh = track([[0, { y: Hs - 0.02, z: 0, el: 84, f: 0.42, u: -0.16, toe: 0 }],
      [0.42, { y: Hs - 0.02, z: 0, el: 86, f: 0.3, u: 0.3, toe: 0 }], [0.62, { y: Hs - 0.04, z: 0.02, el: 90, f: 0.13, u: 0.49, toe: 0 }],
      [0.85, { y: Hs - 0.07, z: 0.04, el: 93, f: -0.13, u: 0.47, toe: 0 }], [1.0, { y: Hs - 0.07, z: 0.04, el: 93, f: -0.13, u: 0.47, toe: 0 }],
      [1.16, { y: Hs - 0.03, z: 0.03, el: 90, f: 0.07, u: 0.48, toe: 0.15 }], [TR, { y: Hs + 0.01, z: 0.02, el: 82, f: 0.32, u: 0.4, toe: 0.35 }], [1.62, { y: Hs, z: 0.01, el: 76, f: 0.52, u: 0.02, toe: 0.15 }],
      [2.0, { y: Hs - 0.02, z: 0, el: 82, f: 0.46, u: -0.1, toe: 0 }], [TC, { y: Hs - 0.02, z: 0, el: 83, f: 0.46, u: -0.12, toe: 0 }]], C);
    T.ohRel = this.place(T, TR).H; T.ohCatch = this.place(T, TC).H;
    T.ohWall = new THREE.Vector3(0, T.ohRel.y - 0.05, WALLZ - R);
    T.ohOut = arc(T.ohRel, T.ohWall, TW - TR); T.ohBack = arc(T.ohWall, T.ohCatch, TC - TW);
  },
  feet(T, t) {
    const tau = mod(t, C), k = T.oh(tau), st = {};
    for (const [s, x] of [['Left', T.ohHalf], ['Right', -T.ohHalf]]) st[s] = { pos: P3(x, 0), lift: 0, yaw: Math.sign(x) * 0.07, toe: k.toe, planted: true, t0: t - tau };
    return st;
  },
  place(T, t) {
    const tau = mod(t, C), k = T.oh(tau), st = this.feet(T, t);
    body(T, { M: new THREE.Vector3(0, k.y, k.z), ft: st, el: k.el, knees: ['Left', 'Right'], lookAt: new THREE.Vector3(0, 1.25, WALLZ), nod: 40 });
    const H = rel(T, k.f, k.u); H.x = 0;
    return { tau, H };
  },
  pose(T, { t }) {
    T.tNow = t;
    const { tau, H } = this.place(T, t), F = frame(T);
    const held = tau <= TR || tau >= TC;
    // Локти: над головой вперёд и наружу, у груди вниз и наружу.
    const hi = ss(tau, 0.25, 0.6) * (1 - ss(tau, TR + 0.05, 1.7));
    const pole = (s) => F.front.clone().multiplyScalar(0.3 + 0.7 * hi).addScaledVector(F.ax, -1 + 1.3 * hi).addScaledVector(F.across, sgn(s) * 0.45);
    hands(T, H, { across: F.across, fwd: F.front, beta: held ? 20 : 10, pole, spread: held ? 0 : 0.02 + 0.015 * ss(tau, 1.9, 2.2) * (1 - ss(tau, 2.3, TC)) });
    T.held = held;
    if (held) placeBall(T, H);
    else if (tau < TW) placeBall(T, T.ohOut(tau - TR), 0.7 * (tau - TR));
    else placeBall(T, T.ohBack(tau - TW), -0.4 * (tau - TW));
  },
  audit(T) {
    const r = ballAudit(T, legAudit(T, this, T.tNow), T.held);
    r.m.ballY = cm(T.mb.position.y);
    if (T.mb.position.z > WALLZ - R + 0.005) r.bad.push('мяч в стене');
    return r;
  },
};
