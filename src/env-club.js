// Клуб вокруг корта: дорожки из гравия, клумбы и некошеная трава у забора — картой на земле (clubMap, её читает шейдер
// газона в env-mountains.js); пучки травы и цветы инстансами, живая изгородь, кусты, камни, фонари, табличка, флаг.
// Площадка клуба ровная (PAD, y = 0): по дорожкам и газону можно ходить, невидимых стен нет — изгородь стоит только
// вдоль забора, где и так не пройти.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, padDist, vnoise, PAD } from './env-mountains.js';

const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches; // телефон: меньше травы
const loader = new THREE.TextureLoader();
const tex = (url) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const FX = 9.145, FZ = 19.885; // ограждение корта

// ---------- План клуба (метры) ----------
// Дорожки: [ширина, [[x, z], …]]. От калитки к дорожке вдоль корта, по ней на террасу (z −19) и назад, к входу в клуб.
export const PATHS = [
  [1.2, [[9.2, 3.99], [10.85, 3.99]]],
  [1.4, [[10.85, 10.2], [10.85, -19.3]]],
  [1.5, [[10.85, 10.2], [11.4, 15.8], [10.3, 21.6], [6, 24.7], [-2, 25.7], [-12, 25.3], [-23, 23.6]]],
];
// Клумбы: [x, z, полуось x, полуось z]. У торца шале, у флагштока, у таблички, круглая на газоне справа.
const BEDS = [[23.2, -18.2, 8, 0.75], [15.2, -16.8, 1.0, 1.0], [13.7, 20.9, 1.7, 0.8], [17.2, 4.5, 1.8, 1.8]];
// Живая изгородь граба вдоль забора снаружи: [x0, z0, x1, z1, высота, толщина].
const HEDGES = [[-10.05, -19.4, -10.05, 19.4, 1.35, 0.75], [-9.7, -20.8, 7.4, -20.8, 1.35, 0.75]];
// Кусты: [x, z, размер]. У шале, у таблички, группами на газоне, по бровке холма.
const BUSHES = [[32.9, -18.1, 1.25], [32.8, -35.9, 1.1], [15.2, -36.4, 0.95], [15.6, 22.3, 0.8], [17.9, 2.2, 1.2], [19.4, 5.1, 0.9], [-24.2, 21.4, 1.3],
  [-21, 27.3, 1.0], [-12.6, -22.6, 1.1], [-4.2, -30.5, 1.4], [3.8, -33.2, 1.1], [-15.5, -36.2, 1.3], [8.4, -41.5, 1.2], [16.5, -15.6, 0.6], [26, 14, 1.4], [28.4, 16.2, 1.0]];
// Камни: [x, z, размер]. Валуны по бровке холма и у входа.
const ROCKS = [[-8, -47.5, 1.4], [-6.5, -48.6, 0.8], [12.3, -49.3, 1.1], [25.4, -46.8, 1.8], [-26.4, -30.2, 1.2], [-27.8, -28.5, 0.7], [38.4, -10.2, 1.5],
  [36.6, 2.2, 0.9], [-28.6, 10.4, 1.3], [20.4, 30.8, 1.0], [-14.2, 33.8, 1.2], [14.9, 21.4, 0.45], [12.6, 20.1, 0.32], [-17.6, 22.2, 0.6]];
// Фонари вдоль дорожек: [x, z].
const LAMPS = [[11.75, -14.5], [11.75, -1.4], [11.95, 13.6], [3, 26.3], [-9.5, 26.6]];
const FLAG = [15.2, -16.8], SIGN = [13.7, 21.1, -2.7]; // табличка лицом к корту и к идущим от входа
const BENCHES_OUT = [[12.3, -6.5], [12.3, 9], [-4.5, 21.7]]; // скамейки зрителей (env.js): вокруг них трава гуще

