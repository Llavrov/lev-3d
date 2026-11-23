// Тайлер-твист с гибким валиком (FlexBar), больная рука — правая. Стоя, стопы на ширине таза, корпус отвесно.
// Валик 30 см держат за концы, ось валика идёт по ладони к указательному. «Закрутка»: руки от «вперёд» приходят к груди,
// валик стоит отвесно, правая кисть внизу разогнута на 40° (держит), левая сверху ладонью наружу сгибается на 45° —
// закручивает валик (полоса на нём закручивается на пол-оборота). «Вынос»: валик ложится поперёк, руки вперёд, локти
// прямые, обе ладони вниз. «Раскрутка»: левая держит, правая медленно сгибается от −40° до +35°: валик раскручивается,
// разгибатели правой кисти работают уступая. Локти прямые всю раскрутку.
import * as THREE from 'three';
import { key, w, SIDES, sgn, ruSide, cm, smooth, clamp, lerp, armIK, stand, feet, trunk, placeHips, look, reachOf, shadows, baseAudit } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';
import { bodyShape, gripAt, flexWrist, handAxes, bodyAudit, wristAudit, wristAngles } from '../arms.js';

const K = key({}), TORSO = 87, KNEE = 16, SHIN = 1;
const BAR = { len: 0.3, r: 0.021, hold: 0.1 }; // длина, радиус, середина ладони от центра валика
const EXT = -40, FLEX_L = 45, FLEX_R = 35;
const n3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

function flexbar() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#c23a2f', roughness: 0.7 });
  const c = new THREE.Mesh(new THREE.CylinderGeometry(BAR.r, BAR.r, BAR.len, 18), m); g.add(c); // ось — локальный Y
  for (const y of [-1, -0.5, 0, 0.5, 1]) { // рёбра
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BAR.r, 0.0025, 6, 18), m); ring.rotation.x = Math.PI / 2; ring.position.y = y * BAR.len * 0.42; g.add(ring);
  }
  g.stripe = [];
  const sm = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.6 });
  for (let i = 0; i < 12; i++) { // полоса вдоль валика: по ней видно, как он закручен
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, BAR.len / 12 + 0.002, 0.004), sm); g.add(s); g.stripe.push(s);
  }
  return shadows(g);
}
function twistBar(bar, k) {
  bar.stripe.forEach((s, i) => {
    const y = (i + 0.5) / 12 - 0.5, a = Math.PI * k * (y + 0.5);
    s.position.set(Math.sin(a) * BAR.r, y * BAR.len, Math.cos(a) * BAR.r); s.rotation.set(0, a, 0);
  });
}

// Положение валика и кистей по фазе: центр C, ось ax (от правой кисти к левой), сгиб запястий, закрутка 0..1.
function layout(i, u) { // h: 0 — валик отвесно у груди, 1 — поперёк на прямых руках
  if (i === 0) { // от «вперёд» к груди, потом закрутка
    const e = smooth(clamp(u * 2, 0, 1)), k = smooth(clamp(u * 2 - 1, 0, 1));
    return { h: 1 - e, fr: lerp(FLEX_R, EXT, e), fl: lerp(0, FLEX_L, k), tw: k };
  }
  if (i === 1) return { h: smooth(u), fr: EXT, fl: FLEX_L, tw: 1 };
  const e = smooth(u);
  return { h: 1, fr: lerp(EXT, FLEX_R, e), fl: lerp(FLEX_L, 0, smooth(clamp(u * 1.5 - 0.5, 0, 1))), tw: 1 - e };
}
const RAX = (s, ax) => ax.clone().multiplyScalar(s === 'Right' ? 1 : -1); // к указательному: к другой кисти

