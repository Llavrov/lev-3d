// Птица-собака, поочерёдно: чётный цикл тянет правую руку и левую ногу, нечётный — левую руку и правую ногу (span 2).
// Четвереньки: бедро отвесно, колено на полу (сустав на 5,5 см над полом), голень и подъём стопы лежат на полу; ладони
// на ширине плеч на 6 см впереди плечевых суставов, локти мягкие (рука до запястья 0,985 своей длины), пальцы вперёд,
// запястье около 45°. Линия таз → шея поднята к голове на угол, при котором так встают руки (у модели около 12°).
// Вынос: рука уходит вперёд в линию с корпусом большим пальцем вверх, нога назад прямой в линию с тазом, носок к полу.
// Таз и корпус неподвижны: таз не раскрывается, поясница не прогибается. Голова в линию спины, взгляд в пол перед ладонями.
import * as THREE from 'three';
import { key, w, mid, SIDES, sgn, ruSide, cm, smooth, look, reachOf, baseAudit } from '../poses.js';
import { prone, palmOn, floorHand, blendHand, footAlong, legTo, PALM_Y, KNEE_Y, ANKLE_Y } from '../kneel.js';

const AHEAD = 0.18, OUT = 0.01, ARM = 0.985; // ладонь впереди и снаружи плеча, м; доля длины руки до запястья
const CYCLE = 9;
const lifter = (t) => (Math.floor(t / CYCLE) % 2 ? 'Left' : 'Right'); // чья рука тянется
const other = (s) => (s === 'Left' ? 'Right' : 'Left');
const K = key({});

// Ладонь на полу под плечом s: точка и положение кисти.
function floorPalm(T, s) {
  const S = w(T.rig, s + 'Arm');
  return new THREE.Vector3(S.x + sgn(s) * OUT, PALM_Y, S.z + AHEAD);
}
// Четвереньки: таз над коленями, угол корпуса подбирается так, чтобы рука до запястья была ARM своей длины.
function base(T) {
  const { rig } = T, M = new THREE.Vector3(0, KNEE_Y + rig.L1, 0), hand = floorHand();
  for (let i = 0; i < 6; i++) {
    prone(T, K, T.elev, M);
    const S = w(rig, 'RightArm'), P = floorPalm(T, 'Right'), [L1, L2] = rig.armLen.Right;
    const Wr = P.clone().addScaledVector(hand.F, -0.62 * rig.hand.Right.len).addScaledVector(hand.N, -0.028);
    T.elev -= (S.distanceTo(Wr) - ARM * (L1 + L2)) / 0.5 * 57.3;
  }
}
// Колено на полу под тазобедренным, голень назад по полу, стопа подъёмом на полу.
function kneel(T, s) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), Kn = new THREE.Vector3(H.x, KNEE_Y, H.z);
  const dy = KNEE_Y - ANKLE_Y, A = Kn.clone().add(new THREE.Vector3(0, -dy, -Math.sqrt(rig.L2 ** 2 - dy * dy)));
  legTo(T, s, A, Kn.clone().sub(H).add(new THREE.Vector3(0, 0, 0.3)), footAlong(T, s, A.clone().sub(Kn), Math.PI / 2));
}

