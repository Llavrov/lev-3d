// Объятия и раскрытия стоя, поочерёдно: чётный цикл сверху правая рука, нечётный левая (span 2). Обнять: локти впереди
// груди, руки скрещены одна над другой, ладони на задней стороне противоположных плеч. Раскрыть: прямые руки в стороны
// чуть ниже плеч и на 22° позади корпуса (предел на уровне плеча 30°), ладони вперёд. Между позами плечо и предплечье
// идут по дуге направлений, ладонь доворачивается. Корпус и ноги стоят, плечи не поднимаются.
import * as THREE from 'three';
import { w, mid, SIDES, sgn, smooth, baseAudit, V } from '../poses.js';
import { standTall, armsOutOfTorso, armsApart, shrugCheck } from '../warmup.js';

const P = 2, BACK = 22, DOWN = 8;
const top = (t) => (Math.floor(t / P) % 2 ? 'Left' : 'Right');
const D = Math.PI / 180;
const dirs = (rig, s) => ({ u: w(rig, s + 'ForeArm').sub(w(rig, s + 'Arm')).normalize(), f: w(rig, s + 'Hand').sub(w(rig, s + 'ForeArm')).normalize(),
  q: rig.b[s + 'Hand'].getWorldQuaternion(new THREE.Quaternion()) });

// Поза «обнять» при верхней руке up: направления плеча и предплечья в мире (тело смотрит в +Z, левая сторона в +X).
// Плечо поперёк груди вперёд, предплечье к задней стороне противоположного плеча; верхняя рука выше на 9–10 см.
function hug(T, up) {
  const out = {};
  for (const s of SIDES) {
    const x = -sgn(s), hi = s === up; // x — в сторону другого плеча
    const u = new THREE.Vector3(x * 0.6, hi ? 0.12 : -0.56, hi ? 0.78 : 0.9).normalize();
    const f = new THREE.Vector3(x * (hi ? 0.75 : 0.85), hi ? 0.1 : 0.3, hi ? -0.45 : -0.2).normalize();
    out[s] = { u, f };
  }
  return out;
}
function open(T) {
  const { rig } = T, out = {};
  const l = (s) => new THREE.Vector3(sgn(s) * Math.cos(BACK * D), -Math.sin(DOWN * D), -Math.sin(BACK * D)).normalize();
  standTall(T, { rUp: V(-l('Right').x, l('Right').y, l('Right').z), rFo: V(-l('Right').x, l('Right').y, l('Right').z), lUp: V(-l('Left').x, l('Left').y, l('Left').z), lFo: V(-l('Left').x, l('Left').y, l('Left').z) });
  for (const s of SIDES) { rig.orientHand(s, new THREE.Vector3(0, 1, 0).addScaledVector(l(s), -l(s).y).normalize(), 1, false); rig.grip(s, 0.1); out[s] = dirs(rig, s); }
  return out;
}
const slerpDir = (a, b, k) => { const q = new THREE.Quaternion().setFromUnitVectors(a, b), r = new THREE.Quaternion().slerp(q, k); return a.clone().applyQuaternion(r); };
// Рука между «раскрыть» (k = 0) и «обнять» (k = 1): плечо идёт по дуге, локоть сгибается вокруг своей оси (она едет вместе
// с плечом), а не по прямой между направлениями предплечья: так локоть на полпути разгибался до 155°.
function armAt(O, H, k) {
  const u = slerpDir(O.u, H.u, k), ax = new THREE.Vector3().crossVectors(H.u, H.f).normalize();
  ax.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(H.u, u));
  const f = u.clone().applyAxisAngle(ax, H.u.angleTo(H.f) * smooth(Math.min(1, k * 1.3)));
  return { u, f };
}

export default {
  id: 'arm-hugs',
  name: 'Объятия и раскрытия',
  muscles: { work: ['delts_rear', 'rhomboids', 'chest'], stretch: ['chest'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'обнять', cue: 'Обними себя за плечи', tempo_s: 1 },
    { name: 'раскрыть', cue: 'Руки широко назад', tempo_s: 1, stretch: true },
  ],
  dose: { sets: '2', reps: '10', rest_s: 15 },
  mistakes: ['Рывки в суставе', 'Руки ниже плеч'],
  view: 'front',
  flat: 'front',
  span: 2,
  setup(T) {
    T.hug = { Right: hug(T, 'Right'), Left: hug(T, 'Left') }; T.open = open(T);
    standTall(T); T.neckToShoulder = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm'));
  },
  motion(i, u) { const e = smooth(Math.min(1, u * 1.25)); return i === 0 ? e : 1 - e; }, // 1 — обнять, 0 — раскрыть; короткая пауза в конце
  pose(T, { depth, t }) {
    const { rig } = T, H = T.hug[top(t)], O = T.open, k = depth;
    standTall(T);
    for (const s of SIDES) {
      rig.root.updateMatrixWorld(true);
      const { u, f } = armAt(O[s], H[s], k);
      rig.arm(s, u.applyQuaternion(rig.toPlayer), f.applyQuaternion(rig.toPlayer));
      rig.root.updateMatrixWorld(true);
      const A = rig.dirW(s + 'ForeArm', s + 'Hand'), up = new THREE.Vector3(0, 1, 0), rel = rig.dirW(s + 'Arm', s + 'ForeArm').negate();
      const R = up.addScaledVector(A, -up.dot(A)).normalize().lerp(rel.addScaledVector(A, -rel.dot(A)).normalize(), smooth(k)); // большой палец вверх (ладонь вперёд) → кисть продолжает предплечье
      if (R.lengthSq() > 1e-4) rig.orientHand(s, R.addScaledVector(A, -R.dot(A)).normalize(), 1, false);
      rig.grip(s, 0.1 + 0.25 * k);
    }
    rig.root.updateMatrixWorld(true);
    T.k = k;
  },
  audit(T) {
    const r = baseAudit(T);
    armsOutOfTorso(T, r, { top: 0.85 }); armsApart(T, r, 0.035); shrugCheck(T, r);
    r.m.hug = +T.k.toFixed(2);
    return r;
  },
};
