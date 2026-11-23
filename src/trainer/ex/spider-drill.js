// «Паук», поочерёдно (span 2): чётный цикл — к точке справа впереди, нечётный — слева впереди. Точки и центр
// отмечены на полу. Из стойки в центре: шаг ближней ногой, приставной, выпад ближней ногой к точке, касание пола
// ближней рукой с торможением (таз низко, вес на передней ноге, спина прямая), толчок назад и два шага в центр.
import * as THREE from 'three';
import { lerp, clamp, smooth, w, sgn, cm, SIDES } from '../poses.js';
import { palmOn } from '../kneel.js';
import { script, measureFeet, gait, legAudit } from '../steps.js';

const CYCLE = 3, HALF = 0.25, PX = 0.55, PZ = 0.6; // цикл, полуширина стойки, точка касания: в сторону и вперёд от центра, м
const side = (t) => (Math.floor(t / CYCLE) % 2 ? 'Left' : 'Right');
const TOUCH = [1.15, 1.45, 1.75, 2.0]; // рука идёт к полу, касается, держит, уходит (с)

// Сценарий к точке со стороны s (Right — в −X). Зеркало по x для левой.
function build(T, s) {
  const { rig } = T, leg = rig.L1 + rig.L2, d = sgn(s), o = s === 'Right' ? 'Left' : 'Right', low = rig.ankleH + 0.8 * leg;
  const S = script(CYCLE, { [s]: { x: d * HALF, z: 0, yaw: d * 0.1 }, [o]: { x: -d * HALF, z: 0, yaw: -d * 0.1 } });
  S.step(s, 0.1, 0.38, d * 0.5, 0.2, d * 0.45, { h: 0.06 });
  S.step(o, 0.45, 0.7, d * 0.05, 0.15, d * 0.2, { h: 0.05, push: 0.3 });
  S.step(s, 0.75, 1.05, d * (PX + 0.12), PZ - 0.2, d * 0.5, { h: 0.07 }); // выпад: стопа снаружи от точки, рука касается внутри
  S.step(s, 2.0, 2.3, d * 0.45, 0.15, d * 0.35, { h: 0.06 });
  S.step(o, 2.3, 2.58, -d * HALF, 0, -d * 0.1, { h: 0.05 });
  S.step(s, 2.6, 2.88, d * HALF, 0, d * 0.1, { h: 0.05 });
  const k = (t, y, yaw, elev, dx = 0, run = 0) => S.key(t, { y, dx: d * dx, dz: 0, yaw: d * yaw, hips: 0, torso: 0, elev, run });
  k(0, low, 0, 72); k(0.1, low, 0, 72); k(0.5, low + 0.02, 20, 68, 0, 0.6); k(1.05, low - 0.06, 30, 45, 0.1, 0.3);
  k(1.45, low - 0.12, 30, 22, 0.02); k(1.75, low - 0.12, 30, 22, 0.02); k(2.1, low - 0.04, 22, 62, 0.04, 0.5); k(2.6, low, 8, 70, 0, 0.3); k(2.9, low, 0, 72);
  S.stride = 0.5;
  return S.done();
}
const point = (s) => new THREE.Vector3(sgn(s) * PX, 0, PZ);

function marks(T) {
  const mat = new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.9 });
  for (const p of [new THREE.Vector3(0, 0, 0), point('Right'), point('Left')]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 24), mat);
    m.position.copy(p).setY(0.002); m.receiveShadow = true; T.add(m);
  }
}

export default {
  id: 'spider-drill',
  name: 'Паук',
  muscles: { work: ['quads', 'glutes', 'calves', 'adductors'], stretch: [], careful: ['ankle', 'knee'] },
  phases: [
    { name: 'старт', cue: 'От центра к точке', tempo_s: 1 },
    { name: 'касание', cue: 'Выпад, коснись пола и тормози', tempo_s: 1 },
    { name: 'возврат', cue: 'Толчок и назад к центру', tempo_s: 1 },
  ],
  dose: { sets: '4', reps: '1 круг (5 точек)', rest_s: 60 },
  mistakes: ['Широкие повороты без торможения', 'Высокая стойка', 'Колено уходит внутрь'],
  view: 'front',
  wide: true,
  flat: 'front',
  span: 2,
  setup(T) { measureFeet(T); T.Sp = { Right: build(T, 'Right'), Left: build(T, 'Left') }; marks(T); },
  pose(T, { t }) {
    const s = side(t), tt = ((t % CYCLE) + CYCLE) % CYCLE, [a, b, c, e] = TOUCH;
    const k = tt < a || tt > e ? 0 : tt < b ? smooth((tt - a) / (b - a)) : tt < c ? 1 : 1 - smooth((tt - c) / (e - c));
    const opt = { skipArm: k > 0 ? s : null, lookAt: k > 0 ? point(s).setY(0).lerp(new THREE.Vector3(0, 1.2, 5), 1 - k) : null, dy: 0 };
    let g = gait(T, T.Sp[s], tt, opt);
    // Таз опускается, пока рука от плеча достаёт до точки касания: длина руки своя у модели, на глаз не подобрать.
    for (let i = 0; k > 0 && i < 8; i++) {
      const [L1, L2] = T.rig.armLen[s], need = w(T.rig, s + 'Arm').distanceTo(point(s).setY(0.1)) - 0.96 * (L1 + L2);
      if (Math.abs(need) < 0.005 || (need < 0 && opt.dy <= 0)) break;
      opt.dy = clamp(opt.dy + need * 0.8 * k, 0, 0.25); g = gait(T, T.Sp[s], tt, opt);
    }
    T.drop = opt.dy;
    T.touch = { s, k };
    if (k > 0) {
      const { rig } = T, yaw = g.yaw, pitch = 1.2; // кисть пальцами вниз к полу, к точке
      const F = new THREE.Vector3(0, -Math.sin(pitch), Math.cos(pitch)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const N = new THREE.Vector3(0, -Math.cos(pitch), -Math.sin(pitch)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const P = point(s).setY(0.075); // середина ладони: кончики пальцев у пола
      const Sh = w(rig, s + 'Arm'), ready = Sh.clone().add(new THREE.Vector3(0, -0.3, 0)).addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 0.3);
      palmOn(T, s, ready.lerp(P, k), F, N, new THREE.Vector3(sgn(s) * 0.6, 0.2, -0.6));
      rig.relaxHand(s);
    }
  },
  audit(T) {
    const r = legAudit(T), { rig } = T, { s, k } = T.touch;
    if (k > 0.999) {
      const m2 = w(rig, s + 'HandMiddle2'), tip = w(rig, s + 'HandMiddle3').multiplyScalar(2).sub(m2).y; // кончик ≈ третья фаланга дальше на свою длину
      r.m.fingerY = cm(tip);
      if (tip > 0.025) r.bad.push(`рука не достала пол (${cm(tip)} см)`);
      if (tip < -0.01) r.bad.push(`рука в полу (${cm(tip)} см)`);
      const a = rig.audit()[s]; if (a.wrist > 50) r.bad.push(`запястье ${a.wrist}°`);
    }
    if (r.m.torso < 20) r.bad.push(`корпус завален: ${r.m.torso}°`);
    return r;
  },
};
