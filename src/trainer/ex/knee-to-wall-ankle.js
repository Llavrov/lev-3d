// Колено к стене для голеностопа. Лицом к стене, правая впереди: носок в 10 см от стены, стопа плоско; левая сзади
// на подушечке. Колено правой идёт вперёд к стене по линии второго пальца, пятка остаётся в полу, ладони на стене.
// Таз идёт вперёд вслед за коленом, корпус прямо. Колено касается стены и возвращается. Вид сбоку с правой стороны.
import * as THREE from 'three';
import { lerp, smooth, w, key, SIDES, ruSide, cm, stand, trunk, placeHips, look, baseAudit } from '../poses.js';
import { kneeDir } from '../steps.js';
import { pelvisTilt } from '../jump.js';
import { wall, handOnWall, wallAudit, measureFoot, reachAudit, gazeAudit } from '../bandlegs.js';

const ON = 'Right', BACK = 'Left', TOE_GAP = 0.1, PHI0 = 5, PSI = 30; // носок до стены, м; голень в начале и бедро от отвеса, °
const K = key({});

export default {
  id: 'knee-to-wall-ankle',
  name: 'Колено к стене для голеностопа',
  muscles: { work: ['calves'], stretch: ['calves'], careful: ['ankle', 'knee'] },
  phases: [
    { name: 'вперёд', cue: 'Колено к стене, пятка в полу', tempo_s: 2, stretch: true },
    { name: 'назад', cue: 'Вернись', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '10 на ногу', rest_s: 15 },
  mistakes: ['Пятка отрывается', 'Колено уходит внутрь'],
  view: 'side',
  flat: 'side',
  setup(T) {
    const { rig } = T;
    stand(T); trunk(T, K, 88);
    placeHips(T, new THREE.Vector3(0, rig.ankleH + 0.975 * (rig.L1 + rig.L2), 0), { Left: { pos: new THREE.Vector3(T.hipHalf, 0, 0), lift: 0, yaw: 0 }, Right: { pos: new THREE.Vector3(-T.hipHalf, 0, 0), lift: 0, yaw: 0 }, crouch: 0 });
    measureFoot(T);
    const toeTip = T.flatFoot[ON].v.z + 0.12; // носок кроссовка впереди щиколотки: подушечка + 12 см (по кадру сбоку; 6,5 см давали носок у стены)
    const R = T.legR, rk = Math.max(R.shin[0], R.thigh[9]); // перёд колена от оси сустава
    T.kw = { wallZ: toeTip + TOE_GAP, rk };
    T.kw.phi1 = THREE.MathUtils.radToDeg(Math.asin((T.kw.wallZ - rk) / rig.L2)); // голень к отвесу, когда колено у стены
    wall(T, T.kw.wallZ);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d2r = THREE.MathUtils.degToRad, x = -T.hipHalf;
    T.depth = depth;
    const phi = d2r(lerp(PHI0, T.kw.phi1, depth)), psi = d2r(PSI);
    const A = new THREE.Vector3(x, rig.ankleH, 0), Kn = A.clone().add(new THREE.Vector3(0, rig.L2 * Math.cos(phi), rig.L2 * Math.sin(phi)));
    const Hp = Kn.clone().add(new THREE.Vector3(0, rig.L1 * Math.cos(psi), -rig.L1 * Math.sin(psi)));
    // Корпус на 6° вперёд, руки упираются в стену. Было 89 по костям (83° тела); прямо (90) плечи уходят от стены на
    // 7 см и кисть ломается в запястье на 62°. Лицо до стены в самой глубокой точке 8 см.
    stand(T); trunk(T, K, 84);
    placeHips(T, new THREE.Vector3(Hp.x + T.hipHalf, Hp.y, Hp.z), {
      [ON]: { pos: new THREE.Vector3(x, 0, 0), lift: 0, yaw: 0 },
      [BACK]: { pos: new THREE.Vector3(T.hipHalf, 0, -0.32), lift: 0, yaw: 0.05, toe: 0.4 }, crouch: 0 });
    look(T, new THREE.Vector3(0, 1.4, T.kw.wallZ + 2), 35);
    const sh = w(rig, 'RightArm').y;
    for (const s of SIDES) handOnWall(T, s, new THREE.Vector3((s === 'Left' ? 1 : -1) * 0.24, sh + 0.25, T.kw.wallZ));
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [ON + 'Foot', ON + 'ToeBase', BACK + 'ToeBase'] }); // передняя стопа плоско на месте, задняя подушечка
    const Kn = w(rig, ON + 'Leg'), front = Kn.z + T.kw.rk - T.kw.wallZ; r.m.kneeWall = cm(front);
    if (front > 0.01) r.bad.push(`колено в стене: ${cm(front)} см`);
    if (T.depth > 0.99 && front < -0.015) r.bad.push(`колено не дошло до стены: ${cm(front)} см`);
    const A = w(rig, ON + 'Foot'); r.m.heelY = cm(A.y - T.flatFoot[ON].ankleY);
    if (Math.abs(A.y - T.flatFoot[ON].ankleY) > 0.01) r.bad.push(`пятка оторвалась: ${r.m.heelY} см`);
    r.m.shin = Math.round(THREE.MathUtils.radToDeg(Math.asin((Kn.z - A.z) / Kn.distanceTo(A))));
    if (r.m.kneeR > 25) { const kin = kneeDir(T, ON, 0); r.m.kneeIn = Math.round(kin); if (kin > 10) r.bad.push(`${ruSide(ON)} колено уходит внутрь: ${r.m.kneeIn}°`); }
    const face = w(rig, 'Head').z + 0.12 - T.kw.wallZ; r.m.faceWall = cm(face); // перёд лица от кости головы ~12 см
    if (face > -0.03) r.bad.push(`лицо у стены: ${r.m.faceWall} см`);
    r.m.tilt = pelvisTilt(rig);
    if (r.m.tilt > 4) r.bad.push(`таз не ровно: ${r.m.tilt}°`);
    if (r.m.torso < 75) r.bad.push(`корпус завален: ${r.m.torso}°`);
    return gazeAudit(T, reachAudit(T, wallAudit(T, T.kw.wallZ, r)));
  },
};