// ---------- Карта клуба на земле ----------
// R — гравий дорожек, G — клумбы, B — некошеная трава (у забора, изгороди, стволов, камней). Квадрат 100 м, 10 см на пиксель.
export const MAP = { x0: -44, z0: -64, size: 100, n: 1024 };
function drawMap(trees) {
  const c = document.createElement('canvas'); c.width = c.height = MAP.n;
  const g = c.getContext('2d'), k = MAP.n / MAP.size;
  g.fillStyle = '#000'; g.fillRect(0, 0, MAP.n, MAP.n);
  g.setTransform(k, 0, 0, k, -MAP.x0 * k, -MAP.z0 * k); // рисуем в метрах: x вправо, z вниз
  g.globalCompositeOperation = 'lighter'; g.lineCap = g.lineJoin = 'round';
  const B = (a) => `rgba(0,0,255,${a})`, dot = (x, z, r, a) => { g.fillStyle = B(a); g.beginPath(); g.arc(x, z, r, 0, 7); g.fill(); };
  const rect = (o, w, a) => { g.strokeStyle = B(a); g.lineWidth = w; g.strokeRect(-FX - o, -FZ - o, 2 * (FX + o), 2 * (FZ + o)); };
  rect(0.6, 0.9, 1); rect(1.1, 1.8, 0.4);
  for (const [x0, z0, x1, z1, , w] of HEDGES) { g.strokeStyle = B(0.9); g.lineWidth = w + 0.8; g.beginPath(); g.moveTo(x0, z0); g.lineTo(x1, z1); g.stroke(); }
  for (const t of trees) dot(t[1], t[2], 1.1 * t[3], 0.8);
  for (const [x, z, s] of [...ROCKS, ...BUSHES]) dot(x, z, s * 1.1, 0.7);
  for (const [x, z] of [...LAMPS, ...BENCHES_OUT, FLAG, SIGN]) dot(x, z, 0.75, 0.6);
  g.fillStyle = 'rgb(0,255,0)';
  for (const [x, z, rx, rz] of BEDS) { g.beginPath(); g.ellipse(x, z, rx, rz, 0, 0, 7); g.fill(); }
  g.strokeStyle = 'rgb(255,0,0)';
  for (const [w, pts] of PATHS) { g.lineWidth = w; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke(); }
  const data = g.getImageData(0, 0, MAP.n, MAP.n).data;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = 8;
  // Та же карта в JS: где трава гуще и куда не ставить пучки (дорожки, клумбы).
  const at = (x, z) => {
    const i = Math.floor((x - MAP.x0) * k), j = Math.floor((z - MAP.z0) * k);
    if (i < 0 || j < 0 || i >= MAP.n || j >= MAP.n) return [0, 0, 0];
    const o = (j * MAP.n + i) * 4; return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
  };
  return { tex: t, at };
}

