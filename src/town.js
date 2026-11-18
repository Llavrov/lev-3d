// Дорога в долину и городок (решено с Лёвой 18.11): от стоянки клуба серпантином вниз, одна улица альпийских домов,
// в четыре можно зайти — теннисный магазин, кафе, зал, дом Лёвы. Всё кодом, строится лениво после старта (main.js).
// Ходить можно по площадке клуба, по дороге и по улице с домами: bounds и ground — крючки в club.js.
// Точки для других систем (магазин, кафе, станции зала, кровать) — экспорты ниже, в мировых метрах.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PAD, heightAt } from './env-mountains.js';
import { SUN } from './env-sky.js';
import { pushOut } from './club.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clamp = THREE.MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- План (метры) ----------
// Ось дороги [x, z]: со стоянки клуба (x ≈ 51, PATHS в env-club.js) на восток вниз, две петли серпантина, к улице.
const ROAD_PTS = [[54, 27], [60.5, 34], [74, 52], [88, 70], [95, 78], [103, 80.5], [109, 76.5], [110.5, 68], [112.5, 50], [116, 28],
  [120, 14], [122.5, 6.5], [127.5, 1.5], [134, 1.5], [139, 6], [148, 20], [160, 37], [171, 49], [181, 57.5], [189, 60], [196, 60]];
export const ROAD_HALF = 2.8; // асфальт: две полосы по 2,8 м
export const SHOULDER = 3.3; // асфальт и гравийная обочина
export const TOWN_Y = -17.75; // мостовая улицы: чуть выше луга (дно долины тут −18,4…−17,9)
export const STREET = { x0: 196, x1: 264, z0: 54, z1: 66 }; // улица вдоль x, южный ряд фасадом на z0, северный на z1
const FLOOR = 0.15, T = 0.3, H1 = 3.45, H2 = 2.65; // пол внутри выше мостовой, стены, этажи
const DW = 1.4, DH = 2.45; // дверь
const AREA = [PAD.x0 + 1, PAD.z0 + 1, PAD.x1 - 1, PAD.z1 - 1]; // площадка клуба, как в club.js

// Дома: x середины фасада, side 1 — южный ряд (фасад к +z на z0), −1 — северный (к −z на z1); w вдоль улицы, d вглубь.
// kind — куда можно зайти. Солнце слева-сзади (−x, +z): южный ряд на солнце, туда магазин и кафе.
const HOUSES = [
  { x: 206, side: 1, w: 12, d: 10, kind: 'shop', tint: '#f1ece1' }, { x: 222, side: 1, w: 12, d: 10, kind: 'cafe', tint: '#efe2c9' },
  { x: 237, side: 1, w: 10, d: 9, tint: '#e8e4dc' }, { x: 251, side: 1, w: 11, d: 10, tint: '#f0e6d2' },
  { x: 205, side: -1, w: 10, d: 9, tint: '#ebe5d8' }, { x: 219, side: -1, w: 12, d: 10, kind: 'gym', tint: '#e6e9e6' },
  { x: 234, side: -1, w: 11, d: 9, kind: 'home', tint: '#f2eadb' }, { x: 249, side: -1, w: 11, d: 10, tint: '#ece3d3' },
];
const zf = (h) => (h.side > 0 ? STREET.z0 : STREET.z1);
// Местные оси дома: x вдоль фасада, z наружу к улице (дом в z ∈ [−d, 0]), y от мостовой.
const W = (h, lx, lz) => [h.x + h.side * lx, zf(h) + h.side * lz];
const yawW = (h, yl) => wrap(yl + (h.side > 0 ? 0 : Math.PI));
const at = (h, lx, lz, yl, y = FLOOR) => { const [x, z] = W(h, lx, lz); return { pos: [x, TOWN_Y + y, z], yaw: yawW(h, yl) }; };
const boxW = (h, [x0, z0, x1, z1]) => { const a = W(h, x0, z0), b = W(h, x1, z1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
const H = Object.fromEntries(HOUSES.filter((h) => h.kind).map((h) => [h.kind, h]));

// Точки (как SEATS в env.js): pos — где стоит Лёва [x, y, z], yaw — куда лицом (sin yaw, cos yaw), r — радиус действия.
export const shop = { ...at(H.shop, 3, -5.2, Math.PI), r: 1.4 }; // перед прилавком, лицом к нему
export const cafe = { ...at(H.cafe, 2.5, -7.1, Math.PI), r: 1.4 }; // у стойки кафе
// Станции зала: свободные площадки 1,6 × 1,6 м лицом к зеркальной стене. Тренажёры ставит экономика (gym.js).
export const gymStations = [[-3.6, -6.4], [0, -6.4], [3.6, -6.4], [-1.8, -3.2], [1.8, -3.2]].map(([x, z]) => ({ ...at(H.gym, x, z, Math.PI), r: 1 }));
// Кровать в доме Лёвы: pos — середина матраса сверху, yaw — от изголовья к ногам, stand — где встать рядом.
export const bed = { ...at(H.home, 3.7, -7.35, 0, FLOOR + 0.55), stand: at(H.home, 2.25, -7.1, Math.PI / 2).pos, r: 1.3 };
export const TOWN_ENTRY = [194, TOWN_Y, 60]; // начало улицы (конец дороги)

// ---------- Видимая высота склона ----------
// Сетка склона (ring в env-mountains.js) крупная, 5–20 м: между узлами она ниже или выше heightAt на полметра.
// Дорогу кладём по самой сетке — иначе склон торчит сквозь асфальт. Узлы читаем из геометрии внутреннего кольца.
function terrainSampler(scene) {
  const mesh = scene.getObjectByName('mountains')?.children[0], p = mesh?.geometry.attributes.position.array;
  if (!p) return heightAt;
  let nA = 1; while (nA * 3 < p.length && (Math.abs(p[nA * 3]) > 1e-3 || Math.abs(p[nA * 3 + 2] - p[2]) > 1e-3)) nA++;
  const nr = Math.floor(p.length / 3 / (nA + 1)), rs = Array.from({ length: nr }, (_, j) => -p[j * (nA + 1) * 3 + 2]);
  const v = (k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]];
  const bary = (P, a, b, c) => {
    const d = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
    const u = ((b[0] - P[0]) * (c[2] - P[2]) - (c[0] - P[0]) * (b[2] - P[2])) / d, w = ((c[0] - P[0]) * (a[2] - P[2]) - (a[0] - P[0]) * (c[2] - P[2])) / d;
    return u > -1e-4 && w > -1e-4 && u + w < 1 + 1e-4 ? u * a[1] + w * b[1] + (1 - u - w) * c[1] : null;
  };
  return (x, z) => {
    const r = Math.hypot(x, z);
    if (r <= rs[0] || r >= rs[nr - 1]) return heightAt(x, z);
    let lo = 0, hi = nr - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rs[m] <= r) lo = m; else hi = m; }
    let a = Math.atan2(x, -z); if (a < 0) a += Math.PI * 2;
    let t = a; for (let k = 0; k < 5; k++) t -= (t - 0.28 * Math.sin(2 * t) - a) / (1 - 0.56 * Math.cos(2 * t)); // как в ring(): a = t − 0,28 sin 2t
    const i = clamp(Math.floor((t / (Math.PI * 2)) * nA), 0, nA - 1), A = lo * (nA + 1) + i, B = A + nA + 1, P = [x, 0, z];
    return bary(P, v(A), v(A + 1), v(B)) ?? bary(P, v(A + 1), v(B + 1), v(B)) ?? heightAt(x, z);
  };
}

