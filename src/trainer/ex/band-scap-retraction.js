// Сведение лопаток с резинкой. Здесь работают обе руки: упражнение про лопатки, одной рукой его не делают. Стоя лицом
// к стойке, крюк впереди на высоте груди, у каждой кисти своя рукоять. Руки прямые вперёд (на 8° ниже плеч, локти
// до 10°), кулаки большими пальцами вверх. Движение только в лопатках: из «плечи вперёд» (ключица вперёд на 14°)
// в «лопатки сведены» (ключица назад на 18° и вниз на 4°): кисти уходят назад вместе с плечами на 7–8 см, локти не
// сгибаются. Ракурс сбоку: видно, как плечи уходят назад и раскрывается грудь.
import * as THREE from 'three';
import { deg, lerp, smooth, w, SIDES, sgn, mid, cm } from '../poses.js';
import { shoulderSetup, upright, armW, fist, post, handle, pull, axes, armAudit, bandAudit, baseAudit, BODY, V3 } from '../shoulder.js';

const RET = [-14, 18], DEP = [3, 4], DOWN = 8;

function pose(T, { depth }) {
  T.retract = lerp(RET[0], RET[1], depth); T.depress = lerp(DEP[0], DEP[1], depth);
  upright(T);
  const { up, left, front } = axes(T);
  for (const s of SIDES) {
    const d = front.clone().multiplyScalar(Math.cos(deg(DOWN))).addScaledVector(up, -Math.sin(deg(DOWN))).addScaledVector(left, -sgn(s) * 0.02).normalize();
    armW(T, s, d, d.clone().addScaledVector(up, 0.06)); // локоть чуть мягкий
    pull(T, T.h[s], s, fist(T, s, up), T.anchor);
  }
}

export default {
  id: 'band-scap-retraction',
  name: 'Сведение лопаток с резинкой',
  muscles: { work: ['rhomboids', 'traps'], stretch: ['chest'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'сведение', cue: 'Сведи лопатки, руки прямые', tempo_s: 1 },
    { name: 'держи', cue: 'Держи две секунды', tempo_s: 2, stretch: true },
    { name: 'возврат', cue: 'Медленно разведи', tempo_s: 3 },
  ],
  dose: { sets: '2', reps: '10', rest_s: 30 },
  mistakes: ['Сгибают руки', 'Плечи поднимаются'],
  view: 'side',
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  setup(T) {
    shoulderSetup(T);
    T.h = { Right: handle(T), Left: handle(T) };
    T.anchor = V3(0, 1.3, 1.2);
    pose(T, { depth: 0 });
    const p = mid(T.rig, 'LeftHand', 'RightHand');
    T.anchor = V3(0, p.y - 0.03, p.z + 0.65);
    post(T, T.anchor, V3(0, 0, 1));
    pose(T, { depth: 0 });
    T.neck0 = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm'));
    T.hand0 = mid(T.rig, 'LeftHand', 'RightHand');
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    for (const s of SIDES) {
      armAudit(T, r, s, { lo: 0, hi: 12, h: T.h[s] });
      bandAudit(T, r, T.h[s], s, [...BODY.torso, ...BODY.legs], 0.4, s[0]);
    }
    const sh = w(rig, 'Head').distanceTo(mid(rig, 'LeftArm', 'RightArm'));
    r.m.shrug = cm(T.neck0 - sh);
    if (T.neck0 - sh > 0.01) r.bad.push(`плечи поднялись к ушам (${r.m.shrug} см)`);
    r.m.handsBack = cm(T.hand0.z - mid(rig, 'LeftHand', 'RightHand').z);
    return r;
  },
};
