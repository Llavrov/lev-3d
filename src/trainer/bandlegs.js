// Общее для ног с резинкой и у стены (23.11.2026, исполнитель bandlegs): мини-петля вокруг голеней или над коленями,
// стена и ладони на ней, ступенька, стопа с наклоном (пятка вверх выше 3 см и ниже края ступеньки).
import * as THREE from 'three';
import { band, stretch } from './band.js';
import { w, cm, SIDES, sgn, ruSide, FWD, UP } from './poses.js';
import { palmOn } from './kneel.js';

const TUBE = 0.012; // толщина петли: на телефоне тоньше не видно

// ---------- Мини-петля ----------
// Петля — «стадион» вокруг двух ног: две прямые ветки (общие касательные двух колец) и две полудуги снаружи ног.
// at: 'shin' — на голенях над щиколоткой (доля от колена 0,7), 'knee' — над коленями (доля бедра от колена 0,15).
export function loop(T, at = 'shin', color = '#1fa35a') {
  const R = T.legR ?? { thigh: new Array(10).fill(0.08), shin: new Array(10).fill(0.05) };
  const r = at === 'shin' ? R.shin[7] : R.thigh[8]; // передний радиус кожи в этом месте
  const L = { at, R: 0.92 * r + TUBE, front: band(T, color, TUBE), back: band(T, color, TUBE), ring: {} };
  const mat = L.front.material;
  for (const s of SIDES) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(L.R, TUBE, 8, 20, Math.PI), mat);
    m.castShadow = true; T.add(m); L.ring[s] = m;
  }
  return L;
}
// Где петля на ноге s: точка на оси и ось кости (вниз по ноге).
function anchor(T, L, s) {
  const { rig } = T;
  if (L.at === 'shin') { const K = w(rig, s + 'Leg'), A = w(rig, s + 'Foot'); return { c: K.clone().lerp(A, 0.7), a: A.sub(K).normalize() }; }
  const H = w(rig, s + 'UpLeg'), K = w(rig, s + 'Leg');
  return { c: K.clone().lerp(H, 0.15), a: K.sub(H).normalize() };
}
const perp = (v, a) => v.clone().addScaledVector(a, -v.dot(a));
// Каждый кадр после позы: ветки по общим касательным, полудуги снаружи ног.
export function wrap(T, L) {
  const A = {}; for (const s of SIDES) A[s] = anchor(T, L, s);
  const ax = A.Left.a.clone().add(A.Right.a).normalize(), d = A.Left.c.clone().sub(A.Right.c);
  const n = new THREE.Vector3().crossVectors(perp(d, ax), ax).normalize(); // поперёк линии между ногами и вдоль пола: перёд и зад
  if (n.dot(FWD.clone().applyQuaternion(T.wrap.quaternion)) < 0) n.negate();
  const end = (s, k) => A[s].c.clone().addScaledVector(n, k * L.R);
  stretch(L.front, end('Left', 1), end('Right', 1));
  stretch(L.back, end('Left', -1), end('Right', -1));
  for (const s of SIDES) {
    const X = perp(n, A[s].a).normalize(), out = A[s].c.clone().sub(A[s === 'Left' ? 'Right' : 'Left'].c);
    const Y = perp(perp(out, A[s].a), X).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
    const m = L.ring[s]; m.position.copy(A[s].c); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }
  L.now = { A, n, len: 2 * perp(d, ax).length() + 2 * Math.PI * L.R };
  return L.now;
}
// Длина петли в покое: в стойке на ширине таза (вызывать в setup после позы стойки).
export function restLength(T, L, k = 0.95) { L.rest = wrap(T, L).len * k; return L.rest; }

// Ближайшее расстояние между отрезками [p1, q1] и [p2, q2].
export function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), cl = THREE.MathUtils.clamp;
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb;
  let s = den > 1e-9 ? cl((bb * f - c * e) / den, 0, 1) : 0, u = (bb * s + f) / e;
  if (u < 0) { u = 0; s = cl(-c / a, 0, 1); } else if (u > 1) { u = 1; s = cl((bb - c) / a, 0, 1); }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, u));
}
// Проверка петли: натянута (длина по ногам не меньше stretchMin длины покоя) и ветки не проходят сквозь ноги
// (голень, бедро у колена и стопа — капсулами в 0,8 переднего радиуса, как в steps.js; допуск 1 см на мягкую кожу).
export function loopAudit(T, L, r, stretchMin = 1.05) {
  const { rig } = T, now = wrap(T, L), R = T.legR;
  r.m.band = +(now.len / L.rest).toFixed(2);
  if (now.len < L.rest * stretchMin) r.bad.push(`резинка провисла: растянута в ${r.m.band} раза`);
  let worst = Infinity, where = '';
  for (const k of [1, -1]) {
    const p = now.A.Left.c.clone().addScaledVector(now.n, k * L.R), q = now.A.Right.c.clone().addScaledVector(now.n, k * L.R);
    for (const s of SIDES) {
      const H = w(rig, s + 'UpLeg'), K = w(rig, s + 'Leg'), An = w(rig, s + 'Foot'), B = w(rig, s + 'ToeBase');
      for (const [a, b, rad, nm] of [[K, An, 0.8 * R.shin[4], 'голень'], [H.clone().lerp(K, 0.6), K, 0.8 * R.thigh[8], 'бедро'], [An, B, 0.04, 'стопа']]) {
        const g = segDist(p, q, a, b) - rad - TUBE;
        if (g < worst) { worst = g; where = `${ruSide(s, true)} ${nm}`; }
      }
    }
  }
  r.m.bandGap = cm(worst);
  if (worst < -0.01) r.bad.push(`резинка проходит сквозь ногу: ${where} (${cm(worst)} см)`);
  return r;
}

