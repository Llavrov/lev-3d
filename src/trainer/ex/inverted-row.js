// Горизонтальные подтягивания (австралийские). Низкая перекладина на стойках, человек под ней лицом вверх, пятки на полу,
// тело прямое от пяток до плеч и поворачивается вокруг пяток как доска. Хват сверху чуть шире плеч. Внизу руки прямые,
// вверху грудь у перекладины, локти уходят к полу и в стороны под 45°, лопатки сведены.
// Высота перекладины и угол тела считаются от модели: вверху (тело 24° к полу) перекладина над нижней частью груди
// в 3,5 см от кожи, внизу угол такой, что рука до середины ладони прямая.
import * as THREE from 'three';
import { V, X, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, trunk, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { pullBar, onAxis, skinSetup, skinGap, clearOf, lowSkin, TORSO } from '../pulls.js';

const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2); // лицом вверх, голова в −Z
const K = key({ rTh: V(0.04, -1, 0), rSh: V(0.04, -1, 0), lTh: V(-0.04, -1, 0), lSh: V(-0.04, -1, 0) });
const GRIP = 0.3, TOP = 24, CHEST = 0.035; // кисти от середины, м; угол тела вверху, °; зазор грудь — перекладина вверху, м
const FEET = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const dirOf = (a) => new THREE.Vector3(0, Math.sin(a * Math.PI / 180), -Math.cos(a * Math.PI / 180)); // от пяток к голове
const nOf = (a) => new THREE.Vector3(0, Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)); // куда смотрит грудь

// Тело доской под углом a к полу, пятки на полу в z = 0.
function body(T, a) {
  const { rig } = T;
  stand(T, 0, 0, 0, LYING);
  trunk(T, K);
  const d = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize();
  T.wrap.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(d, dirOf(a))); T.wrap.updateMatrixWorld(true);
  const ank = mid(rig, 'LeftFoot', 'RightFoot');
  T.wrap.position.add(new THREE.Vector3(-ank.x, 0, -ank.z)); T.wrap.updateMatrixWorld(true);
  T.wrap.position.y += 0.004 - lowSkin(T, FEET); T.wrap.updateMatrixWorld(true);
}
// Таз от линии щиколотки → плечи по нормали груди, м: минус — провис к полу.
function sagOf(rig) {
  const A = mid(rig, 'LeftFoot', 'RightFoot'), S = mid(rig, 'LeftArm', 'RightArm'), H = mid(rig, 'LeftUpLeg', 'RightUpLeg');
  const line = S.clone().sub(A).normalize(), n = new THREE.Vector3(0, -line.z, line.y);
  return H.sub(A).dot(n.lengthSq() > 0.01 ? n.normalize() : new THREE.Vector3(0, 0, 1));
}
const barSeg = (B) => [B.clone().setX(-0.35), B.clone().setX(0.35)];

export default {
  id: 'inverted-row',
  name: 'Горизонтальные подтягивания',
  muscles: { work: ['rhomboids', 'lats', 'delts_rear', 'biceps'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'тяга', cue: 'Грудь к перекладине', tempo_s: 1 },
    { name: 'верх', cue: 'Сведи лопатки', tempo_s: 1 },
    { name: 'вниз', cue: 'Медленно, тело прямое', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '10–12', rest_s: 60 },
  mistakes: ['Таз провисает', 'Плечи поднимаются к ушам'],
  view: 'side',
  flat: 'side',
  setup(T) {
    const { rig } = T;
    skinSetup(T);
    stand(T); trunk(T, K); T.sag0 = sagOf(rig); // стоя: n по +Z (грудь)
    // Вверху: перекладина над нижней частью груди (между Spine1 и Spine2), в CHEST от кожи.
    body(T, TOP);
    const C = w(rig, 'Spine1').lerp(w(rig, 'Spine2'), 0.6);
    let lo = C.y, hi = C.y + 0.4;
    for (let i = 0; i < 20; i++) { const y = (lo + hi) / 2, B = new THREE.Vector3(0, y, C.z); if (skinGap(T, ...barSeg(B), ['Spine1', 'Spine2']) > CHEST) hi = y; else lo = y; }
    T.B = new THREE.Vector3(0, hi, C.z);
    // Внизу: угол, при котором прямая рука достаёт до перекладины.
    const reach = reachOf(T, 'Left') * 0.98;
    let a0 = 0, a1 = TOP;
    for (let i = 0; i < 16; i++) {
      const a = (a0 + a1) / 2; body(T, a);
      const S = w(rig, 'LeftArm'), P = T.B.clone().setX(GRIP);
      if (S.distanceTo(P) > reach) a0 = a; else a1 = a;
    }
    T.bottom = a1;
    pullBar(T, T.B.y, T.B.z, 0.65, -0.55); // стойки за головой: сбоку не закрывают тело
    T.retract = 7;
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d = depth, a = lerp(T.bottom, TOP, d);
    T.retract = lerp(2, 18, d); T.depress = 4;
    body(T, a);
    const u = dirOf(a), n = nOf(a);
    look(T, w(rig, 'Head').addScaledVector(n, 1).addScaledVector(u, 0.25), 15); // голова в линию тела, взгляд вверх-вперёд
    for (const s of SIDES) {
      const out = new THREE.Vector3(sgn(s), 0, 0), pole = n.clone().multiplyScalar(-0.7).addScaledVector(u, -0.4).addScaledVector(out, 0.7);
      palmTo(T, s, T.B.clone().setX(sgn(s) * GRIP), out.clone().negate(), pole);
    }
    rig.grip('Right', 1); rig.grip('Left', 1);
    T.d = d;
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso; // угол корпуса от «вперёд» стоящего тела лёжа ничего не значит
    for (const s of SIDES) {
      const g = onAxis(T, s, T.B, new THREE.Vector3(1, 0, 0), 0.65);
      r.m['grip' + s[0]] = cm(g.off);
      if (!g.ok) r.bad.push(`${ruSide(s, true)} кисть не на перекладине (${cm(g.off)} см)`);
    }
    // Пятки стоят: на полу и не ездят по нему.
    const heel = lowSkin(T, FEET), az = mid(rig, 'LeftFoot', 'RightFoot').z;
    r.m.heelY = cm(heel); r.m.heelZ = cm(az);
    if (Math.abs(heel) > 0.015 || Math.abs(az) > 0.02) r.bad.push('пятки не на месте');
    // Тело прямое: таз на линии щиколотки → плечи (провис или «домик» до 3 см).
    const sag = sagOf(rig) - T.sag0; // от стойки «смирно»: у модели тазобедренный и так не на линии щиколотка — плечо
    r.m.sag = cm(sag);
    if (Math.abs(sag) > 0.03) r.bad.push(`таз ${sag < 0 ? 'провисает' : 'поднят'} (${cm(sag)} см)`);
    const g = clearOf(T, r, 'перекладина', ...barSeg(T.B), TORSO, 0.01);
    if (T.d > 0.99 && g > 0.06) r.bad.push(`грудь не дошла до перекладины (${cm(g)} см)`);
    return r;
  },
};
