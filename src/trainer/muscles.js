// Карта мышц по вершинам и подсветка в шейдере. Ничего не привязано к текстуре и номерам вершин: всё меряем от костей
// в позе привязки (boneInverses и bindMatrix), поэтому та же карта ляжет на любую модель со скелетом Mixamo.
// Вершина: главная кость по весам → участок тела (бедро, голень, плечо, предплечье, туловище, шея); на участке —
// сектор вокруг оси кости (перед, зад, внутри, снаружи) и доля длины. Туловище меряем в своих осях: высота от
// тазобедренных суставов до шеи и угол на эллипсе сечения (сечение туловища шире, чем глубже).
// Метки сглаживаются по рёбрам сетки (вершины, разрезанные швами развёртки, сшиваем по положению) и усредняются с
// зеркальной вершиной — левая и правая стороны одинаковы. В атрибут musc идут две главные мышцы и их доли.
import * as THREE from 'three';
import { MUSCLES, JOINTS } from './exercises.js';

const N = MUSCLES.length, NONE = N; // N — «ничего»: граница плавно гаснет в кожу
const ID = Object.fromEntries(MUSCLES.map((m, i) => [m, i]));
const strip = (n) => n.replace(/^mixamorig:?/, '');

// Правила туловища. r — высота в метрах человека среднего сложения от тазобедренных суставов до плечевого (0,6 м).
// Кости спины у Meshy стоят как придётся, поэтому меряем только по этим двум суставам. a — угол на эллипсе сечения: 0 перед, 90 бок, 180 зад; xn — доля полуширины от середины.
function torso(r, a, xn) {
  if (r > 0.56 && xn > 0.85) return a < 65 ? 'delts_front' : a > 115 ? 'delts_rear' : 'delts_side';
  if (a < 58) { // перед
    if (r < -0.04) return xn > 0.3 ? 'quads' : 'adductors';
    if (r < 0) return xn > 0.3 ? 'quads' : 'adductors';
    if (r < 0.09) return xn > 0.25 ? 'hip_flexors' : null;
    if (r < 0.35) return xn < 0.7 ? 'abs' : 'obliques';
    if (r < 0.62) return 'chest';
    return xn > 0.45 ? 'traps' : 'neck';
  }
  if (a < 122) { // бок
    if (r < 0.03) return 'quads';
    if (r < 0.13) return 'hip_abductors';
    if (r < 0.31) return 'obliques';
    if (r < 0.54) return 'lats';
    return r < 0.64 ? 'delts_side' : 'traps';
  }
  // зад
  if (r < 0.11) return r > -0.07 ? 'glutes' : 'hamstrings';
  if (r < 0.32) return xn < (r < 0.2 ? 0.6 : 0.45) ? 'lower_back' : 'lats';
  if (r < 0.6) return xn < 0.35 ? (r > 0.46 ? 'rhomboids' : 'traps') : xn < 0.8 && r > 0.46 ? 'rotator_cuff' : 'lats';
  return 'traps';
}
// Конечности: t — доля длины от сустава, sec — сектор вокруг оси (front, back, in, out).
function limb(seg, t, sec, ang) {
  switch (seg) {
    case 'thigh':
      if (sec === 'back') return t < 0.2 ? 'glutes' : 'hamstrings'; // ягодичная складка ≈ 8 см ниже сустава
      if (sec === 'front') return t < 0.1 ? 'hip_flexors' : 'quads';
      if (sec === 'in') return t < 0.65 ? 'adductors' : 'quads';
      return t < 0.12 ? 'hip_abductors' : 'quads';
    case 'shin': return Math.abs(ang) > 100 && t < 0.75 ? 'calves' : null; // икра сзади; спереди и по бокам — большеберцовая
    case 'upper':
      if (t < 0.3) return sec === 'front' ? 'delts_front' : sec === 'back' ? 'delts_rear' : sec === 'out' ? 'delts_side' : null;
      return sec === 'front' || (sec === 'in' && t > 0.5) ? 'biceps' : sec === 'back' ? 'triceps' : t < 0.42 ? 'delts_side' : 'triceps';
    case 'fore': return t < 0.85 ? 'forearms' : null;
    case 'neck': return sec === 'back' && t < 0.35 ? 'traps' : 'neck';
  }
  return null;
}
const SEG = (n) => /UpLeg$/.test(n) ? ['thigh', n.replace('UpLeg', 'Leg')] : /Leg$/.test(n) ? ['shin', n.replace('Leg', 'Foot')]
  : /Arm(Twist)?$/.test(n) && !/Fore/.test(n) ? ['upper', n.replace(/Arm(Twist)?$/, 'ForeArm')] : /ForeArm(Twist)?$/.test(n) ? ['fore', n.replace(/ForeArm(Twist)?$/, 'Hand')]
  : n === 'Neck' ? ['neck', 'Head'] : /^(Hips|Spine\d?|(Left|Right)Shoulder)$/.test(n) ? ['torso'] : [null];