// ---------- Текстуры с холста ----------
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), rng(w * 7 + h));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// Асфальт: 5,6 м поперёк, 18 м вдоль; краевые линии и прерывистая осевая 3 м через 6.
const asphaltTex = () => canvasTex(128, 512, (g, r) => {
  g.fillStyle = '#3d3e3f'; g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 6000; i++) { const v = 40 + r() * 50; g.fillStyle = `rgba(${v},${v},${v + 2},${0.25 + r() * 0.3})`; g.fillRect(r() * 128, r() * 512, 1 + r(), 1 + r()); }
  for (const x of [32, 96]) { const gr = g.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 14, 0, 28, 512); } // накатанные колеи светлее
  g.fillStyle = '#e9e7e0'; g.fillRect(4, 0, 3, 512); g.fillRect(121, 0, 3, 512);
  for (let y = 0; y < 512; y += 256) g.fillRect(62.5, y, 3, 85);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(20,20,20,${0.2 + r() * 0.3})`; g.lineWidth = 0.8; g.beginPath(); let x = r() * 128, y = r() * 512; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 14; y += r() * 18; g.lineTo(x, y); } g.stroke(); } // трещины
}, [1, 1]);
// Брусчатка: 2 × 2 м, камни ~10 × 12 см вразбежку.
const cobbleTex = () => canvasTex(512, 512, (g, r) => {
  g.fillStyle = '#2e2a27'; g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 16; row++) for (let col = -1; col < 21; col++) {
    const x = col * 25.6 + (row % 2) * 12.8 + (r() - 0.5) * 3, y = row * 32 + (r() - 0.5) * 2, v = 0.68 + r() * 0.5, t = r();
    g.fillStyle = `rgb(${(128 + 20 * t) * v | 0},${(122 + 8 * t) * v | 0},${(114 - 6 * t) * v | 0})`;
    g.beginPath(); g.roundRect(x + 1.5, y + 1.5, 22.5, 29, 5); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 4, y + 4, 12, 4);
  }
}, [1, 1]);
const plasterTex = () => canvasTex(256, 256, (g, r) => {
  g.fillStyle = '#efebe3'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${110 + r() * 30},${100 + r() * 30},${90},${r() * 0.07})`; g.fillRect(r() * 256, r() * 256, 2 + r() * 14, 2 + r() * 8); }
}, [2, 1]);
const woodTex = (base = [96, 62, 38]) => canvasTex(128, 128, (g, r) => {
  for (let i = 0; i < 8; i++) { const v = 0.78 + r() * 0.35; g.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`; g.fillRect(i * 16, 0, 16, 128); g.fillStyle = 'rgba(25,14,6,0.55)'; g.fillRect(i * 16, 0, 1.5, 128);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(40,24,12,${0.1 + r() * 0.15})`; g.fillRect(i * 16 + r() * 14, r() * 128, 1, 10 + r() * 50); } }
}, [8, 1]);
const planksTex = () => canvasTex(256, 256, (g, r) => { // пол: доски поперёк, стыки вразбежку
  for (let i = 0; i < 10; i++) for (let x = -r() * 256; x < 256; x += 120 + r() * 140) {
    const v = 0.8 + r() * 0.3; g.fillStyle = `rgb(${150 * v | 0},${108 * v | 0},${70 * v | 0})`; g.fillRect(x, i * 25.6, 256, 25.6);
    g.fillStyle = 'rgba(40,24,12,0.7)'; g.fillRect(x, i * 25.6, 2, 25.6); g.fillRect(x, i * 25.6, 256, 1.5);
  }
}, [9, 9]);
const shingleTex = () => canvasTex(128, 128, (g, r) => {
  g.fillStyle = '#4b4744'; g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) for (let c = -1; c < 9; c++) { const v = 0.75 + r() * 0.4; g.fillStyle = `rgb(${74 * v | 0},${70 * v | 0},${66 * v | 0})`; g.fillRect(c * 16 + (row % 2) * 8 + 1, row * 16 + 1, 14, 14.5); }
}, [5, 4]);
function signTex(text, sub = '', w = 512, h = 192, bg = '#1e3b2f') {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9c38a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#f3ecd9'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * 0.36)}px Georgia, "Times New Roman", serif`; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = `500 ${Math.round(h * 0.15)}px Georgia, serif`; g.fillStyle = '#d9c38a'; g.fillText(sub, w / 2, h * 0.75); }
  });
}

// ---------- Сборка геометрии по материалам ----------
// Всё статичное копим в корзины по материалу и сливаем: на весь город — десяток вызовов отрисовки.
class Buckets {
  constructor() { this.map = new Map(); }
  put(mat, geo, m4) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m4) g.applyMatrix4(m4); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); (this.map.get(mat) ?? this.map.set(mat, []).get(mat)).push(g); }
  build(group, shadow = true) {
    for (const [mat, list] of this.map) {
      const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = shadow && !mat.transparent; m.receiveShadow = true; m.userData.town = true; group.add(m);
    }
  }
}
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n).translate(x, y, z);
const rod = (r, len, ax, x, y, z) => { const g = new THREE.CylinderGeometry(r, r, len, 10); if (ax === 'z') g.rotateX(Math.PI / 2); else if (ax === 'x') g.rotateZ(Math.PI / 2); return g.translate(x, y, z); };
const M4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
const houseM = (h) => M4(h.x, TOWN_Y, zf(h), h.side > 0 ? 0 : Math.PI);

