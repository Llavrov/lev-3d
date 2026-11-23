// Тяга двух гантелей в наклоне (в базе нет, данные свои в той же форме). Наклон как в нижней точке румынской тяги,
// корпус неподвижен на 20° над горизонталью, спина прямая. Гантели нейтральным хватом висят под плечами и тянутся к низу
// рёбер, локти уходят назад вдоль корпуса, наверху лопатки сведены (ключица назад до 18°).
import * as THREE from 'three';
import { V, FWD, UP, rad, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, dumbbells, placeDB, stand, feet, trunk, placeHips, look, palmTo, reachOf, baseAudit, legGap } from '../poses.js';
import { hipsOver } from './romanian-deadlift-db.js';

const TORSO = 20; // как нижняя точка румынской тяги
const K = key({ rUp: V(0.1, -1, 0), rFo: V(0.08, -1, 0.05), lUp: V(-0.1, -1, 0), lFo: V(-0.08, -1, 0.05),
  rTh: V(0.05, -1, 0), rSh: V(0.03, -1, 0), lTh: V(-0.05, -1, 0), lSh: V(-0.03, -1, 0) });

export default {
  id: 'bent-over-row-db',
  name: 'Тяга гантелей в наклоне',
  muscles: { work: ['lats', 'rhomboids', 'traps', 'delts_rear', 'biceps'], stretch: ['lats', 'rhomboids'], careful: ['lower_back'] },
  phases: [
    { name: 'тяга', cue: 'Локти назад вдоль корпуса, гантели к низу рёбер', tempo_s: 1 },
    { name: 'пауза', cue: 'Сведи лопатки, корпус неподвижен', tempo_s: 1 },
    { name: 'вниз', cue: 'Медленно опусти, спина прямая', tempo_s: 2, stretch: true },
  ],
  dose: { sets: 3, reps: 10, rest_s: 90 },
  view: 'side',
  setup(T) { dumbbells(T); T.feetAt = feet(T, T.hipHalf + 0.02); },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T;
    T.retract = lerp(4, 18, depth); T.depress = 4;
    stand(T);
    trunk(T, K, TORSO);
    placeHips(T, hipsOver(T, 18, -6), T.feetAt);
    look(T, new THREE.Vector3(0, 0, 1.6));
    const hips = w(rig, 'Hips'), axis = w(rig, 'Neck').sub(hips).normalize(); // ось корпуса к голове
    const ribs = hips.clone().lerp(w(rig, 'Spine2'), 0.55), half = Math.abs(w(rig, 'LeftArm').x - w(rig, 'RightArm').x) / 2;
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm');
      const hang = S.clone().addScaledVector(UP, -reachOf(T, s) * 0.985);
      const pull = ribs.clone().setX(sgn(s) * (half + 0.03)).addScaledVector(axis, -0.02).addScaledVector(UP, -0.06);
      const P = hang.lerp(pull, depth);
      const pole = axis.clone().negate().addScaledVector(UP, 0.7);
      placeDB(T, s, palmTo(T, s, P, FWD, pole)); // нейтральный хват: к указательному — вперёд, ладони смотрят друг на друга
    }
    rig.grip('Right', 1); rig.grip('Left', 1);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T), half = Math.abs(w(rig, 'LeftArm').x - w(rig, 'RightArm').x) / 2;
    if (Math.abs(r.m.torso - TORSO) > 3) r.bad.push(`корпус гуляет: ${r.m.torso}°`);
    for (const s of SIDES) {
      const E = w(rig, s + 'ForeArm');
      const flare = Math.abs(E.x) - half;
      r.m['flare' + s[0]] = cm(flare);
      if (flare > 0.1) r.bad.push(`${ruSide(s)} локоть уходит в сторону (${cm(flare)} см)`);
      const g = legGap(T, s, T.db[s].position, true);
      r.m['gap' + s[0]] = cm(g);
      if (g < 0) r.bad.push(`${ruSide(s, true)} гантель в ноге`);
      // гантель не в корпусе: от середины ручки до оси туловища
      const hips = w(rig, 'Hips'), neck = w(rig, 'Neck'), seg = neck.clone().sub(hips), p = T.db[s].position;
      const c = hips.clone().addScaledVector(seg, Math.max(0, Math.min(1, p.clone().sub(hips).dot(seg) / seg.lengthSq())));
      r.m['body' + s[0]] = cm(p.distanceTo(c));
      if (p.distanceTo(c) < 0.17) r.bad.push(`${ruSide(s, true)} гантель в корпусе`);
    }
    return r;
  },
};
