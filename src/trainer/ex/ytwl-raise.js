// Y-T-W-L в наклоне без снарядов. Стойка на ширине таза, колени мягкие (около 22°), корпус (таз → шея) наклонён из
// тазобедренных на 45° над горизонталью, спина прямая, шея в линию спины, взгляд в пол на 1,5 м впереди. Лопатки сведены
// и опущены (ключица назад на 7°, вниз на 3°, к ушам не поднимается). Каждая фаза — от рук, висящих под плечами, к букве
// и обратно. Направления в осях корпуса: up — к голове вдоль спины, c — грудь (к полу), l — в сторону руки.
// Руки работают в плоскости корпуса, за спину не уходят (сведение лопаток даёт ключица). Y: прямые руки вдоль линии
// корпуса под 35° к ней, большие пальцы к потолку. T: прямые руки в стороны на уровне плеч. W: плечи на 35° ниже уровня
// плеч, локти около 90°, предплечья к голове и немного к полу (0,7·up + 0,45·l + 0,55·c), кисти впереди ушей: ровно
// вдоль корпуса поворот плеча наружу больше 90°, Rig.arm тогда уводит локоть по кругу за спину. L: локти у боков (−0,95·up + 0,3·l), сначала
// предплечья висят к полу, потом поворот плеча наружу уводит кисти в стороны на 53° (0,8·l + 0,6·c): больше модель
// не доворачивает без заломленного плеча.
import * as THREE from 'three';
import { key, w, mid, SIDES, sgn, ruSide, cm, smooth, clamp, stand, feet, trunk, placeHips, look, baseAudit } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';

const TORSO = 45, KNEE = 22, SHIN = 2;
const K = key({});
const V3 = (...a) => new THREE.Vector3(...a);
const sum = (...p) => p.reduce((a, [v, k]) => a.addScaledVector(v, k), new THREE.Vector3()).normalize();
const LETTERS = ['Y', 'T', 'W', 'L'];

// Куда смотрят плечо u и предплечье f (мир), куда большой палец R; d — доля пути от виса к букве.
function arm(B, s, letter, d) {
  const { up, c } = B, l = V3(sgn(s), 0, 0);
  const hang = sum([V3(0, -1, 0), 1], [l, 0.08]), hangF = sum([V3(0, -1, 0), 1], [l, 0.05], [up, 0.1]);
  const thumb = c.clone().negate();
  let u, f;
  if (letter === 'L') { // локти у боков, предплечья сначала к полу, потом поворот плеча наружу уводит кисти в стороны
    const k1 = smooth(clamp(d * 2, 0, 1)), k2 = smooth(clamp(d * 2 - 1, 0, 1)), uL = sum([up, -0.95], [l, 0.3]);
    u = hang.clone().lerp(uL, k1).normalize();
    f = hangF.clone().lerp(c, k1).normalize().lerp(sum([l, 0.8], [c, 0.6]), k2).normalize();
  } else {
    const [uX, fX] = letter === 'Y' ? [sum([up, 0.82], [l, 0.57]), null] // вдоль корпуса под 35° к его линии
      : letter === 'T' ? [l, null] // в стороны на уровне плеч
      : [sum([l, 0.82], [up, -0.57], [c, -0.1]), sum([up, 0.7], [l, 0.45], [c, 0.55])]; // W: локти на 35° ниже плеч, локоть 90°, кисти к голове
    u = hang.clone().lerp(uX, d).normalize(); f = hangF.clone().lerp(fX ?? uX, d).normalize();
  }
  return { u, f, thumb };
}

function pose(T, { i, depth }) {
  const { rig } = T, d = depth, letter = LETTERS[i];
  T.letter = letter; T.d = d;
  stand(T);
  trunk(T, K, TORSO);
  placeHips(T, hipsOver(T, KNEE, SHIN), T.feetAt);
  look(T, V3(0, 0, 1.5));
  const up = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), c = new THREE.Vector3().crossVectors(V3(1, 0, 0), up);
  for (const s of SIDES) {
    const { u, f, thumb } = arm({ up, c }, s, letter, d);
    rig.root.updateMatrixWorld(true);
    rig.arm(s, u.clone().applyQuaternion(rig.toPlayer), f.clone().applyQuaternion(rig.toPlayer));
    const A = rig.dirW(s + 'ForeArm', s + 'Hand'), relax = rig.dirW(s + 'Arm', s + 'ForeArm').negate();
    const R = relax.addScaledVector(A, -relax.dot(A)).normalize().lerp(thumb.clone().addScaledVector(A, -thumb.dot(A)).normalize(), smooth(d));
    rig.orientHand(s, R.addScaledVector(A, -R.dot(A)).normalize(), 1, false);
    rig.grip(s, 0.35);
  }
}

export default {
  id: 'ytwl-raise',
  name: 'Y-T-W-L в наклоне',
  muscles: { work: ['traps', 'rhomboids', 'delts_rear', 'rotator_cuff'], stretch: [], careful: ['shoulder_joint', 'neck', 'lower_back'] },
  phases: [
    { name: 'Y', cue: 'Руки вверх буквой Y', tempo_s: 2 },
    { name: 'T', cue: 'В стороны буквой T', tempo_s: 2 },
    { name: 'W', cue: 'Локти вниз, кисти к голове, W', tempo_s: 2 },
    { name: 'L', cue: 'Локти у боков, кисти наружу, L', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '8 на букву', rest_s: 45 },
  mistakes: ['Тяжёлый вес', 'Подъём плечами к ушам'],
  view: 'side',
  setup(T) {
    T.feetAt = feet(T, T.hipHalf);
    pose(T, { i: 0, depth: 0 });
    T.neckToShoulder = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm')); // в висе: плечи не тянутся к ушам
  },
  motion(i, u) { return smooth(Math.min(1, 1.3 * Math.sin(Math.PI * u))); }, // к букве, короткая пауза, обратно за фазу
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T), a = rig.audit();
    if (Math.abs(r.m.torso - TORSO) > 5) r.bad.push(`корпус не под 45°: ${r.m.torso}°`);
    const sh = w(rig, 'Head').distanceTo(mid(rig, 'LeftArm', 'RightArm'));
    r.m.shrug = cm(T.neckToShoulder - sh);
    if (T.neckToShoulder - sh > 0.015) r.bad.push(`плечи поднялись к ушам (${r.m.shrug} см)`);
    for (const s of SIDES) {
      r.m['wrist' + s[0]] = a[s].wrist;
      if (a[s].wrist > 50) r.bad.push(`${ruSide(s, true)} кисть: запястье согнуто на ${a[s].wrist}°`);
      if (T.d > 0.999) {
        const e = a[s].elbow, bent = T.letter === 'W' || T.letter === 'L';
        if (bent ? e < 70 || e > 115 : e > 20) r.bad.push(`${ruSide(s)} локоть в букве ${T.letter}: ${e}°`);
        const hand = w(rig, s + 'Hand'), S = w(rig, s + 'Arm');
        r.m['handOverShoulder' + s[0]] = cm(hand.y - S.y);
      }
    }
    return r;
  },
};
