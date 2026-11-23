// Копенгагенская планка (длинный рычаг). Боковая планка на правом предплечье, как side-plank.js: плечо над локтем,
// голова к −X, грудь вперёд (+Z). Верхняя (левая) нога лежит внутренней стороной щиколотки на скамье, скамья стоит поперёк
// тела. Нижняя (правая) нога внизу лежит на полу, наверху поднята под скамью и касается её снизу. Таз ходит вниз до пола
// и вверх до прямой линии плечо → щиколотки; угол тела подбирается вокруг плеча.
import * as THREE from 'three';
import { V, X, FWD, deg, rad, lerp, smooth, w, mid, key, SIDES, cm, ruSide, stand, trunk, look, armIK, baseAudit } from '../poses.js';
import { floorSetup, lowest, footAlong, kneeAudit } from '../floor.js';
import { legTo } from '../kneel.js';
import { legsClear } from '../steps.js';
import { bench, overBench, sink, poke, extreme } from '../posterior.js';

const ELBOW_H = 0.045, ANKLE_SIDE = 0.06; // локоть над полом; щиколотка над опорой, тело на боку
const TOP = 0.43, PAD = 0.06; // скамья: верх подушки и её толщина
const K = key({ rUp: V(0.9, 0, 0.1), rFo: V(0.2, 0, 1), lUp: V(-0.12, -1, 0.06), lFo: V(0.02, -1, 0.25),
  rTh: V(-0.1, -1, 0), rSh: V(-0.01, -1, 0), lTh: V(0.1, -1, 0), lSh: V(0.01, -1, 0) });
const onSide = (a) => new THREE.Quaternion().setFromAxisAngle(FWD, deg(90) - a); // голова к −X, левый бок вверх

// Корпус на угле a (рад) вокруг плеча: правое плечо над локтем.
function body(T, a) {
  const { rig } = T;
  stand(T, 0, 0, 0, onSide(a)); trunk(T, K);
  const S = w(rig, 'RightArm');
  T.wrap.position.add(new THREE.Vector3(-S.x, ELBOW_H + rig.armLen.Right[0] - S.y, -S.z)); T.wrap.updateMatrixWorld(true);
}
// Таз от средней линии тела (шея → середина щиколоток) вверх, м: как в боковой планке.
function sagOf(T) {
  const { rig } = T, neck = w(rig, 'Neck'), F = w(rig, 'LeftFoot').add(w(rig, 'RightFoot')).multiplyScalar(0.5), hip = w(rig, 'Hips'), line = neck.clone().sub(F);
  return hip.clone().sub(F.clone().addScaledVector(line, hip.clone().sub(F).dot(line) / line.lengthSq())).y;
}
const hipGap = (T) => lowest(T, ['Hips', 'RightUpLeg']).y; // нижний бок таза над полом

function legs(T, depth) {
  const { rig } = T, toe = new THREE.Vector3(0, -0.2, 1).normalize();
  // Нога прямая, щиколотка лежит на скамье и перекатывается по ней к телу, пока таз опускается.
  const B = T.topFoot.clone(), H = w(rig, 'LeftUpLeg'), d = T.legD;
  B.x = H.x + Math.sqrt(Math.max(0, d * d - (H.y - B.y) ** 2 - (H.z - B.z) ** 2));
  for (let i = 0; i < 3; i++) { // щиколотка садится на подушку по коже
    legTo(T, 'Left', B, FWD);
    rig.setWorld(rig.b.LeftFoot, footAlong(T, 'Left', B.clone().sub(w(rig, 'LeftLeg')), toe)); rig.root.updateMatrixWorld(true);
    const lo = extreme(T, ['LeftLeg', 'LeftFoot'], new THREE.Vector3(0, -1, 0), (v) => overBench(T.bench, v));
    if (!lo || Math.abs(lo.y - TOP - 0.003) < 0.003) break;
    B.y += TOP + 0.003 - lo.y;
  }
  const A = T.lowFloor.clone().lerp(T.lowUnder, depth);
  legTo(T, 'Right', A, FWD);
  rig.setWorld(rig.b.RightFoot, footAlong(T, 'Right', A.clone().sub(w(rig, 'RightLeg')), toe)); rig.root.updateMatrixWorld(true);
}

