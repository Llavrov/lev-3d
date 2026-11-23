// Круги руками стоя (по кругу на фазу, вперёд и назад). Прямые руки в стороны, середина круга на уровне плеч и на 20°
// впереди плоскости корпуса, радиус 48°: так сзади рука не уходит за пределы плеча (30° на уровне плеч, 15° над головой).
// Ладони вниз, плечи не поднимаются, корпус и ноги стоят.
import * as THREE from 'three';
import { w, mid, SIDES, sgn, V, smooth, baseAudit } from '../poses.js';
import { standTall, armsOutOfTorso, shrugCheck } from '../warmup.js';

const RHO = 48, FWD = 20, P = 2;
const D = Math.PI / 180;
// Направление руки s (мир) на круге в точке φ: 0 — верх круга, +90° — перед.
function dir(s, phi) {
  const l = new THREE.Vector3(sgn(s), 0, 0), f = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
  const c = l.clone().multiplyScalar(Math.cos(FWD * D)).addScaledVector(f, Math.sin(FWD * D));
  const F = f.clone().addScaledVector(c, -f.dot(c)).normalize();
  return c.multiplyScalar(Math.cos(RHO * D)).addScaledVector(up, Math.sin(RHO * D) * Math.cos(phi)).addScaledVector(F, Math.sin(RHO * D) * Math.sin(phi)).normalize();
}
const key = (d) => V(-d.x, d.y, d.z); // мир → ключ Rig.pose (x вправо)

export default {
  id: 'arm-circles',
  name: 'Круги руками',
  muscles: { work: ['delts_side', 'delts_front'], stretch: ['chest'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'вперёд', cue: 'Большие круги вперёд', tempo_s: P },
    { name: 'назад', cue: 'Большие круги назад', tempo_s: P },
  ],
  dose: { sets: '1', reps: '15 вперёд + 15 назад', rest_s: 15 },
  mistakes: ['Мелкая амплитуда', 'Плечи к ушам'],
  view: 'quarter',
  flat: 'side',
  pace: 'В жизни быстрее: круг за секунду',
  setup(T) { standTall(T); T.neckToShoulder = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm')); },
  motion(i, u) { return u; },
  pose(T, { i, u }) {
    const { rig } = T, k = smooth(Math.min(1, u * 6)) * smooth(Math.min(1, (1 - u) * 6)); // в начале и конце фазы руки у верха круга
    const phi = (i === 0 ? 1 : -1) * 2 * Math.PI * u;
    const a = {};
    for (const s of SIDES) { const d = dir(s, phi); a[s] = d; }
    standTall(T, { rUp: key(a.Right), rFo: key(a.Right), lUp: key(a.Left), lFo: key(a.Left) });
    for (const s of SIDES) { // ладонь вниз: указательный вперёд поперёк руки
      const f = a[s], R = s === 'Right' ? f.clone().cross(new THREE.Vector3(0, -1, 0)) : new THREE.Vector3(0, -1, 0).cross(f);
      rig.orientHand(s, R.normalize(), 1, false); rig.grip(s, 0.12);
    }
    T.k = k;
  },
  audit(T) {
    const r = baseAudit(T);
    armsOutOfTorso(T, r); shrugCheck(T, r);
    for (const s of SIDES) if (r.m['elbow' + s[0]] > 20) r.bad.push(`${s === 'Left' ? 'левый' : 'правый'} локоть согнут: ${r.m['elbow' + s[0]]}°`);
    return r;
  },
};
