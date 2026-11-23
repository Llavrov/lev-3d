// Отжимания на упорах. Тело одной прямой на носках (core.onToes), качается вокруг подушечек стоп; кисти держат упоры
// под плечами. Почему упоры, а не ладони на полу: внизу отжимания предплечье стоит отвесно, и ладонь на полу требует
// разгибания запястья на 70–90°; у модели кисть дальше 50° ломается на коже (проверка baseAudit). На упорах кисть
// продолжает предплечье, а запястье в списке «беречь» у этого упражнения и так.
// Наклон тела подбирается так, чтобы плечо было на нужном расстоянии от рукояти: наверху рука прямая, внизу локоть
// согнут на 115°. Локти идут назад под 45° к корпусу, а не в стороны.
import * as THREE from 'three';
import { V, w, key, SIDES, sgn, ruSide, cm, lerp, smooth, look, palmTo, reachOf, baseAudit, shadows, rubber, frameMat } from '../poses.js';
import { mat, floorSetup, gap } from '../floor.js';
import { onToes, solve, bodyLine, elbowOut } from '../core.js';

const GH = 0.08, ELBOW = 115; // ось рукояти низкого упора над полом, м; сгиб локтя внизу, °
const K = key({ rTh: V(0.04, -1, 0.05), rSh: V(0.02, -1, 0.05), lTh: V(-0.04, -1, 0.05), lSh: V(-0.02, -1, 0.05) });
const POLE = (s) => new THREE.Vector3(sgn(s) * 0.45, 0.5, -1);
const R = (s) => new THREE.Vector3(-sgn(s), 0, 0); // рукоять поперёк, указательный к середине

function grip() { // упор: рукоять поперёк и две стойки до пола
  const g = new THREE.Group(), f = frameMat();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 12), rubber()); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const k of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, GH, 0.03), f); leg.position.set(k * 0.075, -GH / 2, 0); g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.16), f); foot.position.set(k * 0.075, -GH + 0.0075, 0); g.add(foot);
  }
  return shadows(g);
}
const D = (T, s, e) => { onToes(T, K, e, 0); return w(T.rig, s + 'Arm').distanceTo(T.P[s]); };

export default {
  id: 'push-up',
  name: 'Отжимания',
  muscles: { work: ['chest', 'triceps', 'delts_front', 'abs'], stretch: ['chest'], careful: ['shoulder_joint', 'wrist'] },
  phases: [
    { name: 'вниз', cue: 'Тело прямое, локти назад', tempo_s: 2 },
    { name: 'низ', cue: 'Грудь низко, тело прямое', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Оттолкнись, раздвинь лопатки', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '10–15', rest_s: 60 },
  mistakes: ['Таз провисает', 'Локти в стороны'],
  view: 'side',
  flat: 'side',
  setup(T) {
    const { rig } = T;
    floorSetup(T); mat(T, 1.9, 0.62, 0, 0.75);
    // Наверху рука прямая и отвесна: плечо над рукоятью на длине руки до ладони.
    const top = reachOf(T, 'Right') * 0.985;
    T.eTop = solve((e) => { onToes(T, K, e, 0); return w(rig, 'RightArm').y - GH - top; }, 0, 45);
    onToes(T, K, T.eTop, 0);
    T.P = {}; T.grips = {};
    for (const s of SIDES) {
      const S = w(rig, s + 'Arm');
      T.P[s] = new THREE.Vector3(S.x + sgn(s) * 0.03, GH, S.z + 0.03);
      T.grips[s] = grip(); T.grips[s].position.copy(T.P[s]); T.add(T.grips[s]);
    }
    // Внизу локоть согнут на ELBOW: у модели руки короткие (0,5 м), при груди у самого пола локоть сгибался на 144°.
    T.eBot = solve((e) => { onToes(T, K, e, 0); palmTo(T, 'Right', T.P.Right, R('Right'), POLE('Right')); return ELBOW - rig.audit().Right.elbow; }, -10, T.eTop);
    T.dTop = D(T, 'Right', T.eTop); T.dBot = D(T, 'Right', T.eBot);
  },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    const { rig } = T, want = lerp(T.dTop, T.dBot, depth);
    T.e = solve((e) => D(T, 'Right', e) - want, T.eBot - 2, T.eTop + 2); // ниже тело — ближе плечо к рукояти
    onToes(T, K, T.e, 0);
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, -1, 0.6)), 10);
    for (const s of SIDES) {
      // Локоть назад к тазу, наружу и вверх: плечо к корпусу около 45°.
      palmTo(T, s, T.P[s], R(s), POLE(s));
      rig.grip(s, 1);
    }
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    for (const s of SIDES) {
      const rel = rig.palm(s).sub(T.P[s]), off = Math.hypot(rel.y, rel.z);
      r.m['grip' + s[0]] = cm(off);
      if (off > 0.02 || Math.abs(rel.x) > 0.05) r.bad.push(`${ruSide(s, true)} кисть не на рукояти (${cm(off)} см)`);
      r.m['flare' + s[0]] = elbowOut(T, s);
      if (r.m['flare' + s[0]] > 50) r.bad.push(`${ruSide(s)} локоть в сторону: ${r.m['flare' + s[0]]}° от корпуса`);
      r.m['toe' + s[0]] = gap(T, [s + 'ToeBase', s + 'Foot']);
      if (Math.abs(r.m['toe' + s[0]]) > 1) r.bad.push(`носки ${r.m['toe' + s[0]] > 0 ? 'висят' : 'в полу'}: ${r.m['toe' + s[0]]} см`);
    }
    r.m.chest = gap(T, ['Spine2', 'Spine1']); r.m.knee = gap(T, ['LeftLeg', 'RightLeg']); r.m.face = gap(T, ['Head']);
    if (r.m.chest < 3) r.bad.push(`грудь в полу: ${r.m.chest} см`);
    if (r.m.knee < 3) r.bad.push(`колени у пола: ${r.m.knee} см`);
    if (r.m.face < 3) r.bad.push(`лицо у пола: ${r.m.face} см`);
    bodyLine(T, r);
    r.m.e = +T.e.toFixed(1);
    return r;
  },
};
