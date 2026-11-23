// Растяжка 90/90, поочерёдно (span 2): чётный цикл начинается с правой ноги впереди, нечётный — с левой.
// Сидя на коврике, таз смотрит вперёд, высота таза подобрана так, что седалище и бёдра лежат на коврике. Оба бедра под 45°
// к «вперёд», каждое к своей стороне (между ними 90°), колени на коврике. Передняя голень под 90° к бедру поперёк, к другой
// стороне (параллельна заднему бедру), лежит наружной стороной; задняя голень под 90° к своему бедру назад и наружу, лежит
// внутренней стороной. Стопы чуть вытянуты. Смена: колени поднимаются (стопы на коврике шире таза, колени вверх), потом
// опускаются в другую сторону; бёдра на тех же местах, переворачиваются только голени. Держи: корпус с прямой спиной
// наклоняется из таза от 84° до 56° над горизонталью к передней голени. Руки лежат на передней голени (у колена и у стопы),
// в смене — на своих голенях; сзади на руки не опирается.
import * as THREE from 'three';
import { deg, lerp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, stand, trunk, placeHips, look, palmTo, baseAudit } from '../poses.js';
import { mat, floorSetup, legThrough, kneeAudit, gap, lowest, footAlong, faceTo, MAT } from '../floor.js';

const K = key({});
const KNEE_Y = 0.09, ANKLE_Y = 0.08, UPRIGHT = 84, LEAN = 56, POINT = 25; // колено и щиколотка над полом, м; корпус, °; носок вытянут, °
const hdir = (psi, y = 0) => new THREE.Vector3(Math.sin(deg(psi)), y, Math.cos(deg(psi))); // азимут от «вперёд», плюс — влево
const other = (s) => (s === 'Left' ? 'Right' : 'Left');

// Ключевые положения ноги: колено, щиколотка, ступня (мир). mode: front — передняя, back — задняя, up — колено вверх.
function legKey(T, s, mode) {
  const { rig } = T, H = w(rig, s + 'UpLeg'), g = sgn(s);
  if (mode === 'up') {
    const A = new THREE.Vector3(g * 0.3, rig.ankleH + MAT, H.z + 0.5), Kp = H.clone().add(new THREE.Vector3(g * 0.18, 0.33, 0.25));
    return { K: Kp, A, foot: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g * 0.2).multiply(T.footFlat[s]) };
  }
  const dy = KNEE_Y - H.y, u = hdir(45 * g).multiplyScalar(Math.sqrt(rig.L1 ** 2 - dy ** 2)).setY(dy);
  const Kp = H.clone().add(u), sh = hdir(mode === 'front' ? -45 * g : 135 * g), A = Kp.clone().addScaledVector(sh, rig.L2).setY(ANKLE_Y);
  const shin = A.clone().sub(Kp).normalize(), toe = u.clone().normalize().multiplyScalar(Math.cos(deg(POINT))).addScaledVector(shin, Math.sin(deg(POINT)));
  return { K: Kp, A, foot: footAlong(T, s, shin, toe) };
}
const mixKey = (a, b, e) => ({ K: a.K.clone().lerp(b.K, e), A: a.A.clone().lerp(b.A, e), foot: a.foot.clone().slerp(b.foot, e) });
const top = (T, P, r = 0.075) => P.clone().add(new THREE.Vector3(0, r, 0)); // кожа сверху над точкой ноги

function seat(T, elev, dip = 0) {
  stand(T);
  trunk(T, K, elev);
  placeHips(T, new THREE.Vector3(0, T.hipY - dip, 0), null);
}

