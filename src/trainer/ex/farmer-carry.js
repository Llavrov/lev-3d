// Прогулка фермера: тяжёлые гантели в опущенных руках, корпус прямо, плечи вниз. Показ: три шага вперёд, разворот
// на месте налево в четыре шага, три шага обратно, разворот направо — цикл замыкается в начальной стойке (7,4 с).
// Подъём гантелей с пола не показан: ручка гантели в 5 см от пола, у модели короткие руки, до неё она достаёт только
// в очень глубоком приседе, и цикл ходьбы рвался бы.
import * as THREE from 'three';
import { w, look, SIDES, ruSide, cm, legGap, dumbbells } from '../poses.js';
import { script, measureFeet, gait, legAudit } from '../steps.js';
import { hangDBs, torso, gaze } from '../legs.js';

const A = 0.11, SL = 0.45, D = 2 * SL, P = 7.4; // полуширина стоп, шаг, длина пути, цикл
const deg = Math.PI / 180;
const at = (c, th, s, a = A) => { const k = s === 'Left' ? 1 : -1; return { x: c.x + k * a * Math.cos(th), z: c.z - k * a * Math.sin(th) }; }; // стопа у точки c при курсе th (левая — влево от тела)

export function build(T) {
  const { rig } = T, tall = rig.ankleH + 0.968 * (rig.L1 + rig.L2); // с качанием таза по клипу шага; выше — задняя нога в конце шага не достаёт пола
  const S = script(P, { Left: { x: A, z: 0, yaw: 0 }, Right: { x: -A, z: 0, yaw: 0 } });
  const C1 = { x: 0, z: D }, C0 = { x: 0, z: 0 };
  // В развороте стопы шире (0,14), и стоящая доворачивается на подушечке за тазом наполовину: иначе колено внутрь и бёдра сходятся.
  const put = (s, t0, c, th, turn = true) => { const p = at(c, th * deg, s, turn ? 0.14 : A); S.step(s, t0, t0 + 0.4, p.x, p.z, th * deg, { h: 0.06, follow: 0.5 }); };
  // туда
  S.step('Right', 0.2, 0.6, -A, SL, 0, { h: 0.06 });
  S.step('Left', 0.75, 1.15, A, D, 0, { h: 0.06 });
  put('Right', 1.3, C1, 0, false);
  // разворот налево (курс растёт), левая внутри поворота
  put('Left', 1.85, C1, 60); put('Right', 2.3, C1, 120); put('Left', 2.75, C1, 180, false); put('Right', 3.2, C1, 180, false);
  // обратно
  S.step('Left', 3.7, 4.1, -A, SL, Math.PI, { h: 0.06 });
  S.step('Right', 4.25, 4.65, A, 0, Math.PI, { h: 0.06 });
  put('Left', 4.8, C0, 180, false);
  // разворот направо (курс убывает), правая внутри поворота
  put('Right', 5.35, C0, 120); put('Left', 5.8, C0, 60); put('Right', 6.25, C0, 0, false); put('Left', 6.7, C0, 0, false);
  const k = (t, yaw, gait = 1) => S.key(t, { y: tall, dx: 0, dz: 0, yaw, hips: 0, torso: 0, elev: 89, run: 0, hang: 0, gait, v: 1.2 }); // gait: нога в махе и таз по клипу шага
  // на развороте переступы короткие: мах по старой дуге (иначе стопы задевают друг друга)
  k(0, 0); k(1.7, 0); k(2.2, 60, 0); k(2.65, 120, 0); k(3.1, 172, 0); k(3.55, 180); k(5.2, 180); k(5.75, 120, 0); k(6.2, 60, 0); k(6.65, 8, 0); k(7.1, 0);
  return S.done();
}

export default {
  id: 'farmer-carry',
  name: 'Прогулка фермера',
  muscles: { work: ['forearms', 'traps', 'obliques', 'abs'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'туда', cue: 'Плечи вниз, шаг ровный', tempo_s: 3.55 },
    { name: 'обратно', cue: 'Корпус ровно, не кренись', tempo_s: P - 3.55 },
  ],
  dose: { sets: '3', reps: '30 м', rest_s: 60 },
  mistakes: ['Наклон в сторону', 'Плечи к ушам'],
  view: 'side',
  pace: 'В жизни иди 30 м без остановки',
  wide: true,
  flat: 'side',
  setup(T) { measureFeet(T); dumbbells(T); T.S = build(T); T.depress = 6; },
  pose(T, { t }) {
    const g = gait(T, T.S, t), face = new THREE.Vector3(Math.sin(g.yaw), 0, Math.cos(g.yaw));
    look(T, w(T.rig, 'Head').setY(1.1).addScaledVector(face, 5), 35); // взгляд вперёд: с кивком до 18° у gait лицо смотрело вверх
    hangDBs(T, face, new THREE.Vector3(face.z, 0, -face.x));
  },
  audit(T) {
    const { rig } = T, r = legAudit(T);
    for (const s of SIDES) {
      const g = legGap(T, s, T.db[s].position, true); r.m['gap' + s[0]] = cm(g);
      if (g < -0.015) r.bad.push(`${ruSide(s, true)} гантель в ноге (${cm(g)} см)`);
    }
    // Корпус не кренится вбок: линия таз → шея от отвеса поперёк тела.
    const { up, across } = torso(rig), tilt = Math.round(Math.asin(up.dot(across)) / deg);
    r.m.tilt = tilt;
    if (Math.abs(tilt) > 5) r.bad.push(`корпус кренится вбок: ${tilt}°`);
    gaze(T, r, -35);
    return r;
  },
};
