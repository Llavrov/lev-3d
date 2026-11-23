// Пронация и супинация с гантелью сидя. Посадка и упор как в сгибании кисти (arms.js: seatBody, padArms): правое
// предплечье лежит на подушке, запястье за краем, локоть не двигается. Гантель с одной головой (половина разборной),
// хват у пустого конца, голова над большим пальцем: чем дальше голова от кисти, тем тяжелее рычаг. Старт — большой палец
// вверх. «Внутрь»: поворот ладонью вниз на 75° и обратно, «наружу»: ладонью вверх на 75° и обратно. Поворот делит
// Rig.orientHand: предплечье берёт его вместе с кистью (лучевая кость), запястье не гнётся. Левая ладонь лежит на бедре.
import * as THREE from 'three';
import { key, w, ruSide, cm, smooth, look, armIK, rubber, steel, shadows, baseAudit } from '../poses.js';
import { padArms, padAudit, bodyShape, seatSetup, seatBody, seatBench, handAxes, wristAudit, bodyAudit, onLimb } from '../arms.js';
import { palmOn } from '../kneel.js';

const K = key({}), ELEV = 70, EDGE = 0.06, ROT = 75, HANDLE = 0.2, HEAD = { r: 0.05, len: 0.07 };
const S = 'Right';

// Гантель с одной головой: ручка вдоль локального X от 0 (у мизинца) до HANDLE, голова на конце. Ладонь — на 5 см от низа.
function hammer() {
  const g = new THREE.Group(), h = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, HANDLE, 14), steel());
  h.rotation.z = Math.PI / 2; h.position.x = HANDLE / 2 - 0.05; g.add(h);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(HEAD.r, HEAD.r, HEAD.len, 6), rubber());
  head.rotation.z = Math.PI / 2; head.position.x = HANDLE - 0.05 + HEAD.len / 2; g.add(head);
  return shadows(g);
}
// Поворот ладони на глубине: фаза 0 — к пронации и обратно, фаза 1 — к супинации и обратно; плюс — ладонью вверх.
const angle = (i, d) => (i === 0 ? -1 : 1) * ROT * d;

function pose(T, { i = 0, depth = 0 }) {
  const { rig } = T;
  seatBody(T, K, ELEV);
  look(T, new THREE.Vector3(0.1, 0.4, 0.9), 25);
  const { E, W } = T.arm[S];
  armIK(T, S, W, E.clone().sub(w(rig, S + 'Arm')));
  // Большой палец вверх, поворот вокруг предплечья (вперёд, +Z). Правая ладонью вниз (пронация) — большой палец к телу (+X).
  const a = THREE.MathUtils.degToRad(angle(i, depth)), R = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
  rig.orientHand(S, R, 1, false);
  rig.grip(S, 1);
  const { r } = handAxes(T, S);
  T.bar.position.copy(rig.palm(S)); T.bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), r); T.bar.updateMatrixWorld(true);
  T.rot = angle(i, depth);
  // Левая ладонь на левом бедре у колена, пальцы вперёд и чуть внутрь, кисть наклонена вниз на 20°, локоть назад и наружу.
  const P = onLimb(T, 'LeftUpLeg', 'LeftLeg', 0.82, new THREE.Vector3(0, 1, 0), T.legR.thigh[8]);
  palmOn(T, 'Left', P, new THREE.Vector3(-0.25, -0.35, 1).normalize(), new THREE.Vector3(0, -1, -0.35).normalize(), new THREE.Vector3(0.6, -0.2, -1));
  rig.grip('Left', 0.2);
  T.leftP = P;
}

export default {
  id: 'forearm-pronation-supination',
  name: 'Пронация и супинация с гантелью',
  muscles: { work: ['forearms'], stretch: ['forearms'], careful: ['elbow', 'wrist'] },
  phases: [
    { name: 'внутрь', cue: 'Держи гантель за край, поверни', tempo_s: 2 },
    { name: 'наружу', cue: 'Медленно в другую сторону', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '12–15', rest_s: 30 },
  mistakes: ['Работа плечом вместо предплечья'],
  view: 'front',
  motion(i, u) { return smooth(Math.sin(Math.PI * u)); },
  setup(T) {
    bodyShape(T);
    T.add(seatBench());
    T.bar = hammer(); T.add(T.bar);
    seatSetup(T, K, ELEV);
    seatBody(T, K, ELEV);
    padArms(T, [S], EDGE, () => pose(T, {}));
    T.elbow0 = w(T.rig, S + 'ForeArm');
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    wristAudit(T, r);
    bodyAudit(T, r);
    padAudit(T, r, [S]);
    // Плечо не помогает: локоть стоит (padAudit), плечо не крутится вслед за кистью — направление плеча неизменно.
    // Предплечье повернулось вместе с кистью: ось ручки у ладони отклонена от отвеса на угол поворота (±5°).
    const { r: ax } = handAxes(T, S), got = Math.round(THREE.MathUtils.radToDeg(Math.atan2(ax.x, ax.y)));
    r.m.rot = T.rot; r.m.rotGot = got;
    if (Math.abs(got + T.rot) > 8 && Math.abs(got - T.rot) > 8) r.bad.push(`кисть повернулась на ${got}° вместо ${T.rot}°`);
    // Левая ладонь на бедре: зазор кожи ладони до кожи бедра.
    const L = rig.palm('Left').sub(T.leftP).length();
    r.m.leftOnThigh = cm(L);
    if (L > 0.02) r.bad.push(`левая кисть не на бедре (${cm(L)} см)`);
    return r;
  },
};