export default {
  id: 'bird-dog',
  name: 'Птица-собака',
  muscles: { work: ['glutes', 'lower_back', 'abs', 'delts_front'], stretch: [], careful: ['lower_back', 'wrist'] },
  phases: [
    { name: 'вынос', cue: 'Рука и нога в линию', tempo_s: 2 },
    { name: 'держи', cue: 'Таз ровно, держи пять секунд', tempo_s: 5 },
    { name: 'возврат', cue: 'Медленно на четвереньки', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '10 на сторону', rest_s: 30 },
  view: 'side',
  flat: 'side',
  span: 2,
  setup(T) { T.elev = 10; base(T); },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth, t }) {
    const { rig } = T, arm = lifter(t), leg = other(arm), d = depth;
    T.arm = arm; T.leg = leg; T.d = d;
    prone(T, K, T.elev, new THREE.Vector3(0, KNEE_Y + rig.L1, 0));
    const hips = mid(rig, 'LeftUpLeg', 'RightUpLeg'), neck = w(rig, 'Neck'), dir = neck.clone().sub(hips).normalize();
    const hand = floorHand();
    // Опорная рука и опорное колено.
    palmOn(T, leg, floorPalm(T, leg), hand.F, hand.N, new THREE.Vector3(sgn(leg) * 0.3, 0, -1));
    kneel(T, arm);
    // Рука вперёд: ладонь от пола дугой до прямой руки в линию с корпусом, ладонь к другой руке, большой палец вверх.
    const P0 = floorPalm(T, arm), S = w(rig, arm + 'Arm'), P1 = S.clone().addScaledVector(dir, reachOf(T, arm) * 0.97);
    const P = P0.clone().lerp(P1, d).add(new THREE.Vector3(0, 0.1 * Math.sin(Math.PI * Math.min(1, d * 1.4)), 0));
    const up = blendHand(hand, { F: dir, N: new THREE.Vector3(-sgn(arm), 0, 0) }, smooth(Math.min(1, d * 1.5)));
    if (d < 1e-3) palmOn(T, arm, P0, hand.F, hand.N, new THREE.Vector3(sgn(arm) * 0.3, 0, -1));
    else palmOn(T, arm, P, up.F, up.N, new THREE.Vector3(sgn(arm) * 0.3, -1, -1).lerp(new THREE.Vector3(sgn(arm) * 0.2, -1, 0), d));
    // Нога назад: щиколотка от пола до прямой ноги на высоте таза, колено к полу, стопа из подъёма на полу в нейтраль.
    const H = w(rig, leg + 'UpLeg'), Kn = new THREE.Vector3(H.x, KNEE_Y, H.z), dy = KNEE_Y - ANKLE_Y;
    const A0 = Kn.clone().add(new THREE.Vector3(0, -dy, -Math.sqrt(rig.L2 ** 2 - dy * dy)));
    const A1 = H.clone().add(new THREE.Vector3(0, -0.04, -(rig.L1 + rig.L2) * 0.99));
    const A = A0.clone().lerp(A1, d).add(new THREE.Vector3(0, 0.12 * Math.sin(Math.PI * d), 0));
    const pole = Kn.clone().sub(H).add(new THREE.Vector3(0, 0, 0.3)).normalize().lerp(new THREE.Vector3(0, -1, 0), d);
    const shin = A.clone().sub(H).normalize();
    legTo(T, leg, A, pole, footAlong(T, leg, d < 1e-3 ? A0.clone().sub(Kn) : shin, Math.PI / 2 * (1 - d)));
    look(T, new THREE.Vector3(0, 0, w(rig, 'Head').z + 0.45), 10);
  },
  audit(T) {
    const { rig } = T, arm = T.arm, leg = T.leg, sup = leg; // опорная рука на стороне вытянутой ноги
    const r = baseAudit(T, { feet: [arm + 'Foot'] }); // опорное колено с голенью и стопой не двигаются
    const a = rig.audit();
    for (const s of SIDES) { r.m['wrist' + s[0]] = a[s].wrist; }
    if (a[sup].wrist > 50) r.bad.push(`${ruSide(sup, true)} кисть: запястье согнуто на ${a[sup].wrist}°`);
    if (T.d < 1e-3 && a[arm].wrist > 50) r.bad.push(`${ruSide(arm, true)} кисть: запястье согнуто на ${a[arm].wrist}°`);
    const palm = rig.palm(sup);
    r.m.palmY = cm(palm.y);
    if (Math.abs(palm.y - PALM_Y) > 0.01) r.bad.push(`${ruSide(sup, true)} ладонь не на полу (${cm(palm.y)} см)`);
    const S = w(rig, sup + 'Arm'), Wr = w(rig, sup + 'Hand');
    r.m.handAhead = cm(Wr.z - S.z);
    if (Math.abs(Wr.z - S.z) > 0.15 || Math.abs(Wr.x - S.x) > 0.08) r.bad.push('опорная ладонь не под плечом');
    const kn = w(rig, arm + 'Leg'), H = w(rig, arm + 'UpLeg');
    r.m.kneeY = cm(kn.y);
    if (Math.abs(kn.y - KNEE_Y) > 0.01) r.bad.push('опорное колено не на полу');
    if (Math.hypot(kn.x - H.x, kn.z - H.z) > 0.05) r.bad.push('колено не под тазом');
    const roll = w(rig, 'LeftUpLeg').y - w(rig, 'RightUpLeg').y;
    r.m.pelvisRoll = cm(roll);
    if (Math.abs(roll) > 0.02) r.bad.push(`таз раскрылся на ${cm(Math.abs(roll))} см`);
    if (T.d > 0.999) { // в удержании рука и нога в линию с корпусом
      const lift = w(rig, arm + 'Hand').y - w(rig, arm + 'Arm').y, foot = w(rig, leg + 'Foot').y - w(rig, leg + 'UpLeg').y;
      r.m.armLift = cm(lift); r.m.legLift = cm(foot);
      if (Math.abs(lift) > 0.1) r.bad.push(`рука не в линию с корпусом (${cm(lift)} см)`);
      if (foot > 0.05) r.bad.push(`нога выше таза: поясница прогнётся (${cm(foot)} см)`);
      if (foot < -0.12) r.bad.push(`нога ниже линии таза (${cm(foot)} см)`);
    }
    r.m.elev = Math.round(T.elev);
    delete r.m.torso;
    return r;
  },
};