export default {
  id: 'hip-90-90',
  name: 'Растяжка 90/90 для бедра',
  muscles: { work: ['hip_abductors', 'glutes'], stretch: ['glutes', 'adductors'], careful: ['knee', 'lower_back'] },
  phases: [
    { name: 'посадка', cue: 'Обе ноги под 90°', tempo_s: 1 },
    { name: 'смена', cue: 'Переложи колени в другую сторону', tempo_s: 3 },
    { name: 'держи', cue: 'Наклон к передней голени, спина прямая', tempo_s: 20, stretch: true },
  ],
  dose: { sets: '2', reps: '6 смен', rest_s: 30 },
  view: 'front',
  flat: 'front',
  span: 2,
  motion(i, u) { return i === 2 ? smooth(Math.min(1, u * 4)) : 0; }, // наклон за первые 5 с удержания
  setup(T) {
    floorSetup(T); mat(T, 1.4, 1.2, 0, 0.1);
    T.cycle = this.phases.reduce((a, p) => a + p.tempo_s, 0);
    // Высота таза: седалище и бёдра на коврике в позе 90/90.
    T.hipY = 0.12;
    for (let i = 0; i < 3; i++) {
      this.pose(T, { t: 0, i: 0, u: 0, depth: 0 });
      T.hipY += MAT - lowest(T, ['Hips', 'LeftUpLeg', 'RightUpLeg']).y; // седалище — кожа бедра у таза
    }
  },
  pose(T, { t, i, u, depth }) {
    const { rig } = T, k = ((Math.floor(t / T.cycle) % 2) + 2) % 2, F0 = k ? 'Left' : 'Right'; // передняя до смены
    const F = i === 2 ? other(F0) : F0; // передняя сейчас (после смены — другая)
    seat(T, lerp(UPRIGHT, LEAN, depth), i === 1 ? 0.045 * Math.sin(Math.PI * smooth(u)) : 0); // колени вверх — бёдра поднимают седалище, таз опускается на 4,5 см
    look(T, null);
    faceTo(T, new THREE.Vector3(0, -0.45, 1).normalize(), 60); // взгляд вперёд-вниз, 18° к перпендикуляру корпуса: шея в линию спины сидя запрокидывает лицо модели на 30°
    const legs = {};
    for (const s of SIDES) {
      if (i === 1) { // смена: 0–0,5 — колени вверх, 0,5–1 — вниз в другую сторону
        const e = smooth(u), up = legKey(T, s, 'up');
        legs[s] = e < 0.5 ? mixKey(legKey(T, s, s === F0 ? 'front' : 'back'), up, smooth(e * 2)) : mixKey(up, legKey(T, s, s === F0 ? 'back' : 'front'), smooth(e * 2 - 1));
      } else legs[s] = legKey(T, s, s === F ? 'front' : 'back');
      legThrough(T, s, legs[s].K, legs[s].A, legs[s].foot);
    }
    // Руки: на передней голени у колена и у стопы; в смене — на своих коленях.
    const B = other(F), onShin = { [F]: top(T, w(rig, F + 'Leg')), [B]: top(T, w(rig, F + 'Leg').lerp(w(rig, F + 'Foot'), 0.75), 0.06) };
    for (const s of SIDES) {
      const own = top(T, w(rig, s + 'Leg').lerp(w(rig, s + 'Foot'), 0.5), 0.05); // на середине своей голени
      const P = i === 1 ? own.lerp(onShin[s], Math.abs(smooth(u) * 2 - 1)) : onShin[s];
      palmTo(T, s, P, new THREE.Vector3(-sgn(s), 0, 0.3).normalize(), new THREE.Vector3(sgn(s), -0.2, -0.4));
      rig.relaxHand(s); rig.grip(s, 0.25);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    kneeAudit(T, r);
    r.m.seatGap = gap(T, ['Hips', 'LeftUpLeg', 'RightUpLeg']);
    if (r.m.seatGap > 1.5) r.bad.push(`таз висит над полом: ${r.m.seatGap} см`);
    for (const s of SIDES) {
      r.m['shin' + s[0]] = gap(T, [s + 'Leg']); r.m['thigh' + s[0]] = gap(T, [s + 'UpLeg']);
      r.m['foot' + s[0]] = gap(T, [s + 'Foot', s + 'ToeBase'].filter((n) => T.skin[n]));
      for (const [k, v] of [['голень', r.m['shin' + s[0]]], ['бедро', r.m['thigh' + s[0]]], ['стопа', r.m['foot' + s[0]]]])
        if (v < -1.5) r.bad.push(`${ruSide(s, k !== 'бедро')} ${k} в полу: ${v} см`);
      const H = w(rig, s + 'UpLeg'), A = w(rig, s + 'Foot');
      r.m['hand' + s[0]] = cm(rig.palm(s).distanceTo(w(rig, s + 'Hand'))); // для отладки: ладонь от запястья
      if (A.y < 0) r.bad.push(`${ruSide(s, true)} щиколотка ниже пола`);
      r.m['hipY' + s[0]] = cm(H.y);
    }
    // Колени 90° в позах 90/90 (не в смене).
    r.m.seatY = cm(T.hipY);
    return r;
  },
};
