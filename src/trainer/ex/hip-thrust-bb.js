// Ягодичный мост со штангой. Скамья поперёк тела, край под нижним краем лопаток; тело лежит головой к скамье (−Z),
// корпус поворачивается вокруг края скамьи. Верх: плечи, таз и колени на одной горизонтали, голень отвесно, колено 90°;
// стопы стоят на месте весь цикл. Низ: таз опускается, пока блины не встанут на пол. Гриф лежит на тазу (на сгибе бедра)
// через валик, кисти держат его прямым хватом шире таза, подбородок прижат, взгляд на колени.
import * as THREE from 'three';
import { X, UP, deg, rad, lerp, smooth, w, mid, key, V, SIDES, sgn, cm, stand, trunk, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { placeBar } from '../../gym.js';
import { floorSetup, legThrough, lowest } from '../floor.js';
import { bar, barAt, gripOnBar, bench, overBench, extreme, sink } from '../posterior.js';

const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2); // грудь вверх, голова к −Z
const K = key({ rTh: V(0.06, 0, 1), rSh: V(0, -1, 0), lTh: V(-0.06, 0, 1), lSh: V(0, -1, 0) });
const TOP = 0.42, EDGE = new THREE.Vector3(0, TOP, 0); // верх скамьи и её край
const UNDER = 0.1; // край скамьи ниже плечевых суставов вдоль корпуса, м (низ лопаток)
const GLUTE = 0.1, PAD_R = 0.045, GX = 0.27, FEET_X = 0.15; // валик на грифе; хват; стопы от середины

// Тело опущено тазом на th° ниже горизонтали (линия шея → таз), спиной на краю скамьи.
function body(T, th) {
  const { rig } = T;
  stand(T, 0, 0, 0, LYING); trunk(T, K);
  const d = new THREE.Vector3(0, -Math.sin(deg(th)), Math.cos(deg(th))), cur = mid(rig, 'LeftUpLeg', 'RightUpLeg').sub(w(rig, 'Neck')).normalize();
  T.wrap.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(cur, d)); T.wrap.updateMatrixWorld(true);
  const n = new THREE.Vector3(0, Math.cos(deg(th)), Math.sin(deg(th))); // «вперёд» груди
  T.wrap.position.add(EDGE.clone().addScaledVector(d, -UNDER).sub(mid(rig, 'LeftArm', 'RightArm'))); T.wrap.updateMatrixWorld(true);
  // Кожа спины ложится на плоскость через край скамьи.
  const lo = extreme(T, ['Spine2', 'Spine1'], n.clone().negate()).sub(EDGE).dot(n);
  T.wrap.position.addScaledVector(n, -lo); T.wrap.updateMatrixWorld(true);
  T.d = d; T.n = n;
}
// Точка грифа: над серединой тазобедренных, на коже таза плюс валик.
function barPoint(T) {
  const { rig } = T, H = mid(rig, 'LeftUpLeg', 'RightUpLeg'), n = T.n;
  const top = extreme(T, ['Hips'], n, (v) => Math.abs(v.x) < 0.12 && Math.abs(v.clone().sub(H).dot(T.d)) < 0.08);
  return H.clone().setX(0).addScaledVector(n, top.clone().sub(H).dot(n) + PAD_R);
}

// Кисти достают до грифа с запасом: руки модели короткие (0,50 м без кисти).
const reachable = (T) => SIDES.every((s) => w(T.rig, s + 'Arm').distanceTo(barPoint(T).add(new THREE.Vector3(sgn(s) * GX, 0, 0))) < 0.99 * reachOf(T, s));