// ---------- Дорога ----------
// Ось — гладкая кривая через ROAD_PTS, отсчёты через 1 м. Высота — по видимому склону: не ниже самой высокой точки
// поперёк (до края насыпи), сглажена вдоль; в конце сходится к мостовой. Насыпь уходит под склон, по крутым местам
// и на внешней стороне петель — отбойник.
function buildRoad(terrain) {
  const curve = new THREE.CatmullRomCurve3(ROAD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.round(curve.getLength()), c = curve.getSpacedPoints(n);
  const S = c.map((p, i) => { const a = c[Math.max(0, i - 1)], b = c[Math.min(n, i + 1)], t = b.clone().sub(a).setY(0).normalize(); return { x: p.x, z: p.z, tx: t.x, tz: t.z, nx: -t.z, nz: t.x }; }); // n — поперёк, вправо по ходу
  const top = S.map((s) => Math.max(...[-4.4, -3.3, -2.2, -1.1, 0, 1.1, 2.2, 3.3, 4.4].map((o) => terrain(s.x + s.nx * o, s.z + s.nz * o))));
  let y = top.map((t, i) => Math.max(...top.slice(Math.max(0, i - 4), i + 5)));
  for (let k = 0; k < 3; k++) y = y.map((_, i) => { const w = y.slice(Math.max(0, i - 6), i + 7); return w.reduce((a, b) => a + b, 0) / w.length; });
  y = y.map((v, i) => Math.max(v, top[i] + 0.05));
  for (let i = 0; i < 14; i++) { const k = n - i, u = 1 - i / 14; y[k] = Math.max(top[k] + 0.04, THREE.MathUtils.lerp(y[k], TOWN_Y, u * u)); } // к мостовой
  S.forEach((s, i) => { s.y = y[i]; });
  // Кривизна и отбойник: где склон за краем падает больше чем на 1,2 м или на внешней стороне петли.
  S.forEach((s, i) => {
    const a = S[Math.max(0, i - 2)], b = S[Math.min(n, i + 2)];
    s.k = (a.tx * b.tz - a.tz * b.tx) / 4; // + — поворот влево
    s.rail = [-1, 1].map((sg) => s.y - terrain(s.x + s.nx * sg * 7, s.z + s.nz * sg * 7) > 1.2 || (Math.abs(s.k) > 0.05 && Math.sign(s.k) === -sg));
  });
  for (const side of [0, 1]) for (let i = 1; i < n; i++) if (S[i].rail[side] && !S[i - 1].rail[side]) { let j = i; while (j <= n && S[j].rail[side]) j++; if (j - i < 6) for (let k = i; k < j; k++) S[k].rail[side] = false; }
  for (let i = 0; i < 8; i++) S[i].rail = [false, false]; // у стоянки и в начале улицы без отбойника
  for (let i = n - 6; i <= n; i++) S[i].rail = [false, false];
  return S;
}

function roadMeshes(S, terrain, group, obs) {
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.92, side: THREE.DoubleSide }); // обе стороны: порядок вершин полос не важен, свет three.js переворачивает сам
  const gravel = new THREE.TextureLoader().load('/tex/gravel.webp'); gravel.colorSpace = THREE.SRGBColorSpace; gravel.wrapS = gravel.wrapT = THREE.RepeatWrapping;
  const verge = new THREE.MeshLambertMaterial({ map: gravel, vertexColors: true, side: THREE.DoubleSide });
  const CH = 40; // куски по 40 м: дальние отсекаются камерой
  for (let i0 = 0; i0 < S.length - 1; i0 += CH) {
    const part = S.slice(i0, Math.min(S.length, i0 + CH + 1)), P = [], U = [], I = [], P2 = [], U2 = [], C2 = [], I2 = [];
    part.forEach((s, k) => {
      const v = (i0 + k) / 18;
      for (const o of [-ROAD_HALF, ROAD_HALF]) { P.push(s.x + s.nx * o, s.y, s.z + s.nz * o); U.push((o + ROAD_HALF) / (2 * ROAD_HALF), v); }
      // Обочина и насыпь: край асфальта → край обочины → низ насыпи под склоном (откос 1:1,6).
      for (const sg of [-1, 1]) {
        const e = SHOULDER, ex = s.x + s.nx * sg * e, ez = s.z + s.nz * sg * e, h = s.y - terrain(ex, ez), w = Math.max(0.7, h * 1.6 + 0.4);
        const ox = s.x + s.nx * sg * (e + w), oz = s.z + s.nz * sg * (e + w);
        for (const [px, py, pz, g] of [[s.x + s.nx * sg * ROAD_HALF, s.y - 0.005, s.z + s.nz * sg * ROAD_HALF, 1], [ex, s.y - 0.03, ez, 0.9], [ox, Math.min(s.y - 0.3, terrain(ox, oz) - 0.3), oz, 0]]) {
          P2.push(px, py, pz); U2.push((sg * Math.hypot(px - s.x, pz - s.z)) / 0.55, (i0 + k) / 0.55); C2.push(0.42 + 0.58 * g * g, 0.5 + 0.47 * g * g, 0.24 + 0.61 * g * g); // у асфальта гравий, к низу насыпи — трава
        }
      }
      if (k) {
        const a = (k - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        const b = (k - 1) * 6, q = (o) => [b + o, b + 6 + o];
        for (const [lo, hi] of [[0, 1], [1, 2]]) { const [a0, a1] = q(lo), [b0, b1] = q(hi); I2.push(a0, b0, a1, b0, b1, a1); } // левая сторона (−1): от асфальта наружу
        for (const [lo, hi] of [[3, 4], [4, 5]]) { const [a0, a1] = q(lo), [b0, b1] = q(hi); I2.push(a0, a1, b0, b0, a1, b1); }
      }
    });
    const g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g1.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g1.setIndex(I); g1.computeVertexNormals();
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); g2.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3)); g2.setIndex(I2); g2.computeVertexNormals();
    for (const [geo, mat] of [[g1, asphalt], [g2, verge]]) { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.town = true; m.name = 'road'; group.add(m); }
  }
  // Отбойник: стойки через 2 м и оцинкованная лента 0,5–0,8 м; столкновения — отрезками по ленте.
  const posts = [], rail = new Buckets(), metal = new THREE.MeshStandardMaterial({ color: '#a7adb0', metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
  for (const side of [0, 1]) {
    const sg = side ? 1 : -1, off = SHOULDER - 0.15;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const P = [], I = [];
        run.forEach((p, k) => { P.push(p.x, p.y + 0.5, p.z, p.x, p.y + 0.82, p.z); if (k) { const a = (k - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); rail.put(metal, g);
        for (let k = 1; k < run.length; k++) obs.segs.push([run[k - 1].x, run[k - 1].z, run[k].x, run[k].z]);
      }
      run = [];
    };
    S.forEach((s, i) => {
      if (!s.rail[side]) return flush();
      const p = { x: s.x + s.nx * sg * off, y: s.y, z: s.z + s.nz * sg * off }; run.push(p);
      if (i % 2 === 0) posts.push(p);
    });
    flush();
  }
  rail.build(group);
  const pm = new THREE.InstancedMesh(box(0.09, 0.95, 0.12, 0, 0.4, 0), metal, posts.length);
  posts.forEach((p, i) => pm.setMatrixAt(i, M4(p.x, p.y, p.z)));
  pm.castShadow = true; pm.userData.town = true; group.add(pm);
}

// ---------- Дома ----------
function houses(group, obs, rooms, doors, mats) {
  const B = new Buckets(), win = [], shut = [], glow = [], flowers = [];
  const r = rng(77);
  for (const h of HOUSES) {
    const m = houseM(h), hw = h.w / 2, enter = !!h.kind;
    const wall = new THREE.MeshLambertMaterial({ map: mats.plaster, color: h.tint });
    B.put(mats.stone, box(h.w + 0.2, 1.4, h.d + 0.2, 0, -0.7 + FLOOR, -h.d / 2), m); // цоколь до луга
    if (enter) {
      // Стены первого этажа с проёмом двери посередине фасада; внутри своя отделка (lining) по виду дома.
      for (const g of [box(h.w, H1, T, 0, H1 / 2, -h.d + T / 2), box(T, H1, h.d - 2 * T, -hw + T / 2, H1 / 2, -h.d / 2), box(T, H1, h.d - 2 * T, hw - T / 2, H1 / 2, -h.d / 2),
        box(hw - DW / 2, H1, T, -(hw + DW / 2) / 2, H1 / 2, -T / 2), box(hw - DW / 2, H1, T, (hw + DW / 2) / 2, H1 / 2, -T / 2), box(DW, H1 - DH, T, 0, (H1 + DH) / 2, -T / 2)]) B.put(wall, g, m);
      for (const b of [[-hw, -h.d, hw, -h.d + T], [-hw, -h.d, -hw + T, 0], [hw - T, -h.d, hw, 0], [-hw, -T, -DW / 2, 0], [DW / 2, -T, hw, 0]]) obs.boxes.push(boxW(h, b));
      rooms.push({ rect: boxW(h, [-hw + T, -h.d + T, hw - T, -T]), y: TOWN_Y + FLOOR, h: H1 - FLOOR, kind: h.kind });
      rooms.push({ rect: boxW(h, [-DW / 2, -T - 0.05, DW / 2, 0.3]), y: TOWN_Y + FLOOR, door: true });
      // Дверь на петлях у левого косяка, открывается внутрь, когда Лёва рядом (update).
      const pivot = new THREE.Group(), [px, pz] = W(h, -DW / 2 + 0.03, -T / 2);
      pivot.position.set(px, TOWN_Y + FLOOR, pz); pivot.rotation.y = yawW(h, 0);
      const leaf = new THREE.Mesh(box(DW - 0.06, DH - FLOOR - 0.02, 0.06, (DW - 0.06) / 2, (DH - FLOOR) / 2, 0), mats.door); leaf.castShadow = true;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mats.brass); knob.position.set(DW - 0.2, 1.0, 0.06);
      pivot.add(leaf, knob); pivot.userData.town = true; group.add(pivot);
      const [dx, dz] = W(h, 0, 0); doors.push({ pivot, x: dx, z: dz, a: 0, base: pivot.rotation.y });
      interior(h, B, obs, mats, glow);
    } else {
      B.put(wall, box(h.w, H1, h.d, 0, H1 / 2, -h.d / 2), m);
      obs.boxes.push(boxW(h, [-hw - 0.1, -h.d - 0.1, hw + 0.1, 0.1]));
      B.put(mats.door, box(1.2, 2.3, 0.08, -hw * 0.35, 1.15 + FLOOR, 0.02), m); // дверь-декор
    }
    // Второй этаж — лиственница, крыша с выносом, фронтон к улице, балкон с геранью.
    B.put(mats.wood, box(h.w, H2, h.d, 0, H1 + H2 / 2, -h.d / 2), m);
    const ov = 0.9, rh = 0.42 * h.w, run = hw + ov, ang = Math.atan2(rh, run), len = Math.hypot(run, rh), topY = H1 + H2;
    for (const s of [-1, 1]) {
      const g = box(len + 0.1, 0.2, h.d + 2 * ov, 0, 0, 0); g.rotateZ(-s * ang); g.translate(s * run / 2, topY + rh / 2 + 0.1, -h.d / 2);
      B.put(mats.roof, g, m);
    }
    B.put(mats.dark, box(0.25, 0.22, h.d + 2 * ov, 0, topY + rh + 0.12, -h.d / 2), m); // конёк
    const e = rh * ov / run + 0.05, tri = new THREE.Shape([[-hw, 0], [hw, 0], [hw, e], [0, rh + 0.05], [-hw, e]].map(([a, b]) => new THREE.Vector2(a, b))); // фронтон до ската
    for (const [zz, ry] of [[0, 0], [-h.d, Math.PI]]) { const g = new THREE.ShapeGeometry(tri); g.rotateY(ry); g.translate(0, topY, zz); B.put(mats.wood, g, m); }
    const bw = h.w * 0.72, by = H1 + 0.05;
    B.put(mats.dark, box(bw, 0.14, 1.1, 0, by, 0.55), m);
    for (let k = 0; k <= Math.round(bw / 0.16); k++) B.put(mats.dark, box(0.07, 0.95, 0.04, -bw / 2 + k * 0.16, by + 0.55, 1.08), m); // балясины
    B.put(mats.dark, box(bw + 0.1, 0.08, 0.1, 0, by + 1.05, 1.08), m);
    for (const s of [-1, 1]) B.put(mats.dark, box(0.04, 0.95, 1.1, s * bw / 2, by + 0.55, 0.55), m);
    B.put(mats.box, box(bw - 0.2, 0.2, 0.22, 0, by + 1.18, 1.12), m); // ящик с геранью на перилах
    for (let k = 0; k < bw * 6; k++) flowers.push([W(h, -bw / 2 + 0.15 + r() * (bw - 0.3), 1.12 + (r() - 0.5) * 0.12), TOWN_Y + by + 1.32 + r() * 0.08]);
    // Окна: рамы, стекло, ставни. Первый этаж — по бокам двери и по торцам, второй — за балконом.
    const wins = [];
    const xs1 = enter ? [-hw * 0.55, hw * 0.55] : [hw * 0.1, hw * 0.55];
    for (const x of xs1) wins.push([x, 1.75, 0, 0]);
    for (const x of [-hw * 0.5, 0, hw * 0.5]) wins.push([x, H1 + 1.25, 0, 0]);
    for (const s of [-1, 1]) for (const z of [-h.d * 0.3, -h.d * 0.7]) { wins.push([s * hw, 1.75, z, s * Math.PI / 2]); wins.push([s * hw, H1 + 1.25, z, s * Math.PI / 2]); }
    for (const [x, y, z, ry] of wins) {
      const wm = houseM(h).multiply(M4(x, y, z, ry));
      win.push(wm); shut.push(wm.clone().multiply(M4(-0.78, 0, 0)), wm.clone().multiply(M4(0.78, 0, 0)));
      if (enter && y < H1) glow.push(wm.clone().multiply(M4(0, 0, -T - 0.035, Math.PI))); // изнутри окно светится дневным светом
    }
  }
  B.build(group);
  const inst = (geo, mat, list, shadow = false) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m4, i) => im.setMatrixAt(i, m4)); im.castShadow = shadow; im.receiveShadow = true; im.userData.town = true; group.add(im); return im; };
  const frame = mergeGeometries([box(1.12, 0.1, 0.1, 0, 0.67, 0.02), box(1.12, 0.1, 0.1, 0, -0.67, 0.02), box(0.1, 1.34, 0.1, -0.56, 0, 0.02), box(0.1, 1.34, 0.1, 0.56, 0, 0.02), box(1.02, 0.05, 0.06, 0, 0.1, 0.02), box(0.05, 1.24, 0.06, 0, 0, 0.02), box(1.3, 0.08, 0.22, 0, -0.73, 0.08)]);
  inst(frame, mats.frame, win, true);
  inst(box(1.02, 1.24, 0.02, 0, 0, 0.0), mats.glass, win);
  inst(box(0.52, 1.3, 0.05, 0, 0, 0.03), mats.shutter, shut);
  if (glow.length) inst(new THREE.PlaneGeometry(1.0, 1.2), mats.daylight, glow);
  const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), mats.flower, flowers.length), c = new THREE.Color();
  flowers.forEach(([[x, z], y], i) => { fl.setMatrixAt(i, M4(x, y, z, r() * 6)); fl.setColorAt(i, c.setHSL(r() < 0.75 ? 0.99 : 0.92, 0.75, 0.42 + r() * 0.12)); });
  fl.userData.town = true; group.add(fl);
}

