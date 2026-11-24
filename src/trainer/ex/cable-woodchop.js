// Дровосек на блоке сверху вниз. Блок справа сзади, рукоять над правым плечом; тяга по диагонали к левому бедру.
// Руки почти прямые: рукоять всегда на длине руки от дальнего плеча, тянет её поворот корпуса. Таз ведёт (поворачивается
// раньше), грудной отдел догоняет; поясница крутится вместе с тазом (Rig.pose: 15 % разницы корпус − таз на поясницу).
// Левая стопа стоит, правая проворачивается на подушечке внутрь и встаёт на носок. Стойка блока, трос и рукоять — кодом.
import * as THREE from 'three';
import { V, X, UP, FWD, deg, rad, lerp, clamp, smooth, w, mid, key, SIDES, sgn, ruSide, cm, shadows, frameMat, steel, rubber, stand, trunk, placeHips, look, palmTo, reachOf, baseAudit, axeGrip, twistAudit } from '../poses.js';

const HALF = 0.3; // полуширина стойки, м
const PULLEY = new THREE.Vector3(-1.05, 2.05, 0.05); // справа, на уровне плеч по глубине
const LOW = { az: 55, el: -58 }; // куда идёт рукоять внизу от середины плеч: азимут (+ — влево) и угол к горизонту, °
const sph = (az, el) => new THREE.Vector3(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el)));
const HANDLE = 0.22;

function station() {
  const g = new THREE.Group(), f = frameMat();
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.25, 0.12), f); col.position.set(PULLEY.x - 0.08, 1.125, PULLEY.z - 0.04); g.add(col);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.6), f); base.position.set(PULLEY.x - 0.08, 0.02, PULLEY.z - 0.04); g.add(base);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 24), steel()); wheel.position.copy(PULLEY); wheel.rotation.y = Math.PI / 2; g.add(wheel);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.14), rubber()); stack.position.set(PULLEY.x - 0.08, 0.3, PULLEY.z + 0.04); g.add(stack);
  return shadows(g);
}
function handle() {
  const g = new THREE.Group(), s = steel(), r = rubber();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, HANDLE, 12), r); bar.rotation.z = Math.PI / 2; g.add(bar); // ось — X
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 16), s); ring.position.y = 0.03; g.add(ring);
  return shadows(g);
}

