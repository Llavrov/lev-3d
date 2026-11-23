// Захлёст голени на месте (цикл 2 с): опорная на подушечке, бедро летящей ноги почти отвесно (вперёд до 12°), голень
// захлёстывается назад, пятка к ягодице (сгиб колена до 128°: дальше у модели икра уходит в бедро), стопа носком вниз.
// Корпус ровно, руки машут против ног. Показано медленно и без продвижения.
import { w, cm, SIDES, lerp } from '../poses.js';
import { inPlace, legState, ankleBy, bump, measureFloor, arms, stepAudit, torsoCheck } from '../warmup.js';

const P = 2, SW = 0.5;
const cfg = (rig) => ({
  P, sw: SW, hip: 0.95, toe: 0.35, el: 85,
  bob: (t) => 0.01 * Math.cos(4 * Math.PI * (t - 0.5) / P),
  swing: (u) => { const k = bump(u); return ankleBy(rig, lerp(0, 12, k), lerp(20, 128, k)); },
  plant: (u) => 0.6 * bump(u),
  arm: (t) => { const a = 32 * Math.sin(2 * Math.PI * t / P); return arms({ r: -a, l: a, out: 0.12, bend: 88, inward: 0.08, fwd: 8 }); },
});

export default {
  id: 'butt-kicks',
  name: 'Захлёст голени',
  muscles: { work: ['hamstrings', 'calves'], stretch: ['quads'], careful: ['hamstrings'] },
  phases: [
    { name: 'захлёст', cue: 'Пятка к ягодице', tempo_s: 1 },
    { name: 'контакт', cue: 'Быстро на носок', tempo_s: 1 },
  ],
  dose: { sets: '2', reps: '18 м', rest_s: 30 },
  mistakes: ['Наклон вперёд', 'Медленный темп'],
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
      const H = w(rig, s + 'UpLeg'), A = w(rig, s + 'Foot'), K = w(rig, s + 'Leg');
      r.m.heelUp = cm(A.y - K.y); r.m.thigh = Math.round(Math.atan2(K.z - H.z, H.y - K.y) * 57.3);
      if (A.y - K.y < 0.15) r.bad.push(`пятка не дошла к ягодице: щиколотка на ${cm(A.y - K.y)} см над коленом`);
      if (Math.abs(r.m.thigh) > 25) r.bad.push(`бедро ушло от отвеса: ${r.m.thigh}°`);
    }
    return r;
  },
};
