// Медбол и прыжки (23.11.2026, волна 2, исполнитель medball): мяч, стена, полёт мяча, мяч в ладонях, тело с поворотом таза
// и проверки мяча. Мяч держат обе ладони с боков (чуть сзади по ходу броска), пальцы продолжают предплечье, запястье
// прямое. Мяч — функция времени: в руках он там, где центр кистей H(t); в полёте — парабола с «показным» g (показ
// медленнее жизни), от стены или пола отскакивает и прилетает ровно в H(tc), где кисти его ловят.
import * as THREE from 'three';
import { X, FWD, deg, clamp, w, key, SIDES, sgn, ruSide, cm, shadows, stand, trunk, placeHips, kneeOverToe, look, armIK } from './poses.js';

export const R = 0.11; // радиус медбола, м (диаметр 22 см, 3 кг)
export const G = 5; // ускорение мяча в показе, м/с² (показ медленнее жизни примерно в 1,4 раза: 9,8 / 1,4²)
const SKIN = 0.012; // середина ладони (rig.palm) на столько глубже кожи ладони: точка ладони внутри мяча на SKIN
const TORSO = { front: 0.135, side: 0.17 }; // полуоси сечения груди от оси таз → шея (замер coach-v2: спереди 13,5 см, сзади 12,5)
const HEAD = 0.1; // радиус головы от середины Head → +8 см вверх

// ---------- Снаряды ----------
export function medball() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshStandardMaterial({ color: '#8a95a2', roughness: 0.85 })));
  const seam = new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.7 });
  for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0]]) { // два шва крест-накрест: видно, что мяч крутится
    const s = new THREE.Mesh(new THREE.TorusGeometry(R * 1.003, 0.0045, 6, 48), seam); s.rotation.set(...rot); g.add(s);
  }
  return shadows(g);
}
// Стена для бросков: панель с отметкой цели. Не в T.gear, чтобы камера не отъезжала ради стены: мяч до неё долетает,
// и габарит движения её поверхность и так включает. pos — середина передней грани, normal — куда она смотрит.
export function wall(T, pos, normal, { width = 1.4, height = 2.4 } = {}) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), new THREE.MeshStandardMaterial({ color: '#4a4f58', roughness: 0.95 }));
  panel.position.set(0, height / 2, -0.03); g.add(panel);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ color: '#6a717c', roughness: 0.9 }));
  mark.position.set(0, pos.y, 0.002); g.add(mark);
  g.position.set(pos.x, 0, pos.z); g.quaternion.setFromUnitVectors(FWD, normal.clone().setY(0).normalize());
  shadows(g); T.scene.add(g); T.wall = g; return g; // T.wall — спрятать для съёмки спереди сквозь стену
}

// Полёт мяча из A в B за dur секунд под ускорением g: функция секунды полёта.
export function arc(A, B, dur, g = G) {
  const v = B.clone().sub(A).divideScalar(dur); v.y += (g * dur) / 2;
  return (s) => A.clone().addScaledVector(v, s).add(new THREE.Vector3(0, (-g * s * s) / 2, 0));
}
// Мяч кладём в группу gear и вращаем по ходу полёта (катится вперёд): spin — оборотов за полёт.
export function placeBall(T, C, spin = 0, axis = X) {
  T.mb.position.copy(C); T.mb.quaternion.setFromAxisAngle(axis, spin * 2 * Math.PI); T.mb.updateMatrixWorld(true);
}

// ---------- Тело ----------
// Поза стоя с поворотом таза и корпуса: ступни ft { Left, Right: { pos, lift, yaw (мир), toe } }, M — середина
// тазобедренных, el — линия таз → шея над горизонталью (больше 90 — откинут назад), hips и torso — поворот, °.
// Rig.legs сам доворачивает ступню на 0,55 поворота таза — вычитаем, чтобы стопа стояла, как сказано.
export function body(T, { M, ft, el = 80, hips = 0, torso = 0, knees = [], lookAt = null, nod = 35, k = {} }) {
  stand(T);
  trunk(T, key({ hips, torso, ...k }), el);
  const f = { crouch: 0 };
  for (const s of SIDES) f[s] = { ...ft[s], yaw: (ft[s].yaw ?? 0) - 0.55 * deg(hips) };
  placeHips(T, M, f);
  for (const s of knees) kneeOverToe(T, s, ft[s].yaw ?? 0);
  look(T, lookAt ?? M.clone().add(new THREE.Vector3(0, 0.45, 4)), nod);
}

