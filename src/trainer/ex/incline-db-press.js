// Жим гантелей на наклонной скамье 30°. Скамья собрана по телу: спинка 30°, плечевой сустав на 8,5 см над подушкой
// (как в жиме лёжа), таз на сиденье, стопы на полу шире таза. Лопатки сведены. Внизу гантели у верха груди, локти
// на 56° к корпусу и чуть ниже плоскости спинки; вверху руки прямо над плечами. Предплечья всё время отвесно.
import * as THREE from 'three';
import { V, X, UP, deg, rad, lerp, w, mid, key, SIDES, sgn, ruSide, cm, stand, shadows, frameMat, dumbbells, placeDB, trunk, look, baseAudit, legIK, DB } from '../poses.js';
import { skinSetup, skinGap, TORSO } from '../pulls.js';

const INC = 30, ELBOW = 56, DROP = 0.10, SKIN = 0.085, SIT = 0.1; // спинка, °; локоть к корпусу, °; локоть внизу за плоскостью, м (при 50° и 12 см внутренняя голова гантели входила в грудь на 1,4 см); плечо и таз над подушкой, м
const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2);
const K = key({ rUp: V(0.7, 0, 0.7), rFo: V(0, 0, 1), lUp: V(-0.7, 0, 0.7), lFo: V(0, 0, 1) });
const U = new THREE.Vector3(0, Math.sin(deg(INC)), -Math.cos(deg(INC))), N = new THREE.Vector3(0, Math.cos(deg(INC)), Math.sin(deg(INC))); // к голове; грудь
const HIPS = new THREE.Vector3(0, 0.56, 0); // середина тазобедренных
const FEET = new THREE.Vector3(0, 0, 1);

function body(T) {
  const { rig } = T;
  stand(T, 0, 0, 0, LYING);
  trunk(T, K);
  const d = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize();
  T.wrap.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(d, U)); T.wrap.updateMatrixWorld(true);
  T.wrap.position.add(HIPS.clone().sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'))); T.wrap.updateMatrixWorld(true);
}
// Скамья по телу: верх спинки — плоскость на SKIN ниже плечевых суставов, сиденье на SIT ниже тазобедренных.
function bench(T) {
  const { rig } = T, g = new THREE.Group(), pad = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }), f = frameMat();
  const P = mid(rig, 'LeftArm', 'RightArm').addScaledVector(N, -SKIN), seat = HIPS.y - SIT;
  const hinge = P.clone().addScaledVector(U, (seat - P.y) / U.y);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.85), pad);
  back.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), U); back.position.copy(hinge).addScaledVector(U, 0.43).addScaledVector(N, -0.035); g.add(back);
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.4), pad); s.position.set(0, seat - 0.035, hinge.z + 0.2); g.add(s);
  const leg = (x, y, z, h) => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), f); o.position.set(x, y, z); g.add(o); };
  leg(0, (seat - 0.07) / 2, hinge.z + 0.25, seat - 0.07);
  const top = hinge.clone().addScaledVector(U, 0.7).addScaledVector(N, -0.07);
  leg(0, top.y / 2, top.z, top.y);
  for (const z of [hinge.z + 0.25, top.z]) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.07), f); o.position.set(0, 0.02, z); g.add(o); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, Math.abs(top.z - hinge.z - 0.25)), f); rail.position.set(0, 0.06, (top.z + hinge.z + 0.25) / 2); g.add(rail);
  T.add(shadows(g));
  T.padP = P;
}
// Локоть: внизу в стороне под ELBOW к корпусу (к ногам) и на DROP за плоскостью спинки, вверху над плечом; кисть над локтем.
function armAt(T, s, d) {
  const { rig } = T, S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s], lat = new THREE.Vector3(sgn(s), 0, 0);
  const hd = lat.clone().multiplyScalar(Math.sin(deg(ELBOW))).addScaledVector(U, -Math.cos(deg(ELBOW))), g = -Math.asin(DROP / L1);
  const low = hd.multiplyScalar(Math.cos(g)).addScaledVector(N, Math.sin(g)), high = UP.clone().addScaledVector(lat, 0.08).normalize();
  const e = high.lerp(low, d).normalize(), E = S.clone().addScaledVector(e, L1), Wr = E.clone().addScaledVector(UP, L2);
  rig.root.updateMatrixWorld(true);
  rig.arm(s, E.clone().sub(S).normalize().applyQuaternion(rig.toPlayer), Wr.sub(E).normalize().applyQuaternion(rig.toPlayer));
  return rig.orientHand(s, new THREE.Vector3(-sgn(s), 0, 0), 1, true); // к указательному — к другой руке: хват сверху
}