// Вся поза при опускании таза на th°.
function full(T, th) {
  const { rig } = T;
  body(T, th);
  // Шея в линию спины, подбородок к груди: взгляд на колени.
  look(T, mid(rig, 'LeftUpLeg', 'RightUpLeg').addScaledVector(T.d, 0.5).addScaledVector(T.n, 0.2), 30);
  for (const s of SIDES) legThrough(T, s, w(rig, s + 'UpLeg').add(new THREE.Vector3(0, 1, 0.6)), T.foot[s], T.footFlat[s]);
  // Кисти на гриф, локти в стороны (вниз им мешает скамья).
  const C = barPoint(T);
  for (const s of SIDES) palmTo(T, s, C.clone().add(new THREE.Vector3(sgn(s) * GX, 0, 0)), new THREE.Vector3(-sgn(s), 0, 0), new THREE.Vector3(sgn(s), 0.15, 0));
  rig.grip('Right', 1); rig.grip('Left', 1);
  placeBar(T, T.bar, T.gear);
}
const armsSink = (T) => sink(T, ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftShoulder', 'RightShoulder'], TOP, (v) => overBench(T.bench, v));

export default {
  id: 'hip-thrust-bb',
  name: 'Ягодичный мост со штангой',
  muscles: { work: ['glutes', 'hamstrings'], stretch: ['hip_flexors'], careful: ['lower_back'] },
  phases: [
    { name: 'вверх', cue: 'Лопатки на скамье, толкай пятками', tempo_s: 1 },
    { name: 'верх', cue: 'Сожми ягодицы, рёбра вниз', tempo_s: 1 },
    { name: 'вниз', cue: 'Опусти таз под контролем', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '8–10', rest_s: 90 },
  mistakes: ['Прогиб в пояснице наверху', 'Толчок носками'],
  view: 'side',
  flat: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    T.bench = bench(T, new THREE.Vector3(0, 0, -0.15), { top: TOP });
    bar(T, 0.66); // блины Ø30 см: Ø45 сбоку закрывают весь таз
    T.pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R, PAD_R, 0.4, 20), new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.9 }));
    T.pad.rotation.z = Math.PI / 2; T.bar.add(T.pad);
    // Стопы: на верху колено 90°, голень отвесно.
    body(T, 0);
    T.foot = {};
    for (const s of SIDES) {
      const H = w(rig, s + 'UpLeg');
      T.foot[s] = new THREE.Vector3(sgn(s) * FEET_X, rig.ankleH, H.z + rig.L1);
    }
    // Низ: таз опускается, пока ягодицы не окажутся в GLUTE над полом, блины не встанут на пол, руки достают гриф и не ложатся в скамью.
    let lo = 0, hi = 45;
    for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; full(T, m); if (barPoint(T).y > T.plateR + 0.003 && lowest(T, ['Hips']).y > GLUTE && reachable(T) && armsSink(T) < 0.005) lo = m; else hi = m; }
    T.thLow = lo;
  },
  pose(T, { depth }) { T.depth = depth; full(T, lerp(T.thLow, 0, depth)); },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    gripOnBar(T, r);
    // Гриф на тазу через валик.
    const C = barAt(T), want = barPoint(T);
    r.m.barOnHips = cm(C.clone().sub(want).dot(T.n));
    if (Math.abs(r.m.barOnHips) > 1.5) r.bad.push(`гриф не на тазу (${r.m.barOnHips} см)`);
    r.m.plate = cm(C.y - T.plateR);
    if (C.y - T.plateR < -0.005) r.bad.push(`блины в полу (${r.m.plate} см)`);
    // Спина на скамье: кожа не уходит в подушку.
    const s = sink(T, ['Spine2', 'Spine1', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm'], TOP, (v) => overBench(T.bench, v));
    r.m.benchSink = cm(s);
    if (s > 0.012) r.bad.push(`спина в скамье на ${cm(s)} см`);
    // Верх: плечи, таз и колени в линию, голень отвесно.
    const S = mid(rig, 'LeftArm', 'RightArm').setX(0), H = mid(rig, 'LeftUpLeg', 'RightUpLeg').setX(0), Kn = mid(rig, 'LeftLeg', 'RightLeg').setX(0);
    r.m.line = Math.round(rad(H.clone().sub(S).angleTo(Kn.clone().sub(H))));
    for (const sd of SIDES) r.m['shin' + sd[0]] = Math.round(rad(w(rig, sd + 'Leg').sub(w(rig, sd + 'Foot')).angleTo(UP)));
    if (T.depth > 0.99) {
      if (r.m.line > 10) r.bad.push(`плечи, таз и колени не в линию: ${r.m.line}°`);
      if (Math.max(r.m.shinL, r.m.shinR) > 12) r.bad.push(`голень не отвесно наверху: ${Math.max(r.m.shinL, r.m.shinR)}°`);
    }
    r.m.thLow = Math.round(T.thLow); r.m.glute = cm(lowest(T, ['Hips']).y);
    if (lowest(T, ['Hips']).y < 0.005) r.bad.push('таз в полу');
    return r;
  },
};
