// Боковая планка на правом предплечье, статика с дыханием. Тело одной прямой от головы до пяток: всё тело поворачиваем
// вокруг оси «вперёд» так, чтобы правый бок смотрел в пол, и наклоняем на угол α, при котором плечевой сустав стоит
// над локтем на длине плеча, а правая щиколотка лежит на полу. Локоть под плечом, предплечье на полу вперёд,
// левая рука вдоль тела на бедре, стопы одна на другой. Дыхание — грудной отдел ±1° с периодом 4 с, таз неподвижен.
import * as THREE from 'three';
import { V, X, FWD, deg, rad, w, key, cm, stand, trunk, look, armIK, baseAudit } from '../poses.js';

const ELBOW_H = 0.045, ANKLE_H = 0.06; // локоть и щиколотка над полом, м
// Бёдра сведены к середине (стопы одна на другой), левая рука лежит вдоль бока, кисть на бедре.
const K = key({ rUp: V(0.9, 0, 0.1), rFo: V(0.2, 0, 1), lUp: V(-0.12, -1, 0.06), lFo: V(0.02, -1, 0.25),
  rTh: V(-0.1, -1, 0), rSh: V(-0.01, -1, 0), lTh: V(0.1, -1, 0), lSh: V(0.01, -1, 0) });
const onSide = (a) => new THREE.Quaternion().setFromAxisAngle(FWD, deg(90) - a); // голова к −X, левый бок вверх

function body(T, a, breath) {
  const { rig } = T;
  stand(T, 0, 0, 0, onSide(a));
  trunk(T, K);
  if (breath) rig.turnWorld(rig.b.Spine2, new THREE.Quaternion().setFromAxisAngle(X.clone().applyQuaternion(T.wrap.quaternion), deg(breath)));
  rig.root.updateMatrixWorld(true);
  const S = w(rig, 'RightArm');
  T.wrap.position.y += ELBOW_H + rig.armLen.Right[0] - S.y; T.wrap.position.x -= S.x; T.wrap.position.z -= S.z; // плечо над началом координат
  T.wrap.updateMatrixWorld(true);
}

export default {
  id: 'side-plank',
  name: 'Боковая планка',
  muscles: { work: ['obliques', 'hip_abductors', 'abs'], stretch: [], careful: ['shoulder_joint', 'lower_back'] },
  phases: [
    { name: 'вход', cue: 'Локоть под плечом', tempo_s: 1 },
    { name: 'держи', cue: 'Тело одной линией, дыши ровно', tempo_s: 30 },
  ],
  dose: { sets: '2', reps: '20–30 с на сторону', rest_s: 30 },
  mistakes: ['Таз провисает', 'Корпус заваливается вперёд'],
  view: 'front',
  motion: () => 0,
  setup(T) {
    // Угол α: правая щиколотка на высоте ANKLE_H при плече над локтем.
    let a = deg(12);
    for (let i = 0; i < 4; i++) {
      body(T, a, 0);
      const S = w(T.rig, 'RightArm'), A = w(T.rig, 'RightFoot');
      a += (A.y - ANKLE_H) / S.distanceTo(A);
    }
    T.alpha = a;
  },
  pose(T, { t }) {
    const { rig } = T;
    body(T, T.alpha, 1.0 * Math.sin(2 * Math.PI * t / 4));
    look(T, w(rig, 'Head').add(new THREE.Vector3(0, 0, 3)), 10);
    // Опорная рука: локоть на полу под плечом, предплечье вперёд, ладонь на полу.
    const S = w(rig, 'RightArm'), E = new THREE.Vector3(S.x, ELBOW_H, S.z), Wr = E.clone().add(new THREE.Vector3(0, -0.005, rig.armLen.Right[1]));
    armIK(T, 'Right', Wr, new THREE.Vector3(0, 0, -1));
    rig.orientHand('Right', new THREE.Vector3(1, 0, 0), 1, false); // ладонь вниз, пальцы вперёд
    rig.grip('Right', 0.25);
    rig.relaxHand('Left'); rig.grip('Left', 0.3);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T);
    delete r.m.torso;
    const S = w(rig, 'RightArm'), E = w(rig, 'RightForeArm'), hip = w(rig, 'Hips'), A = w(rig, 'RightFoot'), neck = w(rig, 'Neck');
    r.m.elbowUnder = cm(Math.hypot(S.x - E.x, S.z - E.z));
    if (r.m.elbowUnder > 5) r.bad.push(`локоть не под плечом (${r.m.elbowUnder} см)`);
    r.m.elbowY = cm(E.y); r.m.ankleY = cm(A.y);
    if (Math.abs(E.y - ELBOW_H) > 0.015) r.bad.push('локоть не на полу');
    if (Math.abs(A.y - ANKLE_H) > 0.02) r.bad.push('стопа не на полу');
    // Линия тела: таз на прямой середина щиколоток → шея (стопы одна на другой), излом в тазу.
    const F = w(rig, 'LeftFoot').add(A).multiplyScalar(0.5), line = neck.clone().sub(F), t = hip.clone().sub(F).dot(line) / line.lengthSq(), off = hip.clone().sub(F.clone().addScaledVector(line, t));
    r.m.sag = cm(-off.y); // + — таз провис к полу
    r.m.bend = Math.round(rad(hip.clone().sub(F).angleTo(neck.clone().sub(hip))));
    if (Math.abs(off.y) > 0.03) r.bad.push(`таз ${off.y < 0 ? 'провис' : 'задран'} на ${cm(Math.abs(off.y))} см`);
    if (r.m.bend > 10) r.bad.push(`тело не прямой линией: излом ${r.m.bend}°`);
    // Корпус не заваливается вперёд: грудь смотрит вперёд (в +Z), а не в пол.
    const chest = new THREE.Vector3().crossVectors(w(rig, 'LeftArm').sub(w(rig, 'RightArm')), neck.clone().sub(hip)).normalize(); // «вперёд» груди: влево × вверх
    r.m.chestDown = Math.round(rad(Math.asin(Math.max(-1, Math.min(1, -chest.y)))));
    if (Math.abs(r.m.chestDown) > 15) r.bad.push(`корпус заваливается: ${r.m.chestDown}°`);
    return r;
  },
};
