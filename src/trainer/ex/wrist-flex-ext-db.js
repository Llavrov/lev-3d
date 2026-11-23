// Сгибание и разгибание кисти с гантелями сидя. Сидя на скамье, корпус 70° над горизонталью, спина прямая. Предплечья
// лежат на упоре перед собой (скамья Скотта, выставленная ровно): плечо почти отвесно, локоть около 80°, предплечье
// горизонтально вперёд, запястье на 6 см за краем подушки. Правая ладонью вверх — сгибание, левая ладонью вниз —
// разгибание: оба варианта одним показом. Двигается только кисть: от разгиба к сгибу на правой (−50° → +55°), от сгиба
// к разгибу на левой (+42° → −55°: ниже гантель задевает подушку). Предел общей проверки запястья 50° мешает этой амплитуде: свой предел 60°.
// Своего бедра у модели не хватает: бедро 0,35 м против 0,44 у человека, предплечье на бедре с прямой спиной не лежит
// (плечо не дотягивается до локтя), поэтому упор.
import * as THREE from 'three';
import { key, w, SIDES, sgn, ruSide, cm, smooth, lerp, dumbbells, placeDB, DB, look, armIK, baseAudit } from '../poses.js';
import { padArms, padAudit, bodyShape, seatSetup, seatBody, seatBench, flexWrist, handAxes, wristAudit, bodyAudit } from '../arms.js';

const K = key({}), ELEV = 70, EDGE = 0.06;
// Сгиб запястья на глубине d: правая ладонью вверх, левая ладонью вниз; плюс — к ладони.
const FLEX = { Right: [-50, 55], Left: [42, -55] };

function pose(T, { depth }) {
  const { rig } = T;
  seatBody(T, K, ELEV);
  look(T, new THREE.Vector3(0, 0.45, 0.9), 25);
  for (const s of SIDES) {
    const { W } = T.arm[s];
    armIK(T, s, W, T.arm[s].E.clone().sub(w(rig, s + 'Arm')));
    rig.orientHand(s, new THREE.Vector3(-1, 0, 0), 1, false); // большой палец вправо: у правой ладонь вверх, у левой вниз
    flexWrist(T, s, lerp(FLEX[s][0], FLEX[s][1], depth));
    rig.grip(s, 1);
    placeDB(T, s, handAxes(T, s).r);
  }
}

export default {
  id: 'wrist-flex-ext-db',
  name: 'Сгибание и разгибание кисти',
  muscles: { work: ['forearms'], stretch: ['forearms'], careful: ['wrist', 'elbow'] },
  phases: [
    { name: 'вверх', cue: 'Предплечья на упоре, кисти вверх', tempo_s: 1 },
    { name: 'вниз', cue: 'Медленно опусти', tempo_s: 3 },
  ],
  dose: { sets: '2', reps: '15–20', rest_s: 30 },
  mistakes: ['Тяжёлая гантель', 'Помощь всей рукой'],
  view: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : 1 - e; },
  setup(T) {
    bodyShape(T);
    T.add(seatBench()); dumbbells(T);
    seatSetup(T, K, ELEV);
    seatBody(T, K, ELEV);
    padArms(T, SIDES, EDGE, () => pose(T, { depth: 0 }));
  },
  pose,
  audit(T) {
    const r = baseAudit(T, { feet: [] });
    wristAudit(T, r, { Left: 60, Right: 60 });
    bodyAudit(T, r);
    padAudit(T, r, SIDES);
    for (const s of SIDES) {
      // Гантель не задевает подушку: ближняя к подушке точка головы выше её верха или дальше края.
      const db = T.db[s], ax = new THREE.Vector3(1, 0, 0).applyQuaternion(db.quaternion);
      for (const k of [-1, 1]) {
        const c = db.position.clone().addScaledVector(ax, k * (DB.grip / 2 + DB.head / 2));
        const inZ = c.z - DB.R < T.padZ, inY = c.y - DB.R < T.padY;
        if (inZ && inY) r.bad.push(`${ruSide(s, true)} гантель задевает упор`);
      }
    }
    return r;
  },
};
