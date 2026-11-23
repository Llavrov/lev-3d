// Боковой бросок медбола в стену (стена слева, 1,3 м). Стойка шире плеч боком к стене. Замах: мяч уносится к правому
// бедру, вес на правую ногу, таз и грудь развёрнуты вправо, руки почти прямые. Разворот по порядку: таз, потом грудь,
// потом руки; правая стопа проворачивается на подушечке к стене и встаёт на носок. Выпуск на уровне груди, мяч бьёт
// в стену и отскакивает обратно, руки ловят его слева и снова уносят к бедру. Спереди видно и разворот, и полёт.
import * as THREE from 'three';
import { deg, rad, w } from '../poses.js';
import { mod, ss, track, measureFloor, legAudit, P3 } from '../jump.js';
import { R, medball, wall, arc, placeBall, body, hands, rel, frame, ballAudit } from '../medball.js';

const C = 3, TR = 1.55, TW = 1.82, TC = 2.55, WALLX = 1.3, HALF = 0.3; // цикл, выпуск, стена, ловля (с), стена, полуширина стойки (м)
const PIV = 0.9; // разворот правой стопы на подушечке, рад

export default {
  id: 'mb-side-throw',
  name: 'Боковой бросок медбола',
  muscles: { work: ['obliques', 'glutes', 'abs', 'delts_front'], stretch: ['obliques'], careful: ['lower_back'] },
  phases: [
    { name: 'замах', cue: 'Загрузи заднюю ногу', tempo_s: 1, stretch: true },
    { name: 'разворот', cue: 'Таз, грудь, руки по порядку', tempo_s: 0.55 },
    { name: 'бросок', cue: 'Выпусти в стену', tempo_s: 0.45 },
    { name: 'ловля', cue: 'Поймай отскок слева', tempo_s: 1 },
  ],
  mistakes: ['Руки тянут без таза', 'Мяч тяжелее 2–3 кг'],
  dose: { sets: '2–3', reps: '8–10 на сторону', rest_s: 120 },
  view: 'front',
  flat: 'front',
  pace: 'В жизни разворот взрывной, изо всех сил',
  setup(T) {
    measureFloor(T);
    const { rig } = T, L = rig.L1 + rig.L2, A = rig.ankleH, Hs = A + 0.93 * L;
    T.mb = medball(); T.add(T.mb);
    wall(T, new THREE.Vector3(WALLX, 1.2, 0.3), new THREE.Vector3(-1, 0, 0));
    T.footFwd = rig.footLen * Math.cos(rig.footA0);
    T.stBall = new THREE.Vector3(-HALF, 0, T.footFwd); // правая подушечка
    // Таз: x сдвиг (вес на ногу), y; hips и torso — поворот, ° (+ к стене); мяч в осях корпуса f, u, x; piv — доля разворота стопы.
    T.sd = track([[0, { x: 0.04, y: Hs, hips: 20, torso: 45, f: 0.42, u: -0.2, b: 0, piv: 0.3 }],
      [0.8, { x: -0.07, y: Hs - 0.05, hips: -28, torso: -62, f: 0.4, u: -0.38, b: 0, piv: 0 }], [1.0, { x: -0.07, y: Hs - 0.05, hips: -28, torso: -62, f: 0.4, u: -0.38, b: 0, piv: 0 }],
      [1.25, { x: 0, y: Hs - 0.03, hips: 10, torso: -28, f: 0.42, u: -0.32, b: 0, piv: 0.5 }],
      [TR, { x: 0.06, y: Hs, hips: 38, torso: 50, f: 0.48, u: -0.14, b: 0, piv: 1 }], [1.85, { x: 0.07, y: Hs, hips: 40, torso: 68, f: 0.5, u: -0.12, b: 0, piv: 1 }],
      [2.2, { x: 0.05, y: Hs, hips: 30, torso: 55, f: 0.46, u: -0.14, b: 0, piv: 0.7 }], [TC, { x: 0.05, y: Hs, hips: 26, torso: 52, f: 0.46, u: -0.16, b: 0, piv: 0.55 }]], C);
    T.sdRel = this.place(T, TR).H; T.sdCatch = this.place(T, TC).H;
    T.sdWall = new THREE.Vector3(WALLX - R, T.sdRel.y + 0.05, T.sdRel.z + 0.05);
    T.sdOut = arc(T.sdRel, T.sdWall, TW - TR); T.sdBack = arc(T.sdWall, T.sdCatch, TC - TW);
  },
  feet(T, t) {
    const tau = mod(t, C), k = T.sd(tau), turn = PIV * k.piv, toe = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
    return {
      Left: { pos: P3(HALF, 0), lift: 0, yaw: 0.12, toe: 0, planted: true, t0: t - tau },
      Right: { pos: T.stBall.clone().addScaledVector(toe, -T.footFwd), lift: 0, yaw: turn, toe: 0.35 * k.piv, planted: true, t0: t - tau },
    };
  },
  place(T, t) {
    const tau = mod(t, C), k = T.sd(tau), st = this.feet(T, t);
    body(T, { M: new THREE.Vector3(k.x, k.y, 0), ft: st, el: 80, hips: k.hips, torso: k.torso, knees: ['Left'], lookAt: w(T.rig, 'Head').setY(1.2).add(new THREE.Vector3(Math.sin(deg(k.torso)) * 3, 0, Math.cos(deg(k.torso)) * 3)), nod: 35 });
    return { tau, H: rel(T, k.f, k.u) };
  },
  pose(T, { t }) {
    T.tNow = t;
    const { tau, H } = this.place(T, t), F = frame(T);
    const held = tau <= TR || tau >= TC;
    const pole = (s) => F.ax.clone().negate().addScaledVector(F.across, (s === 'Left' ? 1 : -1) * 0.5).addScaledVector(F.front, -0.2);
    hands(T, H, { across: F.across, fwd: new THREE.Vector3(1, 0, 0), beta: 25, pole, spread: held ? 0 : 0.03 * ss(tau, 2.0, 2.2) * (1 - ss(tau, 2.45, TC)) + 0.01 });
    T.held = held;
    if (held) placeBall(T, H);
    else if (tau < TW) placeBall(T, T.sdOut(tau - TR), -0.5 * (tau - TR), new THREE.Vector3(0, 0, 1));
    else placeBall(T, T.sdBack(tau - TW), 0.3 * (tau - TW), new THREE.Vector3(0, 0, 1));
  },
  audit(T) {
    const { rig } = T, r = ballAudit(T, legAudit(T, this, T.tNow), T.held);
    // Скрутка от таза: грудь не дальше 40° от таза (Rig.pose режет ключ, проверяем итог по линиям плеч и таза).
    const hl = w(rig, 'LeftUpLeg').sub(w(rig, 'RightUpLeg')).setY(0).normalize(), sl = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).setY(0).normalize();
    r.m.twist = Math.round(rad(hl.angleTo(sl)));
    if (r.m.twist > 45) r.bad.push(`грудь скручена от таза на ${r.m.twist}°`);
    if (T.mb.position.x > WALLX - R + 0.005) r.bad.push('мяч в стене');
    return r;
  },
};