// ---------- Стена и ступенька ----------
// Стена — панель поперёк Z, лицевая сторона в z (тело перед ней смотрит в +Z). Лежит в сцене, а не в снарядах: габарит
// камеры её не включает, иначе человек на телефоне мелкий. Камера за стеной видит сквозь неё (стена бледнеет).
export function wall(T, z, width = 1.3, height = 2.1) {
  const mat = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.9, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.08), mat);
  m.position.set(0, height / 2, z + 0.04); m.receiveShadow = true;
  m.onBeforeRender = (r, s, cam) => { mat.opacity = cam.position.z > z ? 0.18 : 1; mat.depthWrite = mat.opacity === 1; };
  T.scene.add(m);
  return m;
}
// Ступенька или тумба: прямоугольник x0..x1, z0..z1, верх на высоте h.
export function box(T, { x0, x1, z0, z1, h }) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.8 }));
  m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true;
  T.scene.add(m);
  return m;
}
// Перила вдоль X на высоте y и в z (кронштейны к стене в zWall): держаться в подъёме на носок.
export function rail(T, y, z, zWall, half = 0.45) {
  const mat = new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.8, roughness: 0.35 }), g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2 * half, 12), mat); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const x of [-half + 0.05, half - 0.05]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, zWall - z), mat); k.position.set(x, 0, (zWall - z) / 2); g.add(k); }
  g.position.set(0, y, z); g.traverse((o) => { o.castShadow = true; });
  T.scene.add(g);
  return { y, z, R: 0.016 };
}
// Ладони на стене: середина ладони в P, пальцы вверх, ладонь к стене (+Z), локоть вниз, к стене и наружу: предплечье
// почти отвесно вдоль стены, иначе запястье разогнуто больше 50° (у модели больше не гнётся).
export function handOnWall(T, s, P, pole = new THREE.Vector3(sgn(s) * 0.4, -1, 0.5)) {
  T.rig.grip(s, 0.1); // пальцы почти прямые; relaxHand здесь нельзя: он доворачивает кисть и снимает ладонь со стены
  palmOn(T, s, P, new THREE.Vector3(sgn(s) * 0.25, 1, 0), new THREE.Vector3(0, 0, 1), pole);
}
// Середина ладони ближе к стене не дальше 1 см и не в стене.
export function wallAudit(T, zWall, r, sides = SIDES) {
  for (const s of sides) {
    const d = zWall - T.rig.palm(s).z; r.m['palm' + s[0]] = cm(d);
    if (Math.abs(d) > 0.015) r.bad.push(`${ruSide(s, true)} ладонь ${d > 0 ? 'не на стене' : 'в стене'} (${cm(d)} см)`);
  }
  return r;
}

// ---------- Стопа с наклоном ----------
// Плоская стопа стоя (поворот костей стопы и пальцев, щиколотка → подушечка) — один раз в setup, в стойке.
export function measureFoot(T) {
  const { rig } = T, F = {};
  for (const s of SIDES) {
    F[s] = { foot: rig.b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion()), toe: rig.b[s + 'ToeBase'].getWorldQuaternion(new THREE.Quaternion()),
      v: w(rig, s + 'ToeBase').sub(w(rig, s + 'Foot')), heel: new THREE.Vector3(0, 0.012 - w(rig, s + 'Foot').y, -0.05), ankleY: w(rig, s + 'Foot').y, ballY: w(rig, s + 'ToeBase').y };
  }
  T.flatFoot = F;
}
// Щиколотка стопы s, у которой подушечка в точке ball (мир, кость ToeBase), а стопа наклонена на pitch (рад, + — пятка вверх).
export function ankleFor(T, s, ball, pitch) {
  const ax = new THREE.Vector3(1, 0, 0);
  return ball.clone().sub(T.flatFoot[s].v.clone().applyAxisAngle(ax, pitch));
}
// Нижняя точка пятки (на 5 см позади щиколотки, у плоской стопы на 1 см над полом) при наклоне pitch.
export const heelAt = (T, s, A, pitch) => A.clone().add(T.flatFoot[s].heel.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
// После Rig.legs: стопа наклонена на pitch вокруг поперечной оси, пальцы остаются горизонтально.
export function pitchFoot(T, s, pitch) {
  const { rig } = T, F = T.flatFoot[s], q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  rig.setWorld(rig.b[s + 'Foot'], q.clone().multiply(F.foot));
  rig.setWorld(rig.b[s + 'ToeBase'], F.toe);
  rig.root.updateMatrixWorld(true);
}
export { UP };

// Rig.legs сам опускает таз (до 8 см), если нога не достаёт до стопы: таз скачет мимо ключей, проверка этого не видит.
export function reachAudit(T, r) {
  const { rig } = T, h = rig.b.Hips, drop = (rig.hipsRest.y - h.position.y) * h.parent.getWorldScale(new THREE.Vector3()).y;
  r.m.hipDrop = cm(drop);
  if (drop > 0.005) r.bad.push(`нога не достаёт до стопы: таз просел на ${r.m.hipDrop} см`);
  return r;
}
// Взгляд: лицо не вверх и не в пол (как в jump.js). Шея в линию спины задирает лицо этой модели на 20–30°.
export function gazeAudit(T, r, up = 8, down = -30) {
  const hq = T.rig.b.Head.getWorldQuaternion(new THREE.Quaternion()), f = T.face.clone().applyQuaternion(hq);
  r.m.gaze = Math.round(THREE.MathUtils.radToDeg(Math.asin(f.y)));
  if (r.m.gaze > up || r.m.gaze < down) r.bad.push(`взгляд ${r.m.gaze > 0 ? 'вверх' : 'в пол'}: ${r.m.gaze}°`);
  return r;
}
