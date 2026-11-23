// Планка на предплечьях, статика с дыханием. Тело лицом к полу одной прямой от головы до пяток, на носках: пальцы стоп
// подогнуты и лежат на коврике. Наклон линии тела подбирается так, чтобы плечевой сустав стоял над локтем на длине плеча
// (core.onToes + solve). Локти под плечами на коврике, предплечья вперёд параллельно, ладони вниз. Голова в линию спины,
// взгляд в пол перед кистями. Дыхание — грудной отдел ±1° с периодом 4 с, таз неподвижен.
import * as THREE from 'three';
import { V, deg, w, key, SIDES, sgn, cm, look, armIK, baseAudit } from '../poses.js';
import { mat, floorSetup, gap, MAT } from '../floor.js';
import { onToes, solve, bodyLine } from '../core.js';

const ELBOW_H = 0.065 + MAT; // локоть над полом: под суставом мягкие ткани предплечья
const K = key({ rTh: V(0.04, -1, 0.06), rSh: V(0.02, -1, 0.06), lTh: V(-0.04, -1, 0.06), lSh: V(-0.02, -1, 0.06) }); // ноги на ширине таза

function body(T, e, breath = 0) {
  const { rig } = T;
  onToes(T, K, e, 0);
  if (breath) {
    rig.turnWorld(rig.b.Spine2, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg(breath)));
    rig.root.updateMatrixWorld(true);
  }
}

export default {
  id: 'front-plank',
  name: 'Планка',
  muscles: { work: ['abs', 'obliques', 'delts_front'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'вход', cue: 'Локти под плечами', tempo_s: 1 },
    { name: 'держи', cue: 'Рёбра вниз, ягодицы сжаты', tempo_s: 30 },
  ],
  dose: { sets: '3', reps: '30 с', rest_s: 30 },
  mistakes: ['Таз провисает', 'Таз задран вверх'],
  pace: 'В жизни держи 30 с',
  view: 'side',
  flat: 'side',
  motion: () => 0,
  setup(T) {
    floorSetup(T); mat(T, 1.9, 0.62, 0, 0.75);
    const L1 = T.rig.armLen.Right[0];
    T.e = solve((e) => { body(T, e); return w(T.rig, 'RightArm').y - (ELBOW_H + L1); }, 0, 40);
  },
  pose(T, { t }) {
    const { rig } = T;
    body(T, T.e, Math.sin(2 * Math.PI * t / 4));
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, -1, 0.5)), 10);
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), E = new THREE.Vector3(S.x, ELBOW_H, S.z);
      armIK(T, s, E.clone().add(new THREE.Vector3(0, -0.012, rig.armLen[s][1])), new THREE.Vector3(0, 0, -1));
      rig.orientHand(s, new THREE.Vector3(-sgn(s), 0, 0), 1, false); // ладонь вниз, пальцы вперёд
      rig.grip(s, 0.25);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm'), E = w(rig, s + 'ForeArm');
      r.m['elbowUnder' + s[0]] = cm(Math.hypot(S.x - E.x, S.z - E.z));
      if (r.m['elbowUnder' + s[0]] > 5) r.bad.push(`локоть не под плечом (${r.m['elbowUnder' + s[0]]} см)`);
      if (Math.abs(E.y - ELBOW_H) > 0.015) r.bad.push('локоть не на полу');
      r.m['fore' + s[0]] = gap(T, [s + 'ForeArm']);
      if (r.m['fore' + s[0]] < -1) r.bad.push(`предплечье в полу: ${r.m['fore' + s[0]]} см`);
      r.m['toe' + s[0]] = gap(T, [s + 'ToeBase', s + 'Foot']);
      if (Math.abs(r.m['toe' + s[0]]) > 1) r.bad.push(`носки ${r.m['toe' + s[0]] > 0 ? 'висят' : 'в полу'}: ${r.m['toe' + s[0]]} см`);
    }
    r.m.knee = gap(T, ['LeftLeg', 'RightLeg']); r.m.belly = gap(T, ['Spine', 'Spine1', 'Hips']);
    if (r.m.knee < 3) r.bad.push(`колени у пола: ${r.m.knee} см`);
    if (r.m.belly < 3) r.bad.push(`живот у пола: ${r.m.belly} см`);
    bodyLine(T, r);
    r.m.e = +T.e.toFixed(1);
    return r;
  },
};