// Считает атрибут musc (vec4: мышца A, мышца B, доля A, доля B) и заодно радиус ноги спереди по длине (для проверки гантелей).
export function mapMuscles(mesh) {
  const g = mesh.geometry, sk = mesh.skeleton, n = g.attributes.position.count;
  const names = sk.bones.map((b) => strip(b.name));
  const bindPos = sk.boneInverses.map((m) => new THREE.Vector3().setFromMatrixPosition(m.clone().invert()));
  const J = (name) => bindPos[names.indexOf(name)];
  const P = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.bindMatrix); v.toArray(P, i * 3); }
  // Оси тела в позе привязки: up — от середины стоп к голове, left — от правого бедра к левому, fwd = left × up.
  const feet = J('LeftFoot').clone().add(J('RightFoot')).multiplyScalar(0.5);
  const up = J('Head').clone().sub(feet).normalize();
  const left = J('LeftUpLeg').clone().sub(J('RightUpLeg')); left.addScaledVector(up, -left.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up);
  const height = J('Head').clone().sub(feet).dot(up) * 1.1;
  const mid = J('LeftUpLeg').clone().add(J('RightUpLeg')).multiplyScalar(0.5);
  const B = (p) => { const d = p.clone().sub(mid); return [d.dot(left), d.dot(up), d.dot(fwd)]; }; // оси тела, начало — между тазобедренными
  const hipY = 0, neckY = B(J('Neck'))[1], T = neckY - hipY, A = (B(J('LeftArm'))[1] + B(J('RightArm'))[1]) / 2 / T;

  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const main = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    main[i] = best;
  }
  // Сечение туловища по высоте: середина по глубине и полуширина/полуглубина (бины по 2 % высоты туловища).
  const segOf = names.map(SEG), bins = 80, lo = -0.5;
  const ext = Array.from({ length: bins }, () => [Infinity, -Infinity, 0]); // z min, z max, |x| max
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = B(v.fromArray(P, i * 3)); xyz[i * 3] = x; xyz[i * 3 + 1] = y; xyz[i * 3 + 2] = z;
    if (segOf[main[i]][0] !== 'torso') continue;
    const b = Math.floor((y / T - lo) / 0.025);
    if (b < 0 || b >= bins) continue;
    const e = ext[b];
    if (Math.abs(x) < 0.04 * T) { e[0] = Math.min(e[0], z); e[1] = Math.max(e[1], z); }
    e[2] = Math.max(e[2], Math.abs(x));
  }
  // Пустые бины берут ближайший заполненный.
  for (let pass = 0; pass < 2; pass++) for (let b = 0; b < bins; b++) {
    const e = ext[b];
    if (e[0] < Infinity && e[2] > 0) continue;
    const o = ext[b - 1]?.[0] < Infinity ? ext[b - 1] : ext[b + 1];
    if (o && o[0] < Infinity) { e[0] = o[0]; e[1] = o[1]; e[2] = Math.max(e[2], o[2]); }
  }
  // Высота r в метрах человека среднего сложения: от тазобедренных (0) до плечевого сустава (0,6 м), линейно по костям.
  const rOf = (h) => h * 0.6 / A;
  const label = new Uint8Array(n).fill(NONE);
  const axis = new THREE.Vector3(), r = new THREE.Vector3(), f = new THREE.Vector3(), out = new THREE.Vector3();
  const legR = { thigh: new Array(10).fill(0).map(() => []), shin: new Array(10).fill(0).map(() => []) };
  const fib = new Float32Array(n * 2); // косинус и синус угла вокруг оси кости: по нему в просвете идут волокна вдоль мышцы
  for (let i = 0; i < n; i++) {
    const nm = names[main[i]], [seg, child] = segOf[main[i]], x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
    let m = null;
    if (seg === 'torso') {
      const b = Math.min(bins - 1, Math.max(0, Math.floor((y / T - lo) / 0.025))), e = ext[b];
      const cz = e[0] < Infinity ? (e[0] + e[1]) / 2 : 0, hd = e[0] < Infinity ? Math.max(1e-3, (e[1] - e[0]) / 2) : 0.1 * T, hw = Math.max(1e-3, e[2]);
      const xn = Math.min(1.2, Math.abs(x) / hw), zn = (z - cz) / hd;
      m = torso(rOf(y / T), THREE.MathUtils.radToDeg(Math.atan2(xn, zn)), xn);
      const fa = Math.atan2(x / hw, zn); fib[i * 2] = Math.cos(fa); fib[i * 2 + 1] = Math.sin(fa);
    } else if (seg) {
      const a = bindPos[main[i]], c = J(child) ?? a;
      axis.copy(c).sub(a); const len = axis.length(); axis.normalize();
      v.fromArray(P, i * 3); r.copy(v).sub(a);
      const t = r.dot(axis) / len;
      r.addScaledVector(axis, -r.dot(axis));
      f.copy(fwd).addScaledVector(axis, -fwd.dot(axis)).normalize();
      const sideSign = Math.sign(a.clone().sub(mid).dot(left)) || 1;
      out.copy(left).multiplyScalar(sideSign).addScaledVector(axis, -left.dot(axis) * sideSign).normalize();
      const ang = THREE.MathUtils.radToDeg(Math.atan2(r.dot(out), r.dot(f))); // 0 перед, 90 снаружи, ±180 зад, −90 внутри
      const sec = Math.abs(ang) < 50 ? 'front' : Math.abs(ang) > 130 ? 'back' : ang > 0 ? 'out' : 'in';
      m = limb(seg, t, sec, ang);
      fib[i * 2] = Math.cos(ang * Math.PI / 180); fib[i * 2 + 1] = Math.sin(ang * Math.PI / 180);
      if ((seg === 'thigh' || seg === 'shin') && Math.abs(ang) < 40 && t >= 0 && t < 1) legR[seg][Math.floor(t * 10)].push(r.length() / height * 1.82); // в метрах модели ростом 1,82
    }
    if (m) label[i] = ID[m];
  }
  // Сшить по положению (швы развёртки) и собрать соседей по треугольникам.
  const key = new Map(), weld = new Int32Array(n);
  const q = height * 1e-4;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[i * 3] / q)},${Math.round(P[i * 3 + 1] / q)},${Math.round(P[i * 3 + 2] / q)}`;
    if (!key.has(k)) key.set(k, i);
    weld[i] = key.get(k);
  }
  const idx = g.index ? g.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  const nb = Array.from({ length: n }, () => []);
  for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) {
    const p = weld[idx[t + a]], s = weld[idx[t + (a + 1) % 3]];
    if (p !== s) { nb[p].push(s); nb[s].push(p); }
  }
  const K = N + 1;
  let L = new Float32Array(n * K), L2 = new Float32Array(n * K);
  for (let i = 0; i < n; i++) L[weld[i] * K + label[i]] += 1;
  for (let i = 0; i < n; i++) if (weld[i] === i) { let s = 0; for (let k = 0; k < K; k++) s += L[i * K + k]; for (let k = 0; k < K; k++) L[i * K + k] /= s || 1; }
  // Зеркало: вершина с x → ближайшая к −x (решётка 1 см).
  const cell = height / 180, grid = new Map();
  const ck = (x, y, z) => `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
  for (let i = 0; i < n; i++) if (weld[i] === i) { const k = ck(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]); (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
  const mirror = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (weld[i] !== i) continue;
    const x = -xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
    let best = -1, bd = Infinity;
    const cx = Math.round(x / cell), cy = Math.round(y / cell), cz = Math.round(z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
        const d = (xyz[j * 3] - x) ** 2 + (xyz[j * 3 + 1] - y) ** 2 + (xyz[j * 3 + 2] - z) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    }
    mirror[i] = best;
  }
  const smooth = () => {
    for (let i = 0; i < n; i++) {
      if (weld[i] !== i) continue;
      const list = nb[i], w0 = 1;
      for (let k = 0; k < K; k++) {
        let s = L[i * K + k] * w0;
        for (const j of list) s += L[j * K + k];
        L2[i * K + k] = s / (w0 + list.length);
      }
    }
    [L, L2] = [L2, L];
  };
  for (let p = 0; p < 6; p++) smooth();
  for (let i = 0; i < n; i++) if (weld[i] === i && mirror[i] >= 0) for (let k = 0; k < K; k++) L2[i * K + k] = (L[i * K + k] + L[mirror[i] * K + k]) / 2;
  for (let i = 0; i < n; i++) if (weld[i] === i && mirror[i] < 0) for (let k = 0; k < K; k++) L2[i * K + k] = L[i * K + k];
  [L, L2] = [L2, L];
  for (let p = 0; p < 2; p++) smooth();
  const musc = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = weld[i] * K;
    let a = NONE, b = NONE, wa = 0, wb = 0;
    for (let k = 0; k < K; k++) { const w = L[o + k]; if (w > wa) { b = a; wb = wa; a = k; wa = w; } else if (w > wb) { b = k; wb = w; } }
    const s = wa + wb || 1;
    musc.set([a, b, wa / s, wb / s], i * 4);
  }
  g.setAttribute('musc', new THREE.BufferAttribute(musc, 4));
  g.setAttribute('fib', new THREE.BufferAttribute(fib, 2));
  // Точки для наведения камеры (muscleFocus): вершины, где мышца главная с долей от 0,6, до 48 на мышцу, ровно по списку.
  const own = MUSCLES.map(() => []);
  for (let i = 0; i < n; i++) if (musc[i * 4] < N && musc[i * 4 + 2] >= 0.6) own[musc[i * 4]].push(i);
  mesh.userData.muscleSamples = Object.fromEntries(MUSCLES.map((m, k) => [m, own[k].filter((_, j) => j % Math.ceil(own[k].length / 48) === 0)]));
  const med = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length * 0.6)] : null);
  const radius = (seg) => { const m = legR[seg].map(med); const fb = m.find((x) => x != null) ?? 0.06; return m.map((x) => x ?? fb); };
  return { dims: { T, A, height, spine: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm'].map((b) => +(B(J(b))[1] / T).toFixed(3)) }, thigh: radius('thigh'), shin: radius('shin'), counts: MUSCLES.map((m, k) => [m, label.reduce((s, l) => s + (l === k), 0)]) };
}

// ---------- Подсветка ----------
// uMus[k] — цвет и сила мышцы k (последняя — «ничего»). Индексы читаем в вершинном шейдере и отдаём готовый цвет:
// индекс, растянутый по треугольнику между двумя мышцами, дал бы мусор. Цвет кладём в альбедо с полом яркости:
// светотень и рельеф остаются от освещения, а на чёрных шортах цвет всё равно читается.
export const U = {
  uMus: { value: Array.from({ length: N + 1 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uJoint: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, -100, 0, 0)) },
  uJointCol: { value: new THREE.Color('#ffc21a') },
  uJointR: { value: 0.09 },
  uFocus: { value: 0 }, // 0 — обычная подсветка, 1 — просвет: тело тёмное и без цвета, мышца светится (и под одеждой)
};
export function patchMaterial(m) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec4 musc;\nattribute vec2 fib;\nuniform vec4 uMus[${N + 1}];\nvarying vec4 vMus;\nvarying vec3 vMusW;\nvarying vec2 vFib;\n` + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 mA = uMus[int(musc.x + 0.5)], mB = uMus[int(musc.y + 0.5)];
  vMus = vec4(mA.rgb * mA.a * musc.z + mB.rgb * mB.a * musc.w, mA.a * musc.z + mB.a * musc.w);
  vFib = fib;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vMusW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform vec4 uJoint[10];\nuniform vec3 uJointCol;\nuniform float uJointR;\nuniform float uFocus;\nvarying vec4 vMus;\nvarying vec3 vMusW;\nvarying vec2 vFib;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 musC = vMus.rgb / max(vMus.a, 1e-4); float musK = clamp(vMus.a, 0.0, 1.0), jk = 0.0;
  for (int i = 0; i < 10; i++) jk = max(jk, uJoint[i].w * (1.0 - smoothstep(uJointR * 0.35, uJointR, distance(vMusW, uJoint[i].xyz))));
  musC = mix(musC, uJointCol, jk / max(musK + jk, 1e-4)); musK = max(musK, jk);
  float musL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, musC * (0.42 + 0.75 * musL), musK * 0.8);
  float musFib = 0.5 + 0.5 * sin(atan(vFib.y, vFib.x) * 44.0); // волокна вдоль кости: угол вокруг оси, 44 полоски на круг
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(musL) * 0.2, musC * (0.42 + 0.26 * musFib + 0.5 * musL), musK), uFocus);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float musRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0); // край мышцы ярче: читается как свечение изнутри
  totalEmissiveRadiance += musC * musK * (0.07 + uFocus * (0.22 + 0.5 * musRim));`);
  };
  m.customProgramCacheKey = function () { return prevKey.call(this) + '|muscles'; };
  m.needsUpdate = true;
}

