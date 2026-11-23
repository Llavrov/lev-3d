// Общее для поз лицом к полу: на четвереньках и в упоре на ладонях (птица-собака, выпад «спайдермен»).
// Порядок как у тела на опоре: тело целиком лицом вниз, линия таз → шея под нужным углом, середина тазобедренных в точку;
// потом конечности, которые держат тело, двухзвенным расчётом в точки опоры (ладонь на полу, колено на полу).
import * as THREE from 'three';
import { X, w, mid, stand, trunk, armIK, legIK } from './poses.js';

export const PRONE = new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2); // голова в +Z, грудь к полу
// Над полом, м: середина ладони (кожа ладони на полу), колено на полу (под суставом надколенник и кожа),
// щиколотка, когда стопа лежит тыльной стороной (подъём на полу).
export const PALM_Y = 0.004, KNEE_Y = 0.055, ANKLE_Y = 0.065;
export const HAND_PITCH = 20; // кисть на полу: ось запястье → основание среднего пальца уходит вниз на столько, °

// Тело лицом к полу: линия таз → шея поднята к голове на elev° (голова в +Z), середина тазобедренных суставов в M.
export function prone(T, K, elev, M) {
  const { rig } = T;
  stand(T, 0, 0, 0, PRONE);
  trunk(T, K);
  const d = w(rig, 'Neck').sub(w(rig, 'Hips')).normalize(), e = THREE.MathUtils.degToRad(elev);
  T.wrap.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(d, new THREE.Vector3(0, Math.sin(e), Math.cos(e))));
  T.wrap.updateMatrixWorld(true);
  T.wrap.position.add(M.clone().sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'))); T.wrap.updateMatrixWorld(true);
}

// Кисть: середина ладони в P, пальцы вдоль F, ладонь смотрит по N (наружу из ладони; на полу — вниз). Рука двухзвенным
// расчётом с полюсом локтя pole, поворот кисти вокруг предплечья делит Rig.orientHand (как лучевая кость), сгиб
// запястья — отдельным поворотом вокруг оси «к указательному», без скрутки. Три прохода: ладонь сдвигается с поворотом кисти.
export function palmOn(T, s, P, F, N, pole) {
  const { rig } = T, H = rig.hand[s];
  F = F.clone().normalize(); N = N.clone().addScaledVector(F, -N.dot(F)).normalize();
  const R = s === 'Right' ? new THREE.Vector3().crossVectors(F, N) : new THREE.Vector3().crossVectors(N, F); // к указательному
  for (let i = 0; i < 3; i++) {
    const wr = w(rig, s + 'Hand');
    armIK(T, s, P.clone().sub(rig.palm(s).sub(wr)), pole);
    rig.orientHand(s, R, 1, false);
    const hand = rig.b[s + 'Hand'], f = H.f.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    rig.turnWorld(hand, new THREE.Quaternion().setFromUnitVectors(f, F));
  }
}
// Кисть на полу пальцами вперёд (+Z), чуть наклонена: пятка ладони на полу, ось кисти вниз на HAND_PITCH.
export const floorHand = () => {
  const p = THREE.MathUtils.degToRad(HAND_PITCH);
  return { F: new THREE.Vector3(0, -Math.sin(p), Math.cos(p)), N: new THREE.Vector3(0, -Math.cos(p), -Math.sin(p)) };
};
// Между двумя положениями кисти (F, N) по доле k.
export const blendHand = (a, b, k) => ({ F: a.F.clone().lerp(b.F, k).normalize(), N: a.N.clone().lerp(b.N, k).normalize() });

// Стопа: стоя (T.footFlat) повёрнута так, как голень повернулась из отвеса в направление shin (мир), и ещё на extra
// вокруг оси голеностопа (рад, + — носок от голени, подошвенное сгибание). Голеностоп в нейтрали, если extra = 0.
export function footAlong(T, s, shin, extra = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), shin.clone().normalize());
  const ax = X.clone().applyQuaternion(q);
  return new THREE.Quaternion().setFromAxisAngle(ax, extra).multiply(q).multiply(T.footFlat[s]);
}
// Пальцы стопы в подушечке параллельно полу носком вперёд (упор на носки): кость ToeBase доворачивается к dir.
export function toesTo(T, s, dir) {
  const { rig } = T, toe = rig.b[s + 'ToeBase'], end = rig.b[s + 'Toe_End'];
  if (!toe || !end) return;
  toe.quaternion.copy(rig.rest.get(toe)); rig.root.updateMatrixWorld(true);
  const cur = w(rig, s + 'Toe_End').sub(w(rig, s + 'ToeBase')).normalize();
  rig.turnWorld(toe, new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()));
}

// Нога в точку A, как legIK, и бедро довёрнуто вокруг своей оси так, чтобы надколенник (Rig.legFront) смотрел против
// сгиба: голень уходит назад от колена на коже. legIK ставит кости кратчайшим поворотом, и у ноги, вынесенной далеко
// вбок и вперёд (шаг в спайдермене), колено на коже оказывалось согнутым в обратную сторону.
export function legTo(T, s, A, pole, foot = null) {
  const { rig } = T;
  legIK(T, s, A, pole);
  const H = w(rig, s + 'UpLeg'), K = w(rig, s + 'Leg'), An = w(rig, s + 'Foot');
  const th = K.clone().sub(H).normalize(), bend = An.clone().sub(K).normalize();
  bend.addScaledVector(th, -bend.dot(th));
  if (bend.lengthSq() > 1e-6) {
    const want = bend.normalize().negate();
    const kf = rig.legFront[s].clone().applyQuaternion(rig.b[s + 'UpLeg'].getWorldQuaternion(new THREE.Quaternion()));
    kf.addScaledVector(th, -kf.dot(th)).normalize();
    const ang = Math.atan2(th.dot(new THREE.Vector3().crossVectors(kf, want)), kf.dot(want));
    rig.turnWorld(rig.b[s + 'UpLeg'], new THREE.Quaternion().setFromAxisAngle(th, ang));
    rig.root.updateMatrixWorld(true);
    rig.aim(s + 'Leg', s + 'Foot', An.clone().sub(w(rig, s + 'Leg')).normalize().applyQuaternion(rig.toPlayer));
  }
  if (foot) rig.setWorld(rig.b[s + 'Foot'], foot);
  rig.root.updateMatrixWorld(true);
}