function pose(T, { i = 0, u = 0 }) {
  const { rig } = T;
  stand(T);
  trunk(T, K, TORSO);
  placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
  look(T, new THREE.Vector3(0, 0.5, 2), 35); // взгляд на руки
  const L = layout(i, u), flex = { Right: L.fr, Left: L.fl }, pole = (s) => n3(sgn(s) * 1.1, -1, -0.1);
  // Руки вперёд: запястья на прямых руках (0,995 длины) к точке перед грудью, ладони где окажутся с этим сгибом;
  // валик ляжет между ладонями. Согнутое запястье укорачивает руку, и с общей точкой для ладоней локоть сгибался.
  const hor = {};
  for (const s of SIDES) {
    const S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s], aim = T.front.clone().add(new THREE.Vector3(sgn(s) * BAR.hold, 0, 0));
    armIK(T, s, S.clone().add(aim.sub(S).normalize().multiplyScalar((L1 + L2) * 0.995)), pole(s));
    const A = rig.dirW(s + 'ForeArm', s + 'Hand'), R = RAX(s, n3(1, 0, 0));
    rig.orientHand(s, R.addScaledVector(A, -R.dot(A)).normalize(), 1, false); flexWrist(T, s, flex[s]);
    hor[s] = rig.palm(s);
  }
  const vax = n3(0.1, 1, 0.4); // отвесный валик верхом чуть вперёд: ось поперёк предплечий
  const hax = hor.Left.clone().sub(hor.Right).normalize(), hc = hor.Left.clone().add(hor.Right).multiplyScalar(0.5);
  const ax = vax.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(vax, hax), L.h));
  const c = T.chest.clone().lerp(hc, L.h).add(new THREE.Vector3(0, 0, 0.06 * Math.sin(Math.PI * L.h))); // дугой от груди
  for (const s of SIDES) {
    gripAt(T, s, c.clone().addScaledVector(ax, (s === 'Right' ? -1 : 1) * BAR.hold), RAX(s, ax), flex[s], pole(s));
    rig.grip(s, 0.95);
  }
  const pR = rig.palm('Right'), pL = rig.palm('Left'), C = pR.clone().add(pL).multiplyScalar(0.5), bax = pL.clone().sub(pR).normalize();
  const bar = T.bar;
  bar.position.copy(C); bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bax);
  twistBar(bar, L.tw); bar.updateMatrixWorld(true);
  T.L = { ...L, C, ax: bax, span: pR.distanceTo(pL) }; T.ph = i; T.u = u;
}

export default {
  id: 'tyler-twist',
  name: 'Тайлер-твист',
  muscles: { work: ['forearms'], stretch: ['forearms'], careful: ['elbow', 'wrist'] },
  phases: [
    { name: 'закрутка', cue: 'Скрути палку здоровой кистью', tempo_s: 2 },
    { name: 'вынос', cue: 'Руки вперёд, локти прямые', tempo_s: 1 },
    { name: 'раскрутка', cue: 'Отпускай медленно больной кистью', tempo_s: 4 },
  ],
  dose: { sets: '3', reps: '15', rest_s: 30 },
  mistakes: ['Быстрая раскрутка', 'Согнутые локти'],
  view: 'quarter',
  setup(T) {
    const { rig } = T;
    bodyShape(T);
    T.feetAt = feet(T, T.hipHalf);
    stand(T); trunk(T, K, TORSO); placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
    const S = w(rig, 'LeftArm').add(w(rig, 'RightArm')).multiplyScalar(0.5), half = T.shoulderHalf - BAR.hold, y = -0.12;
    const L = Math.min(reachOf(T, 'Left'), reachOf(T, 'Right')) * 0.965; // со согнутым запястьем ладонь ближе: запас, чтобы локоть остался почти прямым
    T.front = S.clone().add(new THREE.Vector3(0, y, Math.sqrt(L * L - half * half - y * y)));
    T.chest = S.clone().add(new THREE.Vector3(-0.03, -0.17, 0.37));
    T.bar = flexbar(); T.add(T.bar);
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    wristAudit(T, r);
    bodyAudit(T, r);
    const ax = T.L.ax;
    for (const s of SIDES) {
      const rel = rig.palm(s).sub(T.L.C), along = rel.dot(ax), off = rel.addScaledVector(ax, -along).length();
      const tilt = Math.round(THREE.MathUtils.radToDeg(Math.acos(Math.abs(handAxes(T, s).r.dot(ax)))));
      r.m['bar' + s[0]] = cm(off); r.m['barTilt' + s[0]] = tilt;
      if (off > 0.02 || Math.abs(along) > BAR.len / 2) r.bad.push(`${ruSide(s, true)} кисть не на валике (${cm(off)} см)`);
      if (s === 'Right') { r.m.span = cm(T.L.span); if (Math.abs(T.L.span - 2 * BAR.hold) > 0.03) r.bad.push(`ладони не на концах валика: между ними ${cm(T.L.span)} см`); }
      if (tilt > 42) r.bad.push(`${ruSide(s, true)} кисть поперёк валика: ${tilt}°`);
      // Вынос и раскрутка: локти почти прямые (до 20°), кроме самого начала выноса.
      const straight = T.ph === 2 || (T.ph === 1 && T.u > 0.9);
      if (straight && r.m['elbow' + s[0]] > 20) r.bad.push(`${ruSide(s)} локоть согнут: ${r.m['elbow' + s[0]]}°`);
    }
    r.m.wristR = wristAngles(T, 'Right').flex;
    return r;
  },
};
