// Русский твист с медболом, поочерёдно (span 2): чётный цикл — поворот вправо, нечётный — влево. Сидя на коврике,
// корпус отклонён назад на 30° от отвеса с прямой спиной, колени согнуты, пятки на полу. Медбол у нижних рёбер на 30 см
// впереди, ладони по бокам мяча. Поворот: таз стоит, грудь с мячом поворачивается на 38° (Rig.pose делит скрутку
// по спине: поясница 15 %), голова идёт за грудью. Сидение — нижняя точка кожи ягодиц на коврике (floor.lowest).
import * as THREE from 'three';
import { V, deg, rad, w, mid, key, SIDES, sgn, ruSide, cm, smooth, stand, trunk, look, baseAudit } from '../poses.js';
import { palmOn } from '../kneel.js';
import { mat, floorSetup, gap, lowest, keep, legThrough, kneeAudit, faceTo, MAT } from '../floor.js';
import { gazeAudit } from '../core.js';

const RECLINE = 120, TWIST = 38, THIGH = 42, BALL = 0.11; // корпус над горизонталью (больше 90 — назад); скрутка; бедро над полом, °; радиус мяча, м
const sideOf = (T, t) => (((Math.floor(t / T.cycle) % 2) + 2) % 2 ? 'Left' : 'Right');
const kOf = (torso) => key({ torso, rTh: V(0.1, 0.6, 1), rSh: V(0.05, -1, 0.3), lTh: V(-0.1, 0.6, 1), lSh: V(-0.05, -1, 0.3) });

function body(T, torso) {
  stand(T, T.base.p.x, T.base.p.y, T.base.p.z, T.base.q);
  trunk(T, kOf(torso), RECLINE);
}
// Ноги: бедро на THIGH° над полом, пятка на полу впереди, ступня плоско носком вперёд.
function legs(T) {
  const { rig } = T;
  for (const s of SIDES) {
    const H = w(rig, s + 'UpLeg'), Kn = H.clone().add(new THREE.Vector3(sgn(s) * 0.06, Math.sin(deg(THIGH)) * rig.L1, Math.cos(deg(THIGH)) * rig.L1));
    const dy = Kn.y - (rig.ankleH + MAT), A = Kn.clone().add(new THREE.Vector3(0, -dy, Math.sqrt(Math.max(0, rig.L2 ** 2 - dy * dy))));
    legThrough(T, s, Kn, A, T.footFlat[s]);
  }
}
const chestFrame = (T) => {
  const { rig } = T, axis = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), across = w(rig, 'LeftArm').sub(w(rig, 'RightArm')).normalize();
  return { axis, across, fwd: new THREE.Vector3().crossVectors(across, axis).normalize() };
};

