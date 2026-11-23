// Выпад «спайдермен», поочерёдно: чётный цикл шагает правая нога, нечётный — левая (span 2).
// Упор лёжа на ладонях: ладони на 18 см впереди плечевых суставов и на 1 см снаружи, кисть вниз на 20°, запястье около 45°,
// локти мягкие (рука до запястья 0,985 длины), тело прямой линией от шеи до щиколоток, упор на подушечки, пальцы стоп
// подогнуты вперёд. Угол тела и высота таза подбираются так, чтобы рука встала в эту длину, а подушечка — на пол.
// Шаг: стопа дугой встаёт плоско снаружи от руки той же стороны: на 0,3 м от середины тела и на 0,12 м впереди
// тазобедренных, носок наружу на 17°. До ладони, как у человека, стопа не достаёт: бедро модели 0,35 м против 0,44.
// Бедро довёрнуто так, что колено на коже гнётся правильно (kneel.legTo): колено высоко у плеча, голень почти отвесно.
// Растяжка: таз опускается на 15 см, задняя нога почти прямая на подушечке, рука той же стороны отрывается, локоть
// тянется вниз к внутренней стороне стопы (у модели доходит до 21–22 см). Смена: стопа возвращается в упор.
import * as THREE from 'three';
import { key, w, mid, SIDES, sgn, ruSide, cm, smooth, clamp, look, armIK, baseAudit } from '../poses.js';
import { prone, palmOn, floorHand, toesTo, legTo, PALM_Y } from '../kneel.js';

const AHEAD = 0.18, OUT = 0.01, ARM = 0.985, TOE_Y = 0.025; // ладонь от плеча, м; доля руки; подушечка стопы над полом
const DROP = 0.15, FWD = 0; // таз в растяжке ниже и впереди, м
const FOOT_X = 0.3, FOOT_Z = 0.12; // передняя стопа: от середины тела в сторону и впереди тазобедренных, м
const CYCLE = 5;
const stepper = (t) => (Math.floor(t / CYCLE) % 2 ? 'Left' : 'Right');
const other = (s) => (s === 'Left' ? 'Right' : 'Left');
const K = key({ rTh: new THREE.Vector3(0.06, -1, 0.1).normalize(), rSh: new THREE.Vector3(0.06, -1, 0).normalize(),
  lTh: new THREE.Vector3(-0.06, -1, 0.1).normalize(), lSh: new THREE.Vector3(-0.06, -1, 0).normalize() }); // ноги прямо, чуть врозь

const floorPalm = (T, s, S = T.plank.S[s]) => new THREE.Vector3(S.x + sgn(s) * OUT, PALM_Y, S.z + AHEAD);
const UPV = new THREE.Vector3(0, 1, 0);

// Упор лёжа: угол тела e и высота таза h, при которых рука до запястья ARM своей длины, а подушечки на полу.
function plank(T) {
  const { rig } = T, hand = floorHand(), [L1, L2] = rig.armLen.Right;
  let e = 12, h = 0.5;
  for (let i = 0; i < 30; i++) {
    prone(T, K, e, new THREE.Vector3(0, h, 0));
    const S = w(rig, 'RightArm'), P = new THREE.Vector3(S.x - OUT, PALM_Y, S.z + AHEAD);
    const Wr = P.clone().addScaledVector(hand.F, -0.62 * rig.hand.Right.len).addScaledVector(hand.N, -0.028);
    h -= (S.distanceTo(Wr) - ARM * (L1 + L2)) * 0.9;
    const toe = Math.min(w(rig, 'RightToeBase').y, w(rig, 'LeftToeBase').y);
    e += (toe - TOE_Y) / 1.3 * 57.3;
  }
  prone(T, K, e, new THREE.Vector3(0, h, 0));
  T.plank = { e, M: new THREE.Vector3(0, h, 0), S: {}, A: {}, foot: {}, neck: mid(rig, 'LeftArm', 'RightArm') };
  for (const s of SIDES) {
    T.plank.S[s] = w(rig, s + 'Arm'); T.plank.A[s] = w(rig, s + 'Foot');
    T.plank.foot[s] = rig.b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion());
  }
}