export default {
  id: 'incline-db-press',
  name: 'Жим гантелей на наклонной',
  muscles: { work: ['chest', 'delts_front', 'triceps'], stretch: ['chest'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'вниз', cue: 'Скамья 30°, гантели к груди', tempo_s: 3, stretch: true },
    { name: 'вверх', cue: 'Выжми над плечами', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8–10', rest_s: 90 },
  mistakes: ['Сильный прогиб в спине', 'Удар гантелями наверху'],
  view: 'side',
  flat: 'side',
  setup(T) {
    skinSetup(T); dumbbells(T);
    T.retract = 12;
    body(T); bench(T);
  },
  pose(T, { depth }) {
    const { rig } = T;
    body(T);
    for (const s of SIDES) {
      const H = w(rig, s + 'UpLeg'), A = new THREE.Vector3(sgn(s) * 0.27, rig.ankleH, H.z + rig.L1 * 0.95);
      legIK(T, s, A, UP.clone().addScaledVector(FEET, 0.3), new THREE.Quaternion().setFromAxisAngle(UP, sgn(s) * 0.25).multiply(T.footFlat[s]));
    }
    look(T, w(rig, 'Head').addScaledVector(N, 2).addScaledVector(FEET, 0.6), 25); // затылок на спинке, взгляд вперёд-вверх
    for (const s of SIDES) placeDB(T, s, new THREE.Vector3(-sgn(s), 0, 0).applyQuaternion(armAt(T, s, depth)));
    rig.grip('Right', 1); rig.grip('Left', 1);
    T.d = depth;
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), E = w(rig, s + 'ForeArm'), Wr = w(rig, s + 'Hand');
      const fore = Math.round(rad(Wr.clone().sub(E).angleTo(UP)));
      r.m['fore' + s[0]] = fore;
      if (fore > 15) r.bad.push(`${ruSide(s, true)} рука: предплечье не отвесно (${fore}°)`);
      if (T.d > 0.8) { // внизу: локоть под 40–65° к корпусу в плоскости спинки
        const p = E.clone().sub(S); p.addScaledVector(N, -p.dot(N));
        const a = Math.round(rad(p.angleTo(U.clone().negate())));
        r.m['elbowTo' + s[0]] = a;
        if (a < 40 || a > 65) r.bad.push(`${ruSide(s)} локоть не под 45–60° к корпусу (${a}°)`);
      }
      const ank = w(rig, s + 'Foot');
      r.m['foot' + s[0]] = cm(ank.y - rig.ankleH);
      if (Math.abs(ank.y - rig.ankleH) > 0.02) r.bad.push(`${ruSide(s, true)} стопа не на полу`);
      // Гантель не в теле: ось от торца до торца не ближе половины головы к коже корпуса и головы.
      const ax = X.clone().applyQuaternion(T.db[s].quaternion), c = T.db[s].position, h = DB.grip / 2 + DB.head;
      const g = skinGap(T, c.clone().addScaledVector(ax, -h), c.clone().addScaledVector(ax, h), TORSO);
      r.m['dbGap' + s[0]] = cm(g - DB.apothem);
      if (g < DB.apothem) r.bad.push(`${ruSide(s, true)} гантель в теле (${cm(g - DB.apothem)} см)`);
    }
    // Спина на спинке: плечевые суставы над подушкой на SKIN (лежит, не висит).
    const lift = mid(rig, 'LeftArm', 'RightArm').sub(T.padP).dot(N) - SKIN;
    r.m.shoulderOverPad = cm(lift);
    if (Math.abs(lift) > 0.01) r.bad.push(`спина оторвалась от спинки (${cm(lift)} см)`);
    if (T.d < 0.02) { const k = rad(w(rig, 'LeftHand').sub(w(rig, 'LeftArm')).angleTo(UP)); r.m.topTilt = Math.round(k); }
    return r;
  },
};
