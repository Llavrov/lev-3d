// Бросок медбола от груди в стену. Стойка на ширине плеч, мяч у груди, локти вниз. Загрузка: короткий подсед, мяч
// прижат к груди. Бросок: ноги разгибаются, руки выпрямляются вперёд, мяч уходит в отметку на стене (1,7 м).
// Отскок возвращается дугой, руки встречают его почти прямыми и гасят к груди — так начинается следующий бросок.
// Сбоку видно всё: подсед, разгиб ног, вынос рук, полёт мяча до стены и обратно.
import * as THREE from 'three';
import { lerp, w, mid, cm } from '../poses.js';
import { mod, ss, track, measureFloor, legAudit, P3 } from '../jump.js';
import { R, medball, wall, arc, placeBall, body, hands, ballAudit } from '../medball.js';

const C = 3, TR = 1.3, TW = 1.62, TC = 2.35, WALLZ = 1.7; // цикл, выпуск, стена, ловля (с), стена (м)

export default {
  id: 'mb-chest-pass',
  name: 'Бросок медбола от груди',
  muscles: { work: ['chest', 'triceps', 'delts_front'], stretch: [], careful: ['wrist', 'shoulder_joint'] },
  phases: [
    { name: 'загрузка', cue: 'Мяч у груди, присед', tempo_s: 1 },
    { name: 'бросок', cue: 'Толкни взрывно вперёд', tempo_s: 0.6 },
    { name: 'ловля', cue: 'Поймай отскок, погаси к груди', tempo_s: 1.4 },
  ],
  mistakes: ['Медленный бросок', 'Локти в стороны'],
  dose: { sets: '2–3', reps: '8–10', rest_s: 90 },
  view: 'side',
  flat: 'side',
  pace: 'В жизни бросок взрывной, изо всех сил',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, Hs = A + 0.96 * L;
    T.mb = medball(); T.add(T.mb);
    wall(T, new THREE.Vector3(0, 1.35, WALLZ), new THREE.Vector3(0, 0, -1));
    T.cpHalf = T.hipHalf + 0.07;
    // Таз (y, z), корпус el, центр мяча от груди: hz вперёд, hy вверх; toe — пятки над полом на выпуске.
    T.cp = track([[0, { y: Hs - 0.02, z: 0, el: 84, hz: 0.33, hy: -0.06, toe: 0 }],
      [0.8, { y: Hs - 0.1, z: -0.05, el: 77, hz: 0.27, hy: -0.08, toe: 0 }], [1.0, { y: Hs - 0.1, z: -0.05, el: 77, hz: 0.27, hy: -0.08, toe: 0 }],
      [TR, { y: Hs + 0.01, z: 0.02, el: 85, hz: 0.56, hy: -0.02, toe: 0.35 }], [1.65, { y: Hs, z: 0.01, el: 84, hz: 0.57, hy: -0.03, toe: 0.2 }],
      [2.0, { y: Hs - 0.01, z: 0, el: 84, hz: 0.46, hy: -0.04, toe: 0 }], [TC, { y: Hs - 0.01, z: 0, el: 84, hz: 0.5, hy: -0.04, toe: 0 }]], C);
    // Где мяч на выпуске и на ловле: ставим тело и берём центр кистей.
    T.cpRel = this.place(T, TR).H; T.cpCatch = this.place(T, TC).H;
    T.cpWall = new THREE.Vector3(0, T.cpRel.y + 0.04, WALLZ - R);
    T.cpOut = arc(T.cpRel, T.cpWall, TW - TR); T.cpBack = arc(T.cpWall, T.cpCatch, TC - TW);
  },
  feet(T, t) {
    const tau = mod(t, C), k = T.cp(tau), st = {};
    for (const [s, x] of [['Left', T.cpHalf], ['Right', -T.cpHalf]]) st[s] = { pos: P3(x, 0), lift: 0, yaw: Math.sign(x) * 0.07, toe: k.toe, planted: true, t0: t - tau };
    return st;
  },
  // Тело и центр кистей H в секунду t (без рук).
  place(T, t) {
    const tau = mod(t, C), k = T.cp(tau), st = this.feet(T, t), { rig } = T;
    body(T, { M: new THREE.Vector3(0, k.y, k.z), ft: st, el: k.el, knees: ['Left', 'Right'], lookAt: new THREE.Vector3(0, 1.35, WALLZ), nod: 30 });
    const ch = w(rig, 'Spine2'), up = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize();
    const H = ch.clone().add(new THREE.Vector3(0, 0, k.hz)).addScaledVector(up, k.hy); H.x = 0;
    return { tau, H };
  },
  pose(T, { t }) {
    T.tNow = t;
    const { tau, H } = this.place(T, t);
    const held = tau <= TR || tau >= TC;
    hands(T, H, { beta: 25, pole: (s) => new THREE.Vector3((s === 'Left' ? 1 : -1) * 0.35, -1, -0.35), spread: held ? 0 : lerp(0.01, 0.035, ss(tau, 1.8, 2.1)) * (1 - ss(tau, 2.25, TC)) });
    T.held = held;
    if (held) placeBall(T, H);
    else if (tau < TW) placeBall(T, T.cpOut(tau - TR), -0.6 * (tau - TR));
    else placeBall(T, T.cpBack(tau - TW), 0.4 * (tau - TW));
  },
  audit(T) {
    const r = ballAudit(T, legAudit(T, this, T.tNow), T.held);
    r.m.ballZ = cm(T.mb.position.z);
    if (T.mb.position.z > WALLZ - R + 0.005) r.bad.push('мяч в стене');
    return r;
  },
};
