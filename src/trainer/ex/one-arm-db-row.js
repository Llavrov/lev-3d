// Тяга гантели одной рукой с упором в скамью. Левое колено и левая ладонь на скамье: бедро отвесно, голень и подъём стопы
// лежат на подушке, ладонь на 18 см впереди плеча (как упор в птице-собаке), рука почти прямая. Правая стопа на полу
// сбоку, колено мягкое. Корпус почти горизонтально, спина прямая, не разворачивается. Правая рука тянет гантель от
// «висит под плечом» к поясу, локоть идёт назад вдоль корпуса к бедру, лопатка сводится к позвоночнику.
import * as THREE from 'three';
import { X, FWD, UP, lerp, smooth, w, key, cm, shadows, dumbbells, placeDB, look, palmTo, reachOf, baseAudit, DB } from '../poses.js';
import { prone, palmOn, floorHand, footAlong, legTo, PALM_Y, KNEE_Y, ANKLE_Y } from '../kneel.js';
import { skinSetup, skinGap, TORSO, LEGS } from '../pulls.js';

const BT = 0.44, AHEAD = 0.18, ARM = 0.985; // верх подушки, м; ладонь впереди плеча, м; опорная рука до запястья, доля длины
const K = key({});
const BENCH_X = 0.15; // середина скамьи: под левым коленом и левой ладонью

function benchMesh(T) {
  const g = new THREE.Group(), pad = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }), f = new THREE.MeshStandardMaterial({ color: '#2f3339', metalness: 0.4, roughness: 0.55 });
  const box = (wd, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); o.position.set(x, y, z); g.add(o); };
  box(0.3, 0.07, 1.5, pad, BENCH_X, BT - 0.035, 0.11); // сзади стопа на подушке целиком, спереди ладонь не у края
  for (const z of [-0.45, 0.7]) { box(0.06, BT - 0.07, 0.06, f, BENCH_X, (BT - 0.07) / 2, z); box(0.4, 0.04, 0.07, f, BENCH_X, 0.02, z); }
  T.add(shadows(g));
}
const hipsAt = (T) => new THREE.Vector3(0, BT + KNEE_Y + T.rig.L1, 0);
const benchPalm = (T) => { const S = w(T.rig, 'LeftArm'); return new THREE.Vector3(S.x + 0.01, BT + PALM_Y, S.z + AHEAD); };
// Опора: таз над левым коленом, наклон корпуса такой, что левая рука до запястья ARM своей длины.
function base(T) {
  const { rig } = T, hand = floorHand();
  for (let i = 0; i < 6; i++) {
    prone(T, K, T.elev, hipsAt(T));
    const S = w(rig, 'LeftArm'), P = benchPalm(T), [L1, L2] = rig.armLen.Left;
    const Wr = P.clone().addScaledVector(hand.F, -0.62 * rig.hand.Left.len).addScaledVector(hand.N, -0.028);
    T.elev -= (S.distanceTo(Wr) - ARM * (L1 + L2)) / 0.5 * 57.3;
  }
}