// ---------- Внутри ----------
// Отделка стен (lining) своим цветом со слабым свечением: окна нарисованы, солнце внутрь не попадает, а комната светлая.
function interior(h, B, obs, mats, glow) {
  const hw = h.w / 2 - T, z0 = -h.d + T, z1 = -T, m = houseM(h), K = { shop: '#f3efe6', cafe: '#e9d6b8', gym: '#d9dcd8', home: '#efe4cf' }[h.kind];
  const lining = new THREE.MeshLambertMaterial({ color: K, emissive: new THREE.Color(K).multiplyScalar(0.32) });
  const L = (g) => B.put(lining, g, m);
  L(box(2 * hw, H1 - FLOOR, 0.02, 0, (H1 + FLOOR) / 2, z0 + 0.01));
  for (const s of [-1, 1]) L(box(0.02, H1 - FLOOR, z1 - z0, s * (hw - 0.01), (H1 + FLOOR) / 2, (z0 + z1) / 2));
  for (const s of [-1, 1]) L(box(hw - DW / 2, H1 - FLOOR, 0.02, s * (hw + DW / 2) / 2, (H1 + FLOOR) / 2, z1 - 0.01));
  const floorMat = h.kind === 'gym' ? mats.rubber : mats.floor;
  B.put(floorMat, box(2 * hw, 0.02, z1 - z0, 0, FLOOR, (z0 + z1) / 2), m); // верх на 1 см выше цоколя
  B.put(mats.ceiling, box(2 * hw, 0.02, z1 - z0, 0, H1 - 0.01, (z0 + z1) / 2), m);
  const ob = (b) => obs.boxes.push(boxW(h, b));
  const P = (mat, g) => B.put(mat, g, m);
  // Лампы под потолком: тёплые плафоны.
  for (const [x, z] of [[-hw / 2, (z0 + z1) / 2], [hw / 2, (z0 + z1) / 2]]) { P(mats.dark, cyl(0.01, 0.01, 0.6, x, H1 - 0.3, z, 4)); P(mats.lamp, cyl(0.12, 0.28, 0.22, x, H1 - 0.68, z, 16)); }
  const y0 = FLOOR;
  if (h.kind === 'shop') {
    P(mats.oak, box(3.2, 1.0, 0.8, 3, y0 + 0.5, -6.6)); P(mats.top, box(3.3, 0.05, 0.9, 3, y0 + 1.02, -6.6)); ob([1.35, -7.05, 4.65, -6.15]);
    P(mats.dark, box(0.4, 0.25, 0.3, 3.8, y0 + 1.17, -6.7)); // касса
    // Стена ракеток: панель на задней стене, ракетки рядами (instanced в racketWall).
    P(mats.oak, box(5.6, 2.1, 0.05, -2.3, y0 + 1.75, z0 + 0.05));
    h.rackets = []; for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) h.rackets.push([-4.8 + k * 0.82, y0 + 1.15 + row * 1.0, z0 + 0.12]);
    // Полки с мячами у левой стены: три доски, банки и корзина мячей.
    for (let k = 0; k < 3; k++) P(mats.oak, box(0.45, 0.04, 3.2, -hw + 0.25, y0 + 0.45 + k * 0.62, -4.5));
    P(mats.oak, box(0.45, 1.75, 0.04, -hw + 0.25, y0 + 0.9, -6.1)); P(mats.oak, box(0.45, 1.75, 0.04, -hw + 0.25, y0 + 0.9, -2.9)); ob([-hw, -6.2, -hw + 0.5, -2.8]);
    h.tubes = []; for (let k = 0; k < 3; k++) for (let j = 0; j < 11; j++) h.tubes.push([-hw + 0.2 + (j % 2) * 0.12, y0 + 0.6 + k * 0.62, -5.9 + j * 0.28]);
    // Вешалка с футболками посередине и стол со сложенной одеждой у правой стены.
    P(mats.chrome, rod(0.015, 2.2, 'z', 0, y0 + 1.5, -3.2)); // перекладина вдоль z
    for (const z of [-4.3, -2.1]) P(mats.chrome, cyl(0.02, 0.02, 1.5, 0, y0 + 0.75, z, 6));
    ob([-0.35, -4.4, 0.35, -2.0]);
    h.shirts = []; for (let k = 0; k < 8; k++) h.shirts.push([0, y0 + 1.15, -4.0 + k * 0.26]);
    P(mats.oak, box(1.6, 0.8, 0.9, 4.2, y0 + 0.4, -2.4)); ob([3.4, -2.85, 5.0, -1.95]);
    h.folded = []; for (let k = 0; k < 6; k++) h.folded.push([3.65 + (k % 3) * 0.55, y0 + 0.84, -2.6 + Math.floor(k / 3) * 0.4]);
    h.balls = []; P(mats.dark, cyl(0.32, 0.26, 0.6, -2.5, y0 + 0.3, -2.0, 14)); ob([-2.85, -2.35, -2.15, -1.65]);
    const rb = rng(3); for (let k = 0; k < 40; k++) { const a = rb() * 6.28, d = Math.sqrt(rb()) * 0.24; h.balls.push([-2.5 + Math.cos(a) * d, y0 + 0.55 + rb() * 0.12, -2.0 + Math.sin(a) * d]); }
  } else if (h.kind === 'cafe') {
    P(mats.oak, box(4.6, 1.05, 0.75, 2.5, y0 + 0.52, -8.45)); P(mats.top, box(4.7, 0.06, 0.85, 2.5, y0 + 1.07, -8.45)); ob([0.15, -8.9, 4.85, -8.0]);
    P(mats.chrome, box(0.6, 0.5, 0.45, 1.2, y0 + 1.35, -8.55)); P(mats.dark, box(0.5, 0.08, 0.3, 1.2, y0 + 1.19, -8.4)); // кофемашина
    P(mats.display, box(1.4, 0.45, 0.6, 3.4, y0 + 1.33, -8.45)); // витрина с выпечкой
    for (let k = 0; k < 6; k++) P(k % 2 ? mats.cake : mats.flowerPot, cyl(0.09, 0.09, 0.08, 2.9 + (k % 3) * 0.45, y0 + 1.16 + Math.floor(k / 3) * 0.2, -8.45, 12));
    for (let k = 0; k < 5; k++) P(mats.cup, cyl(0.04, 0.035, 0.08, 0.3 + k * 0.12, y0 + 1.14, -8.25, 10));
    h.menu = [-1.4, y0 + 2.1, z0 + 0.03];
    h.tables = [[-3.6, -6.5], [-3.6, -3.0], [-0.6, -4.8], [3.2, -3.2]];
    for (const [x, z] of h.tables) obs.circles.push([...W(h, x, z), 0.75]);
  } else if (h.kind === 'gym') {
    P(mats.mirror, box(2 * hw - 1, 2.2, 0.03, 0, y0 + 1.35, z0 + 0.04));
    for (const s of gymStations) { const [x, , z] = s.pos; const lx = (x - h.x) * h.side, lz = (z - zf(h)) * h.side; P(mats.mat, box(1.6, 0.02, 1.6, lx, y0 + 0.01, lz)); }
    P(mats.dark, box(0.5, 0.8, 2.6, -hw + 0.3, y0 + 0.4, -5.0)); ob([-hw, -6.35, -hw + 0.6, -3.65]); // стойка с гантелями
    for (let k = 0; k < 8; k++) { P(mats.iron, rod(0.016, 0.42, 'x', -hw + 0.3, y0 + 0.88, -6.0 + k * 0.28)); for (const s of [-1, 1]) P(mats.iron, rod(0.07, 0.06, 'x', -hw + 0.3 + s * 0.16, y0 + 0.88, -6.0 + k * 0.28)); } // гантели
    P(mats.oak, box(0.06, 2.4, 1.4, hw - 0.05, y0 + 1.3, -5.0)); // шведская стенка
    for (let k = 0; k < 9; k++) P(mats.oak, rod(0.02, 1.35, 'z', hw - 0.12, y0 + 0.3 + k * 0.26, -5.0));
  } else if (h.kind === 'home') {
    const bx = bed.pos[0], bz = bed.pos[2], lx = (bx - h.x) * h.side, lz = (bz - zf(h)) * h.side;
    P(mats.oak, box(1.7, 0.4, 2.15, lx, y0 + 0.2, lz)); P(mats.sheet, box(1.6, 0.18, 2.05, lx, y0 + 0.49, lz));
    P(mats.blanket, box(1.66, 0.06, 1.35, lx, y0 + 0.6, lz + 0.33)); P(mats.oak, box(1.7, 1.0, 0.08, lx, y0 + 0.5, lz - 1.1));
    for (const s of [-1, 1]) P(mats.sheet, box(0.6, 0.12, 0.38, lx + s * 0.38, y0 + 0.64, lz - 0.78));
    ob([lx - 0.85, lz - 1.15, lx + 0.85, lz + 1.07]);
    P(mats.oak, box(0.45, 0.5, 0.45, lx - 1.15, y0 + 0.25, lz - 0.85)); P(mats.lamp, cyl(0.08, 0.13, 0.2, lx - 1.15, y0 + 0.72, lz - 0.85, 12)); ob([lx - 1.4, lz - 1.1, lx - 0.9, lz - 0.6]);
    P(mats.oak, box(1.3, 2.1, 0.6, -hw + 1.0, y0 + 1.05, z0 + 0.32)); ob([-hw, z0, -hw + 1.7, z0 + 0.65]); // шкаф
    P(mats.rug, box(2.4, 0.015, 1.6, 0, y0 + 0.008, -4.2));
    P(mats.oak, box(1.2, 0.05, 0.75, -3.2, y0 + 0.75, -2.2)); for (const [x, z] of [[-3.75, -2.5], [-2.65, -2.5], [-3.75, -1.9], [-2.65, -1.9]]) P(mats.oak, box(0.05, 0.75, 0.05, x, y0 + 0.37, z)); ob([-3.85, -2.6, -2.55, -1.8]);
    P(mats.oak, box(0.45, 0.04, 0.45, -3.2, y0 + 0.46, -1.35)); P(mats.oak, box(0.45, 0.5, 0.04, -3.2, y0 + 0.7, -1.13)); // стул
    h.picture = [0.5, y0 + 1.7, z0 + 0.03];
  }
}

