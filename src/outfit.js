// Форма и вещи Лёвы (решено с ним 18.11): ракетка — сила и контроль, кроссовки — скорость, новые мячи прыгают живее;
// футболка, шорты, кепка, повязка, напульсники, сумка — только вид. Что куплено и надето — в localStorage.
// Модель Лёвы — один меш Meshy с запечённой текстурой: футболку, шорты и кроссовки перекрашиваем в шейдере по маске
// (public/models/lev-mask.png, tools/outfit-mask.mjs), складки и тени остаются. Кепка, повязка, напульсники и сумка —
// меши кодом на костях головы, предплечий и груди, по размерам самой модели (замер вершин в позе привязки).
import * as THREE from 'three';
import { safeStore } from './stats.js';

const KEY = 'lev-outfit';
const it = (id, kind, name, price, o = {}) => ({ id, kind, name, price, ...o });
// color — цвет вещи; null — как на модели. power, control — ракетка (1 — как у стартовой), speed — кроссовки.
export const CATALOG = [
  it('shirt-white', 'shirt', 'Белая футболка', 0, { color: null }),
  it('shirt-black', 'shirt', 'Чёрная футболка', 25, { color: '#1d2025' }),
  it('shirt-navy', 'shirt', 'Тёмно-синяя футболка', 25, { color: '#1f3566' }),
  it('shirt-red', 'shirt', 'Красная футболка', 25, { color: '#b31f2e' }),
  it('shirt-lime', 'shirt', 'Салатовая футболка', 25, { color: '#bfdc3e' }),
  it('shirt-sky', 'shirt', 'Голубая футболка', 25, { color: '#79b8e6' }),
  it('shorts-stripe', 'shorts', 'Шорты в полоску', 0, { color: null }),
  it('shorts-white', 'shorts', 'Белые шорты', 25, { color: '#efefea' }),
  it('shorts-black', 'shorts', 'Чёрные шорты', 25, { color: '#202328' }),
  it('shorts-navy', 'shorts', 'Тёмно-синие шорты', 25, { color: '#1f3566' }),
  it('shorts-red', 'shorts', 'Красные шорты', 25, { color: '#a5202d' }),
  it('cap-white', 'cap', 'Белая кепка', 20, { color: '#f1f1ec' }),
  it('cap-black', 'cap', 'Чёрная кепка', 20, { color: '#1c1e23' }),
  it('cap-navy', 'cap', 'Тёмно-синяя кепка', 20, { color: '#22355f' }),
  it('band-white', 'band', 'Белая повязка', 8, { color: '#f1f1ec' }),
  it('band-red', 'band', 'Красная повязка', 8, { color: '#c22234' }),
  it('band-black', 'band', 'Чёрная повязка', 8, { color: '#1c1e23' }),
  it('wrist-white', 'wrist', 'Белые напульсники', 10, { color: '#f1f1ec' }),
  it('wrist-black', 'wrist', 'Чёрные напульсники', 10, { color: '#1c1e23' }),
  it('wrist-lime', 'wrist', 'Салатовые напульсники', 10, { color: '#c6e03f' }),
  it('shoes-base', 'shoes', 'Белые кроссовки', 0, { color: null, speed: 1 }),
  it('shoes-light', 'shoes', 'Лёгкие кроссовки', 70, { color: '#2f6fe0', speed: 1.025 }),
  it('shoes-clay', 'shoes', 'Грунтовые кроссовки', 140, { color: '#e2602a', speed: 1.045 }),
  it('red', 'racket', 'Красная', 0, { base: 'red', power: 1, control: 1, color: '#b5122a' }),
  it('white', 'racket', 'Бело-синяя', 120, { base: 'white', power: 0.98, control: 1.1, color: '#2a5db0' }),
  it('neon', 'racket', 'Неон', 160, { base: 'neon', power: 1.06, control: 0.96, color: '#c8f03a' }),
  it('red-black', 'racket', 'Чёрная', 45, { base: 'red', power: 1, control: 1, tint: '#232427', color: '#232427' }),
  it('white-gold', 'racket', 'Золотая', 60, { base: 'white', power: 0.98, control: 1.1, tint: '#c99a2e', color: '#c99a2e' }),
  it('neon-pink', 'racket', 'Розовая', 70, { base: 'neon', power: 1.06, control: 0.96, tint: '#ff4f9e', color: '#ff4f9e' }),
  it('bag-black', 'bag', 'Чёрная сумка', 45, { color: '#1c1e22' }),
  it('bag-red', 'bag', 'Красная сумка', 45, { color: '#b3202e' }),
  it('bag-navy', 'bag', 'Тёмно-синяя сумка', 45, { color: '#1f3566' }),
  it('balls', 'balls', 'Банка мячей', 6, { matches: 3 }),
];
export const ITEM = Object.fromEntries(CATALOG.map((x) => [x.id, x]));
const FREE = CATALOG.filter((x) => x.price === 0).map((x) => x.id);
const SLOTS = ['shirt', 'shorts', 'shoes', 'racket', 'cap', 'band', 'wrist', 'bag'];
const DEFAULT = { shirt: 'shirt-white', shorts: 'shorts-stripe', shoes: 'shoes-base', racket: 'red' };