// ---------- Пучки травы и цветы ----------
// Три пересечённые карточки с травинками с холста. Нормаль у всех вершин вверх: пучок освещён как газон под ним,
// а не горит или темнеет боком. Верх качается ветром. Цветы — те же карточки, лепестки красятся своим цветом.
function bladeTexture(flowers) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rng(flowers ? 5 : 3);
  const PAL = ['#3c5222', '#4a6328', '#55702c', '#617a33', '#6c8238', '#7d8a40', '#8f9148'];
  for (let i = 0; i < (flowers ? 50 : 120); i++) { // травинки: тонкие, сужаются к кончику, гнутся в стороны
    const x0 = N / 2 + (r() - 0.5) * N * 0.55, top = N * (0.05 + r() * (flowers ? 0.5 : 0.55)), x1 = x0 + (r() - 0.5) * N * 0.45, w = 1.2 + r() * 2.2;
    const gr = g.createLinearGradient(0, N, 0, top), col = PAL[Math.floor(r() * PAL.length)];
    gr.addColorStop(0, '#1f2d12'); gr.addColorStop(0.35, col); gr.addColorStop(1, r() < 0.2 ? '#a99f5c' : col);
    const cx = (x0 + x1) / 2 + (r() - 0.5) * 20, cy = (N + top) / 2;
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - w, N); g.quadraticCurveTo(cx - w * 0.6, cy, x1, top); g.quadraticCurveTo(cx + w * 0.6, cy, x0 + w, N); g.fill();
  }
  if (flowers) for (let i = 0; i < 11; i++) { // соцветия: белые, их тон задаёт инстанс
    const x = N * (0.15 + r() * 0.7), y = N * (0.08 + r() * 0.4), rr = 5 + r() * 3;
    for (let p = 0; p < 6; p++) { const a = (p / 6) * 6.283 + r(); g.fillStyle = '#f4f2ee'; g.beginPath(); g.ellipse(x + Math.cos(a) * rr, y + Math.sin(a) * rr, rr * 0.75, rr * 0.5, a, 0, 7); g.fill(); }
    g.fillStyle = '#d9c060'; g.beginPath(); g.arc(x, y, rr * 0.45, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Ветка листвы для кустов и бахромы изгороди: листья граба разного тона на прозрачном, к краю реже.
function leafTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rng(9), PAL = ['#2f4a1b', '#3b5a22', '#476a27', '#52772d', '#5f8433', '#3a5520'];
  for (let i = 0; i < 130; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * N * 0.43, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, L = 11 + r() * 8, rot = r() * 6.283;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = PAL[Math.floor(r() * PAL.length)]; g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * 0.55, L, 0); g.quadraticCurveTo(0, L * 0.55, -L, 0); g.fill();
    g.strokeStyle = 'rgba(160,190,110,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L * 0.8, 0); g.lineTo(L * 0.8, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function tuftGeometry(w, h) {
  const parts = [0, 1, 2].map((i) => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0).rotateY((i * Math.PI) / 3));
  const g = mergeGeometries(parts), n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
function tuftMaterial(map, time, flowers) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.time = time;
    sh.vertexShader = 'uniform float time;\nattribute vec3 tint; varying vec3 vTint;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vTint = tint;
      vec3 io = instanceMatrix[3].xyz; float hh = uv.y * uv.y;
      transformed.xz += vec2(sin(time * 1.9 + io.x * .7 + io.z * .3), cos(time * 1.4 + io.z * .6 + io.x * .2)) * .07 * hh;`);
    sh.fragmentShader = 'varying vec3 vTint;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${flowers ? 'float bl = smoothstep(.55, .8, min(diffuseColor.r, diffuseColor.b)); diffuseColor.rgb = mix(diffuseColor.rgb, vTint * diffuseColor.g, bl);' : 'diffuseColor.rgb *= vTint;'}
        diffuseColor.rgb *= .55 + .45 * vMapUv.y; // у земли темнее: туда не достаёт свет`);
  };
  return m;
}
function tufts(map, time) {
  const r = rng(11), grass = [], flowers = [];
  const free = (x, z) => {
    if (Math.abs(x) < FX + 0.15 && Math.abs(z) < FZ + 0.15) return false; // корт
    if (x > 10.1 && x < 32 && z > -35.2 && z < -18.9) return false; // терраса и шале
    const [p, bed] = map.at(x, z); return p < 0.2 && bed < 0.3;
  };
  const put = (list, x, z, s) => { if (free(x, z)) list.push([x, heightAt(x, z) + 0.02, z, s, r() * 6.28]); };
  const N = COARSE ? 0.35 : 1;
  // Вдоль забора снаружи, кроме калитки и стороны с дорожкой — там газон стригут до бордюра.
  for (let k = 0; k < 2600 * N; k++) {
    const side = Math.floor(r() * 4), t = r() * 2 - 1, o = 0.2 + Math.pow(r(), 1.6) * 1.3;
    const [x, z] = side === 0 ? [-FX - o, t * FZ] : side === 1 ? [t * FX, -FZ - o] : side === 2 ? [t * FX, FZ + o] : [FX + o, t * FZ];
    if (side === 3) continue; // со стороны дорожки газон стрижен до бордюра: зрителям со скамеек виден корт
    put(grass, x, z, 0.7 + r() * 0.6 - o * 0.15);
  }
  // По карте: у изгороди, стволов, камней, фонарей; по некошеному лугу за площадкой — пятнами.
  for (let k = 0; k < 60000 && grass.length < 9000 * N; k++) {
    const x = MAP.x0 + r() * MAP.size, z = MAP.z0 + r() * MAP.size, [, , b] = map.at(x, z), pd = padDist(x, z);
    const meadow = Math.min(1, Math.max(0, (pd - 2) / 10)) * (0.25 + 0.75 * vnoise(x / 7, z / 7));
    if (r() > Math.max(b * 0.9, meadow * 0.5)) continue;
    put(grass, x, z, 0.6 + r() * 0.7);
  }
  // Цветы: в клумбах гуще, по лугу за площадкой редко (белые, жёлтые, лиловые).
  for (let k = 0; k < 40000 && flowers.length < 1400 * N; k++) {
    const x = MAP.x0 + r() * MAP.size, z = MAP.z0 + r() * MAP.size, [p, bed] = map.at(x, z), pd = padDist(x, z);
    if (p > 0.1) continue;
    if (bed > 0.5) { flowers.push([x, 0.0, z, 0.9 + r() * 0.5, r() * 6.28, 1]); continue; }
    if (pd > 3 && r() < 0.06 * vnoise(x / 9 + 3, z / 9)) flowers.push([x, heightAt(x, z) + 0.02, z, 0.5 + r() * 0.4, r() * 6.28, 0]);
  }
  const BED = [[0.75, 0.05, 0.06], [0.85, 0.32, 0.55], [0.95, 0.9, 0.85], [0.55, 0.3, 0.7]], WILD = [[0.95, 0.95, 0.92], [0.95, 0.8, 0.2], [0.6, 0.45, 0.8]];
  const make = (list, geo, mat, tintOf) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new Float32Array(list.length * 3);
    list.forEach((s, i) => { im.setMatrixAt(i, m4.compose(new THREE.Vector3(s[0], s[1], s[2]), q.setFromAxisAngle(up, s[4]), new THREE.Vector3(s[3], s[3] * (0.8 + r() * 0.4), s[3]))); tint.set(tintOf(s), i * 3); });
    im.geometry = geo.clone(); im.geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
    im.receiveShadow = true; im.frustumCulled = false;
    return im;
  };
  const g = new THREE.Group(); g.name = 'tufts';
  g.add(make(grass, tuftGeometry(0.5, 0.42), tuftMaterial(bladeTexture(false), time, false), () => { const v = 0.62 + r() * 0.25; return [v * (0.95 + r() * 0.15), v, v * (0.85 + r() * 0.2)]; }));
  g.add(make(flowers, tuftGeometry(0.42, 0.4), tuftMaterial(bladeTexture(true), time, true), (s) => (s[5] ? BED : WILD)[Math.floor(r() * 3.999) % (s[5] ? 4 : 3)]));
  return g;
}

