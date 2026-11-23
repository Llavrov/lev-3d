// Нижняя тяга резинки стоя. Две резинки закреплены на стойке впереди на высоте 0,8 м, в руках рукояти нейтральным хватом.
// Руки почти прямые: идут от «вперёд-вниз на 40°» к бёдрам и чуть за них, лопатки уходят вниз и назад. Корпус ровный,
// колени мягкие, поясница не прогибается.
import * as THREE from 'three';
import { V, FWD, lerp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, feet, trunk, placeHips, look, palmTo, reachOf, baseAudit, shadows, frameMat } from '../poses.js';
import { band, stretch } from '../band.js';
import { grip, placeGrip, onAxis, skinSetup, clearOf, TORSO, LEGS } from '../pulls.js';

const FRONT = 40, BACK = -10, TORSO_EL = 88; // рука от отвеса вперёд в начале и назад в конце, °; корпус, °
const K = key({});
const anchorOf = (s) => new THREE.Vector3(sgn(s) * 0.22, 0.8, 1.1);

export default {
  id: 'band-low-row',
  name: 'Нижняя тяга резинки',
  muscles: { work: ['rhomboids', 'traps', 'lats', 'delts_rear'], stretch: [], careful: ['shoulder_joint'] },
  phases: [
    { name: 'тяга', cue: 'Руки к бёдрам', tempo_s: 1 },
    { name: 'держи', cue: 'Лопатки вниз и назад', tempo_s: 2 },
    { name: 'возврат', cue: 'Медленно вперёд', tempo_s: 3 },
  ],
  dose: { sets: '2', reps: '10', rest_s: 30 },
  mistakes: ['Плечи поднимаются', 'Прогиб в пояснице'],
  view: 'side',
  setup(T) {
    const { rig } = T;
    skinSetup(T);
    const g = new THREE.Group(), post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), frameMat()); post.position.set(0, 0.6, 1.15); g.add(post);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), frameMat()); bar.position.set(0, 0.8, 1.13); g.add(bar);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.4), frameMat()); foot.position.set(0, 0.02, 1.15); g.add(foot);
    T.add(shadows(g));
    T.band = { Left: band(T), Right: band(T) };
    T.grips = { Left: grip(T), Right: grip(T) };
    T.feetAt = feet(T, T.hipHalf + 0.03);
    T.hipY = rig.ankleH + 0.965 * (rig.L1 + rig.L2); // колени мягкие
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d = depth;
    T.retract = lerp(3, 18, d); T.depress = lerp(2, 10, d);
    stand(T);
    trunk(T, K, TORSO_EL);
    placeHips(T, new THREE.Vector3(0, T.hipY, 0), T.feetAt);
    look(T, new THREE.Vector3(0, 1.1, 3), 35); // у этой модели шея в линию спины задирает лицо: кивок до 35°, как в steps.js
    const a = THREE.MathUtils.degToRad(lerp(FRONT, BACK, d));
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), dir = new THREE.Vector3(sgn(s) * 0.12, -Math.cos(a), Math.sin(a)).normalize();
      const P = S.clone().addScaledVector(dir, reachOf(T, s) * 0.97);
      const ax = palmTo(T, s, P, FWD, new THREE.Vector3(sgn(s) * 0.2, 0, -1)); // локоть смотрит назад, рука почти прямая
      placeGrip(T.grips[s], rig.palm(s), ax);
      stretch(T.band[s], anchorOf(s), rig.palm(s));
    }
    rig.grip('Right', 1); rig.grip('Left', 1);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    if (Math.abs(r.m.torso - TORSO_EL) > 3) r.bad.push(`корпус гуляет: ${r.m.torso}°`);
    for (const s of SIDES) {
      const g = T.grips[s], ax = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion), h = onAxis(T, s, g.position, ax, 0.06);
      r.m['grip' + s[0]] = cm(h.off);
      if (!h.ok) r.bad.push(`${ruSide(s, true)} кисть не на рукояти`);
      if (r.m['elbow' + s[0]] > 30) r.bad.push(`${ruSide(s)} локоть согнут ${r.m['elbow' + s[0]]}°: руки почти прямые`);
      clearOf(T, r, `${ruSide(s, true)} резинка`, anchorOf(s), g.position.clone().addScaledVector(anchorOf(s).sub(g.position).normalize(), 0.06), [...TORSO, ...LEGS]);
    }
    return r;
  },
};
