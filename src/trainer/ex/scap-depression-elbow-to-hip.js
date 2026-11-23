// Опускание лопаток локтями к бедру, без снарядов, обе руки (лопатки работают парой). Стоя ровно, локти согнуты на 90°,
// предплечья вперёд, кулаки мягкие. Локти идут назад и вниз «к задним карманам»: плечо от 5° впереди корпуса до 22°
// позади (предел у опущенной руки 55°), лопатки сводятся и опускаются (ключица назад с 7 до 18°, вниз с 3 до 12°):
// плечи уходят от ушей на 2–3 см. Предплечья остаются параллельно полу, поэтому локоть разгибается до 110°. Ракурс сбоку.
import { deg, lerp, smooth, w, SIDES, sgn, mid, cm } from '../poses.js';
import { shoulderSetup, upright, armW, axes, armAudit, baseAudit } from '../shoulder.js';

const FLEX = [5, -22], RET = [7, 18], DEP = [3, 12];

function pose(T, { depth }) {
  T.retract = lerp(RET[0], RET[1], depth); T.depress = lerp(DEP[0], DEP[1], depth);
  upright(T);
  const { up, left, front } = axes(T), a = deg(lerp(FLEX[0], FLEX[1], depth));
  for (const s of SIDES) {
    const u = up.clone().multiplyScalar(-Math.cos(a)).addScaledVector(front, Math.sin(a)).addScaledVector(left, sgn(s) * 0.12).normalize();
    armW(T, s, u, front.clone().addScaledVector(up, -0.05).addScaledVector(left, -sgn(s) * 0.12));
    T.rig.relaxHand(s); T.rig.grip(s, 0.6);
  }
}

export default {
  id: 'scap-depression-elbow-to-hip',
  name: 'Опускание лопаток локтями к бедру',
  muscles: { work: ['traps', 'rhomboids', 'lats'], stretch: [], careful: ['shoulder_joint', 'neck'] },
  phases: [
    { name: 'вниз', cue: 'Локти к карманам', tempo_s: 2 },
    { name: 'держи', cue: 'Лопатки вниз и назад', tempo_s: 2 },
    { name: 'возврат', cue: 'Расслабь медленно', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '10', rest_s: 30 },
  mistakes: ['Прогиб в пояснице', 'Задержка дыхания'],
  view: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    shoulderSetup(T);
    pose(T, { depth: 0 });
    T.neck0 = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm'));
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    for (const s of SIDES) armAudit(T, r, s, { lo: 80, hi: 115 });
    // Плечи опускаются, а не поднимаются; поясница не прогибается (спина прямая — baseAudit, корпус отвесно).
    r.m.drop = cm(w(rig, 'Head').distanceTo(mid(rig, 'LeftArm', 'RightArm')) - T.neck0);
    if (r.m.drop < -0.5) r.bad.push(`плечи поднялись (${r.m.drop} см)`);
    if (Math.abs(r.m.torso - 88) > 3) r.bad.push(`корпус отклонился: ${r.m.torso}°`);
    return r;
  },
};
