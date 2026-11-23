// Отжимания от стены с «плюсом». Стопы стоят, тело одной прямой качается вокруг щиколоток к стене (наклон β от отвеса
// подбирается так, чтобы плечо было на нужном расстоянии от ладони), ладони на стене неподвижны. Вниз: локти под 45°
// к корпусу до сгиба 100°; вверх: руки прямые; плюс: руки прямые, лопатки разводятся (ключица вперёд, T.retract < 0),
// и спина отходит от стены на несколько сантиметров; плюс отпускается в начале следующего «вниз».
// Кисть упирается в стену основаниями пальцев, пальцы мягко согнуты, основание ладони на 2–3 см от стены: плоская
// ладонь на стене при руке почти горизонтально требует разгибания запястья на 80°, у модели больше 50° кисть ломается
// на коже (проверка baseAudit). Ладони чуть выше плеч (рука поднята на 10°).
import * as THREE from 'three';
import { deg, w, key, SIDES, sgn, ruSide, cm, lerp, smooth, stand, trunk, placeHips, feet, look, reachOf, baseAudit, frameMat, shadows } from '../poses.js';
import { palmOn } from '../kneel.js';
import { floorSetup } from '../floor.js';
import { solve, bodyLine, elbowOut } from '../core.js';

const LEAN = 22, RAISE = 10, TILT = 35, ELBOW = 100; // наклон наверху от отвеса; рука к ладони над горизонталью; кисть от стены; сгиб локтя внизу, °
const K = key({});
const HAND = { F: new THREE.Vector3(0, Math.cos(deg(TILT)), Math.sin(deg(TILT))), N: new THREE.Vector3(0, -Math.sin(deg(TILT)), Math.cos(deg(TILT))) }; // пальцы вверх и к стене, ладонь к стене
const POLE = (s) => new THREE.Vector3(sgn(s) * 0.7, -1, -0.4); // локоть вниз и в сторону под 45°

function body(T, b) {
  const { rig } = T;
  stand(T);
  trunk(T, K, 90 - b);
  const d = new THREE.Vector3(0, Math.cos(deg(b)), Math.sin(deg(b)));
  placeHips(T, new THREE.Vector3(0, rig.ankleH, 0).addScaledVector(d, 0.982 * (rig.L1 + rig.L2)), feet(T, T.hipHalf));
}
// Передняя (к стене) точка кожи кисти с пальцами.
const _v = new THREE.Vector3();
function handZ(T, s) {
  const { mesh } = T; let z = -Infinity;
  T.wrap.updateMatrixWorld(true);
  for (const [n, list] of Object.entries(T.skin)) if (n.startsWith(s + 'Hand')) for (const k of list) z = Math.max(z, mesh.getVertexPosition(k, _v).applyMatrix4(mesh.matrixWorld).z);
  return z;
}
const dist = (T, b) => { body(T, b); return w(T.rig, 'RightArm').distanceTo(T.P.Right); };

export default {
  id: 'wall-push-up-plus',
  name: 'Отжимания от стены с плюсом',
  muscles: { work: ['chest', 'delts_front', 'triceps'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'вниз', cue: 'Грудь к стене', tempo_s: 2 },
    { name: 'вверх', cue: 'Выпрями руки', tempo_s: 1 },
    { name: 'плюс', cue: 'Ещё толкни лопатками', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '12–15', rest_s: 30 },
  mistakes: ['Прогиб в пояснице', 'Плечи поднимаются'],
  view: 'side',
  flat: 'side',
  wide: true, // крупный план груди и плеч снимал бы из-за стены: человек к ней лицом
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 - e : 0; },
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    T.retract = 7;
    body(T, LEAN);
    const top = reachOf(T, 'Right') * 0.985, up = new THREE.Vector3(0, Math.sin(deg(RAISE)), Math.cos(deg(RAISE)));
    T.P = {};
    for (const s of SIDES) { const S = w(rig, s + 'Arm'); T.P[s] = S.clone().addScaledVector(up, top).add(new THREE.Vector3(sgn(s) * 0.04, 0, 0)); }
    for (const s of SIDES) palmOn(T, s, T.P[s], HAND.F, HAND.N, POLE(s)), rig.grip(s, 0.5);
    T.wallZ = handZ(T, 'Right'); // стена по передней точке кисти
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 0.08), new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.9 }));
    wall.position.set(0, 1.25, T.wallZ + 0.04); T.add(shadows(wall));
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.02), frameMat()); base.position.set(0, 0.05, T.wallZ - 0.01); T.add(base); // плинтус
    T.dTop = top;
    T.bBot = solve((b) => { body(T, b); palmOn(T, 'Right', T.P.Right, HAND.F, HAND.N, POLE('Right')); return rig.audit().Right.elbow - ELBOW; }, LEAN, LEAN + 30);
    T.dBot = dist(T, T.bBot);
  },
  pose(T, { i, u, depth }) {
    const { rig } = T;
    T.plus = i === 2 ? smooth(u) : i === 0 ? 1 - smooth(Math.min(1, u * 3)) : 0;
    T.retract = lerp(7, -14, T.plus); // ключица: сведены 7° → разведены вперёд на 14°
    const want = lerp(T.dTop, T.dBot, depth);
    T.b = solve((b) => want - dist(T, b), LEAN - 8, T.bBot + 3); // больше наклон — ближе плечо к ладони
    body(T, T.b);
    look(T, new THREE.Vector3(0, w(rig, 'Head').y, T.wallZ), 18);
    for (const s of SIDES) { palmOn(T, s, T.P[s], HAND.F, HAND.N, POLE(s)); rig.grip(s, 0.5); }
  },
  audit(T) {
    const { rig, mesh } = T, r = baseAudit(T);
    delete r.m.torso;
    for (const s of SIDES) {
      const d = rig.palm(s).distanceTo(T.P[s]);
      r.m['palm' + s[0]] = cm(d);
      if (d > 0.015) r.bad.push(`${ruSide(s, true)} ладонь не на стене (${cm(d)} см)`);
      r.m['touch' + s[0]] = cm(T.wallZ - handZ(T, s));
      if (r.m['touch' + s[0]] > 1 || r.m['touch' + s[0]] < -0.8) r.bad.push(`${ruSide(s, true)} кисть ${r.m['touch' + s[0]] > 0 ? 'не касается стены' : 'в стене'}: ${r.m['touch' + s[0]]} см`);
      r.m['flare' + s[0]] = elbowOut(T, s);
      if (r.m['flare' + s[0]] > 50) r.bad.push(`${ruSide(s)} локоть в сторону: ${r.m['flare' + s[0]]}°`);
    }
    // Ближе всего к стене: кожа груди и лица.
    T.wrap.updateMatrixWorld(true);
    let near = -Infinity; const v = new THREE.Vector3();
    for (const n of ['Spine2', 'Neck', 'Head']) for (const k of T.skin[n] ?? []) near = Math.max(near, mesh.getVertexPosition(k, v).applyMatrix4(mesh.matrixWorld).z);
    r.m.wallGap = cm(T.wallZ - near);
    if (r.m.wallGap < 3) r.bad.push(`грудь или лицо в стене: ${r.m.wallGap} см`);
    const b = deg(T.b);
    bodyLine(T, r, new THREE.Vector3(0, -Math.sin(b), Math.cos(b)));
    r.m.lean = +T.b.toFixed(1); r.m.plus = +T.plus.toFixed(2);
    return r;
  },
};