// ---------- Изгородь, кусты, камни ----------
// Листва и камень — фото GPT (art/env → tools/ground-tex.py → public/tex). Кусты и камни кроем текстурой с трёх сторон
// по мировым координатам: у искажённой сферы своей развёртки без швов нет.
function triplanar(m, tile) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vTp, vTn;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 tp = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        tp = instanceMatrix * tp;
      #endif
      vTp = (modelMatrix * tp).xyz; vTn = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = 'varying vec3 vTp, vTn;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 tw = pow(abs(vTn), vec3(4.)); tw /= tw.x + tw.y + tw.z;
      vec4 tc = texture2D(map, vTp.zy / ${tile.toFixed(2)}) * tw.x + texture2D(map, vTp.xz / ${tile.toFixed(2)}) * tw.y + texture2D(map, vTp.xy / ${tile.toFixed(2)}) * tw.z;
      diffuseColor *= tc;`);
  };
  return m;
}

// Поперечник изгороди — суперэллипс: стенки прямые, верх скруглён, как у стриженого граба. Вдоль — шаг 25 см,
// поверхность чуть волнистая шумом, торцы закрыты. Снизу темнее: внутрь кроны свет не доходит.
function hedgeGeometry(len, h, w, seed) {
  const prof = []; const M = 16;
  for (let i = 0; i <= M; i++) { const a = Math.PI - (i / M) * Math.PI, c = Math.cos(a), s = Math.sin(a); prof.push([(w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 0.35), h * Math.pow(s, 0.3)]); }
  const n = Math.max(2, Math.round(len / 0.25)), P = [], C = [], U = [], I = [];
  const arc = [0]; for (let i = 1; i <= M; i++) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  for (let j = 0; j <= n; j++) {
    const x = -len / 2 + (j / n) * len, end = Math.min(1, Math.min(j, n - j) / n * len / 0.35), sc = 0.82 + 0.18 * end;
    for (let i = 0; i <= M; i++) {
      const [pz, py] = prof[i], nz = pz / (w / 2), ny = py / h;
      const d = (vnoise(x * 1.6 + seed, py * 2.1) - 0.5) * 0.12 + (vnoise(x * 5.3, py * 5.9 + seed) - 0.5) * 0.05;
      const k = py > 0.02 ? 1 : 0;
      P.push(x, py * sc + d * ny * k, pz * sc + d * nz * k);
      const ao = (0.5 + 0.5 * Math.min(1, py / 0.7)) * (0.85 + 0.3 * vnoise(x * 0.8 + seed, py));
      C.push(ao, ao, ao); U.push(x / 0.9, arc[i] / 0.9);
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < M; i++) { const a = j * (M + 1) + i, b = a + M + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  for (const j of [0, n]) { // торец: веер из середины
    const c = P.length / 3; P.push(j ? len / 2 : -len / 2, h * 0.4, 0); C.push(0.6, 0.6, 0.6); U.push(0, 0);
    for (let i = 0; i < M; i++) { const a = j * (M + 1) + i; if (j) I.push(c, a, a + 1); else I.push(c, a + 1, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
// Листва карточками: каждая карточка — ветка с листьями (leafTexture). Нормаль у всех вершин — от центра кроны
// (оболочка), поэтому куст освещён как объём: светлая сторона к солнцу, теневая от него, а не мешанина бликов.
// Глубже и ниже — темнее (цвета вершин).
function cardsMaterial(map) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')); };
  return m;
}
const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
function cards(list, r) { // list: [[p, n, size, ao]] → геометрия карточек
  const P = [], N = [], U = [], C = [], I = [], t = new THREE.Vector3(), b = new THREE.Vector3(), f = new THREE.Vector3(), q = new THREE.Vector3();
  for (const [p, n, s, ao] of list) {
    f.copy(n).add(q.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.1)).normalize();
    t.crossVectors(f, Math.abs(f.y) < 0.9 ? UP : XA).normalize(); b.crossVectors(f, t);
    const a = r() * 6.283, ca = Math.cos(a) * s / 2, sa = Math.sin(a) * s / 2, k = P.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const du = u * 2 - 1, dv = v * 2 - 1;
      P.push(p.x + (t.x * ca - b.x * sa) * du + (t.x * sa + b.x * ca) * dv, p.y + (t.y * ca - b.y * sa) * du + (t.y * sa + b.y * ca) * dv, p.z + (t.z * ca - b.z * sa) * du + (t.z * sa + b.z * ca) * dv);
      N.push(n.x, n.y, n.z); U.push(u, v); C.push(ao, ao, ao);
    }
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  return g;
}
// Куст высотой ~1.1 м: тёмная сердцевина (чтобы не просвечивал насквозь) и 60 карточек по оболочке.
function bushGeometry(seed) {
  const r = rng(101 + seed * 13), list = [], c = new THREE.Vector3(0, 0.5, 0);
  for (let i = 0; i < 60; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, r() * 1.6 - 0.45, r() * 2 - 1).normalize(), rad = 0.5 + 0.18 * r();
    const p = c.clone().add(new THREE.Vector3(d.x * rad * 1.15, d.y * rad * 0.85, d.z * rad * 1.15));
    list.push([p, d, 0.5 + r() * 0.25, (0.5 + 0.5 * Math.min(1, Math.max(0, p.y / 0.9))) * (0.85 + 0.25 * r())]);
  }
  const core = blobGeometry(2, seed * 2.3, false).scale(0.55, 0.5, 0.55).translate(0, 0.32, 0);
  const cc = core.attributes.color; for (let i = 0; i < cc.count; i++) cc.setXYZ(i, 0.3, 0.32, 0.26);
  return [cards(list, r), core];
}
function hedges(leaf) {
  const geos = HEDGES.map(([x0, z0, x1, z1, h, w], i) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    return hedgeGeometry(len, h, w, i * 7.1).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: leaf, vertexColors: true, color: '#a9b49a' }));
  m.castShadow = m.receiveShadow = true; m.name = 'hedges';
  // Бахрома: карточки с листьями по бокам и верху — у стриженого граба край не гладкий, листья торчат.
  const r = rng(77), fr = HEDGES.map(([x0, z0, x1, z1, h, w]) => {
    const len = Math.hypot(x1 - x0, z1 - z0), list = [];
    for (let x = -len / 2 + 0.15; x < len / 2 - 0.1; x += 0.3) for (const [nz, ny, y] of [[-1, 0, 0.35], [-1, 0, 0.8], [-0.8, 0.5, h - 0.15], [0, 1, h], [0.8, 0.5, h - 0.15], [1, 0, 0.8], [1, 0, 0.35]]) {
      const n = new THREE.Vector3(0, ny, nz).normalize(), j = (r() - 0.5) * 0.2;
      const p = new THREE.Vector3(x + (r() - 0.5) * 0.25, y + j, (w / 2) * nz * 0.92 + (r() - 0.5) * 0.05);
      list.push([p, n, 0.42 + r() * 0.2, (0.45 + 0.55 * Math.min(1, y / 1.1)) * (0.85 + 0.25 * r())]);
    }
    return cards(list, r).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  });
  const f = new THREE.Mesh(mergeGeometries(fr), cardsMaterial(leafTexture())); f.castShadow = f.receiveShadow = true;
  const g = new THREE.Group(); g.add(m, f);
  return g;
}
// Куст или камень: икосаэдр, искажённый шумом. Куст — круглый, с нормалями оболочки (свет мягкий, как у кроны),
// камень — сплюснутый, с плоским низом, сидит в земле.
function blobGeometry(detail, seed, rock) {
  const ico = new THREE.IcosahedronGeometry(1, detail); ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const g = mergeVertices(ico), p = g.attributes.position, v = new THREE.Vector3(); // у икосаэдра вершины граней свои: склеиваем, иначе шум рвёт поверхность
  const shell = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); shell.push(v.clone());
    const n = vnoise(v.x * 1.7 + seed, v.y * 1.7 + v.z * 0.9) * 0.6 + vnoise(v.z * 3.1 + seed, v.x * 3.1 - v.y) * 0.4;
    v.multiplyScalar(rock ? 0.8 + 0.45 * n + 0.1 * Math.abs(Math.sin(v.x * 4 + seed)) : 0.85 + 0.3 * n);
    v.y = rock ? Math.max(v.y * 0.62, -0.18) : v.y * 0.78 + 0.12;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const ng = g;
  ng.computeVertexNormals();
  if (!rock) { const nn = ng.attributes.normal; for (let i = 0; i < nn.count; i++) { v.fromBufferAttribute(nn, i).multiplyScalar(0.4).add(shell[i].normalize().multiplyScalar(0.6)).normalize(); nn.setXYZ(i, v.x, v.y, v.z); } }
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = rock ? 0.75 + 0.35 * Math.min(1, (y + 0.18) / 0.6) : 0.45 + 0.6 * Math.min(1, Math.max(0, y + 0.1)); col.set([a, a, a], i * 3); }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}
function blobs(list, geos, mat, place, color) {
  const g = new THREE.Group(), r = rng(19), rc = rng(29), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); // rc: цвета отдельно — места не зависят от того, сколько чисел съел цвет
  geos.forEach((geo, gi) => {
    const mine = list.filter((_, i) => i % geos.length === gi);
    const im = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((s, i) => { const [pos, scale] = place(s, r); im.setMatrixAt(i, m4.compose(pos, q.setFromEuler(e.set((r() - 0.5) * 0.2, r() * 6.28, (r() - 0.5) * 0.2)), scale)); im.setColorAt(i, color(rc)); });
    im.castShadow = im.receiveShadow = true; g.add(im);
  });
  return g;
}

// ---------- Фонари, табличка, флаг ----------
function lamps() {
  const metal = new THREE.MeshStandardMaterial({ color: '#1f2b25', roughness: 0.45, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#77735f', roughness: 0.15, metalness: 0.1, emissive: '#ffd9a0', emissiveIntensity: 0.12 }); // стекло днём тёмное, тёплый отсвет лампы
  const post = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.13, 0.35, 12).translate(0, 0.175, 0), new THREE.CylinderGeometry(0.045, 0.05, 2.5, 10).translate(0, 1.6, 0),
    new THREE.CylinderGeometry(0.09, 0.07, 0.06, 12).translate(0, 2.86, 0), new THREE.ConeGeometry(0.2, 0.16, 4, 1).rotateY(Math.PI / 4).translate(0, 3.27, 0),
    new THREE.SphereGeometry(0.03, 8, 6).translate(0, 3.37, 0),
  ]);
  const lantern = new THREE.CylinderGeometry(0.15, 0.11, 0.3, 4, 1).rotateY(Math.PI / 4).translate(0, 3.04, 0);
  const g = new THREE.Group(), a = new THREE.InstancedMesh(post, metal, LAMPS.length), b = new THREE.InstancedMesh(lantern, glass, LAMPS.length), m4 = new THREE.Matrix4();
  LAMPS.forEach(([x, z], i) => { m4.makeTranslation(x, heightAt(x, z) + 0.05, z); a.setMatrixAt(i, m4); b.setMatrixAt(i, m4); });
  a.castShadow = true; g.add(a, b);
  return g;
}
function sign() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#1e3b2f'; x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#d9c38a'; x.lineWidth = 5; x.strokeRect(12, 12, 488, 136);
  x.fillStyle = '#f1ead8'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 64px Georgia, "Times New Roman", serif'; x.fillText('TENNISCLUB', 256, 72);
  x.font = '500 26px Georgia, serif'; x.fillStyle = '#d9c38a'; x.fillText('—  1926  —', 256, 122);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.85 });
  const g = new THREE.Group(), [sx, sz, rot] = SIGN; g.position.set(sx, 0, sz); g.rotation.y = rot;
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  for (const s of [-0.95, 0.95]) add(new THREE.BoxGeometry(0.1, 1.75, 0.1), wood, s, 0.875, 0);
  add(new THREE.BoxGeometry(1.84, 0.6, 0.06), wood, 0, 1.3, 0);
  add(new THREE.PlaneGeometry(1.76, 0.55), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), 0, 1.3, 0.031);
  add(new THREE.BoxGeometry(2.1, 0.05, 0.3), wood, 0, 1.78, 0); // козырёк
  return g;
}
// Флаг Швейцарии на белом флагштоке 6,5 м у угла террасы: полотнище колышется волной от древка, край провисает.
function flag(time) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#d52b1e'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#fff'; x.fillRect(52, 24, 24, 80); x.fillRect(24, 52, 80, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(); g.position.set(FLAG[0], 0, FLAG[1]);
  const white = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.4, metalness: 0.2 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 6.5, 12).translate(0, 3.25, 0), white); pole.castShadow = true;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.3, metalness: 0.8 })); ball.position.y = 6.55;
  const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.time = time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float u = uv.x, ph = time * 5. - u * 7.;
      transformed.z += sin(ph) * .13 * u + sin(time * 3.1 - u * 11. + uv.y * 2.) * .03 * u;
      transformed.y -= u * u * .12;`).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal = normalize(vec3(-cos(time * 5. - uv.x * 7.) * .13 * 7. * uv.x * .5, 0., 1.));`);
  };
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2, 16, 6).translate(0.63, 5.8, 0), m);
  g.add(pole, ball, cloth); g.rotation.y = 0.6; // ветер с долины
  return g;
}

// Всё вместе. trees — места деревьев из env.js (вокруг стволов трава гуще). Возвращает группу и формы для шейдера газона.
export function buildClub(trees) {
  const map = drawMap(trees), time = { value: 0 }, g = new THREE.Group(); g.name = 'club';
  const leaf = tex('/tex/hedge.webp'), rock = tex('/tex/rock.webp');
  g.add(hedges(leaf), tufts(map, time), lamps(), sign(), flag(time));
  // Кусты: три варианта, у каждого карточки листвы и тёмная сердцевина с теми же местами.
  const leafCards = cardsMaterial(leafTexture()), coreMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: '#2c3a22' });
  const bushPlace = ([x, z, s], r) => [new THREE.Vector3(x, heightAt(x, z) - 0.05, z), new THREE.Vector3(s * (0.9 + r() * 0.3), s * (0.8 + r() * 0.35), s * (0.9 + r() * 0.3))];
  const bushTint = (r) => new THREE.Color().setHSL(0.2 + r() * 0.07, 0.35, 0.55 + r() * 0.2);
  const bushGeos = [0, 1, 2].map((sd) => bushGeometry(sd));
  g.add(blobs(BUSHES, bushGeos.map((b) => b[0]), leafCards, bushPlace, bushTint), blobs(BUSHES, bushGeos.map((b) => b[1]), coreMat, bushPlace, () => new THREE.Color(1, 1, 1)));
  // Камни: заданные у клуба и россыпь по склону холма за площадкой.
  const r = rng(23), stones = [...ROCKS];
  for (let k = 0; k < 400 && stones.length < 60; k++) { const a = r() * 6.28, d = 60 + r() * 120, x = Math.sin(a) * d, z = -Math.cos(a) * d; if (padDist(x, z) > 12) stones.push([x, z, 0.5 + r() * r() * 2.2]); }
  const rockMat = triplanar(new THREE.MeshLambertMaterial({ map: rock, vertexColors: true }), 1.6);
  const rocks = blobs(stones, [0, 1, 2].map((s) => blobGeometry(2, 10 + s * 5.3, true)), rockMat, ([x, z, s], rr) => [new THREE.Vector3(x, heightAt(x, z) - 0.08 * s, z), new THREE.Vector3(s * (0.8 + rr() * 0.5), s * (0.7 + rr() * 0.4), s * (0.8 + rr() * 0.5))], (rr) => new THREE.Color().setHSL(0.09, 0.06, 0.34 + rr() * 0.14));
  g.add(rocks);
  g.getObjectByName('tufts').children[0].onBeforeRender = () => { time.value = performance.now() / 1000; }; // часы ветра: трава рисуется всегда
  const grassT = tex('/tex/grass.webp'), gravelT = tex('/tex/gravel.webp');
  return {
    group: g,
    uniforms: {
      clubMap: { value: map.tex }, grassT: { value: grassT }, gravelT: { value: gravelT },
      clubRect: { value: new THREE.Vector4(MAP.x0, MAP.z0, MAP.size, 0) }, pad: { value: new THREE.Vector4(PAD.x0, PAD.z0, PAD.x1, PAD.z1) },
    },
  };
}
