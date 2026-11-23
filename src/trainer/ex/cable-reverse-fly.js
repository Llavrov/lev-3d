// Разведения назад на блоке стоя. Две стойки блока впереди по бокам, ролики чуть ниже плеч; правая рука держит трос
// левой стойки, левая — правой, тросы перекрещиваются перед грудью. Руки почти прямые (локоть мягкий), ладони вниз,
// кисти идут по дуге на уровне плеч от «вместе перед грудью» до «в стороны в линию с плечами», лопатки сводятся.
// Корпус неподвижен. Показ сзади: работают задние дельты и мышцы между лопатками, стойки не закрывают человека.
import * as THREE from 'three';
import { UP, deg, lerp, smooth, w, key, SIDES, sgn, ruSide, cm, stand, feet, trunk, placeHips, look, palmTo, reachOf, baseAudit } from '../poses.js';
import { stretch } from '../band.js';
import { station, cable, grip, placeGrip, onAxis, skinSetup, clearOf, TORSO, LEGS } from '../pulls.js';

const IN = -12, OUT = 84, TORSO_EL = 90; // кисти от «прямо вперёд»: внутрь в начале, наружу в конце, °
const K = key({});
const other = (s) => (s === 'Left' ? 'Right' : 'Left');
const DOWN = new THREE.Vector3(0, -1, 0);
// Ролик стойки на стороне s (левая стойка в +X). Ролики на разной высоте, чтобы тросы не резали друг друга.
const pulleyOf = (s) => new THREE.Vector3(sgn(s) * 0.62, s === 'Left' ? 1.33 : 1.39, 1.3);

export default {
  id: 'cable-reverse-fly',
  name: 'Разведения назад на блоке',
  muscles: { work: ['delts_rear', 'rhomboids', 'traps'], stretch: ['chest'], careful: ['shoulder_joint'] },
  phases: [
    { name: 'развод', cue: 'Руки широко назад', tempo_s: 1 },
    { name: 'держи', cue: 'Сведи лопатки', tempo_s: 1 },
    { name: 'возврат', cue: 'Медленно вперёд', tempo_s: 2 },
  ],
  dose: { sets: '3', reps: '12–15', rest_s: 45 },
  mistakes: ['Рывок корпусом', 'Плечи к ушам'],
  view: 'back',
  setup(T) {
    const { rig } = T;
    skinSetup(T);
    for (const s of SIDES) station(T, pulleyOf(s));
    T.cable = { Left: cable(T), Right: cable(T) };
    T.grips = { Left: grip(T, 0.1), Right: grip(T, 0.1) };
    T.feetAt = feet(T, T.hipHalf + 0.03);
    T.hipY = rig.ankleH + 0.975 * (rig.L1 + rig.L2);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, d = depth, phi = deg(lerp(IN, OUT, d));
    T.retract = lerp(-3, 18, d); T.depress = 4;
    stand(T);
    trunk(T, K, TORSO_EL);
    placeHips(T, new THREE.Vector3(0, T.hipY, 0), T.feetAt);
    look(T, new THREE.Vector3(0, 1.2, 3), 35);
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), f = new THREE.Vector3(sgn(s) * Math.sin(phi), 0, Math.cos(phi));
      const P = S.clone().addScaledVector(f.clone().setY(-0.08).normalize(), reachOf(T, s) * 0.95);
      const R = s === 'Right' ? f.clone().cross(DOWN) : DOWN.clone().cross(f); // ладонь вниз, к указательному — внутрь
      const ax = palmTo(T, s, P, R, new THREE.Vector3(sgn(s), 0.4, -0.3)); // локоть смотрит наружу-вверх
      placeGrip(T.grips[s], rig.palm(s), ax);
      stretch(T.cable[s], pulleyOf(other(s)), rig.palm(s));
    }
    rig.grip('Right', 1); rig.grip('Left', 1);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    if (Math.abs(r.m.torso - TORSO_EL) > 3) r.bad.push(`корпус гуляет: ${r.m.torso}°`);
    for (const s of SIDES) {
      const g = T.grips[s], ax = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion), h = onAxis(T, s, g.position, ax, 0.05);
      r.m['grip' + s[0]] = cm(h.off);
      if (!h.ok) r.bad.push(`${ruSide(s, true)} кисть не на рукояти`);
      if (r.m['elbow' + s[0]] > 40) r.bad.push(`${ruSide(s)} локоть согнут ${r.m['elbow' + s[0]]}°: руки почти прямые`);
      const P = pulleyOf(other(s)), from = g.position.clone().addScaledVector(P.clone().sub(g.position).normalize(), 0.05);
      clearOf(T, r, `трос к ${s === 'Left' ? 'левой' : 'правой'} руке`, P, from, [...TORSO, ...LEGS, other(s) + 'Arm', other(s) + 'ForeArm']);
      // Кисть на уровне плеча (до 12 см ниже), а не над ним.
      const dy = rig.palm(s).y - w(rig, s + 'Arm').y;
      r.m['handY' + s[0]] = cm(dy);
      if (dy > 0.02 || dy < -0.15) r.bad.push(`${ruSide(s, true)} кисть не на уровне плеча (${cm(dy)} см)`);
    }
    return r;
  },
};