// Ладони на мяч с центром C. across — от правой ладони к левой, fwd — куда уходит мяч (ладони на beta° позади
// экватора), pole — куда смотрят локти (функция стороны или вектор). spread — ладони дальше от мяча (раскрытые руки
// перед ловлей). Пальцы продолжают предплечье (запястье прямое), ладонь смотрит на мяч, пальцы чуть согнуты.
export function hands(T, C, { across = X, fwd = FWD, beta = 20, pole, spread = 0, grip = 0.25 }) {
  const { rig } = T, b = deg(beta);
  for (let i = 0; i < 5; i++) for (const s of SIDES) {
    const c = across.clone().multiplyScalar(sgn(s) * Math.cos(b)).addScaledVector(fwd, -Math.sin(b)).normalize(); // от центра к ладони
    const P = C.clone().addScaledVector(c, R - SKIN + spread), n = c.clone().negate();
    const W = P.clone().sub(rig.palm(s).sub(w(rig, s + 'Hand')));
    armIK(T, s, W, typeof pole === 'function' ? pole(s) : pole);
    rig.root.updateMatrixWorld(true);
    const A = w(rig, s + 'Hand').sub(w(rig, s + 'ForeArm')).normalize(), F = A.clone().addScaledVector(n, -A.dot(n)).normalize();
    const Rr = s === 'Right' ? new THREE.Vector3().crossVectors(F, n) : new THREE.Vector3().crossVectors(n, F); // большой палец
    rig.orientHand(s, Rr.normalize(), 1, false);
  }
  for (const s of SIDES) rig.grip(s, grip);
}

// Точка от середины плеч в осях корпуса: f — вперёд от груди, u — вдоль оси таз → шея, x — влево. Мяч идёт за корпусом
// в наклоне и повороте, поэтому ключи мяча пишутся в этих осях.
export function rel(T, f, u, x = 0) {
  const F = torsoFrame(T.rig), S = w(T.rig, 'LeftArm').add(w(T.rig, 'RightArm')).multiplyScalar(0.5);
  return S.addScaledVector(F.front, f).addScaledVector(F.ax, u).addScaledVector(F.across, x);
}
export const frame = (T) => torsoFrame(T.rig);

// ---------- Проверка ----------
// Точка p в сечении груди: доля полуосей (меньше 1 — внутри груди) с запасом pad. Ось — таз → шея, «вперёд» — от
// плеч и оси, так что мера держится и в наклоне, и в повороте корпуса.
function torsoFrame(rig) {
  const H = w(rig, 'Hips'), N = w(rig, 'Neck'), ax = N.clone().sub(H).normalize();
  const across = w(rig, 'LeftArm').sub(w(rig, 'RightArm')); across.addScaledVector(ax, -across.dot(ax)).normalize();
  return { H, N, ax, across, front: new THREE.Vector3().crossVectors(across, ax).normalize() };
}
function inTorso(F, p, pad) {
  const d = p.clone().sub(F.H), h = d.dot(F.ax), len = F.N.distanceTo(F.H);
  if (h < -0.05 || h > len + 0.03) return Infinity;
  const x = d.dot(F.across), z = d.dot(F.front);
  return Math.hypot(x / (TORSO.side + pad), z / (TORSO.front + pad));
}
const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };

// Мяч в руках: обе ладони на мяче (зазор от −1 до 2 см). Всегда: мяч не в груди, не в голове, не в ногах; руки (локоть,
// запястье) не в груди и не сквозь мяч. inHands — мяч сейчас держат. r — итог baseAudit или legAudit.
export function ballAudit(T, r, inHands) {
  const { rig } = T, C = T.mb.position, F = torsoFrame(rig);
  if (inHands) for (const s of SIDES) {
    const g = rig.palm(s).distanceTo(C) - (R - SKIN);
    r.m['palm' + s[0]] = cm(g);
    if (g > 0.02 || g < -0.01) r.bad.push(`${ruSide(s, true)} ладонь не на мяче: ${cm(g)} см`);
  }
  const t = inTorso(F, C, R - 0.01); r.m.ballTorso = +t.toFixed(2);
  if (t < 1) r.bad.push('мяч в груди');
  const head = w(rig, 'Head').addScaledVector(F.ax, 0.08), hg = C.distanceTo(head) - R - HEAD; r.m.ballHead = cm(hg);
  if (hg < -0.01) r.bad.push(`мяч в голове: ${cm(hg)} см`);
  for (const s of SIDES) {
    const lg = Math.min(segDist(C, w(rig, s + 'UpLeg'), w(rig, s + 'Leg')) - 0.075, segDist(C, w(rig, s + 'Leg'), w(rig, s + 'Foot')) - 0.05) - R;
    if (lg < -0.01) r.bad.push(`мяч в ${s === 'Left' ? 'левой' : 'правой'} ноге: ${cm(lg)} см`);
    const E = w(rig, s + 'ForeArm'), Wr = w(rig, s + 'Hand'), S = w(rig, s + 'Arm');
    for (const [p, name] of [[E, 'локоть'], [Wr, 'запястье']]) {
      const q = inTorso(F, p, 0.0);
      if (q < 0.92) r.bad.push(`${ruSide(s)} ${name} в груди`);
    }
    // плечо и предплечье сквозь мяч: ось сегмента до центра мяча минус радиусы (у запястья кисть законно у мяча)
    const ag = Math.min(segDist(C, S, E) - 0.05, segDist(C, E, E.clone().lerp(Wr, 0.75)) - 0.04) - R;
    r.m['armBall' + s[0]] = cm(ag);
    if (ag < -0.01) r.bad.push(`${ruSide(s, true)} рука проходит сквозь мяч: ${cm(ag)} см`);
  }
  return r;
}