export default {
  id: 'russian-twist',
  name: 'Русский твист',
  muscles: { work: ['obliques', 'abs'], stretch: [], careful: ['lower_back'] },
  phases: [
    { name: 'наклон', cue: 'Сядь, корпус назад', tempo_s: 1 },
    { name: 'поворот', cue: 'Поворот грудью, не руками', tempo_s: 2 },
  ],
  dose: { sets: '2', reps: '20', rest_s: 30 },
  mistakes: ['Круглая спина', 'Вертятся только руки'],
  pace: 'В жизни без паузы в центре',
  view: 'front',
  flat: 'front',
  span: 2,
  motion(i, u) { return i === 0 ? 0 : Math.sin(Math.PI * smooth(u)); },
  setup(T) {
    const { rig } = T;
    floorSetup(T); mat(T, 1.4, 0.7, 0, 0.1);
    T.cycle = this.phases.reduce((a, p) => a + p.tempo_s, 0);
    T.base = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    for (let i = 0; i < 3; i++) { // ноги достают пол от того места, где сидит таз: садим и ставим ноги по очереди
      body(T, 0); if (i) legs(T);
      const lo = lowest(T, ['Hips', 'LeftUpLeg', 'RightUpLeg']), m = mid(rig, 'LeftUpLeg', 'RightUpLeg');
      T.wrap.position.add(new THREE.Vector3(-m.x, MAT - lo.y, -m.z)); T.wrap.updateMatrixWorld(true);
      T.base = keep(T);
    }
    T.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL, 24, 16), new THREE.MeshStandardMaterial({ color: '#c8492f', roughness: 0.7 }));
    T.ball.castShadow = true; T.add(T.ball);
    rig.root.updateMatrixWorld(true);
  },
  pose(T, { t, depth }) {
    const { rig } = T, s0 = sideOf(T, t), torso = -sgn(s0) * TWIST * depth; // вправо — torso < 0 (у Mixamo правая в −X)
    body(T, torso); legs(T);
    const f = chestFrame(T);
    const B = w(rig, 'Spine2').addScaledVector(f.fwd, 0.32).addScaledVector(f.axis, -0.2); // у нижних рёбер: выше мяч закрывал лицо спереди
    // Взгляд на мяч: голова кивает до 40°, шея сгибается на 12° (предел проверки шеи 15°). Шея в линию откинутой
    // спины задирала лицо этой модели вверх на 40°.
    rig.turnWorld(rig.b.Neck, new THREE.Quaternion());
    look(T, null);
    rig.turnWorld(rig.b.Neck, new THREE.Quaternion().setFromAxisAngle(f.across, deg(12)));
    faceTo(T, B.clone().sub(w(rig, 'Head')).normalize(), 40);
    T.ball.position.copy(B);
    T.P = {};
    for (const s of SIDES) {
      T.P[s] = B.clone().addScaledVector(f.across, sgn(s) * (BALL + 0.005));
      palmOn(T, s, T.P[s], f.fwd.clone().addScaledVector(f.axis, 0.3), f.across.clone().multiplyScalar(-sgn(s)), f.axis.clone().negate().addScaledVector(f.across, sgn(s) * 0.8));
      rig.grip(s, 0.35);
    }
    T.twist = torso;
  },
  audit(T) {
    const { rig, mesh } = T, r = baseAudit(T);
    delete r.m.torso;
    kneeAudit(T, r);
    r.m.seat = gap(T, ['Hips', 'LeftUpLeg', 'RightUpLeg']);
    if (r.m.seat < -1 || r.m.seat > 1.5) r.bad.push(`таз ${r.m.seat < 0 ? 'в полу' : 'над полом'}: ${r.m.seat} см`);
    for (const s of SIDES) {
      r.m['heel' + s[0]] = gap(T, [s + 'Foot']);
      if (Math.abs(r.m['heel' + s[0]]) > 1.5) r.bad.push(`${ruSide(s, true)} пятка ${r.m['heel' + s[0]] > 0 ? 'над полом' : 'в полу'}: ${r.m['heel' + s[0]]} см`);
      r.m['palm' + s[0]] = cm(rig.palm(s).distanceTo(T.P[s]));
      if (r.m['palm' + s[0]] > 1.5) r.bad.push(`${ruSide(s, true)} ладонь не на мяче (${r.m['palm' + s[0]]} см)`);
    }
    // Скрутка груди от таза по линии плеч и линии таза в плане; поворачивается грудь, а не руки.
    const yaw = (a, b) => { const d = w(rig, b).sub(w(rig, a)); return rad(Math.atan2(d.z, d.x)); };
    r.m.chestTurn = Math.round(yaw('RightArm', 'LeftArm') - yaw('RightUpLeg', 'LeftUpLeg'));
    if (Math.abs(r.m.chestTurn) > 45) r.bad.push(`скрутка больше 45°: ${r.m.chestTurn}°`);
    if (Math.abs(T.twist) > 30 && Math.abs(r.m.chestTurn) < 20) r.bad.push(`поворачиваются руки, а не грудь: ${r.m.chestTurn}°`);
    r.m.recline = Math.round(rad(Math.acos(Math.min(1, w(rig, 'Neck').sub(w(rig, 'Hips')).normalize().y))));
    if (r.m.recline < 20 || r.m.recline > 45) r.bad.push(`корпус отклонён на ${r.m.recline}° от отвеса`);
    // Мяч не в ногах и не в груди: кожа (без кистей) не ближе радиуса.
    T.wrap.updateMatrixWorld(true);
    let near = Infinity; const v = new THREE.Vector3();
    for (const [n, list] of Object.entries(T.skin)) if (!/Hand/.test(n)) for (const k of list) near = Math.min(near, mesh.getVertexPosition(k, v).applyMatrix4(mesh.matrixWorld).distanceTo(T.ball.position));
    r.m.ballGap = cm(near - BALL);
    if (r.m.ballGap < 0) r.bad.push(`мяч в теле: ${r.m.ballGap} см`);
    gazeAudit(T, r, 15, -40);
    return r;
  },
};