export default {
  id: 'copenhagen-plank',
  name: 'Копенгагенская планка',
  muscles: { work: ['adductors', 'obliques', 'abs'], stretch: ['adductors'], careful: ['adductors', 'knee'] },
  phases: [
    { name: 'подъём', cue: 'Верхняя нога на скамье', tempo_s: 1 },
    { name: 'верх', cue: 'Тело прямое, нижняя к скамье', tempo_s: 1 },
    { name: 'вниз', cue: 'Опусти таз медленно', tempo_s: 3 },
  ],
  dose: { sets: '2–3', reps: '5–10 на сторону', rest_s: 60 },
  mistakes: ['Таз провисает', 'Старт сразу с длинного рычага'],
  view: 'front',
  flat: 'front',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    // Верх: прямое тело, левая щиколотка на высоте скамьи.
    let a = deg(12);
    for (let i = 0; i < 6; i++) { body(T, a); const S = w(rig, 'RightArm'), A = w(rig, 'LeftFoot'); a += (A.y - (TOP + ANKLE_SIDE)) / S.distanceTo(A); } // больше угол — ниже ноги
    T.aTop = a; T.sag0 = sagOf(T); // прямое тело: кость Hips у этой модели выше средней линии
    T.topFoot = w(rig, 'LeftFoot'); T.topFoot.y = TOP + ANKLE_SIDE + 0.005;
    T.legD = w(rig, 'LeftUpLeg').distanceTo(w(rig, 'LeftFoot')); // прямая нога ключа
    T.bench = bench(T, new THREE.Vector3(T.topFoot.x + 0.1, 0, 0), { top: TOP, pad: PAD, along: FWD });
    T.lowUnder = w(rig, 'RightFoot'); T.lowUnder.set(T.topFoot.x, TOP - PAD - ANKLE_SIDE + 0.012, T.topFoot.z);
    // Низ: таз опускается, пока нижний бок не ляжет у пола или верхней ноге не хватит длины до скамьи.
    let lo = T.aTop, hi = T.aTop + deg(25);
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2; body(T, m);
      const H = w(rig, 'LeftUpLeg'), slide = T.topFoot.x - H.x - Math.sqrt(Math.max(0, T.legD ** 2 - (H.y - T.topFoot.y) ** 2 - (H.z - T.topFoot.z) ** 2));
      const ok = hipGap(T) > 0.03 && slide < 0.2; // щиколотка не съезжает со скамьи
      if (ok) lo = m; else hi = m;
    }
    T.aLow = lo;
    body(T, T.aLow);
    const H = w(rig, 'RightUpLeg');
    T.lowFloor = new THREE.Vector3(T.topFoot.x, ANKLE_SIDE, H.z + 0.02); // нижняя нога лежит на полу под скамьёй и поднимается отвесно
  },
  pose(T, { depth }) {
    const { rig } = T;
    T.depth = depth;
    body(T, lerp(T.aLow, T.aTop, depth));
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, 0, 3)), 10);
    legs(T, depth);
    // Опорная рука: локоть на полу под плечом, предплечье вперёд, ладонь на полу (как в боковой планке).
    const S = w(rig, 'RightArm'), E = new THREE.Vector3(S.x, ELBOW_H, S.z), Wr = E.clone().add(new THREE.Vector3(0, -0.005, rig.armLen.Right[1]));
    armIK(T, 'Right', Wr, new THREE.Vector3(0, 0, -1));
    rig.orientHand('Right', new THREE.Vector3(1, 0, 0), 1, false);
    rig.grip('Right', 0.25); rig.relaxHand('Left'); rig.grip('Left', 0.3);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r);
    const S = w(rig, 'RightArm'), E = w(rig, 'RightForeArm');
    r.m.elbowUnder = cm(Math.hypot(S.x - E.x, S.z - E.z));
    if (r.m.elbowUnder > 5) r.bad.push(`локоть не под плечом (${r.m.elbowUnder} см)`);
    if (Math.abs(E.y - ELBOW_H) > 0.015) r.bad.push('локоть не на полу');
    // Верхняя нога на скамье: щиколотка лежит, не проваливается.
    const inPad = sink(T, ['LeftLeg', 'LeftFoot'], TOP, (v) => overBench(T.bench, v));
    const onPad = extreme(T, ['LeftLeg', 'LeftFoot'], new THREE.Vector3(0, -1, 0), (v) => overBench(T.bench, v));
    r.m.padSink = cm(inPad); r.m.padGap = onPad ? cm(onPad.y - TOP) : null;
    if (inPad > 0.012) r.bad.push(`верхняя нога в скамье на ${cm(inPad)} см`);
    if (!onPad || onPad.y - TOP > 0.015) r.bad.push('верхняя нога не на скамье');
    // Нижняя нога не проходит сквозь скамью; наверху касается её снизу.
    const under = TOP - PAD, up = poke(T, ['RightLeg', 'RightFoot', 'RightUpLeg'], under, (v) => overBench(T.bench, v));
    r.m.underPoke = cm(up);
    if (up > 0.012) r.bad.push(`нижняя нога в скамье на ${cm(up)} см`);
    const lowTop = extreme(T, ['RightLeg', 'RightFoot'], new THREE.Vector3(0, 1, 0), (v) => overBench(T.bench, v));
    r.m.underGap = lowTop ? cm(under - lowTop.y) : null;
    if (T.depth > 0.99 && (!lowTop || under - lowTop.y > 0.02)) r.bad.push('нижняя нога не у скамьи');
    // Ноги не проходят друг сквозь друга.
    const c = legsClear(T); r.m.legsGap = cm(c.gap);
    if (c.gap < -0.01) r.bad.push(`ноги друг в друге: ${c.where}`);
    // Таз: внизу не в полу, наверху на линии плечо → середина щиколоток.
    const hg = hipGap(T); r.m.hipGap = cm(hg);
    if (hg < -0.01) r.bad.push(`таз в полу на ${cm(-hg)} см`);
    const off = sagOf(T) - T.sag0, neck = w(rig, 'Neck'), hip = w(rig, 'Hips');
    r.m.sag = cm(-off);
    if (T.depth > 0.99 && Math.abs(off) > 0.03) r.bad.push(`таз ${off < 0 ? 'провис' : 'задран'} на ${cm(Math.abs(off))} см`);
    const chest = new THREE.Vector3().crossVectors(w(rig, 'LeftArm').sub(w(rig, 'RightArm')), neck.clone().sub(hip)).normalize();
    r.m.chestDown = Math.round(rad(Math.asin(Math.max(-1, Math.min(1, -chest.y)))));
    if (Math.abs(r.m.chestDown) > 15) r.bad.push(`корпус заваливается: ${r.m.chestDown}°`);
    return r;
  },
};