// Ракетки, банки, футболки, столики — инстансами (цвета по экземплярам).
function interiorProps(group, mats) {
  const c = new THREE.Color(), list = (h, key) => (h[key] ?? []).map(([x, y, z]) => { const [wx, wz] = W(h, x, z); return [wx, y + TOWN_Y, wz]; });
  const inst = (geo, mat, pts, rot, color) => {
    if (!pts.length) return;
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach((p, i) => { im.setMatrixAt(i, M4(p[0], p[1], p[2], rot(i))); if (color) im.setColorAt(i, color(i)); });
    im.receiveShadow = true; im.userData.town = true; group.add(im);
  };
  const S = H.shop, ry = (h) => () => yawW(h, 0);
  const head = new THREE.TorusGeometry(0.13, 0.012, 6, 24).scale(0.78, 1, 1).translate(0, 0.36, 0);
  const racket = mergeGeometries([head, box(0.025, 0.2, 0.02, -0.03, 0.15, 0).rotateZ(0.12), box(0.025, 0.2, 0.02, 0.03, 0.15, 0).rotateZ(-0.12), box(0.032, 0.24, 0.028, 0, -0.04, 0)].map((g) => g.index ? g.toNonIndexed() : g).map((g) => { g.deleteAttribute('uv'); return g; }));
  const RC = ['#c62828', '#f2f2f2', '#c6e83a', '#1b1b1b', '#e66a1f', '#1d4f91', '#c62828'];
  inst(racket, mats.paint, list(S, 'rackets'), ry(S), (i) => c.set(RC[i % 7]));
  inst(new THREE.CircleGeometry(0.115, 16).scale(0.78, 1, 1).translate(0, 0.36, 0.001), mats.strings, list(S, 'rackets'), ry(S));
  inst(cyl(0.04, 0.04, 0.26, 0, 0.13, 0, 10), mats.paint, list(S, 'tubes'), () => 0, (i) => c.set(i % 4 ? '#d8d8d4' : '#2d2d2d'));
  inst(new THREE.SphereGeometry(0.034, 10, 8), mats.ball, list(S, 'balls'), () => 0);
  const SC = ['#ffffff', '#1e3b2f', '#c62828', '#9fd8ff', '#f2c14e', '#ffffff', '#3a3a3a', '#d6ef3c'];
  inst(shirt(), mats.paint, list(S, 'shirts'), () => yawW(S, 0) + 0.15, (i) => c.set(SC[i % 8]));
  inst(box(0.4, 0.1, 0.32), mats.paint, list(S, 'folded'), ry(S), (i) => c.set(SC[(i + 3) % 8]));
  // Кафе: столики со стульями.
  const C = H.cafe, tables = (C.tables ?? []).map(([x, z]) => { const [wx, wz] = W(C, x, z); return [wx, TOWN_Y + FLOOR, wz]; });
  const table = mergeGeometries([cyl(0.42, 0.42, 0.04, 0, 0.74, 0, 20), cyl(0.03, 0.03, 0.72, 0, 0.37, 0, 8), cyl(0.22, 0.24, 0.03, 0, 0.015, 0, 16)].map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  inst(table, mats.iron, tables, () => 0);
  inst(cyl(0.4, 0.4, 0.02, 0, 0.765, 0, 20), mats.top, tables, () => 0);
  const chair = mergeGeometries([box(0.42, 0.04, 0.4, 0, 0.46, 0), box(0.42, 0.42, 0.04, 0, 0.7, -0.19), ...[[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]].map(([x, z]) => box(0.035, 0.46, 0.035, x, 0.23, z))].map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  const chairs = []; tables.forEach(([x, y, z], k) => { for (const s of [-1, 1]) chairs.push([x + s * 0.62, y, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, k]); });
  inst(chair, mats.oak, chairs, (i) => chairs[i][3]);
  inst(cyl(0.008, 0.008, 1.1, 0, 0.55, 0, 4).translate(0, 1.85, 0), mats.dark, tables, () => 0); // шнуры ламп над столами
  inst(cyl(0.08, 0.2, 0.18, 0, 2.3, 0, 14), mats.lamp, tables, () => 0);
  // Доска меню в кафе и картина в доме.
  for (const [h, key, tex, w, hh] of [[C, 'menu', signTex('Кофе · Чай', 'Штрудель · Сэндвичи', 512, 256, '#22261f'), 1.6, 0.8], [H.home, 'picture', mountainPicture(), 1.2, 0.8]]) {
    if (!h[key]) continue;
    const [x, y, z] = h[key], [wx, wz] = W(h, x, z), p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: tex }));
    p.position.set(wx, y + TOWN_Y, wz); p.rotation.y = yawW(h, 0); p.userData.town = true; group.add(p);
  }
}
// Окно изнутри: дневной свет за переплётом.
const windowTex = () => canvasTex(64, 80, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#cfe2f0'); gr.addColorStop(1, '#eef4f6'); g.fillStyle = gr; g.fillRect(0, 0, 64, 80);
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 76, 64, 4); g.fillRect(0, 0, 4, 80); g.fillRect(60, 0, 4, 80); g.fillRect(30, 0, 4, 80); g.fillRect(0, 34, 64, 4);
});
// Футболка на вешалке: силуэт с рукавами, тонкий.
const shirt = () => { const sh = new THREE.Shape([[-0.2, 0], [0.2, 0], [0.2, 0.42], [0.3, 0.38], [0.35, 0.5], [0.12, 0.6], [0, 0.56], [-0.12, 0.6], [-0.35, 0.5], [-0.3, 0.38], [-0.2, 0.42]].map(([x, y]) => new THREE.Vector2(x, y))); return new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }).translate(0, -0.3, -0.015); };
const mountainPicture = () => canvasTex(384, 256, (g) => {
  g.fillStyle = '#5a3b22'; g.fillRect(0, 0, 384, 256); g.fillStyle = '#bcd4e6'; g.fillRect(14, 14, 356, 228);
  g.fillStyle = '#7d8a98'; g.beginPath(); g.moveTo(14, 200); g.lineTo(120, 70); g.lineTo(190, 150); g.lineTo(260, 60); g.lineTo(370, 190); g.lineTo(370, 242); g.lineTo(14, 242); g.fill();
  g.fillStyle = '#f4f6f8'; g.beginPath(); g.moveTo(120, 70); g.lineTo(140, 95); g.lineTo(100, 95); g.fill(); g.beginPath(); g.moveTo(260, 60); g.lineTo(285, 92); g.lineTo(238, 92); g.fill();
  g.fillStyle = '#4f6b34'; g.fillRect(14, 200, 356, 42); g.fillStyle = '#b5532b'; g.fillRect(160, 205, 64, 26); g.fillStyle = '#f2f2ee'; g.fillRect(164, 209, 56, 18); // корт
});