// Состояние подсветки: { muscle: [цвет, сила] }; joints — суставы «беречь» и их сила. Переход между цветами плавный.
const target = Array.from({ length: N + 1 }, () => new THREE.Vector4(0, 0, 0, 0)), tmp = new THREE.Color();
export function setTargets(map) {
  for (const t of target) t.w = 0;
  for (const [m, [col, k]] of Object.entries(map)) if (m in ID) { tmp.set(col); target[ID[m]].set(tmp.r, tmp.g, tmp.b, k); }
}
export function stepMuscles(dt) {
  const a = dt == null ? 1 : 1 - Math.exp(-dt / 0.18);
  U.uMus.value.forEach((v, k) => {
    const t = target[k];
    if (v.w < 0.01 && t.w > 0) v.set(t.x, t.y, t.z, v.w); // из пустоты цвет сразу свой, растёт только сила
    v.lerp(t.w > 0 ? t : new THREE.Vector4(v.x, v.y, v.z, 0), a);
  });
}
// Куда смотреть, чтобы показать мышцы list в текущей позе: точки кожи этих мышц в мире и средняя нормаль наружу.
// Кожу считаем тем же скиннингом, что шейдер (линейным): для камеры этого хватает. null — у модели таких мышц нет.
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3();
export function muscleFocus(mesh, list) {
  const S = mesh.userData.muscleSamples, pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
  const points = [], normal = new THREE.Vector3();
  mesh.updateMatrixWorld(true);
  for (const m of list) for (const i of S?.[m] ?? []) {
    _p.fromBufferAttribute(pos, i); _q.copy(_p).addScaledVector(_n.fromBufferAttribute(nor, i), 0.02);
    mesh.applyBoneTransform(i, _p).applyMatrix4(mesh.matrixWorld); mesh.applyBoneTransform(i, _q).applyMatrix4(mesh.matrixWorld);
    points.push(_p.clone()); normal.add(_q.sub(_p).normalize());
  }
  return points.length ? { points, normal: normal.lengthSq() > 1e-6 ? normal.normalize() : null } : null;
}

// Суставы «беречь»: кости по имени, точка — сустав в мире.
export const JOINT_BONES = { knee: 'Leg', ankle: 'Foot', shoulder_joint: 'Arm', elbow: 'ForeArm', wrist: 'Hand' };
export function setJoints(rig, list, k) {
  let i = 0;
  for (const j of list) if (JOINTS.includes(j)) for (const s of ['Left', 'Right']) {
    if (i >= 10) break;
    const p = rig.b[s + JOINT_BONES[j]].getWorldPosition(new THREE.Vector3());
    U.uJoint.value[i++].set(p.x, p.y, p.z, k);
  }
  for (; i < 10; i++) U.uJoint.value[i].w = 0;
}
// Отладка: каждой мышце свой цвет; соседние мышцы — непохожими цветами (палитра Трубецкого, вручную по соседству).
export const DEBUG_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#469990',
  '#9a6324', '#dcbeff', '#800000', '#000075', '#ffffff', '#a9a9a9', '#808000', '#aaffc3', '#fabed4', '#00e5c0', '#fffac8', '#f58231'];