export class Outfit {
  constructor(store = safeStore()) {
    this.store = store;
    const s = store.get(KEY), ok = (id, kind) => ITEM[id]?.kind === kind;
    this.owned = new Set([...FREE, ...(Array.isArray(s?.owned) ? s.owned.filter((id) => ITEM[id] && ITEM[id].kind !== 'balls') : [])]);
    // Ракетку раньше помнил main.js под ключом racket: подхватываем, если она стартовая.
    this.worn = {};
    for (const k of SLOTS) { const id = s?.worn?.[k]; this.worn[k] = ok(id, k) && this.owned.has(id) ? id : DEFAULT[k] ?? null; }
    this.balls = Number.isFinite(s?.ballMatches) ? Math.max(0, Math.min(99, Math.round(s.ballMatches))) : 0; // сколько матчей ещё живые мячи
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save() { this.store.set(KEY, { owned: [...this.owned].filter((id) => !FREE.includes(id)), worn: this.worn, ballMatches: this.balls }); for (const fn of this.listeners) fn(); }
  has(id) { return this.owned.has(id); }
  // Купить уже оплаченное (деньги списывает shop.js). Мячи — расходник: прибавляют живые геймы.
  give(id) { const x = ITEM[id]; if (!x) return; if (x.kind === 'balls') this.balls += x.matches; else this.owned.add(id); this.save(); }
  wear(id) { const x = ITEM[id]; if (!x || !this.owned.has(id) || !SLOTS.includes(x.kind)) return false; this.worn[x.kind] = id; this.save(); return true; }
  // Снять можно только вещи «для вида» без замены: кепку, повязку, напульсники, сумку.
  takeOff(kind) { if (!['cap', 'band', 'wrist', 'bag'].includes(kind)) return; this.worn[kind] = null; this.save(); }
  useBalls() { if (this.balls > 0) { this.balls--; this.save(); } }
  // Что влияет на игру: ракетка, кроссовки, мячи.
  gear() {
    const r = ITEM[this.worn.racket], sh = ITEM[this.worn.shoes];
    return { racket: { power: r.power, control: r.control }, shoes: { speed: sh.speed ?? 1 }, lively: this.balls > 0 ? 1.06 : 1 };
  }
  rackets() { return CATALOG.filter((x) => x.kind === 'racket' && this.owned.has(x.id)).map((x) => x.id); }
}
export const outfit = new Outfit();

// ---------- Вид на модели ----------
const M_PER = 1.82; // рост Лёвы, м: геометрия модели 2 единицы в высоту — масштаб берём из рамки
// Средняя яркость (линейная) ткани по маске — к ней приводим перекрас, чтобы складки и полоски остались (замер outfit-mask).
const REF = { shirt: 0.76, shorts: 0.48, shoes: 0.74 };
// Маска без мип-карт: на дальних уровнях край острова смешивался бы с соседним и перекрас тёк на кожу.
const maskTex = (() => { let t = null; return () => (t ??= Object.assign(new THREE.TextureLoader().load('/models/lev-mask.png'), { flipY: false, colorSpace: THREE.NoColorSpace, generateMipmaps: false, minFilter: THREE.LinearFilter })); })();

// Перекрас по маске поверх уже подключённых правок шейдера (DQS в dqs.js): цепляемся к ним, а не заменяем.
function recolor(mesh, U) {
  const m = mesh.material;
  if (m.userData.outfit) return;
  m.userData.outfit = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    Object.assign(sh.uniforms, U);
    // vGeo — точка в позе привязки: всё, что выше края кепки, — макушка с волосами; под кепкой её не рисуем.
    sh.vertexShader = 'varying vec3 vGeo;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGeo = position;');
    sh.fragmentShader = 'uniform sampler2D oMask; uniform vec3 oShirt, oShorts, oShoes, oOn, oRef; uniform vec4 oCut; varying vec3 vGeo;\n' + sh.fragmentShader
      .replace('void main() {', 'void main() {\n  if (oCut.w > 0.5 && vGeo.y > oCut.x + oCut.y * (vGeo.z - oCut.z)) discard;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 om = texture2D(oMask, vMapUv).rgb; om *= step(max(om.r, max(om.g, om.b)) - 0.001, om) * oOn; // на стыке островов — только свой канал
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, oShirt * min(1.5, lum / oRef.x), om.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, oShorts * mix(1.0, min(1.6, lum / oRef.y), 0.6), om.g); // полоски тише, складки остаются
        diffuseColor.rgb = mix(diffuseColor.rgb, oShoes * min(1.5, lum / oRef.z), om.b); }`);
  };
  m.customProgramCacheKey = function () { return prevKey.call(this) + '|outfit'; };
  m.needsUpdate = true;
}

// Замеры по вершинам в позе привязки (оси геометрии: y вверх, лицо в +z, правая рука в −x).
function bindInfo(mesh) {
  const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
  g.computeBoundingBox();
  const upm = (g.boundingBox.max.y - g.boundingBox.min.y) / M_PER; // единиц геометрии на метр
  const M = (n) => new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[names.indexOf(n)], mesh.bindMatrix); // геометрия → кость
  const joint = (n) => new THREE.Vector3().applyMatrix4(M(n).invert());
  // Вершины, у которых костей из re не меньше w по весу.
  const verts = (re, w = 0.5) => {
    const ids = new Set(names.map((n, i) => (re.test(n) ? i : -1)).filter((i) => i >= 0)), out = [];
    for (let i = 0; i < P.count; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) if (ids.has(SI.getComponent(i, k))) s += SW.getComponent(i, k);
      if (s >= w) out.push(new THREE.Vector3().fromBufferAttribute(P, i));
    }
    return out;
  };
  const bone = (n) => mesh.skeleton.bones[names.indexOf(n)];
  return { upm, M, joint, verts, bone, has: (n) => names.includes(n) };
}
// Меш в осях геометрии на кость: двигается и крутится вместе с ней ровно так, как кожа на этой кости.
function attach(info, boneName, obj) {
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false; holder.matrix.copy(info.M(boneName)); holder.add(obj);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  info.bone(boneName).add(holder);
  return obj;
}
const cloth = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });

// Срез головы на высоте y: центр и полуоси эллипса по x и z.
function slice(vs, y, d) {
  const s = vs.filter((v) => Math.abs(v.y - y) < d);
  const xs = s.map((v) => v.x), zs = s.map((v) => v.z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ax: (x1 - x0) / 2, az: (z1 - z0) / 2 };
}

function buildHead(info) {
  const u = info.upm, head = info.verts(/^(Head|HeadTop_End|headfront|Bone_\d+)$/), j = info.joint('Head');
  const top = Math.max(...head.map((v) => v.y)), H = top - j.y;
  // Повязка — на лбу над бровями, кепка садится чуть ниже, макушка накрыта куполом с козырьком вперёд.
  const yb = j.y + 0.66 * H, sb = slice(head, yb, 0.012 * u), gap = 0.004 * u;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.034 * u, 48, 1, true), cloth('#fff'));
  band.scale.set(sb.ax + gap, 1, sb.az + gap); band.position.set(sb.cx, yb, sb.cz);
  // Бейсболка. Край — на лбу на 1,5 см выше бровей (брови — на 4,5 см выше кончика носа), сзади чуть ниже (наклон 0,1).
  // Всё, что выше края, — макушку с волосами — шейдер не рисует (oCut), поэтому купол низкий, по форме головы, а не шлем
  // поверх причёски. Купол из шести клиньев (швы), кнопка сверху, козырёк 7,5 см изогнут по ширине и опущен вперёд.
  const nose = head.reduce((m, v) => (v.y > j.y && v.z > m.z ? v : m), head[0]);
  const yf = nose.y + 0.06 * u, zf = nose.z, tilt = 0.1, edge = (z) => yf + tilt * (z - zf);
  const ring = head.filter((v) => Math.abs(v.y - edge(v.z)) < 0.008 * u);
  const cx = (Math.min(...ring.map((v) => v.x)) + Math.max(...ring.map((v) => v.x))) / 2, cz = (Math.min(...ring.map((v) => v.z)) + Math.max(...ring.map((v) => v.z))) / 2;
  const NA = 48, NE = 12, r0 = new Float32Array(NA), bin = (dx, dz) => ((Math.round((Math.atan2(dx, dz) / (2 * Math.PI)) * NA) % NA) + NA) % NA;
  for (const v of ring) { const k = bin(v.x - cx, v.z - cz); r0[k] = Math.max(r0[k], Math.hypot(v.x - cx, v.z - cz)); }
  for (let pass = 0; pass < 3; pass++) { const src = r0.slice(); for (let k = 0; k < NA; k++) r0[k] = Math.max(src[k], (src[(k + NA - 1) % NA] + src[k] + src[(k + 1) % NA]) / 3); } // без провалов между ячейками
  const capGap = 0.004 * u, yc0 = edge(cz);
  const yTop = yc0 + THREE.MathUtils.clamp(top - yc0 - 0.035 * u, 0.09 * u, 0.115 * u); // волосы под кепкой прижаты на 3,5 см
  const rim = (k) => { const th = (2 * Math.PI * k) / NA, r = r0[((k % NA) + NA) % NA] + capGap, x = cx + r * Math.sin(th), z = cz + r * Math.cos(th); return new THREE.Vector3(x, edge(z) - 0.003 * u, z); };
  const at = (k, al) => { const R = rim(k), c = Math.pow(Math.cos(al), 0.85); return new THREE.Vector3(cx + (R.x - cx) * c, R.y + (yTop - R.y) * Math.pow(Math.sin(al), 0.9), cz + (R.z - cz) * c); };
  const pos = [], idx = [];
  for (let i = 0; i <= NE; i++) for (let k = 0; k < NA; k++) pos.push(...at(k, (Math.PI / 2) * (i / NE)).toArray());
  for (let i = 0; i < NE; i++) for (let k = 0; k < NA; k++) { const a = i * NA + k, b = i * NA + ((k + 1) % NA), c = a + NA, d = b + NA; idx.push(a, d, b, a, c, d); }
  const crownGeo = new THREE.BufferGeometry(); crownGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); crownGeo.setIndex(idx); crownGeo.computeVertexNormals();
  const cap = new THREE.Group(), mat = Object.assign(cloth('#fff'), { side: THREE.DoubleSide }), seamMat = Object.assign(cloth('#fff'), { userData: { shade: 0.72 } });
  cap.add(new THREE.Mesh(crownGeo, mat));
  for (let s = 0; s < 6; s++) { // швы клиньев: по меридианам на 1 мм над тканью
    const k = (s * NA) / 6, pts = [];
    for (let i = 1; i <= 20; i++) { const p = at(k, (Math.PI / 2) * 0.97 * (i / 20)); pts.push(p.add(new THREE.Vector3(p.x - cx, 0.4 * (p.y - yc0), p.z - cz).setLength(0.0012 * u))); }
    cap.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0014 * u, 4), seamMat));
  }
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009 * u, 14, 8), seamMat); btn.scale.y = 0.5; btn.position.set(cx, yTop, cz);
  // Козырёк: от края купола спереди (±75°) наружу, длиннее посередине, края загнуты вниз, весь опущен на 10°.
  const bp = [], bi = [], NU = 30, NV = 6, L = 0.075 * u;
  for (let i = 0; i <= NU; i++) {
    const w = -1 + (2 * i) / NU, k = (w * 75 * NA) / 360, R = rim(Math.round(k)), ph = (w * 75 * Math.PI) / 180, l = L * Math.pow(Math.cos(ph), 0.5);
    for (let jv = 0; jv <= NV; jv++) { const v = (jv / NV) * l; bp.push(R.x + Math.sin(ph) * v, R.y - v * Math.sin(0.17) - 0.014 * u * w * w * (jv / NV), R.z + Math.cos(ph) * v); }
  }
  for (let i = 0; i < NU; i++) for (let jv = 0; jv < NV; jv++) { const a = i * (NV + 1) + jv, b = a + NV + 1; bi.push(a, b, a + 1, b, b + 1, a + 1); }
  const brimGeo = new THREE.BufferGeometry(); brimGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); brimGeo.setIndex(bi); brimGeo.computeVertexNormals();
  cap.add(new THREE.Mesh(brimGeo, mat), btn);
  cap.userData.cut = new THREE.Vector4(yf, tilt, zf, 1);
  return { band: attach(info, 'Head', band), cap: attach(info, 'Head', cap) };
}

// Напульсник: кольцо вокруг запястья по срезу кожи, эллипс по главным осям среза. Крепим к скрутке предплечья —
// она несёт поворот кисти, и кольцо крутится вместе с кожей.
function buildWrist(info, s) {
  const u = info.upm, e = info.joint(s + 'ForeArm'), w = info.joint(s + 'Hand'), axis = w.clone().sub(e), len = axis.length();
  axis.normalize();
  const c = e.clone().addScaledVector(axis, len * 0.86), vs = info.verts(new RegExp(`^${s}(ForeArm|ForeArmTwist|Hand)$`), 0.5)
    .filter((v) => Math.abs(v.clone().sub(c).dot(axis)) < 0.012 * u).map((v) => { const d = v.clone().sub(c); return d.addScaledVector(axis, -d.dot(axis)); })
    .filter((d) => d.length() < 0.06 * u);
  // Главная ось среза: перебор направлений в плоскости.
  const p = new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize(), q = new THREE.Vector3().crossVectors(axis, p);
  let best = null;
  for (let a = 0; a < Math.PI; a += Math.PI / 36) {
    const d1 = p.clone().multiplyScalar(Math.cos(a)).addScaledVector(q, Math.sin(a)), d2 = new THREE.Vector3().crossVectors(axis, d1);
    const r1 = Math.max(...vs.map((v) => Math.abs(v.dot(d1)))), r2 = Math.max(...vs.map((v) => Math.abs(v.dot(d2))));
    if (!best || r1 * r2 < best[0]) best = [r1 * r2, d1, d2, r1, r2];
  }
  const [, d1, d2, r1, r2] = best, gap = 0.005 * u;
  const geo = new THREE.CylinderGeometry(1, 1, 0.06 * u, 36, 1, true);
  const ring = new THREE.Mesh(geo, cloth('#fff', 0.95));
  ring.matrixAutoUpdate = false;
  ring.matrix.makeBasis(d1.clone().multiplyScalar(r1 + gap), axis.clone(), d2.clone().multiplyScalar(r2 + gap)).setPosition(c);
  const holder = new THREE.Group(); holder.add(ring);
  return attach(info, info.has(s + 'ForeArmTwist') ? s + 'ForeArmTwist' : s + 'ForeArm', holder);
}

// Теннисный рюкзак на спине: корпус с закруглённым верхом, ручка и две лямки к плечам. Передняя стенка на 2,5 см
// дальше самой выпуклой точки спины в его рамке: не протыкает лопатки и на наклоне.
function buildBag(info) {
  const u = info.upm, s2 = info.joint('Spine2');
  const W = 0.3 * u, Hh = 0.42 * u, D = 0.15 * u, yTop = s2.y + 0.11 * u, yBot = yTop - Hh;
  const torso = info.verts(/^(Spine|Spine1|Spine2|Neck|LeftShoulder|RightShoulder)$/, 0.4);
  const back = torso.filter((v) => v.y > yBot - 0.03 * u && v.y < yTop && Math.abs(v.x) < W / 2 + 0.03 * u);
  // Спина наклонная: сумку кладём по ней — наклон по самой выпуклой точке верхней и нижней трети, зазор 1,5 см.
  const zOf = (y0, y1) => Math.min(...back.filter((v) => v.y >= y0 && v.y <= y1).map((v) => v.z));
  const zt = zOf(yTop - Hh / 3, yTop), zb = zOf(yBot - 0.03 * u, yBot + Hh / 3), tilt = Math.atan2(zt - zb, (2 * Hh) / 3);
  const zBack = Math.min(zt, zb) - 0.015 * u, zc = zBack - D / 2, yc = (yTop + yBot) / 2;
  const g = new THREE.Group(), bag = new THREE.Group(), mat = cloth('#fff', 0.7), dark = cloth('#16181b', 0.6);
  dark.userData.keep = true; // молния, ручка и лямки не перекрашиваются
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh - W / 2, D), mat); body.position.set(0, yc - W / 4, zc);
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, D, 32, 1, false, -Math.PI / 2, Math.PI), mat); // полукруглый верх под головку ракетки
  dome.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))); // ось вдоль толщины, полукруг вверх
  dome.position.set(0, yc + Hh / 2 - W / 2, zc);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(W * 0.74, Hh * 0.34, 0.035 * u), mat); pocket.position.set(0, yBot + Hh * 0.22, zc - D / 2 - 0.016 * u);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.006 * u, 0.006 * u), dark); zip.position.set(0, yBot + Hh * 0.37, zc - D / 2 - 0.034 * u);
  bag.add(body, dome, pocket, zip); g.add(bag);
  // Наклон вокруг ближайшей к спине точки: верх или низ касается, второй край идёт по спине.
  const pivot = new THREE.Vector3(0, zt < zb ? yTop : yBot, zBack + D * 0);
  bag.position.copy(pivot); bag.rotation.x = tilt; for (const o of bag.children) o.position.sub(pivot);
  // Лямки: от верха сумки по профилю трапеции у шеи через плечо на грудь — по вершинам самой модели, на 1,2 см над кожей.
  for (const sx of [-1, 1]) {
    const x = sx * 0.1 * u, near = torso.filter((v) => Math.abs(v.x - x) < 0.018 * u && v.y > yTop - 0.05 * u);
    const z0 = Math.min(...near.map((v) => v.z)), z1 = Math.max(...near.map((v) => v.z)), pts = [new THREE.Vector3(x, yTop - 0.05 * u, zBack + 0.02 * u)];
    for (let i = 0; i <= 8; i++) {
      const zb = z0 + ((z1 - z0) * i) / 8, inBin = near.filter((v) => Math.abs(v.z - zb) < (z1 - z0) / 12);
      if (inBin.length) pts.push(new THREE.Vector3(x, Math.max(...inBin.map((v) => v.y)) + 0.012 * u, zb + (i === 0 ? -0.012 : i === 8 ? 0.012 : 0) * u));
    }
    const last = pts.at(-1); pts.push(new THREE.Vector3(x * 1.5, last.y - 0.11 * u, last.z + 0.004 * u)); // к подмышке
    g.add(ribbon(new THREE.CatmullRomCurve3(pts), 0.038 * u, dark));
  }
  g.userData.mat = mat;
  return attach(info, 'Spine2', g);
}

// Плоская лента шириной w вдоль кривой (лямка): ширина поперёк тела (по x), обе стороны видны.
function ribbon(curve, w, mat) {
  const n = 40, pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n), t = curve.getTangent(i / n), side = new THREE.Vector3(1, 0, 0).addScaledVector(t, -t.x).normalize().multiplyScalar(w / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, Object.assign(mat.clone(), { side: THREE.DoubleSide, userData: { keep: true } }));
}

// Одеть игрока по outfit.worn. Меши строятся один раз, дальше меняются цвет и видимость.
export function dress(player, o = outfit) {
  let mesh = null;
  player.wrap.traverse((x) => { if (x.isSkinnedMesh && !mesh) mesh = x; });
  if (!mesh) return;
  let k = player.outfitKit;
  if (!k) {
    const U = { oMask: { value: maskTex() }, oShirt: { value: new THREE.Color() }, oShorts: { value: new THREE.Color() }, oShoes: { value: new THREE.Color() }, oOn: { value: new THREE.Vector3() }, oRef: { value: new THREE.Vector3(REF.shirt, REF.shorts, REF.shoes) }, oCut: { value: new THREE.Vector4() } };
    recolor(mesh, U);
    const info = bindInfo(mesh);
    k = player.outfitKit = { U, ...buildHead(info), wristL: buildWrist(info, 'Left'), wristR: buildWrist(info, 'Right'), bag: buildBag(info) };
  }
  const col = (slot) => ITEM[o.worn[slot]]?.color ?? null, U = k.U;
  for (const [slot, u, i] of [['shirt', U.oShirt, 'x'], ['shorts', U.oShorts, 'y'], ['shoes', U.oShoes, 'z']]) {
    const c = col(slot); U.oOn.value[i] = c ? 1 : 0; if (c) u.value.set(c);
  }
  const paint = (obj, slot) => { const c = col(slot); obj.visible = !!c; if (c) obj.traverse((x) => { if (x.isMesh && !x.material.userData.keep) x.material.color.set(c).multiplyScalar(x.material.userData.shade ?? 1); }); };
  paint(k.cap, 'cap'); paint(k.band, 'band'); paint(k.wristL, 'wrist'); paint(k.wristR, 'wrist'); paint(k.bag, 'bag');
  if (k.cap.visible) k.band.visible = false; // под кепкой повязку не видно — и не торчит
  U.oCut.value.copy(k.cap.userData.cut).setW(k.cap.visible ? 1 : 0);
  k.bagWorn = k.bag.visible;
}
// Сумку видно только на прогулке (и в магазине на примерке).
export function showBag(player, on) { const k = player.outfitKit; if (k) k.bag.visible = on && k.bagWorn; }

// Ракетка в руке: модель Meshy (base) или её перекрас — насыщенные части рамки в цвет, струны и обмотка как были.
export function racketModel(id, models) {
  const x = ITEM[id], base = models[x?.base ?? id];
  if (!base) return null;
  const m = base.clone(true);
  if (!x?.tint) return m;
  const tint = new THREE.Color(x.tint);
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.onBeforeCompile = (sh) => {
      sh.uniforms.rTint = { value: tint };
      sh.fragmentShader = 'uniform vec3 rTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          diffuseColor.rgb = mix(diffuseColor.rgb, rTint * (0.45 + 1.6 * lum), smoothstep(0.08, 0.2, sat)); }`);
    };
    o.material.customProgramCacheKey = () => 'rk' + id;
  });
  return m;
}
