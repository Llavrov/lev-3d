// Марш прямыми ногами на месте (цикл 2 с): прямая нога махом вперёд-вверх до 65° от отвеса, носок на себя, навстречу
// ей тянется прямая рука другой стороны (до стопы у модели не достаёт: руки и бёдра короче человеческих). Опорная нога
// прямая, стоит всей стопой, корпус ровно. Показано без продвижения: в жизни каждый мах — шаг вперёд.
import * as THREE from 'three';
import { w, cm, SIDES, sgn, lerp, V } from '../poses.js';
import { inPlace, legState, bump, measureFloor, stepAudit, torsoCheck } from '../warmup.js';

const P = 2, SW = 0.42, HIP = 0.982, UPMAX = 65;
// Рука s тянется вперёд на k (0 — висит вдоль тела, 1 — прямая вперёд-вниз на 25° под горизонталью, к стопе).
const reach = (s, k) => {
  const x = s === 'Right' ? 1 : -1, e = (25 * Math.PI) / 180;
  const up = V(x * 0.1, -1, 0.04).lerp(V(-x * 0.12, -Math.sin(e), Math.cos(e)), k).normalize();
  const fo = V(x * 0.06, -1, 0.18).lerp(V(-x * 0.14, -Math.sin(e), Math.cos(e)), k).normalize();
  return [up, fo];
};
const cfg = (rig) => ({
  P, sw: SW, hip: HIP, toe: 0, el: 86, shift: 0.025,
  swing: (u) => { const a = (UPMAX * Math.PI / 180) * bump(u), R = HIP * (rig.L1 + rig.L2); return { z: R * Math.sin(a), y: -R * Math.cos(a) }; },
  plant: (u) => -0.25 * bump(u), // носок на себя
  arm: (t) => {
    const k = (s) => { const f = legState(P, SW, s === 'Left' ? 'Right' : 'Left', t); return f.planted ? 0 : bump(f.u) ** 0.8; }; // рука навстречу ноге другой стороны
    const [rUp, rFo] = reach('Right', k('Right')), [lUp, lFo] = reach('Left', k('Left'));
    return { rUp, rFo, lUp, lFo };
  },
  grip: 0.15,
});

export default {
  id: 'straight-leg-march',
  name: 'Марш прямыми ногами',
  muscles: { work: ['hip_flexors', 'abs'], stretch: ['hamstrings', 'calves'], careful: ['hamstrings'] },
  phases: [
    { name: 'мах', cue: 'Прямая нога навстречу руке', tempo_s: 1, stretch: true },
    { name: 'шаг', cue: 'Опусти и смени ногу', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '10 на ногу', rest_s: 30 },
  mistakes: ['Сгибание опорной ноги', 'Рывок через боль'],
  view: 'side',
  flat: 'side',
  wide: true,
  pace: 'В жизни с шагом вперёд на каждый мах',
  setup(T) { measureFloor(T); T.cfg = cfg(T.rig); },
  motion(i, u) { return bump(u); },
  feet(T, t) { const st = {}; for (const s of SIDES) st[s] = legState(P, SW, s, t); return st; },
  pose(T, { t }) { T.tNow = t; inPlace(T, t, T.cfg); },
  audit(T) {
    const { rig } = T, r = stepAudit(T, this, T.tNow);
    torsoCheck(r, 80, 92);
    for (const s of SIDES) {
      const f = T.st[s], k = r.m['knee' + s[0]];
      if (f.planted && k > 24) r.bad.push(`${s === 'Left' ? 'левая' : 'правая'} опорная нога согнута: ${k}°`);
      if (!f.planted && f.u > 0.25 && f.u < 0.75 && k > 24) r.bad.push(`${s === 'Left' ? 'левая' : 'правая'} нога в махе согнута: ${k}°`);
      if (!f.planted && Math.abs(f.u - 0.5) < 0.06) {
        const H = w(rig, s + 'UpLeg'), A = w(rig, s + 'Foot');
        r.m.legUp = Math.round(Math.atan2(A.z - H.z, H.y - A.y) * 57.3);
        if (r.m.legUp < 55) r.bad.push(`нога поднята мало: ${r.m.legUp}°`);
      }
    }
    return r;
  },
};
