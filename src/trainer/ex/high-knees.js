// Высокое колено на месте (цикл 2 с, по шагу на ногу): опорная на подушечке (пятка на 2,5 см), колено почти прямое,
// летящее бедро до горизонтали (колено до пояса), голень отвесно, стопа с носком вниз. Корпус ровно, без завала назад,
// руки согнуты под 90° и машут против ног. Показано медленно и без продвижения: цикл замыкается на месте.
import { w, cm, SIDES } from '../poses.js';
import { inPlace, legState, ankleBy, bump, measureFloor, arms, stepAudit, torsoCheck } from '../warmup.js';
import { lerp } from '../poses.js';

const P = 2, SW = 0.5;
const cfg = (rig) => ({
  P, sw: SW, hip: 0.95, toe: 0.35, el: 86,
  bob: (t) => 0.012 * Math.cos(4 * Math.PI * (t - 0.5) / P), // таз выше, когда колено вверху: опорная выпрямляется
  swing: (u) => { const k = bump(u); return ankleBy(rig, lerp(0, 86, k), lerp(15, 92, k)); },
  plant: (u) => 0.35 * bump(u),
  arm: (t) => { const a = 38 * Math.sin(2 * Math.PI * t / P); return arms({ r: -a, l: a, out: 0.12, bend: 88, inward: 0.08, fwd: 8 }); },
});

export default {
  id: 'high-knees',
  name: 'Высокое колено',
  muscles: { work: ['hip_flexors', 'calves', 'quads'], stretch: ['glutes'], careful: ['ankle'] },
  phases: [
    { name: 'подъём', cue: 'Колено до пояса', tempo_s: 1 },
    { name: 'контакт', cue: 'Быстро на носок', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '18 м', rest_s: 30 },
  mistakes: ['Наклон назад', 'Приземление на пятку'],
  view: 'side',
  flat: 'side',
  wide: true,
  pace: 'В жизни бегом, частые шаги вперёд',
  setup(T) { measureFloor(T); T.cfg = cfg(T.rig); },
  motion(i, u) { return bump(u); },
  feet(T, t) {
    const st = {};
    for (const s of SIDES) { st[s] = legState(P, SW, s, t); st[s].land = st[s].planted && t - st[s].t0 < 0.15; }
    return st;
  },
  pose(T, { t }) { T.tNow = t; inPlace(T, t, T.cfg); },
  audit(T) {
    const { rig } = T, r = stepAudit(T, this, T.tNow);
    torsoCheck(r, 80, 92);
    for (const s of SIDES) {
      const f = T.st[s];
      if (f.planted || Math.abs(f.u - 0.5) > 0.06) continue;
      const k = w(rig, s + 'Leg').y - w(rig, s + 'UpLeg').y; r.m.kneeUp = cm(k);
      if (k < -0.07) r.bad.push(`колено ниже пояса: ${cm(k)} см под тазом`);
    }
    return r;
  },
};