export default {
  id: 'one-arm-db-row',
  name: 'Тяга гантели одной рукой',
  muscles: { work: ['lats', 'rhomboids', 'delts_rear', 'biceps'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'тяга', cue: 'Локоть к бедру', tempo_s: 1 },
    { name: 'верх', cue: 'Лопатка к позвоночнику', tempo_s: 1 },
    { name: 'вниз', cue: 'Полностью опусти руку', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '10 на руку', rest_s: 60 },
  mistakes: ['Поворот корпуса', 'Тяга бицепсом без лопатки'],
  view: 'side',
  flat: 'side',
  setup(T) {
    skinSetup(T); benchMesh(T); dumbbells(T);
    T.db.Left.visible = false;
    T.elev = 10; base(T);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d = depth, hand = floorHand();
    prone(T, K, T.elev, hipsAt(T));
    // Левое колено на скамье под тазом, голень назад по подушке, стопа подъёмом на ней.
    let H = w(rig, 'LeftUpLeg');
    const Kn = new THREE.Vector3(H.x, BT + KNEE_Y, H.z), dy = KNEE_Y - ANKLE_Y;
    const A = Kn.clone().add(new THREE.Vector3(0, -dy, -Math.sqrt(rig.L2 ** 2 - dy * dy)));
    legTo(T, 'Left', A, Kn.clone().sub(H).add(new THREE.Vector3(0, 0, 0.3)), footAlong(T, 'Left', A.clone().sub(Kn), Math.PI / 2));
    // Правая стопа на полу сбоку от скамьи, чуть позади таза, колено мягкое и смотрит вперёд-наружу.
    H = w(rig, 'RightUpLeg');
    legTo(T, 'Right', new THREE.Vector3(H.x - 0.2, rig.ankleH, H.z - 0.08), new THREE.Vector3(-0.3, 0, 1),
      new THREE.Quaternion().setFromAxisAngle(UP, -0.2).multiply(T.footFlat.Right));
    look(T, new THREE.Vector3(0, 0, w(rig, 'Head').z + 0.7), 15);
    T.retract = 7; T.depress = 3;
    palmOn(T, 'Left', benchPalm(T), hand.F, hand.N, new THREE.Vector3(0.3, 0, -1));
    // Правая: как тяга в наклоне — от отвеса под плечом к поясу, локоть назад вдоль корпуса.
    T.retract = lerp(4, 18, d);
    const hips = w(rig, 'Hips'), axis = w(rig, 'Neck').sub(hips).normalize(), S = w(rig, 'RightArm');
    const hang = S.clone().addScaledVector(UP, -reachOf(T, 'Right') * 0.985);
    const half = Math.abs(w(rig, 'LeftArm').x - S.x) / 2, ribs = hips.clone().lerp(w(rig, 'Spine2'), 0.5);
    const pull = ribs.setX(-(half + 0.04)).addScaledVector(axis, -0.03).addScaledVector(UP, -0.06);
    placeDB(T, 'Right', palmTo(T, 'Right', hang.lerp(pull, d), FWD, axis.clone().negate().addScaledVector(UP, 0.7)));
    rig.grip('Right', 1);
    T.d = d;
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    r.m.elev = Math.round(T.elev);
    // Корпус не разворачивается: плечи на одной высоте (до 3 см).
    const roll = w(rig, 'LeftArm').y - w(rig, 'RightArm').y;
    r.m.shoulderRoll = cm(roll);
    if (Math.abs(roll) > 0.03) r.bad.push(`корпус развернулся: плечи разошлись на ${cm(Math.abs(roll))} см`);
    const kn = w(rig, 'LeftLeg');
    r.m.kneeY = cm(kn.y - BT);
    if (Math.abs(kn.y - BT - KNEE_Y) > 0.01) r.bad.push('колено не на скамье');
    const toe = w(rig, rig.b.LeftToe_End ? 'LeftToe_End' : 'LeftToeBase');
    r.m.toeOverEnd = cm(toe.z - (0.11 - 0.75));
    if (toe.z < 0.11 - 0.75) r.bad.push('левая стопа свисает со скамьи');
    const palm = rig.palm('Left');
    r.m.palmY = cm(palm.y - BT);
    if (Math.abs(palm.y - BT - PALM_Y) > 0.01) r.bad.push('левая ладонь не на скамье');
    // Локоть идёт вдоль корпуса, а не в сторону (до 10 см).
    const flare = Math.abs(w(rig, 'RightForeArm').x) - Math.abs(w(rig, 'RightArm').x);
    r.m.flare = cm(flare);
    if (flare > 0.1) r.bad.push(`локоть уходит в сторону (${cm(flare)} см)`);
    // Гантель не в теле: ось от торца до торца не ближе половины головы к коже корпуса и ног.
    const db = T.db.Right, ax = X.clone().applyQuaternion(db.quaternion), h = DB.grip / 2 + DB.head;
    const g = skinGap(T, db.position.clone().addScaledVector(ax, -h), db.position.clone().addScaledVector(ax, h), [...TORSO, ...LEGS]);
    r.m.dbGap = cm(g - DB.apothem);
    if (g < DB.apothem) r.bad.push(`гантель в теле (${cm(g - DB.apothem)} см)`);
    if (db.position.y - DB.R < 0.01) r.bad.push('гантель в полу');
    return r;
  },
};
