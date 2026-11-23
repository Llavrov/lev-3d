// Наружная ротация с резинкой у корпуса, правая рука. Стоя боком к стойке: крюк слева на высоте локтя, резинка идёт
// перед животом к правой кисти. Локоть прижат к боку (валик под ним, плечо отведено на 10°), сгиб 90°, кулак большим
// пальцем вверх. Предплечье поворачивается от «чуть к животу» (−20°) наружу до 55°: дальше у живого плеча с локтем у
// бока амплитуда кончается. Левая рука висит. Ракурс спереди-справа: кисть идёт поперёк кадра.
import * as THREE from 'three';
import { lerp, smooth, w, SIDES } from '../poses.js';
import { shoulderSetup, upright, elbowSide, rest, fist, post, handle, pull, axes, armAudit, bandAudit, handIn, baseAudit, BODY, V3 } from '../shoulder.js';

const PHI = [-20, 55];

function pose(T, { depth }) {
  upright(T);
  elbowSide(T, 'Right', lerp(PHI[0], PHI[1], depth));
  rest(T, 'Left');
  pull(T, T.h, 'Right', fist(T, 'Right', axes(T).up), T.anchor);
}

export default {
  id: 'band-er-elbow-side',
  name: 'Наружная ротация с резинкой у корпуса',
  muscles: { work: ['rotator_cuff', 'delts_rear'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'наружу', cue: 'Локоть у бока, кисть наружу', tempo_s: 2 },
    { name: 'держи', cue: 'Пауза в конце', tempo_s: 2 },
    { name: 'возврат', cue: 'Медленно внутрь', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '12', rest_s: 30 },
  mistakes: ['Локоть отходит от бока', 'Поворот корпусом'],
  view: 'quarter',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    shoulderSetup(T);
    T.h = handle(T);
    T.anchor = V3(0, 0, 0);
    pose(T, { depth: 0 });
    const p = T.rig.palm('Right');
    T.anchor = V3(0.5, p.y, p.z + 0.04);
    post(T, T.anchor, V3(1, 0, 0));
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
