// Подъём по диагонали на блоке, снизу вверх (зеркало дровосека). Нижний ролик справа впереди, старт в полуприседе
// с корпусом, повёрнутым к блоку, рукоять у наружной стороны правого колена. Подъём: ноги выпрямляются, таз ведёт
// поворот влево, грудь догоняет, почти прямые руки выносят рукоять над левым плечом. Правая стопа проворачивается
// на подушечке и встаёт на носок. Рукоять идёт по дуге (азимут и угол к горизонту от середины плеч), как в дровосеке:
// на прямой между краями она в середине пути проходила бы у груди и сгибала локти.
import * as THREE from 'three';
import { V, X, FWD, deg, rad, lerp, clamp, smooth, w, mid, key, SIDES, ruSide, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { floorSetup } from '../floor.js';
import { band, stretch } from '../band.js';
import { station, handleBar, placeBar, onBar, skinGap, gazeAudit } from '../core.js';

const HALF = 0.32;
const PULLEY = new THREE.Vector3(-1.0, 0.3, 0.65); // справа, впереди стоп: трос идёт перед телом, а не сквозь руку
const HIGH = { az: 62, el: 38 }; // куда уходит рукоять наверху от середины плеч: азимут (+ — влево) и угол к горизонту, °
const sph = (az, el) => new THREE.Vector3(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el)));

export default {
  id: 'cable-lift',
  name: 'Подъём по диагонали на блоке',
  muscles: { work: ['obliques', 'glutes', 'delts_front', 'abs'], stretch: ['obliques'], careful: ['lower_back', 'shoulder_joint'] },
  phases: [
    { name: 'старт', cue: 'Ручка у бедра, присед', tempo_s: 1 },
    { name: 'подъём', cue: 'Толкни ногами, поверни корпус', tempo_s: 1 },
    { name: 'возврат', cue: 'Под контролем вниз', tempo_s: 2, stretch: true },
  ],
  dose: { sets: '3', reps: '8–10 на сторону', rest_s: 60 },
  mistakes: ['Руки тянут без ног', 'Прогиб в пояснице наверху'],
  view: 'front',
  sideFrom: 'left', // блок справа закрыл бы человека
  motion(i, u) { const e = smooth(u); return i === 0 ? 0 : i === 1 ? e : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    T.add(station(PULLEY, new THREE.Vector3(-0.1, 0, 0.02)));
    T.bar = handleBar(); T.add(T.bar);
    T.cable = band(T, '#111214', 0.004);
    T.footFwd = rig.footLen * Math.cos(rig.footA0);
    T.ball = new THREE.Vector3(-HALF, 0, T.footFwd);
    rig.root.updateMatrixWorld(true);
    T.latHips = X.clone().applyQuaternion(rig.b.Hips.getWorldQuaternion(new THREE.Quaternion()).invert());
    T.latSpine = X.clone().applyQuaternion(rig.b.Spine.getWorldQuaternion(new THREE.Quaternion()).invert());
  },
  pose(T, { depth }) {
    const { rig } = T, d = depth, hp = smooth(clamp(d / 0.7, 0, 1)); // таз и ноги опережают руки
    // Внизу рукоять у правого колена снаружи: азимут на блок, угол вниз; дальше по дуге вверх-влево.
    const az = lerp(-50, HIGH.az, d), el = lerp(-62, HIGH.el, d);
    const hipYaw = lerp(-35, 30, hp), torso = clamp(az, hipYaw - 40, hipYaw + 40);
    const K = key({ hips: hipYaw, torso, lean: lerp(22, 0, hp), rUp: V(-0.4, -0.6, 0.6), rFo: V(-0.3, -0.5, 0.8), lUp: V(-0.6, -0.4, 0.6), lFo: V(-0.4, -0.4, 0.8) });
    stand(T);
    trunk(T, K);
    // Правая стопа на подушечке проворачивается влево и встаёт на носок; Rig.legs сам добавляет 0,55 поворота таза.
    const turn = deg(35) * hp, hy = deg(hipYaw) * 0.55, toe = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
    const ft = { crouch: 0,
      Left: { pos: new THREE.Vector3(HALF, 0, 0), lift: 0, yaw: 0.12 - hy },
      Right: { pos: T.ball.clone().addScaledVector(toe, -T.footFwd), lift: 0, yaw: turn - hy, toe: 0.3 * hp } };
    placeHips(T, new THREE.Vector3(lerp(-0.06, 0.07, hp), rig.ankleH + lerp(0.86, 0.955, hp) * (rig.L1 + rig.L2), lerp(-0.08, 0, hp)), ft);
    const M = mid(rig, 'LeftArm', 'RightArm'), dir = sph(az, el);
    const SR = w(rig, 'RightArm'), SL = w(rig, 'LeftArm'), reach = Math.min(reachOf(T, 'Right'), reachOf(T, 'Left')) * 0.985;
    let C = M.clone();
    for (let k = 0.2; k < 1.2; k += 0.005) { const c = M.clone().addScaledVector(dir, k); if (Math.max(c.distanceTo(SR), c.distanceTo(SL)) > reach) break; C = c; }
    const ax = new THREE.Vector3().crossVectors(dir, FWD).normalize(); if (ax.x < 0) ax.negate();
    look(T, C, 35);
    const pole = new THREE.Vector3(0, -1, -0.3);
    palmTo(T, 'Right', C.clone().addScaledVector(ax, -0.055), ax, pole);
    palmTo(T, 'Left', C.clone().addScaledVector(ax, 0.055), ax.clone().negate(), pole);
    rig.grip('Right', 1); rig.grip('Left', 1);
    placeBar(T, T.bar);
    stretch(T.cable, T.bar.position, PULLEY);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightToeBase'] });
    const lh = T.latHips.clone().applyQuaternion(rig.b.Hips.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const ls = T.latSpine.clone().applyQuaternion(rig.b.Spine.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    r.m.lumbar = Math.round(rad(lh.angleTo(ls)));
    if (r.m.lumbar > 10) r.bad.push(`поясница скручена отдельно от таза: ${r.m.lumbar}°`);
    if (r.m.torso > 92) r.bad.push(`прогиб назад наверху: корпус ${r.m.torso}°`);
    for (const s of SIDES) {
      if (r.m['elbow' + s[0]] > 45) r.bad.push(`${ruSide(s)} локоть согнут ${r.m['elbow' + s[0]]}°`);
      r.m['grip' + s[0]] = onBar(T, s, T.bar);
      if (r.m['grip' + s[0]] > 2) r.bad.push(`${ruSide(s, true)} кисть не на рукояти`);
    }
    gazeAudit(T, r, 35, -45); // взгляд идёт за рукоятью: внизу в пол, наверху вверх
    const g = skinGap(T, T.bar.position, PULLEY);
    r.m.cableGap = g.gap;
    if (g.gap < 0.5) r.bad.push(`трос сквозь тело (${g.bone}, ${g.gap} см)`);
    return r;
  },
};
