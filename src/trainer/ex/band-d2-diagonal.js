// Диагональ вверх с резинкой (D2 сгибание), правая рука. Крюк низко слева впереди (15 см над полом), резинка тянет
// кисть к левому бедру. Старт: кулак у левого бедра перед телом, ладонь к бедру, большой палец вниз. Рука почти прямая
// (локоть до 20°) идёт по дуге вверх и наружу, по ходу поворачивается наружу: наверху рука над правым плечом на 140°
// подъёма, ладонь вперёд, большой палец назад. Дуга — поворот направления руки по большому кругу от старта к верху,
// середина проходит перед корпусом. Плечи не тянутся к ушам. Ракурс спереди.
import * as THREE from 'three';
import { deg, lerp, smooth, w, mid, cm } from '../poses.js';
import { shoulderSetup, upright, armW, rest, fist, post, handle, pull, axes, armAudit, bandAudit, handIn, baseAudit, BODY, V3 } from '../shoulder.js';

function dirs(T) {
  const { up, left, front } = axes(T), out = left.clone().negate();
  return {
    a: left.clone().multiplyScalar(0.42).addScaledVector(up, -0.78).addScaledVector(front, 0.46).normalize(), // к левому бедру
    b: out.clone().multiplyScalar(0.55).addScaledVector(up, 0.8).addScaledVector(front, 0.18).normalize(), // над правым плечом
    ta: left.clone().multiplyScalar(0.3).addScaledVector(up, -0.4).addScaledVector(front, -0.85), // большой палец вниз и к телу
    tb: front.clone().negate().addScaledVector(out, 0.3), // большой палец назад
    up, front, out,
  };
}
function pose(T, { depth }) {
  upright(T);
  const D = dirs(T), d = D.a.clone().lerp(D.b, depth).normalize(); // по большому кругу (lerp + нормировка — та же дуга)
  // Локоть чуть мягкий: предплечье на 12° к «вперёд» руки.
  const bend = D.front.clone().addScaledVector(d, -D.front.dot(d)).normalize(), f = d.clone().multiplyScalar(Math.cos(deg(12))).addScaledVector(bend, Math.sin(deg(12)));
  armW(T, 'Right', d, f);
  rest(T, 'Left');
  const t = D.ta.clone().normalize().lerp(D.tb.clone().normalize(), smooth(depth));
  pull(T, T.h, 'Right', fist(T, 'Right', t), T.anchor);
}

export default {
  id: 'band-d2-diagonal',
  name: 'Диагональ вверх с резинкой',
  muscles: { work: ['rotator_cuff', 'delts_side', 'traps', 'delts_rear'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'старт', cue: 'Кисть у противоположного бедра', tempo_s: 1 },
    { name: 'подъём', cue: 'Вверх и наружу по диагонали', tempo_s: 2 },
    { name: 'возврат', cue: 'Медленно обратно', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '15–20', rest_s: 30 },
  mistakes: ['Рывок корпусом', 'Плечо к уху'],
  view: 'front',
  motion(i, u) { const e = smooth(u); return i === 0 ? 0 : i === 1 ? e : 1 - e; },
  setup(T) {
    shoulderSetup(T);
    T.h = handle(T);
    T.anchor = V3(0.5, 0.15, 0.5);
    post(T, T.anchor, V3(0.6, 0, 0.8));
    pose(T, { depth: 0 });
    T.neck0 = w(T.rig, 'Head').distanceTo(mid(T.rig, 'LeftArm', 'RightArm'));
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    armAudit(T, r, 'Right', { lo: 0, hi: 20, h: T.h });
    bandAudit(T, r, T.h, 'Right', [...BODY.torso, ...BODY.legs, ...BODY.limb('Left')], 0.4);
    r.m.handGap = handIn(T, 'Right', axes(T).front);
    if (r.m.handGap != null && r.m.handGap < 0.5) r.bad.push(`кисть в теле (${r.m.handGap} см)`);
    const sh = w(rig, 'Head').distanceTo(mid(rig, 'LeftArm', 'RightArm'));
    r.m.shrug = cm(T.neck0 - sh);
    if (T.neck0 - sh > 0.02) r.bad.push(`плечо к уху (${r.m.shrug} см)`);
    return r;
  },
};
