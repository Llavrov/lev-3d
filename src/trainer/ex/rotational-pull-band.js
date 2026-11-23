// Ротационная тяга резинки, как двуручный бэкхенд. Резинка закреплена справа на стойке на высоте груди, человек стоит
// к ней боком в стойке с мягкими коленями, обе кисти на рукояти, руки почти прямые. Поворот: таз начинает влево,
// грудь догоняет, рукоять уходит по горизонтальной дуге перед грудью к левому боку; пауза; медленно назад к стойке.
// Правая стопа проворачивается на подушечке. Рукоять по дуге от середины плеч (азимут, угол к горизонту), как в дровосеке.
import * as THREE from 'three';
import { V, X, FWD, deg, rad, lerp, clamp, smooth, w, mid, key, SIDES, ruSide, frameMat, shadows, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { floorSetup } from '../floor.js';
import { band, stretch } from '../band.js';
import { handleBar, placeBar, onBar, skinGap, gazeAudit } from '../core.js';

const HALF = 0.3;
const ANCHOR = new THREE.Vector3(-1.2, 1.2, 0.65); // справа впереди: резинка идёт перед грудью, а не сквозь руку
const FROM = { az: -70, el: -14 }, TO = { az: 60, el: -14 }; // рукоять от середины плеч: азимут (+ — влево) и угол к горизонту, °
const sph = (az, el) => new THREE.Vector3(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el)));

export default {
  id: 'rotational-pull-band',
  name: 'Ротационная тяга резинки',
  muscles: { work: ['obliques', 'abs', 'rhomboids', 'glutes'], stretch: ['obliques'], careful: ['lower_back'] },
  phases: [
    { name: 'поворот', cue: 'Таз начинает, грудь догоняет', tempo_s: 1 },
    { name: 'держи', cue: 'Короткая пауза', tempo_s: 1 },
    { name: 'возврат', cue: 'Медленно назад', tempo_s: 2, stretch: true },
  ],
  dose: { sets: '2', reps: '12 на сторону', rest_s: 45 },
  mistakes: ['Руки тянут без корпуса'],
  view: 'front',
  sideFrom: 'left', // стойка справа закрыла бы человека
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), frameMat()); post.position.set(ANCHOR.x - 0.06, 1.1, ANCHOR.z); T.add(shadows(post));
    T.bar = handleBar(); T.add(T.bar);
    T.cable = band(T);
    T.footFwd = rig.footLen * Math.cos(rig.footA0);
    T.ball = new THREE.Vector3(-HALF, 0, T.footFwd);
    rig.root.updateMatrixWorld(true);
    T.latHips = X.clone().applyQuaternion(rig.b.Hips.getWorldQuaternion(new THREE.Quaternion()).invert());
    T.latSpine = X.clone().applyQuaternion(rig.b.Spine.getWorldQuaternion(new THREE.Quaternion()).invert());
  },
  pose(T, { depth }) {
    const { rig } = T, d = depth, hp = smooth(clamp(d / 0.7, 0, 1)); // таз и ноги опережают руки
    const az = lerp(FROM.az, TO.az, d), el = lerp(FROM.el, TO.el, d);
    const hipYaw = lerp(-30, 30, hp), torso = clamp(az, hipYaw - 40, hipYaw + 40);
    const K = key({ hips: hipYaw, torso, lean: 6, rUp: V(-0.4, -0.6, 0.6), rFo: V(-0.3, -0.5, 0.8), lUp: V(-0.6, -0.4, 0.6), lFo: V(-0.4, -0.4, 0.8) });
    stand(T);
    trunk(T, K);
    // Правая стопа на подушечке проворачивается влево и встаёт на носок; Rig.legs сам добавляет 0,55 поворота таза.
    const turn = deg(35) * hp, hy = deg(hipYaw) * 0.55, toe = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
    const ft = { crouch: 0,
      Left: { pos: new THREE.Vector3(HALF, 0, 0), lift: 0, yaw: 0.12 - hy },
      Right: { pos: T.ball.clone().addScaledVector(toe, -T.footFwd), lift: 0, yaw: turn - hy, toe: 0.3 * hp } };
    placeHips(T, new THREE.Vector3(lerp(-0.06, 0.07, hp), rig.ankleH + 0.94 * (rig.L1 + rig.L2), -0.03), ft);
    const M = mid(rig, 'LeftArm', 'RightArm'), dir = sph(az, el);
    const SR = w(rig, 'RightArm'), SL = w(rig, 'LeftArm'), reach = Math.min(reachOf(T, 'Right'), reachOf(T, 'Left')) * 0.985;
    let C = M.clone();
    for (let k = 0.2; k < 1.2; k += 0.005) { const c = M.clone().addScaledVector(dir, k); if (Math.max(c.distanceTo(SR), c.distanceTo(SL)) > reach) break; C = c; }
    const ax = new THREE.Vector3().crossVectors(dir, FWD).normalize(); if (ax.x < 0) ax.negate();
    look(T, C.clone().setY(C.y - 0.3).addScaledVector(dir.clone().setY(0).normalize(), 1.5), 35);
    const pole = new THREE.Vector3(0, -1, -0.3);
    palmTo(T, 'Right', C.clone().addScaledVector(ax, -0.055), ax, pole);
    palmTo(T, 'Left', C.clone().addScaledVector(ax, 0.055), ax.clone().negate(), pole);
    rig.grip('Right', 1); rig.grip('Left', 1);
    placeBar(T, T.bar);
    stretch(T.cable, T.bar.position, ANCHOR);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightToeBase'] });
    const lh = T.latHips.clone().applyQuaternion(rig.b.Hips.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const ls = T.latSpine.clone().applyQuaternion(rig.b.Spine.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    r.m.lumbar = Math.round(rad(lh.angleTo(ls)));
    if (r.m.lumbar > 10) r.bad.push(`поясница скручена отдельно от таза: ${r.m.lumbar}°`);
    for (const s of SIDES) {
      if (r.m['elbow' + s[0]] > 45) r.bad.push(`${ruSide(s)} локоть согнут ${r.m['elbow' + s[0]]}°`);
      r.m['grip' + s[0]] = onBar(T, s, T.bar);
      if (r.m['grip' + s[0]] > 2) r.bad.push(`${ruSide(s, true)} кисть не на рукояти`);
    }
    gazeAudit(T, r);
    const g = skinGap(T, T.bar.position, ANCHOR, 0.008);
    r.m.cableGap = g.gap;
    if (g.gap < 0.5) r.bad.push(`резинка сквозь тело (${g.bone}, ${g.gap} см)`);
    return r;
  },
};
