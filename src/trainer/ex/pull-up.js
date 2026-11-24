// Подтягивания на турнике. Перекладина на двух стойках на высоте BAR_Y, хват сверху шире плеч (±0,42 м, как в gym.js).
// Тело висит: стопы над полом, колени чуть согнуты, ноги слегка впереди. Внизу руки почти прямые, плечи чуть подняты
// (полный вис); вверху грудь у перекладины, корпус чуть откинут назад, лопатки вниз и назад. Локти идут вниз и в стороны.
import * as THREE from 'three';
import { V, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, trunk, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { pullBar, onAxis, skinSetup, clearOf, lowSkin, TORSO } from '../pulls.js';

const BAR_Y = 2.2, GRIP = 0.42; // высота перекладины, м; кисти от середины
const K = key({ rTh: V(0.06, -1, 0.12), rSh: V(0.02, -1, -0.22), lTh: V(-0.06, -1, 0.12), lSh: V(-0.02, -1, -0.22) });
const FEET = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];

export default {
  id: 'pull-up',
  name: 'Подтягивания',
  muscles: { work: ['lats', 'biceps', 'rhomboids', 'forearms'], stretch: ['lats'], careful: ['shoulder_joint', 'elbow'] },
  phases: [
    { name: 'вверх', cue: 'Грудь к перекладине', tempo_s: 1 },
    { name: 'верх', cue: 'Лопатки вниз и назад', tempo_s: 1 },
    { name: 'вниз', cue: 'Опустись полностью медленно', tempo_s: 3, stretch: true },
  ],
  dose: { sets: '3', reps: '5–8', rest_s: 120 },
  mistakes: ['Рывки ногами', 'Неполная амплитуда внизу'],
  view: 'front',
  flat: 'side', // висящего плоская фигурка показывает сбоку
  setup(T) {
    skinSetup(T);
    T.bar = pullBar(T, BAR_Y, 0, 0.7);
    // Плечи под перекладиной в нижней точке: прямая рука до середины ладони, кисть шире плеча на GRIP − полуширина плеч.
    const r = reachOf(T, 'Left') * 0.985, lat = GRIP - T.shoulderHalf;
    T.drop = Math.sqrt(r * r - lat * lat - 0.03 * 0.03);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d = depth;
    T.retract = lerp(2, 14, d); T.depress = lerp(-12, 8, d); // внизу плечи подняты (вис), вверху лопатки вниз и назад
    stand(T);
    trunk(T, K, lerp(90, 95, d)); // вверху корпус чуть откинут: грудь идёт к перекладине, лицо мимо неё
    const M = mid(rig, 'LeftArm', 'RightArm'), to = new THREE.Vector3(0, BAR_Y - lerp(T.drop, 0.17, d), lerp(-0.03, -0.19, d) - 0.12 * Math.sin(Math.PI * d)); // на проходе лица мимо перекладины корпус дальше назад
    // 24.11: голова в нейтрали стоит впереди прежней (была запрокинута), поэтому путь на 4–6 см дальше от перекладины, корпус вверху 95° (было 100 по костям)
    T.wrap.position.add(to.sub(M)); T.wrap.updateMatrixWorld(true);
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, 0.2, 3)), 15); // взгляд вперёд, чуть вверх: на перекладину над собой голова задиралась на 19°
    for (const s of SIDES) palmTo(T, s, new THREE.Vector3(sgn(s) * GRIP, BAR_Y, 0), new THREE.Vector3(-sgn(s), 0, 0), new THREE.Vector3(sgn(s) * 0.8, -0.6, 0.3));
    rig.grip('Right', 1); rig.grip('Left', 1);
    T.d = d;
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] }); // тело висит, стопы идут вместе с ним
    for (const s of SIDES) {
      const g = onAxis(T, s, T.bar, new THREE.Vector3(1, 0, 0), 0.7);
      r.m['grip' + s[0]] = cm(g.off);
      if (!g.ok) r.bad.push(`${ruSide(s, true)} кисть не на перекладине (${cm(g.off)} см)`);
    }
    const foot = lowSkin(T, FEET);
    r.m.footY = cm(foot);
    if (foot < 0.05) r.bad.push(`стопы не над полом (${cm(foot)} см)`);
    clearOf(T, r, 'перекладина', new THREE.Vector3(-0.6, BAR_Y, 0), new THREE.Vector3(0.6, BAR_Y, 0), TORSO);
    r.m.chin = cm(w(rig, 'Head').y - BAR_Y);
    return r;
  },
};