// ---------- Улица ----------
function street(group, obs, rooms, mats) {
  const { x0, x1, z0, z1 } = STREET;
  const cob = cobbleTex(); cob.repeat.set((x1 - x0) / 3, (z1 - z0) / 3); // камни ~15 × 18 см
  const top = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: cob, roughness: 0.85 }));
  top.position.set((x0 + x1) / 2, TOWN_Y, (z0 + z1) / 2); top.receiveShadow = true; top.userData.town = true; group.add(top); // асфальт дороги кончается на x0
  const base = new THREE.Mesh(box(x1 - x0 + 0.2, 1.2, z1 - z0 + 0.2, 0, -0.61, 0), mats.stone);
  base.position.copy(top.position); base.receiveShadow = true; base.userData.town = true; group.add(base);
  rooms.push({ rect: [x0 - 0.3, z0 + 0.05, x1, z1 - 0.05], y: TOWN_Y, street: true });
  // Конец улицы: каменная стенка, за ней луг и горы.
  const wall = new THREE.Mesh(box(0.5, 0.8, z1 - z0, x1 + 0.25, TOWN_Y + 0.4, (z0 + z1) / 2), mats.stone); wall.castShadow = wall.receiveShadow = true; wall.userData.town = true; group.add(wall);
  obs.boxes.push([x1, z0, x1 + 0.5, z1]);
  // Фонари вдоль улицы — тот же вид, что в клубе (env-club.js lamps), по обе стороны вразбежку.
  const LAMPS = [[199, 55.3], [213.8, 64.7], [229.5, 55.3], [242, 64.7], [258, 55.3]];
  const post = mergeGeometries([cyl(0.11, 0.13, 0.35, 0, 0.175, 0), cyl(0.045, 0.05, 2.5, 0, 1.6, 0, 10), cyl(0.09, 0.07, 0.06, 0, 2.86, 0), new THREE.ConeGeometry(0.2, 0.16, 4, 1).rotateY(Math.PI / 4).translate(0, 3.27, 0)].map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  const a = new THREE.InstancedMesh(post, mats.iron, LAMPS.length), b = new THREE.InstancedMesh(cyl(0.15, 0.11, 0.3, 0, 3.04, 0, 4).rotateY(Math.PI / 4), mats.lantern, LAMPS.length);
  LAMPS.forEach(([x, z], i) => { a.setMatrixAt(i, M4(x, TOWN_Y, z)); b.setMatrixAt(i, M4(x, TOWN_Y, z)); obs.circles.push([x, z, 0.15]); });
  a.castShadow = true; a.userData.town = b.userData.town = true; group.add(a, b);
  // Вывески: доска над дверью и кованый кронштейн с табличкой поперёк улицы.
  for (const [h, text, sub] of [[H.shop, 'Теннис', 'ракетки · мячи · одежда'], [H.cafe, 'Кафе', 'кофе · выпечка'], [H.gym, 'Спортзал', '']]) {
    const t = signTex(text, sub), m = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15 });
    const [fx, fz] = W(h, 0, 0.04), fas = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), m);
    fas.position.set(fx, TOWN_Y + DH + 0.62, fz); fas.rotation.y = yawW(h, 0); fas.userData.town = true; group.add(fas);
    const [bx, bz] = W(h, -DW / 2 - 1.3, 0.75), hang = new THREE.Group(); // табличка с двух сторон, надпись не зеркальная
    for (const ry of [0, Math.PI]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), m); p.rotation.y = ry; p.position.z = ry ? -0.012 : 0.012; hang.add(p); }
    hang.add(new THREE.Mesh(box(1.14, 0.46, 0.02), mats.dark));
    hang.position.set(bx, TOWN_Y + 2.75, bz); hang.rotation.y = yawW(h, Math.PI / 2); hang.userData.town = true; group.add(hang);
    const arm = new THREE.Mesh(box(0.03, 0.03, 0.95), mats.iron); const [ax, az] = W(h, -DW / 2 - 1.3, 0.48); arm.position.set(ax, TOWN_Y + 3.0, az); arm.rotation.y = yawW(h, 0); arm.userData.town = true; group.add(arm);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshLambertMaterial({ map: signTex('Лёва', '', 256, 96, '#2c4a6b') }));
  const [px, pz] = W(H.home, DW / 2 + 0.45, 0.02); plate.position.set(px, TOWN_Y + 1.55, pz); plate.rotation.y = yawW(H.home, 0); plate.userData.town = true; group.add(plate);
}