export default {
  id: 'spiderman-lunge',
  name: 'Выпад «спайдермен»',
  muscles: { work: ['abs', 'delts_front', 'quads'], stretch: ['hip_flexors', 'adductors', 'glutes'], careful: ['wrist', 'lower_back'] },
  phases: [
    { name: 'шаг', cue: 'Стопа шагает к руке, снаружи', tempo_s: 2 },
    { name: 'растяжка', cue: 'Таз вниз, локоть тянется к стопе', tempo_s: 2, stretch: true },
    { name: 'смена', cue: 'Стопа назад, другая нога', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '6 на сторону', rest_s: 30 },
  view: 'side',
  flat: 'side',
  span: 2,
  setup(T) { plank(T); },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { i, u, t }) {
    const { rig } = T, P0 = T.plank, front = stepper(t), back = other(front);
    // Ход стопы (0 — упор, 1 — у ладони) и растяжки (0 — таз в линии, 1 — таз внизу, локоть у стопы).
    const step = i === 0 ? smooth(u) : i === 1 ? 1 : 1 - smooth(clamp(u * 1.4 - 0.3, 0, 1));
    const sink = i === 1 ? smooth(clamp(u * 1.6, 0, 1)) : i === 2 ? 1 - smooth(clamp(u * 2, 0, 1)) : 0;
    T.front = front; T.back = back; T.step = step; T.sink = sink;
    // Таз вниз и вперёд, плечи остаются над ладонями: линия таз → плечи поворачивается.
    const M = P0.M.clone().add(new THREE.Vector3(0, -DROP * sink, FWD * sink));
    const a0 = Math.atan2(P0.neck.y - P0.M.y, P0.neck.z - P0.M.z), a1 = Math.atan2(P0.neck.y - M.y, P0.neck.z - M.z);
    prone(T, K, P0.e + (a1 - a0) * 57.3, M);
    const hand = floorHand(), pole = (s) => new THREE.Vector3(sgn(s) * 0.3, 0, -1);
    // Опорная рука на полу; рука стороны шага на полу, в растяжке отрывается, локоть к стопе.
    palmOn(T, back, floorPalm(T, back), hand.F, hand.N, pole(back));
    const Pf = floorPalm(T, front);
    const Af = new THREE.Vector3(sgn(front) * FOOT_X, rig.ankleH, P0.M.z + FOOT_Z); // бедро модели короче человеческого: до ладони стопа не достаёт
    if (sink < 1e-3) palmOn(T, front, Pf, hand.F, hand.N, pole(front));
    else {
      const S = w(rig, front + 'Arm'), [L1, L2] = rig.armLen[front];
      const E = Af.clone().add(new THREE.Vector3(-sgn(front) * 0.1, 0.12, 0.06)), d = E.clone().sub(S);
      const Eb = S.clone().addScaledVector(d.normalize(), L1), W1 = Eb.clone().add(new THREE.Vector3(-sgn(front) * 0.04, -L2 * 0.97, 0.06));
      const W0 = Pf.clone().addScaledVector(hand.F, -0.062).addScaledVector(hand.N, -0.028);
      const Wr = W0.lerp(W1, sink).addScaledVector(UPV, 0.06 * Math.sin(Math.PI * sink));
      armIK(T, front, Wr, Eb.clone().sub(S.clone().lerp(Wr, 0.5)));
      rig.relaxHand(front); rig.grip(front, 0.3);
    }
    // Задняя нога: щиколотка и стопа на месте упора, колено к полу.
    legTo(T, back, P0.A[back], new THREE.Vector3(0, -1, 0.2), P0.foot[back]);
    toesTo(T, back, new THREE.Vector3(0, -0.05, 1));
    // Передняя нога: стопа дугой из упора к ладони, колено наружу и вверх, стопа плоско носком наружу на 17°.
    const A = P0.A[front].clone().lerp(Af, step).addScaledVector(UPV, 0.05 * Math.sin(Math.PI * step));
    const flat = new THREE.Quaternion().setFromAxisAngle(UPV, sgn(front) * 0.3).multiply(T.footFlat[front]);
    legTo(T, front, A, new THREE.Vector3(sgn(front) * 0.6, 1, 0.8), P0.foot[front].clone().slerp(flat, smooth(clamp(step * 1.3 - 0.3, 0, 1))));
    if (step < 0.5) toesTo(T, front, new THREE.Vector3(0, -0.05, 1).lerp(new THREE.Vector3(0, -1, 0.3), step * 2));
    look(T, new THREE.Vector3(0, 0, w(rig, 'Head').z + 0.5), 10);
  },
  audit(T) {
    const { rig } = T, front = T.front, back = T.back;
    const r = baseAudit(T, { feet: [back + 'Foot'] });
    const a = rig.audit();
    for (const s of SIDES) r.m['wrist' + s[0]] = a[s].wrist;
    const onFloor = T.sink < 1e-3 ? SIDES : [back];
    for (const s of onFloor) {
      if (a[s].wrist > 50) r.bad.push(`${ruSide(s, true)} кисть: запястье согнуто на ${a[s].wrist}°`);
      const p = rig.palm(s);
      r.m['palmY' + s[0]] = cm(p.y);
      if (Math.abs(p.y - PALM_Y) > 0.01) r.bad.push(`${ruSide(s, true)} ладонь не на полу (${cm(p.y)} см)`);
    }
    const toe = w(rig, back + 'ToeBase');
    r.m.backToeY = cm(toe.y);
    if (Math.abs(toe.y - TOE_Y) > 0.015) r.bad.push(`задняя стопа не на подушечке (${cm(toe.y)} см)`);
    // Таз от линии плечи → щиколотки (в упоре: провис или задран).
    const Sm = mid(rig, 'LeftArm', 'RightArm'), A = w(rig, back + 'Foot'), H = mid(rig, 'LeftUpLeg', 'RightUpLeg');
    const line = Sm.clone().sub(A), k = H.clone().sub(A).dot(line) / line.lengthSq(), off = H.y - (A.y + line.y * k);
    r.m.hipsOffLine = cm(off);
    if (T.sink < 1e-3 && T.step < 1e-3 && Math.abs(off) > 0.03) r.bad.push(`таз не в линии тела (${cm(off)} см)`);
    if (T.step > 0.999) {
      const fa = w(rig, front + 'Foot');
      r.m.frontFootY = cm(fa.y - rig.ankleH);
      if (Math.abs(fa.y - rig.ankleH) > 0.01) r.bad.push('передняя стопа не на полу');
      const fk = w(rig, front + 'Leg'), sh = w(rig, front + 'Arm');
      r.m.kneeOutOfShoulder = cm(Math.abs(fk.x) - Math.abs(sh.x));
      const shin = fk.clone().sub(fa).setX(0), tilt = Math.round(THREE.MathUtils.radToDeg(shin.angleTo(UPV)));
      r.m.frontShin = tilt; r.m.kneeOverAnkle = cm(fk.z - fa.z); // голень от отвеса вперёд-назад (вбок колено уходит к плечу), колено впереди щиколотки
      if (tilt > 25) r.bad.push(`передняя голень не отвесно: ${tilt}°`);
    }
    if (T.sink > 0.999) r.m.elbowToFoot = cm(w(rig, front + 'ForeArm').distanceTo(w(rig, front + 'Foot')));
    r.m.elev = Math.round(T.plank.e);
    delete r.m.torso;
    return r;
  },
};