export default {
  id: 'cable-woodchop',
  name: 'Дровосек на блоке',
  muscles: { work: ['obliques', 'abs', 'glutes', 'delts_front'], stretch: ['obliques'], careful: ['lower_back'] },
  phases: [
    { name: 'разворот', cue: 'Толчок ногой, поворот таза', tempo_s: 1 },
    { name: 'тяга', cue: 'Руки ведёт корпус', tempo_s: 1 },
    { name: 'возврат', cue: 'Медленно назад', tempo_s: 2, stretch: true },
  ],
  dose: { sets: '3', reps: '8–10 на сторону', rest_s: 60 },
  mistakes: ['Тянут одни руки', 'Скрут в пояснице без таза'],
  view: 'front',
  sideFrom: 'left', // блок справа закрыл бы человека
  motion(i, u) { const e = smooth(u); return i === 0 ? 0.35 * e : i === 1 ? 0.35 + 0.65 * e : 1 - e; },
  setup(T) {
    const { rig } = T;
    T.retract = -16; // обе лопатки выведены вперёд за руками (poses.js: ключица): со сведёнными дельта и грудь вдавливались
    T.add(station());
    T.handle = handle(); T.add(T.handle);
    T.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.6 })); T.cable.castShadow = true; T.add(T.cable);
    T.footFwd = rig.footLen * Math.cos(rig.footA0); // щиколотка → подушечка по горизонтали
    T.ball = new THREE.Vector3(-HALF, 0, T.footFwd); // правая подушечка стоит
    const toP = PULLEY.clone().sub(new THREE.Vector3(0, 1.45, 0)); // направление на блок от плеч стоя
    T.pulleyDir = { az: rad(Math.atan2(toP.x, toP.z)), el: rad(Math.atan2(toP.y, Math.hypot(toP.x, toP.z))) };
    // «Влево» таза и нижних рёбер в осях костей — для проверки скрутки поясницы.
    rig.root.updateMatrixWorld(true);
    T.latHips = X.clone().applyQuaternion(rig.b.Hips.getWorldQuaternion(new THREE.Quaternion()).invert());
    T.latSpine = X.clone().applyQuaternion(rig.b.Spine.getWorldQuaternion(new THREE.Quaternion()).invert());
  },
  pose(T, { depth }) {
    const { rig } = T, hp = smooth(clamp(depth / 0.7, 0, 1)), d = depth; // таз впереди корпуса
    // Рукоять идёт по дуге от блока к левому бедру; грудь всё время смотрит на неё (обе руки дотягиваются почти прямыми),
    // таз ведёт и опережает корпус, разница корпус − таз не больше 40° (так ставит Rig.pose).
    const P0 = T.pulleyDir, az = lerp(P0.az, LOW.az, d), el = lerp(P0.el, LOW.el, d);
    const hipYaw = lerp(-40, 32, hp), torso = clamp(az, hipYaw - 40, hipYaw + 40);
    const K = key({ hips: hipYaw, torso, lean: 4, rUp: V(-0.4, -0.6, 0.6), rFo: V(-0.3, -0.5, 0.8), lUp: V(-0.6, -0.4, 0.6), lFo: V(-0.4, -0.4, 0.8) });
    stand(T);
    trunk(T, K);
    // Ступни: левая стоит, правая на подушечке проворачивается внутрь до 35° и встаёт на носок. Rig.legs сам добавляет
    // к повороту ступни 0,55 поворота таза — вычитаем.
    const turn = deg(35) * hp, hy = deg(hipYaw) * 0.55, toe = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
    const ft = { crouch: 0,
      Left: { pos: new THREE.Vector3(HALF, 0, 0), lift: 0, yaw: 0.12 - hy },
      Right: { pos: T.ball.clone().addScaledVector(toe, -T.footFwd), lift: 0, yaw: turn - hy, toe: 0.3 * hp } };
    placeHips(T, new THREE.Vector3(lerp(-0.07, 0.08, hp), rig.ankleH + 0.955 * (rig.L1 + rig.L2), 0.0), ft);
    // Рукоять: от середины плеч по направлению из блока вниз к левому бедру, на длине руки от дальнего плеча.
    const M = mid(rig, 'LeftArm', 'RightArm'), dir = sph(az, el);
    const SR = w(rig, 'RightArm'), SL = w(rig, 'LeftArm'), reach = Math.min(reachOf(T, 'Right'), reachOf(T, 'Left')) * 0.985;
    let C = M.clone();
    for (let k = 0.2; k < 1.2; k += 0.005) { const c = M.clone().addScaledVector(dir, k); if (Math.max(c.distanceTo(SR), c.distanceTo(SL)) > reach) break; C = c; }
    // Хват как на топорище: рукоять поперёк рук, кисти одна над другой, обе большим пальцем вверх вдоль рукояти.
    // Было: хват сверху двумя руками рядом на рукояти, которая у блока стояла почти отвесно, — предплечья перекрещивались
    // и скручивались (Лёва 24.11: «руки перекручивает, совсем жопа»).
    look(T, C, 25);
    const pole = new THREE.Vector3(0, -1, -0.3);
    axeGrip(T, C, dir, pole); // хват как на топорище (poses.js): кисти одна над другой, предплечья не перекрещены
    rig.grip('Right', 1); rig.grip('Left', 1);
    const pc = rig.palm('Right').add(rig.palm('Left')).multiplyScalar(0.5);
    T.handle.position.copy(pc); T.handle.quaternion.setFromUnitVectors(X, rig.palm('Left').sub(rig.palm('Right')).normalize());
    const span = PULLEY.clone().sub(pc);
    T.cable.position.copy(pc).addScaledVector(span, 0.5); T.cable.scale.set(1, span.length(), 1); T.cable.quaternion.setFromUnitVectors(UP, span.normalize());
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: ['LeftFoot', 'RightToeBase'], gaze: [-45, 35] }); // взгляд идёт за рукоятью, как в cable-lift
    twistAudit(T, r);
    // Скрутка поясницы отдельно от таза: «влево» таза и нижних рёбер по горизонтали.
    const lh = T.latHips.clone().applyQuaternion(rig.b.Hips.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const ls = T.latSpine.clone().applyQuaternion(rig.b.Spine.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize(); // поясничная кость
    r.m.lumbar = Math.round(rad(lh.angleTo(ls)));
    if (r.m.lumbar > 10) r.bad.push(`поясница скручена отдельно от таза: ${r.m.lumbar}°`);
    for (const s of SIDES) {
      if (r.m['elbow' + s[0]] > 45) r.bad.push(`${ruSide(s)} локоть согнут ${r.m['elbow' + s[0]]}°`);
      const ax = X.clone().applyQuaternion(T.handle.quaternion), rel = rig.palm(s).sub(T.handle.position), off = rel.addScaledVector(ax, -rel.dot(ax)).length();
      r.m['grip' + s[0]] = cm(off);
      if (off > 0.02) r.bad.push(`${ruSide(s, true)} кисть не на рукояти`);
    }
    return r;
  },
};
