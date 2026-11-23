// Наружная ротация 90/90 с резинкой, правая рука. Стоя лицом к стойке, крюк впереди на высоте кисти в начале. Плечо
// отведено на 90° (локоть на уровне плеча) и на 30° вперёд от плоскости корпуса (плоскость лопатки; при 0 и 15° Rig.arm уводил локоть по кругу уже с 65° поворота), локоть 90°.
// Старт: предплечье вперёд параллельно полу, ладонь вниз. Предплечье поворачивается вокруг плеча вверх до 80° (почти
// отвесно, ладонь вперёд), локоть остаётся на месте. Дальше 90° у модели плечо доворачивает свой предел и локоть уходит
// по кругу. Большой палец всё время к голове (к середине тела). Ракурс спереди: кисть поднимается от уровня локтя почти отвесно.
import * as THREE from 'three';
import { deg, lerp, smooth, w, sgn } from '../poses.js';
import { shoulderSetup, upright, armW, rest, fist, post, handle, pull, axes, armAudit, bandAudit, baseAudit, BODY, V3, rad } from '../shoulder.js';

const TH = [0, 80], PLANE = 30;

function pose(T, { depth }) {
  upright(T);
  const { up, left, front } = axes(T), out = left.clone().multiplyScalar(sgn('Right'));
  const u = out.clone().multiplyScalar(Math.cos(deg(PLANE))).addScaledVector(front, Math.sin(deg(PLANE)));
  const fw = front.clone().addScaledVector(u, -front.dot(u)).normalize(), th = deg(lerp(TH[0], TH[1], depth));
  armW(T, 'Right', u, fw.multiplyScalar(Math.cos(th)).addScaledVector(up, Math.sin(th)));
  rest(T, 'Left');
  pull(T, T.h, 'Right', fist(T, 'Right', u.clone().negate()), T.anchor);
  T.u = u;
}

export default {
  id: 'band-er-90-90',
  name: 'Наружная ротация 90/90',
  muscles: { work: ['rotator_cuff', 'delts_rear', 'traps'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'старт', cue: 'Плечо и локоть под 90°', tempo_s: 1 },
    { name: 'вверх', cue: 'Кисть назад и вверх', tempo_s: 2 },
    { name: 'возврат', cue: 'Медленно вперёд', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '12', rest_s: 30 },
  mistakes: ['Локоть опускается ниже плеча', 'Прогиб в пояснице'],
  view: 'front', // спереди-справа плечо смотрит в камеру и кисть закрывает лицо
  motion(i, u) { const e = smooth(u); return i === 0 ? 0 : i === 1 ? e : 1 - e; },
  setup(T) {
    shoulderSetup(T);
    T.h = handle(T);
    T.anchor = V3(0, 0, 0);
    pose(T, { depth: 0 });
    const p = T.rig.palm('Right');
    T.anchor = V3(p.x - 0.3, p.y - 0.05, p.z + 0.6); // стойка снаружи от линии предплечья: спереди она не закрывает руку
    post(T, T.anchor, V3(0, 0, 1));
    pose(T, { depth: 0 });
    T.elbow0 = { Right: w(T.rig, 'RightForeArm') };
  },
  pose,
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    armAudit(T, r, 'Right', { h: T.h });
    bandAudit(T, r, T.h, 'Right', [...BODY.torso, ...BODY.legs, ...BODY.limb('Left')], 0.4);
    const S = w(rig, 'RightArm'), E = w(rig, 'RightForeArm');
    r.m.elbowBelow = +((S.y - E.y) * 100).toFixed(1);
    if (Math.abs(S.y - E.y) > 0.04) r.bad.push(`локоть не на уровне плеча (${r.m.elbowBelow} см)`);
    const f = w(rig, 'RightHand').sub(E).normalize();
    r.m.foreUp = Math.round(rad(Math.asin(f.y)));
    if (f.y < -0.1) r.bad.push('предплечье ниже горизонтали');
    return r;
  },
};