// Скамейки, кадки с геранью и фонтан — те же модели Meshy, что в клубе (кэш браузера, файлы уже скачаны).
const PROPS = { bench: [0.85, [[217.5, 64.7, Math.PI], [245.5, 55.3, 0], [232, 55.3, 0]]], planter: [0.8, [[203.6, 54.6, 0.3], [208.4, 54.6, 1.5], [219.6, 54.6, 2.2], [224.4, 54.6, 0.8], [221.4, 65.4, 1.1], [231.6, 65.4, 2.6]]], fountain: [1.5, [[260.5, 60, Math.PI / 2]]] };
function props(group, obs) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const [name, [h, spots]] of Object.entries(PROPS)) {
    loader.load(`/models/env/${name}.glb`, ({ scene: m }) => {
      const bb = new THREE.Box3().setFromObject(m), k = h / (bb.max.y - bb.min.y), c = bb.getCenter(new THREE.Vector3());
      m.scale.setScalar(k); m.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = name !== 'planter'; o.receiveShadow = true; } });
      for (const [x, z, rot] of spots) { const g = new THREE.Group(); g.position.set(x, TOWN_Y, z); g.rotation.y = rot; g.add(m.clone()); g.userData.town = true; group.add(g); }
    });
    for (const [x, z, rot] of spots) { // столкновения по размеру, не дожидаясь моделей
      if (name === 'planter') { obs.circles.push([x, z, 0.32]); continue; }
      const [a, b] = name === 'bench' ? [0.8, 0.3] : [0.85, 0.5], c = Math.abs(Math.cos(rot)) > 0.5;
      obs.boxes.push(c ? [x - a, z - b, x + a, z + b] : [x - b, z - a, x + b, z + a]);
    }
  }
}

