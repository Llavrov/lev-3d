// Обратный бросок с резинкой: торможение руки после подачи, правая (игровая) рука. Стоя, стопы чуть шире таза, колени
// мягкие, корпус почти отвесно (82°) и не крутится: работает плечо. Резинка закреплена впереди слева низко (0,35 м),
// ручка в правой. Старт — рука в конце подачи: плечо вниз и через тело к левому бедру, локоть почти прямой. «Назад»: рука
// идёт через «вперёд на уровне груди» в замах подачи — плечо в сторону на уровне плеча и чуть вперёд, локоть 90°,
// предплечье вверх (поворот плеча наружу). «Возврат» — тот же путь обратно, медленно. Путь по трём ключам, между ними
// направления плеча и предплечья поворачиваются по дуге. Левая рука висит вдоль тела.
import * as THREE from 'three';
import { key, w, ruSide, cm, smooth, clamp, stand, feet, trunk, placeHips, look, baseAudit } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';
import { band, stretch } from '../band.js';
import { bodyShape, anchor, handle, placeHandle, handleGap, bodyAudit, bandClear, legClear, wristAudit } from '../arms.js';

const K = key({}), TORSO = 82, KNEE = 20, SHIN = 3;
const ANCHOR = new THREE.Vector3(0.35, 0.35, 0.75);
const n3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
// Ключи правой руки (мир, тело смотрит в +Z, правая сторона в −X): плечо u и предплечье f.
const KEYS = [
  { u: n3(0.15, -0.5, 0.85), f: n3(0.62, -0.45, 0.64) }, // конец подачи: к левому бедру
  { u: n3(-0.25, -0.15, 1), f: n3(-0.15, 0.45, 0.88) }, // вперёд на уровне груди
  { u: n3(-1, 0.05, 0.45), f: n3(-0.1, 0.9, 0.4) }, // замах: локоть 90°, предплечье вверх
];
const slerpV = (a, b, k) => a.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(a, b), k));
function armAt(d) {
  const k = clamp(d * 2, 0, 2), i = Math.min(1, Math.floor(k)), e = k - i, A = KEYS[i], B = KEYS[i + 1];
  return { u: slerpV(A.u, B.u, e), f: slerpV(A.f, B.f, e) };
}

function pose(T, { depth }) {
  const { rig } = T;
  stand(T);
  trunk(T, K, TORSO);
  placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
  look(T, new THREE.Vector3(0, 1.2, 3), 18);
  rig.root.updateMatrixWorld(true);
  const { u, f } = armAt(depth);
  rig.arm('Right', u.applyQuaternion(rig.toPlayer), f.applyQuaternion(rig.toPlayer));
  rig.relaxHand('Right'); rig.grip('Right', 1);
  rig.arm('Left', n3(0.12, -1, 0.04).applyQuaternion(rig.toPlayer), n3(0.06, -1, 0.15).applyQuaternion(rig.toPlayer));
  rig.relaxHand('Left'); rig.grip('Left', 0.4);
  placeHandle(T, T.handle, 'Right');
  stretch(T.band, ANCHOR, T.handle.position);
}

export default {
  id: 'band-reverse-throw',
  name: 'Обратный бросок с резинкой',
  muscles: { work: ['rotator_cuff', 'delts_rear', 'rhomboids'], stretch: ['rotator_cuff'], careful: ['shoulder_joint', 'elbow'] },
  phases: [
    { name: 'старт', cue: 'Рука в конце подачи', tempo_s: 1 },
    { name: 'назад', cue: 'Веди руку в замах', tempo_s: 2 },
    { name: 'возврат', cue: 'Медленно вперёд', tempo_s: 3 },
  ],
  dose: { sets: '2', reps: '15–20', rest_s: 45 },
  mistakes: ['Слишком тугая резинка', 'Поворот корпусом вместо руки'],
  view: 'front', // спереди видны и путь руки к замаху, и якорь сбоку
  motion(i, u) { const e = smooth(u); return i === 0 ? 0 : i === 1 ? e : 1 - e; },
  setup(T) {
    bodyShape(T);
    T.feetAt = feet(T, T.hipHalf + 0.04);
    T.add(anchor(ANCHOR, new THREE.Vector3(0.3, 0, 1)));
    T.handle = handle(); T.add(T.handle);
    T.band = band(T);
    pose(T, { depth: 0 });
    T.len0 = T.handle.position.distanceTo(ANCHOR);
    T.shoulders0 = w(T.rig, 'LeftArm').sub(w(T.rig, 'RightArm'));
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    wristAudit(T, r);
    bodyAudit(T, r);
    // Корпус не крутится: линия плеч та же, что на старте (до 3°).
    const tw = Math.round(THREE.MathUtils.radToDeg(w(rig, 'LeftArm').sub(w(rig, 'RightArm')).angleTo(T.shoulders0)));
    r.m.twist = tw;
    if (tw > 3) r.bad.push(`корпус повернулся на ${tw}°`);
    const g = handleGap(T, T.handle, 'Right'), H = T.handle.position, len = H.distanceTo(ANCHOR), c = bandClear(T, ANCHOR, H);
    const lc = legClear(T, rig.palm('Right')) - 0.025;
    r.m.grip = g; r.m.band = cm(len - T.len0); r.m.bandClear = cm(c); r.m.handLeg = cm(lc);
    if (g > 2) r.bad.push(`кисть не на ручке (${g} см)`);
    if (len < T.len0 - 0.01) r.bad.push('резинка провисла');
    if (c < 0.01) r.bad.push('резинка проходит сквозь тело');
    if (lc < -0.01) r.bad.push(`кисть в бедре (${cm(lc)} см)`);
    return r;
  },
};
