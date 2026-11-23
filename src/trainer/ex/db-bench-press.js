// Жим гантелей лёжа. Лёжа на скамье, как станция bench в gym.js: тело повёрнуто так, что «вверх» тела — к изголовью (−Z),
// грудь — к небу. Лопатки сведены, стопы на полу (ноги ставит legIK), голова на скамье. Локти под 50° к корпусу,
// предплечья всегда отвесно: локоть идёт по дуге вокруг плеча, кисть над ним. Внизу гантели у груди, вверху руки почти прямые.
import * as THREE from 'three';
import { V, X, UP, deg, rad, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, shadows, frameMat, dumbbells, placeDB, trunk, look, baseAudit, legIK } from '../poses.js';

const PAD = 0.44, ELBOW = 50, DROP = 0.14; // верх подушки, м; локоть к корпусу, °; локоть внизу ниже плеча, м
const LYING = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2);
const K = key({ rUp: V(0.7, 0, 0.7), rFo: V(0, 0, 1), lUp: V(-0.7, 0, 0.7), lFo: V(0, 0, 1) });
const HEAD = new THREE.Vector3(0, Math.sin(deg(5)), -Math.cos(deg(5))), FEET = new THREE.Vector3(0, 0, 1); // таз чуть ниже плеч: ягодицы на подушке

function bench() {
  const g = new THREE.Group(), pad = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }), f = frameMat();
  const box = (wd, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); o.position.set(x, y, z); g.add(o); };
  box(0.3, 0.07, 1.25, pad, 0, PAD - 0.035, -0.37);
  for (const z of [-0.85, 0.1]) { box(0.06, PAD - 0.07, 0.06, f, 0, (PAD - 0.07) / 2, z); box(0.4, 0.04, 0.07, f, 0, 0.02, z); }
  return shadows(g);
}
// Локоть на дуге вокруг плеча: g — угол над горизонталью (°). В плане локоть под ELBOW к оси тела, к ногам.
function armAt(T, s, g) {
  const { rig } = T, S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s];
  const hd = new THREE.Vector3(sgn(s) * Math.sin(deg(ELBOW)), 0, Math.cos(deg(ELBOW)));
  const E = S.clone().addScaledVector(hd, L1 * Math.cos(deg(g))).addScaledVector(UP, L1 * Math.sin(deg(g)));
  const Wr = E.clone().addScaledVector(UP, L2);
  rig.root.updateMatrixWorld(true);
  rig.arm(s, E.clone().sub(S).normalize().applyQuaternion(rig.toPlayer), Wr.sub(E).normalize().applyQuaternion(rig.toPlayer));
  return rig.orientHand(s, new THREE.Vector3(-sgn(s), 0, 0), 1, true); // к указательному — к другой руке: ладони к ногам
}

export default {
  id: 'db-bench-press',
  name: 'Жим гантелей лёжа',
  muscles: { work: ['chest', 'triceps', 'delts_front'], stretch: ['chest'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'вниз', cue: 'Локти 45° к корпусу', tempo_s: 3 },
    { name: 'низ', cue: 'Гантели у груди', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Выжми, лопатки прижаты', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8–10', rest_s: 90 },
  mistakes: ['Локти разведены в стороны', 'Слишком глубоко внизу'],
  view: 'front',
  flat: 'side', // плоская фигурка виджета: спереди лежащий сливается в пятно
  setup(T) {
    T.add(bench()); dumbbells(T);
    T.retract = 12; // лопатки сведены сильнее, чем стоя
    // Угол, на котором локоть внизу на DROP ниже плеча.
    T.gBottom = -rad(Math.asin(DROP / T.rig.armLen.Left[0]));
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T;
    stand(T, 0, 0, 0, LYING);
    trunk(T, K);
    // Корпус ровно вдоль скамьи (таз → шея горизонтально), плечевой сустав на 8,5 см над подушкой (спина лежит на ней, замер по кадрам сбоку).
    const d = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize();
    T.wrap.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(d, HEAD)); T.wrap.updateMatrixWorld(true);
    T.wrap.position.add(new THREE.Vector3(0, PAD + 0.085, -0.5).sub(mid(rig, 'LeftArm', 'RightArm'))); T.wrap.updateMatrixWorld(true);
    // Стопы на полу шире таза, голень почти отвесно, колени вверх.
    for (const s of SIDES) {
      const H = w(rig, s + 'UpLeg'), A = new THREE.Vector3(sgn(s) * 0.27, rig.ankleH, H.z + rig.L1 * 0.95);
      legIK(T, s, A, UP.clone().addScaledVector(FEET, 0.3), new THREE.Quaternion().setFromAxisAngle(UP, sgn(s) * 0.25).multiply(T.footFlat[s]));
    }
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, 2, 0.5)), 30); // затылок на скамье, лицо вверх, подбородок не задран
    const g = lerp(84, T.gBottom, depth);
    for (const s of SIDES) placeDB(T, s, new THREE.Vector3(-sgn(s), 0, 0).applyQuaternion(armAt(T, s, g)));
    rig.grip('Right', 1); rig.grip('Left', 1);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), E = w(rig, s + 'ForeArm'), Wr = w(rig, s + 'Hand');
      const fore = Math.round(rad(Wr.clone().sub(E).angleTo(UP)));
      r.m['fore' + s[0]] = fore;
      if (fore > 15) r.bad.push(`${ruSide(s, true)} рука: предплечье не отвесно (${fore}°)`);
      const plan = E.clone().sub(S).setY(0);
      if (plan.length() > 0.05) {
        const a = Math.round(rad(plan.angleTo(FEET)));
        r.m['elbowTo' + s[0]] = a; // угол плеча к корпусу в плане: 90 — локоть строго в сторону
        if (a < 40 || a > 65) r.bad.push(`${ruSide(s)} локоть не под 45–60° к корпусу (${a}°)`);
      }
      const ank = w(rig, s + 'Foot');
      r.m['foot' + s[0]] = cm(ank.y - rig.ankleH);
      if (Math.abs(ank.y - rig.ankleH) > 0.02) r.bad.push(`${ruSide(s, true)} стопа не на полу`);
    }
    const back = mid(rig, 'LeftArm', 'RightArm').y - PAD, pelvis = w(rig, 'Hips').y - PAD;
    r.m.shoulderOverPad = cm(back); r.m.hipsOverPad = cm(pelvis);
    return r;
  },
};