function materials() {
  const L = (o) => new THREE.MeshLambertMaterial(o), Sd = (o) => new THREE.MeshStandardMaterial(o);
  return {
    plaster: plasterTex(), stone: L({ color: '#8e8a83' }), wood: L({ map: woodTex() }), roof: L({ map: shingleTex() }), dark: L({ color: '#4a2f1c' }),
    box: L({ color: '#6b4428' }), door: L({ map: woodTex([110, 70, 40]) }), brass: Sd({ color: '#c9a24a', metalness: 0.8, roughness: 0.3 }),
    frame: L({ color: '#f4f1ea' }), glass: Sd({ color: '#26303a', metalness: 0.2, roughness: 0.08 }), shutter: L({ color: '#2f5a3a' }),
    daylight: new THREE.MeshBasicMaterial({ map: windowTex() }), flower: L({ color: '#ffffff' }),
    floor: L({ map: planksTex() }), rubber: L({ color: '#45494c', emissive: '#121416' }), ceiling: L({ color: '#b08a60', emissive: '#4a3826' }),
    lamp: L({ color: '#fff2d8', emissive: '#ffd9a0', emissiveIntensity: 0.9 }), lantern: Sd({ color: '#77735f', roughness: 0.15, emissive: '#ffd9a0', emissiveIntensity: 0.12 }),
    oak: L({ color: '#9b7048', emissive: '#2a1c10' }), top: L({ color: '#d8cdb8', emissive: '#30291f' }), chrome: Sd({ color: '#d8dcdf', metalness: 0.9, roughness: 0.2 }),
    iron: Sd({ color: '#25302b', metalness: 0.6, roughness: 0.45 }), paint: L({ color: '#ffffff', emissive: '#202020' }), strings: L({ color: '#ece6d4', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    ball: L({ color: '#d6ef3c', emissive: '#2a3008' }), cup: L({ color: '#ffffff', emissive: '#303030' }), cake: L({ color: '#c98a4a', emissive: '#2a1a0a' }), flowerPot: L({ color: '#e9c0c8', emissive: '#2a1a1c' }),
    mirror: new THREE.MeshBasicMaterial({ map: canvasTex(4, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#c9d4da'); gr.addColorStop(0.55, '#e9eef0'); gr.addColorStop(1, '#aab6bd'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); }) }), display: Sd({ color: '#d8ecf2', transparent: true, opacity: 0.3, roughness: 0.05 }), mat: L({ color: '#3d4245' }), sheet: L({ color: '#f4f2ec', emissive: '#2c2b28' }), // зеркало без отражений: светлый градиент
    blanket: L({ color: '#5b7896', emissive: '#141c24' }), rug: L({ color: '#9c3b2e', emissive: '#200c09' }),
  };
}

// ---------- Город целиком ----------
export class Town {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'town'; this.group.userData.town = true;
    this.terrain = terrainSampler(scene);
    this.obs = { segs: [], circles: [], boxes: [] };
    this.rooms = []; this.doors = [];
    this.points = { shop, cafe, gymStations, bed }; // те же точки, что в экспортах: для систем, которые получают город готовым
    const mats = materials();
    this.road = buildRoad(this.terrain);
    roadMeshes(this.road, this.terrain, this.group, this.obs);
    street(this.group, this.obs, this.rooms, mats);
    houses(this.group, this.obs, this.rooms, this.doors, mats);
    interiorProps(this.group, mats);
    props(this.group, this.obs);
    scene.add(this.group);
    this.scene = scene;
    this.clear(); // деревья, камни и дома долины на дороге и улице прячем; лес и деревья догружаются — повторяем
    let n = 0; const again = () => { if (++n < 6) setTimeout(() => { this.clear(); again(); }, 2000); }; again();
    this.sun = null; scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) this.sun = o; });
  }

  // Ближайшая точка оси дороги: d — сбоку от оси (м, + влево), y — высота асфальта, s — номер отсчёта.
  roadAt(x, z) {
    const S = this.road; let best = 0, bd = Infinity;
    for (let i = 0; i < S.length; i += 3) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    for (let i = Math.max(0, best - 3); i <= Math.min(S.length - 1, best + 3); i++) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    const s = S[best], dx = x - s.x, dz = z - s.z;
    return { i: best, d: dx * s.nx + dz * s.nz, along: dx * s.tx + dz * s.tz, y: s.y, s };
  }
  inPad(x, z, m = 0) { return x >= AREA[0] - m && x <= AREA[2] + m && z >= AREA[1] - m && z <= AREA[3] + m; }
  room(x, z) { return this.rooms.find(({ rect: [a, b, c, d] }) => x >= a && x <= c && z >= b && z <= d) ?? null; }
  // Высота под ногами вне площадки клуба: дом, улица, дорога, иначе склон. null — на площадке (решает club.ground).
  ground(x, z) {
    const r = this.room(x, z); if (r) return r.y;
    if (this.inPad(x, z)) return null;
    const q = this.roadAt(x, z);
    if (Math.abs(q.d) <= SHOULDER + 0.5 && Math.abs(q.along) < 1.5) return q.y;
    return this.terrain(x, z);
  }
  // Где можно быть: площадка клуба, полоса дороги (half — полуширина для центра тела или машины), улица и дома.
  // Вне — ставим в ближайшую разрешённую точку. Препятствия клуба — только у площадки, свои — везде.
  bounds(p, r, club, half = SHOULDER - 0.25) {
    let hit = false;
    if (club && this.inPad(p.x, p.z, 3)) hit = pushOut(p, r, { ...club, area: null });
    hit = pushOut(p, r, this.obs) || hit;
    hit = this.extra?.(p, r) || hit; // стоящие велосипед и машина (vehicle.js)
    const q = this.roadAt(p.x, p.z);
    if (this.inPad(p.x, p.z) || (Math.abs(q.d) <= half && Math.abs(q.along) < 1.5) || this.room(p.x, p.z)) return hit;
    const c = [[clamp(p.x, AREA[0], AREA[2]), clamp(p.z, AREA[1], AREA[3])], [q.s.x + q.s.nx * clamp(q.d, -half, half), q.s.z + q.s.nz * clamp(q.d, -half, half)],
      ...this.rooms.map(({ rect: [a, b, cc, d] }) => [clamp(p.x, a + 0.01, cc - 0.01), clamp(p.z, b + 0.01, d - 0.01)])];
    let best = c[0], bd = Infinity; for (const v of c) { const d = (v[0] - p.x) ** 2 + (v[1] - p.z) ** 2; if (d < bd) { bd = d; best = v; } }
    p.x = best[0]; p.z = best[1];
    return true;
  }
  // Камера на прогулке внутри дома: не дальше стен и ниже потолка.
  camClamp(eye, at) {
    const r = this.room(at.x, at.z); if (!r || r.street || r.door) return;
    const [a, b, c, d] = r.rect;
    eye.x = clamp(eye.x, a + 0.35, c - 0.35); eye.z = clamp(eye.z, b + 0.35, d - 0.35); eye.y = Math.min(eye.y, TOWN_Y + H1 - 0.3);
  }
  // Каждый кадр прогулки: двери открываются перед Лёвой, тень солнца едет за ним, когда он далеко от корта.
  update(dt, pos) {
    for (const d of this.doors) {
      const want = Math.hypot(pos.x - d.x, pos.z - d.z) < 2.6 ? 1 : 0;
      d.a += (want - d.a) * Math.min(1, dt * 4); d.pivot.rotation.y = d.base + 1.7 * d.a; // створка уходит внутрь дома
    }
    if (this.sun) {
      const far = Math.hypot(pos.x, pos.z) > 70, t = far ? new THREE.Vector3(Math.round(pos.x * 2) / 2, Math.round(pos.y), Math.round(pos.z * 2) / 2) : new THREE.Vector3();
      if (!this.sun.target.position.equals(t)) { this.sun.target.position.copy(t); this.sun.position.copy(SUN).multiplyScalar(40).add(t); this.sun.target.updateMatrixWorld(); }
    }
  }
  // Что из чужого стоит на дороге или улице (центр с запасом m): деревья, камни, кусты, дома долины, лес.
  covers(x, z, m) {
    if (x > STREET.x0 - 4 - m && x < STREET.x1 + 3 + m && z > STREET.z0 - 12 - m && z < STREET.z1 + 12 + m) return true;
    if (this.inPad(x, z)) return false;
    const q = this.roadAt(x, z); return Math.abs(q.d) < SHOULDER + 2 + m && Math.abs(q.along) < 2 + m;
  }
  clear() {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.scene.updateMatrixWorld();
    // Части одного дерева (ствол, крона) — разные инстансы в одной точке: запас берём наибольший по точке, иначе
    // крона пропала бы, а ствол остался.
    const inst = [], reach = new Map(), key = () => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    const visit = (o) => {
      if (o.userData.town) return;
      if (o.isInstancedMesh) {
        o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox, R = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
        inst.push(o);
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld).decompose(p, q, s); reach.set(key(), Math.max(reach.get(key()) ?? 0, R * Math.max(s.x, s.z) * 0.7)); }
      } else if (o.name === 'forest') { // карточки елей: по 4 вершины, сводим в точку
        const pa = o.geometry.attributes.position, a = pa.array; let hit = 0;
        for (let k = 0; k < pa.count; k += 4) {
          const cx = (a[k * 3] + a[k * 3 + 3]) / 2, cz = (a[k * 3 + 2] + a[k * 3 + 5]) / 2, w = Math.hypot(a[k * 3] - a[k * 3 + 3], a[k * 3 + 2] - a[k * 3 + 5]);
          if (w > 0 && this.covers(cx, cz, w / 2)) { for (let j = 0; j < 4; j++) a.set([cx, a[k * 3 + 1], cz], (k + j) * 3); hit++; }
        }
        if (hit) pa.needsUpdate = true;
      }
      for (const c of o.children) visit(c);
    };
    visit(this.scene);
    for (const o of inst) {
      let hit = 0;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld).decompose(p, q, s); if (s.x > 0 && this.covers(p.x, p.z, reach.get(key()))) { o.setMatrixAt(i, zero); hit++; } }
      if (hit) { o.instanceMatrix.needsUpdate = true; o.boundingSphere = null; }
    }
  }
}
