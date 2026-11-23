// Внутренняя ротация с резинкой, правая рука. Стоя боком к стойке: крюк справа на высоте локтя, резинка тянет кисть
// наружу. Локоть прижат к боку (валик, плечо отведено на 10°), сгиб 90°, кулак большим пальцем вверх. Предплечье идёт
// от 45° наружу к животу (−50°): дальше кисть упирается в живот. Ракурс спереди-справа.
import { lerp, smooth, w } from '../poses.js';
import { shoulderSetup, upright, elbowSide, rest, fist, post, handle, pull, axes, armAudit, bandAudit, handIn, baseAudit, BODY, V3 } from '../shoulder.js';

const PHI = [45, -50];

function pose(T, { depth }) {
  upright(T);
  elbowSide(T, 'Right', lerp(PHI[0], PHI[1], depth));
  rest(T, 'Left');
  pull(T, T.h, 'Right', fist(T, 'Right', axes(T).up), T.anchor);
}

export default {
  id: 'band-ir-elbow-side',
  name: 'Внутренняя ротация с резинкой',
  muscles: { work: ['rotator_cuff', 'chest'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'внутрь', cue: 'Локоть у бока, кисть к животу', tempo_s: 1 },
    { name: 'возврат', cue: 'Медленно наружу', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '12', rest_s: 30 },
  mistakes: ['Поворот корпусом', 'Локоть отходит'],
  view: 'quarter',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : 1 - e; },
  setup(T) {
    shoulderSetup(T);
    T.h = handle(T);
    T.anchor = V3(0, 0, 0);
    pose(T, { depth: 0 });
    const p = T.rig.palm('Right');
    T.anchor = V3(p.x - 0.55, p.y, p.z);
    post(T, T.anchor, V3(-1, 0, 0));
    pose(T, { depth: 0 });
    T.elbow0 = { Right: w(T.rig, 'RightForeArm') };
  },
  pose,
  audit(T) {
    const r = baseAudit(T);
    armAudit(T, r, 'Right', { h: T.h });
    bandAudit(T, r, T.h, 'Right', [...BODY.torso, ...BODY.limb('Left'), ...BODY.legs], 0.4);
    r.m.handGap = handIn(T, 'Right', axes(T).front);
    if (r.m.handGap != null && r.m.handGap < 0.5) r.bad.push(`кисть в животе (${r.m.handGap} см)`);
    return r;
  },
};
