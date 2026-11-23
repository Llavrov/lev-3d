// Выпад вперёд с поворотом, поочерёдно: чётный цикл шагает правая, нечётный левая (span 2). Стопа летит вперёд первой,
// таз идёт следом вперёд и вниз (передняя голень почти отвесно, заднее колено над полом, задняя стопа на подушечке).
// Внизу таз стоит ровно, грудь с руками поворачивается к передней ноге на 35° (поясница 15 %, грудной отдел остальное,
// предел 40°), голова с грудью. Возврат: грудь вперёд, толчок передней ногой назад в стойку. Руки прямые перед грудью,
// кисти вместе: так поворот виден издалека.
import * as THREE from 'three';
import { lerp, clamp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, trunk, placeHips, look, armIK, baseAudit } from '../poses.js';
import { valgus } from '../jump.js';
import { torsoFrame, armsOutOfTorso, armsApart, legsCheck } from '../warmup.js';

const C = 4, TWIST = 35;
const stepper = (t) => (Math.floor(t / C) % 2 ? 'Left' : 'Right');
const other = (s) => (s === 'Left' ? 'Right' : 'Left');
const ss = (u, a, b) => smooth(clamp((u - a) / (b - a), 0, 1));

export default {
  id: 'lunge-with-twist',
  name: 'Выпад с поворотом',
  muscles: { work: ['quads', 'glutes', 'obliques'], stretch: ['hip_flexors', 'obliques'], careful: ['knee'] },
  phases: [
    { name: 'выпад', cue: 'Шаг вперёд в выпад', tempo_s: 2 },
    { name: 'поворот', cue: 'Грудь к передней ноге', tempo_s: 1, stretch: true },
    { name: 'возврат', cue: 'Корпус вперёд, шаг назад', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '10 на ногу', rest_s: 30 },
  mistakes: ['Поворот поясницей без груди', 'Колено внутрь'],
  view: 'quarter',
  flat: 'side',
  span: 2,
  motion(i, u) { return i === 0 ? smooth(u) : i === 1 ? 1 : 1 - smooth(u); },
  pose(T, { i, u, t }) {
    const { rig } = T, front = stepper(t), back = other(front), L1 = rig.L1, L2 = rig.L2, D = L1 + L2 * 0.88;
    let foot, sink, tw;
    if (i === 0) { foot = ss(u, 0, 0.55); sink = ss(u, 0.3, 1); tw = 0; }
    else if (i === 1) { foot = 1; sink = 1; tw = smooth(u); }
    else { tw = 1 - ss(u, 0, 0.5); sink = 1 - ss(u, 0, 0.7); foot = 1 - ss(u, 0.35, 1); }
    T.front = front; T.foot = foot; T.sink = sink; T.tw = tw; T.phaseI = i;
    const moving = foot > 0.001 && foot < 0.999, ft = { crouch: 0 };
    ft[back] = { pos: new THREE.Vector3(sgn(back) * T.hipHalf, 0, 0), lift: 0, yaw: sgn(back) * 0.06, toe: 0.4 * sink };
    ft[front] = { pos: new THREE.Vector3(sgn(front) * T.hipHalf, 0, D * foot), lift: moving ? 0.07 * Math.sin(Math.PI * foot) : 0, yaw: sgn(front) * 0.06 };
    stand(T);
    trunk(T, key({ torso: (front === 'Right' ? -1 : 1) * TWIST * tw }), lerp(87, 84, sink));
    const top = new THREE.Vector3(0, rig.ankleH + 0.975 * (L1 + L2), 0), bottom = new THREE.Vector3(0, rig.ankleH + L2 * 0.97, D - L1 * 0.9);
    const M = top.clone().lerp(bottom, sink); M.z = lerp(top.z, bottom.z, smooth(clamp(sink * 1.6, 0, 1)));
    placeHips(T, M, ft);
    const F = torsoFrame(T), chest = w(rig, 'Spine2');
    look(T, chest.clone().addScaledVector(F.front, 3).setY(1.2), 25);
    for (const s of SIDES) { // руки прямые перед грудью, кисти почти вместе, локти мягко вниз
      const W = chest.clone().addScaledVector(F.front, 0.5).addScaledVector(F.up, 0.08).addScaledVector(F.across, sgn(s) * 0.05);
      armIK(T, s, W, F.up.clone().negate().addScaledVector(F.across, sgn(s) * 0.5));
      rig.relaxHand(s); rig.grip(s, 0.5);
    }
  },
  audit(T) {
    const { rig } = T, front = T.front, back = other(front);
    const r = baseAudit(T, { feet: [back + 'ToeBase'] }); // задняя стоит, пятка поднимается на подушечке
    const fk = w(rig, front + 'Leg'), fa = w(rig, front + 'Foot');
    r.m.frontKneeOverToe = cm(fk.z - fa.z);
    if (T.foot > 0.999 && fk.z - fa.z > 0.12) r.bad.push(`переднее колено ушло за носок (${cm(fk.z - fa.z)} см)`);
    if (T.foot > 0.999 && r.m['knee' + front[0]] > 25) {
      const v = Math.round(valgus(rig, front, sgn(front) * 0.06)); r.m.kneeIn = v;
      if (v > 10) r.bad.push(`${ruSide(front)} колено внутрь: ${v}°`);
    }
    if (T.foot > 0.999 && Math.abs(fa.z - (rig.L1 + rig.L2 * 0.88)) > 0.01) r.bad.push('передняя стопа скользит');
    if (T.foot > 0.999) { const toe = w(rig, front + 'ToeBase'); if (Math.abs(toe.y - T.ref[front + 'ToeBase'].y) > 0.015) r.bad.push(`передняя стопа не на полу (${cm(toe.y)} см)`); }
    const bk = w(rig, back + 'Leg'); r.m.backKneeY = cm(bk.y);
    if (bk.y < 0.07) r.bad.push(`заднее колено бьётся в пол (${cm(bk.y)} см)`);
    if (r.m.torso < 78) r.bad.push(`корпус завален вперёд: ${r.m.torso}°`);
    // Поворот: грудь к передней ноге, таз ровно.
    const F = torsoFrame(T), yawChest = Math.round(Math.atan2(F.front.x, F.front.z) * 57.3);
    const hipAx = w(rig, 'LeftUpLeg').sub(w(rig, 'RightUpLeg')), yawHips = Math.round(Math.atan2(-hipAx.z, hipAx.x) * 57.3);
    r.m.chestYaw = yawChest; r.m.hipsYaw = yawHips;
    if (Math.abs(yawHips) > 8) r.bad.push(`таз повёрнут: ${yawHips}°`);
    if (T.tw > 0.999 && sgn(front) * yawChest < 25) r.bad.push(`грудь не повернулась к передней ноге: ${yawChest}°`);
    if (Math.abs(yawChest - yawHips) > 40) r.bad.push(`скрутка больше 40°: ${yawChest - yawHips}°`);
    armsOutOfTorso(T, r); armsApart(T, r, 0.035); legsCheck(T, r);
    return r;
  },
};
