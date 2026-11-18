// Клубный дом — альпийское шале кодом (18.11.2026, вместо кома из Meshy с осколками текстуры): каменный цоколь, белая
// штукатурка первого этажа, второй этаж из лиственницы с балконом и резными перилами, герань в ящиках, двускатная
// крыша со свесом, снизу обшита доской, сверху дранка, ставни, окна с переплётами, труба. Конёк смотрит на корт.
// Внутри зал клубного бара: пол из досок, панели по низу стен, балки, стойка с полками бутылок, три столика со
// стульями, камин, тёплые лампы. Свет внутри без теней: солнце в зал не заходит, светят лампы и камин (шейдер).
// Дверь со стороны террасы открывается внутрь на петлях: door.toggle(). Стены для столкновений — HOUSE (как в
// pushOut из club.js): boxes — стены с проёмом двери и мебель, segs — створка, floors — пол зала.
// Текстуры — Poly Haven, CC0 (README): камень rustic_stone_wall, штукатурка white_stucco_02, доски wood_planks,
// дранка roof_slates_02.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// Наружные грани стен: фасад с дверью на террасу (−x), конёк вдоль x.
const X0 = 14.6, X1 = 25.8, Z0 = -33.2, Z1 = -20.8, ZC = (Z0 + Z1) / 2;
const T = 0.35, FL = 0.15, G = 3.2, U = 5.7, TAN = Math.tan(0.42); // стена, пол зала (как настил), этаж, верх стен, уклон 24°
const UP = 0.08; // второй этаж из бруса чуть нависает над штукатуркой
const DW = 1.2, DH = 2.25; // дверь
const IN = { x0: X0 + T, x1: X1 - T, z0: Z0 + T, z1: Z1 - T }; // зал изнутри
const roofY = (z) => U + 0.12 + (Math.min(z - Z0, Z1 - z)) * TAN; // низ кровли над точкой (без свеса)

// ---------- Геометрия ----------
// Развёртка по грани коробки: каждая грань берёт две свои оси в метрах / tile. swap — доски вертикально.
function boxUV(g, tile, swap) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u = ax >= ay && ax >= az ? p.getZ(i) : p.getX(i), v = ay > ax && ay >= az ? p.getZ(i) : p.getY(i);
    if (swap) [u, v] = [v, u];
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}
const tint = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set(c, i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const WHITE = [1, 1, 1];
// Наборы геометрии по материалам: всё одного материала сливается в одну сетку.
const P = { stone: [], plaster: [], wood: [], roof: [], paint: [], glass: [], curtain: [], rail: [], gerLeaf: [], gerFlower: [], gerTrail: [], gerTrailF: [], inPaint: [], inPlaster: [], inWood: [], inStone: [], bottles: [], glow: [] };
const TILE = { stone: 1.5, plaster: 1.6, wood: 1.4, roof: 3, paint: 1.4, inPlaster: 1.6, inWood: 1.4, inStone: 1.2 };
// Коробка по углам (в мире, по осям); swap — доски вертикально.
function box(kind, x0, y0, z0, x1, y1, z1, col = WHITE, swap = false) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  P[kind].push(tint(boxUV(g, TILE[kind] ?? 1, swap), col));
  return g;
}
// Любая геометрия с переносом и тоном.
function put(kind, g, m, col = WHITE) { P[kind].push(tint(g.applyMatrix4(m), col)); return g; }
const M = (x, y, z, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// Стена с проёмами: полоса вдоль u (z у фасадов, x у боковых), толщина по нормали [a, b], высота [y0, y1].
// holes — [центр по u, ширина, низ, высота]. Режем на столбцы по краям проёмов: над и под проёмом — перемычки.
function wall(kind, normal, a, b, u0, u1, y0, y1, holes, col) {
  const cuts = [...new Set([u0, u1, ...holes.flatMap(([c, w]) => [c - w / 2, c + w / 2])])].filter((c) => c >= u0 && c <= u1).sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i], e = cuts[i + 1], mid = (s + e) / 2, h = holes.find(([c, w]) => Math.abs(mid - c) < w / 2);
    const spans = !h ? [[y0, y1]] : [[y0, Math.max(y0, h[2])], [Math.min(y1, h[2] + h[3]), y1]];
    for (const [ya, yb] of spans) if (yb - ya > 1e-3) {
      if (normal === 'x') box(kind, a, ya, s, b, yb, e, col); else box(kind, s, ya, a, e, yb, b, col);
    }
  }
}

// ---------- Окна ----------
// Окно в стене: рама и переплёт (белая краска), стекло, наружный подоконник, ставни раскрыты к стене; на втором этаже
// ящик с геранью, за стеклом занавеска. side — куда смотрит фасад: [nx, nz] наружу. u — центр по стене, w×h — проём.
const SHUTTER = [0.035, 0.1, 0.055]; // тёмно-зелёные ставни (тон линейный: на экране ~#344f3c)
function windowAt(side, plane, u, yb, w, h, { upper = false, shutters = true, box: flowerBox = upper } = {}) {
  const [nx, nz] = side, along = nx ? 'z' : 'x';
  // Точка в осях окна: s — вдоль стены, y — высота, d — от наружной грани наружу (минус — вглубь стены).
  const at = (s, y, d) => (along === 'z' ? [plane + nx * d, y, u + s] : [u + s, y, plane + nz * d]);
  const B = (kind, s0, s1, y0, y1, d0, d1, col, swap) => { const a = at(s0, y0, d0), b = at(s1, y1, d1); box(kind, Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), col, swap); };
  const fd = -0.12, ft = 0.07; // рама на 12 см в глубине проёма
  B('paint', -w / 2, w / 2, yb, yb + 0.07, fd - ft, fd, WHITE); B('paint', -w / 2, w / 2, yb + h - 0.07, yb + h, fd - ft, fd, WHITE);
  B('paint', -w / 2, -w / 2 + 0.07, yb, yb + h, fd - ft, fd, WHITE); B('paint', w / 2 - 0.07, w / 2, yb, yb + h, fd - ft, fd, WHITE);
  B('paint', -0.025, 0.025, yb, yb + h, fd - ft + 0.01, fd - 0.01, WHITE); // створки
  for (const k of [0.38, 0.7]) B('paint', -w / 2, w / 2, yb + h * k - 0.02, yb + h * k + 0.02, fd - ft + 0.015, fd - 0.015, WHITE); // переплёт: шесть стёкол
  B('glass', -w / 2, w / 2, yb, yb + h, fd - ft / 2 - 0.005, fd - ft / 2 + 0.005);
  if (upper) B('curtain', -w / 2, w / 2, yb, yb + h, fd - ft - 0.06, fd - ft - 0.05);
  B(upper ? 'wood' : 'stone', -w / 2 - 0.08, w / 2 + 0.08, yb - 0.07, yb, -0.18, 0.07, upper ? [0.7, 0.55, 0.45] : [0.95, 0.95, 0.95]); // подоконник
  if (!upper) { // штукатурка вокруг окна чуть светлее и выступает — обрамление, как на шале
    B('plaster', -w / 2 - 0.14, w / 2 + 0.14, yb + h, yb + h + 0.14, 0, 0.02, [1.06, 1.04, 1]);
    for (const s of [-1, 1]) B('plaster', s > 0 ? w / 2 : -w / 2 - 0.14, s > 0 ? w / 2 + 0.14 : -w / 2, yb - 0.07, yb + h + 0.14, 0, 0.02, [1.06, 1.04, 1]);
  }
  if (shutters) for (const s of [-1, 1]) { // ставня: доски вертикально, две поперечины
    const s0 = s * (w / 2 + 0.16), s1 = s * (w / 2 + 0.16 + w / 2);
    B('paint', Math.min(s0, s1), Math.max(s0, s1), yb, yb + h, 0.04, 0.085, SHUTTER, true);
    for (const y of [0.22, h - 0.22]) B('paint', Math.min(s0, s1) + 0.05, Math.max(s0, s1) - 0.05, yb + y - 0.04, yb + y + 0.04, 0.085, 0.105, SHUTTER.map((v) => v * 0.8));
  }
  if (flowerBox) { B('wood', -w / 2 - 0.1, w / 2 + 0.1, yb - 0.28, yb - 0.08, 0.07, 0.3, [0.6, 0.45, 0.35]); geraniums(at, -w / 2 - 0.05, w / 2 + 0.05, yb - 0.08, 0.19); }
}

// Герань в ящике карточками: округлые листья с тёмным кольцом лежат шапкой, над ними зонтики по 5–15 цветков на
// цветоносах (красные, реже розовые и лососевые), к улице свисают плети с листьями и цветками. Нормаль карточек —
// вверх и наружу: ящик освещён как одна масса. at(s, y, d) — точка в осях ящика: вдоль, высота, наружу от стены.
const gr = rng(17);
const FLOWER = [[0.85, 0.06, 0.05], [0.85, 0.06, 0.05], [0.78, 0.04, 0.06], [0.95, 0.3, 0.42], [0.98, 0.42, 0.3]];
function card(kind, at, s, y, d, w, h, yaw, pitch, nOut, col) {
  const o = new THREE.Vector3(...at(0, 0, 0)), D = new THREE.Vector3(...at(0, 0, 1)).sub(o), A = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), D); // правая тройка
  const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0); // низ карточки в точке
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(A, new THREE.Vector3(0, 1, 0), D)); // оси ящика
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))).applyQuaternion(q).translate(...at(s, y, d));
  const n = new THREE.Vector3(0, 1, 0).addScaledVector(D, nOut).normalize(), nn = g.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, n.x, n.y, n.z);
  P[kind].push(tint(g, col));
}
function geraniums(at, s0, s1, y, d) {
  const L = s1 - s0, out = d + 0.13;
  for (let i = 0; i < L / 0.022; i++) { // листья шапкой 15–20 см: лежат сверху, стоят к улице, свешиваются через край
    const s = s0 + gr() * L, k = 0.12 + gr() * 0.07, t = gr();
    if (t < 0.45) card('gerLeaf', at, s, y + 0.03 + gr() * 0.12, d + (gr() - 0.5) * 0.2, k, k, gr() * 6.28, -1.3 + gr() * 0.5, 0.3, [1, 1, 1]);
    else if (t < 0.8) card('gerLeaf', at, s, y - 0.01 + gr() * 0.05, d + (gr() - 0.3) * 0.18, k, k * 1.1, (gr() - 0.5) * 1.4, -0.5 + gr() * 0.45, 0.6, [1, 1, 1]);
    else card('gerLeaf', at, s, y + 0.02, out - 0.03, k, k, (gr() - 0.5) * 0.8, 0.5 + gr() * 0.5, 1, [1, 1, 1]);
  }
  for (let i = 0; i < L / 0.075; i++) { // зонтики на цветоносах над листьями: две карточки крестом
    const s = s0 + gr() * L, h = 0.2 + gr() * 0.1, a = gr() * 3.14, c = FLOWER[Math.floor(gr() * FLOWER.length)], dd = d + (gr() - 0.4) * 0.16;
    for (const da of [0, Math.PI / 2]) card('gerFlower', at, s, y + 0.02, dd, h * 0.8, h, a + da, -0.15 + gr() * 0.12, 0.4, c);
  }
  for (let i = 0; i < L / 0.16; i++) { // плети через край к улице
    const s = s0 + gr() * L, h = 0.22 + gr() * 0.25, c = gr() < 0.5 ? FLOWER[Math.floor(gr() * FLOWER.length)] : null;
    card(c ? 'gerTrailF' : 'gerTrail', at, s, y + 0.03 - h, out + 0.01 + gr() * 0.04, 0.11, h, (gr() - 0.5) * 0.6, -0.15, 1.5, c ?? [1, 1, 1]);
  }
}
// Текстуры герани (холст): лист — округлый, край зубчиками, тёмное кольцо, жилки; зонтик — 5–15 цветков по пять
// лепестков, белёсые (цвет — тон вершин), бутоны, цветоносы; плеть — стебель с листьями плюща, внизу зонтик.
function gerLeafTex() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rng(61);
  for (let i = 0; i < 5; i++) {
    const cx = N / 2 + (r() - 0.5) * 50, cy = N / 2 + (r() - 0.5) * 50, R = 20 + r() * 10, base = ['#3d6a26', '#45742b', '#4f7f30', '#3a6324'][i % 4];
    g.beginPath(); for (let a = 0; a <= 6.3; a += 0.1) { const rr = R * (1 + 0.07 * Math.sin(a * 11)); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.fillStyle = base; g.fill();
    g.strokeStyle = 'rgba(60,32,14,0.45)'; g.lineWidth = R * 0.22; g.beginPath(); g.arc(cx, cy, R * 0.55, 0, 7); g.stroke(); // тёмное кольцо зональной герани
    g.strokeStyle = 'rgba(170,200,120,0.35)'; g.lineWidth = 1; for (let a = 0; a < 6.3; a += 0.7) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function umbel(g, cx, cy, R, r, n) {
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.75, p = 4.5 + r() * 2.5;
    for (let k = 0; k < 5; k++) { const b = (k / 5) * 6.28 + a; g.fillStyle = `rgb(${235 + r() * 20 | 0},${215 + r() * 40 | 0},${215 + r() * 40 | 0})`; g.beginPath(); g.ellipse(x + Math.cos(b) * p * 0.7, y + Math.sin(b) * p * 0.7, p * 0.75, p * 0.55, b, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(120,60,40,0.7)'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill();
  }
  g.fillStyle = '#7d8f45'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx + (r() - 0.5) * R * 2, cy + R * 0.6 + r() * 4, 2.5, 3.5, 0, 0, 7); g.fill(); } // бутоны
}
function gerFlowerTex() {
  const W = 96, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(67);
  g.strokeStyle = '#4c6b2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 + 6, H * 0.6, W / 2, 40); g.stroke(); // цветонос
  umbel(g, W / 2, 36, 32, r, 15);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function gerTrailTex(flower) {
  const W = 48, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(flower ? 71 : 73);
  g.strokeStyle = '#4f6a2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, 0); g.bezierCurveTo(W / 2 + 10, H * 0.3, W / 2 - 10, H * 0.65, W / 2 + 3, flower ? H - 30 : H - 6); g.stroke(); // стебель свисает сверху
  for (let y = 8; y < (flower ? H - 40 : H - 10); y += 13 + r() * 6) { // листья плюща: пять лопастей
    const x = W / 2 + (r() - 0.5) * 22, R = 7 + r() * 4;
    g.fillStyle = ['#3e6a27', '#4a7a2e', '#365d22'][Math.floor(r() * 3)];
    g.beginPath(); for (let a = 0; a <= 6.3; a += 0.1) { const rr = R * (0.75 + 0.25 * Math.abs(Math.cos(a * 2.5))); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill();
  }
  if (flower) umbel(g, W / 2, H - 22, 15, r, 7); // зонтик на конце плети
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Карточки без переворота нормали у изнанки (свет от «массы», а не от каждой карточки); тон вершин красит только
// белёсые лепестки, листья и стебли остаются своими.
function cardMat(map) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb * (.45 + .55 * diffuseColor.g), smoothstep(.32, .55, min(diffuseColor.r, diffuseColor.b)));');
  };
  return m;
}

// ---------- Снаружи ----------
function shell() {
  const PL = [1, 0.985, 0.95], LARCH = [0.95, 0.68, 0.48], BEAM = [0.62, 0.43, 0.3];
  // Проёмы первого этажа: [центр, ширина, низ, высота]. Фасад: окно — дверь — окно; бока по три окна (на южном
  // посередине камин); сзади глухо — там полки бара.
  const frontG = [[ZC - 3.6, 1.3, 1.0, 1.35], [ZC, DW, -0.3, FL + DH + 0.3], [ZC + 3.6, 1.3, 1.0, 1.35]]; // проём двери до низа стены: под порогом пол
  const southG = [[17.4, 1.2, 1.0, 1.35], [24.2, 1.2, 1.0, 1.35]], northG = [[17.4, 1.2, 1.0, 1.35], [20.8, 1.2, 1.0, 1.35], [24.2, 1.2, 1.0, 1.35]];
  const frontU = [[ZC - 3.6, 1.2, G + 0.75, 1.3], [ZC, 1.0, G + 0.14, 2.1], [ZC + 3.6, 1.2, G + 0.75, 1.3]];
  const sideU = [[17.4, 1.1, G + 0.75, 1.25], [21, 1.1, G + 0.75, 1.25], [24.4, 1.1, G + 0.75, 1.25]], backU = [[ZC - 2.6, 1.1, G + 0.75, 1.25], [ZC + 2.6, 1.1, G + 0.75, 1.25]];
  // Первый этаж: наружная часть стены — штукатурка, внутренний слой 2 см — штукатурка зала (свой свет).
  wall('plaster', 'x', X0, X0 + T - 0.02, Z0, Z1, -0.3, G, frontG, PL); wall('inPlaster', 'x', X0 + T - 0.02, X0 + T, Z0 + T, Z1 - T, FL, G, frontG, PL);
  wall('plaster', 'x', X1 - T + 0.02, X1, Z0, Z1, -0.3, G, [], PL); wall('inPlaster', 'x', X1 - T, X1 - T + 0.02, Z0 + T, Z1 - T, FL, G, [], PL);
  wall('plaster', 'z', Z0, Z0 + T - 0.02, X0, X1, -0.3, G, southG, PL); wall('inPlaster', 'z', Z0 + T - 0.02, Z0 + T, X0 + T, X1 - T, FL, G, southG, PL);
  wall('plaster', 'z', Z1 - T + 0.02, Z1, X0, X1, -0.3, G, northG, PL); wall('inPlaster', 'z', Z1 - T, Z1 - T + 0.02, X0 + T, X1 - T, FL, G, northG, PL);
  // Каменный цоколь по низу: на 5 см толще стены, до 0,75 м.
  const ST = [0.9, 0.88, 0.84];
  wall('stone', 'x', X0 - 0.05, X0, Z0 - 0.05, Z1 + 0.05, -0.3, 0.75, [[ZC, DW, -0.3, 2]], ST); wall('stone', 'x', X1, X1 + 0.05, Z0 - 0.05, Z1 + 0.05, -0.3, 0.75, [], ST);
  wall('stone', 'z', Z0 - 0.05, Z0, X0, X1, -0.3, 0.75, [], ST); wall('stone', 'z', Z1, Z1 + 0.05, X0, X1, -0.3, 0.75, [], ST);
  // Второй этаж: брус лиственницы, чуть нависает; торцы брёвен крестом на углах.
  const ux0 = X0 - UP, ux1 = X1 + UP, uz0 = Z0 - UP, uz1 = Z1 + UP;
  wall('wood', 'x', ux0, ux0 + T, uz0, uz1, G, U, frontU, LARCH); wall('wood', 'x', ux1 - T, ux1, uz0, uz1, G, U, backU, LARCH);
  wall('wood', 'z', uz0, uz0 + T, ux0, ux1, G, U, sideU, LARCH); wall('wood', 'z', uz1 - T, uz1, ux0, ux1, G, U, sideU, LARCH);
  const stub = (ax, bx, y, az, bz) => box('wood', Math.min(ax, bx), y, Math.min(az, bz), Math.max(ax, bx), y + 0.18, Math.max(az, bz), BEAM);
  for (let y = G + 0.1; y < U - 0.2; y += 0.24) for (const [x, z] of [[ux0, uz0], [ux0, uz1], [ux1, uz0], [ux1, uz1]]) {
    const sx = x === ux0 ? -1 : 1, sz = z === uz0 ? -1 : 1; // наружу от угла
    stub(x, x + sx * 0.26, y, z, z - sz * T); // торец бруса боковой стены
    stub(x, x - sx * T, y + 0.06, z, z + sz * 0.26); // торец бруса фасада
  }
  box('wood', ux0 - 0.04, G - 0.18, uz0 - 0.04, ux1 + 0.04, G + 0.02, uz1 + 0.04, BEAM); // пояс между этажами
  // Фронтоны: треугольник из бруса до низа кровли, в переднем — окошко.
  for (const [x, hole] of [[ux0, true], [ux1 - T, false]]) {
    const sh = new THREE.Shape([[-(uz0), U], [-(uz1), U], [-ZC, roofY(ZC) - 0.02]].map(([a, b]) => new THREE.Vector2(a, b)));
    if (hole) sh.holes.push(new THREE.Path([[-ZC + 0.4, U + 0.5], [-ZC - 0.4, U + 0.5], [-ZC - 0.4, U + 1.4], [-ZC + 0.4, U + 1.4]].map(([a, b]) => new THREE.Vector2(a, b))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false }).rotateY(Math.PI / 2).translate(x, 0, 0);
    P.wood.push(tint(boxUV(g, TILE.wood), LARCH));
  }
  windowAt([-1, 0], ux0, ZC, U + 0.5, 0.8, 0.9, { upper: true, box: false });
  // Окна.
  for (const [u, w, yb, h] of frontG) if (u !== ZC) windowAt([-1, 0], X0, u, yb, w, h);
  for (const [u, w, yb, h] of southG) windowAt([0, -1], Z0, u, yb, w, h);
  for (const [u, w, yb, h] of northG) windowAt([0, 1], Z1, u, yb, w, h);
  for (const [u, w, yb, h] of frontU) if (u !== ZC) windowAt([-1, 0], ux0, u, yb, w, h, { upper: true });
  for (const [u, w, yb, h] of sideU) { windowAt([0, -1], uz0, u, yb, w, h, { upper: true }); windowAt([0, 1], uz1, u, yb, w, h, { upper: true }); }
  for (const [u, w, yb, h] of backU) windowAt([1, 0], ux1, u, yb, w, h, { upper: true });
  // Балконная дверь: рама и стекло во всю высоту, за ним занавеска.
  windowAt([-1, 0], ux0, ZC, G + 0.14, 1.0, 2.1, { upper: true, shutters: false, box: false });
  // Наличник входной двери, табличка над ней.
  for (const s of [-1, 1]) box('wood', X0 - 0.06, FL, ZC + s * (DW / 2 + 0.06) - 0.06, X0 + 0.02, FL + DH + 0.08, ZC + s * (DW / 2 + 0.06) + 0.06, BEAM);
  box('wood', X0 - 0.07, FL + DH, ZC - DW / 2 - 0.14, X0 + 0.02, FL + DH + 0.14, ZC + DW / 2 + 0.14, BEAM);
  // Балкон по фасаду: пол на консолях, столбики, перила с резными досками, ящики с геранью снаружи.
  const bx0 = ux0 - 1.25, bz0 = uz0 + 0.25, bz1 = uz1 - 0.25, by = G + 0.12;
  box('wood', bx0, G - 0.02, bz0, ux0, by, bz1, BEAM);
  for (let z = bz0 + 0.3; z < bz1; z += (bz1 - bz0 - 0.6) / 3) { // четыре консоли клином (середина свободна — там табличка): у стены 0,4 м, к краю 0,12 м
    const sh = new THREE.Shape([[0, 0], [1.15, 0], [1.15, -0.12], [0.25, -0.4], [0, -0.4]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }).translate(0, 0, -0.07).rotateY(Math.PI);
    P.wood.push(tint(boxUV(g, TILE.wood).translate(ux0, G - 0.02, z), BEAM));
  }
  const RH = 1.0, post = (x, z) => box('wood', x - 0.06, by, z - 0.06, x + 0.06, by + RH + 0.04, z + 0.06, BEAM);
  for (let z = bz0 + 0.06; z <= bz1 - 0.05; z += (bz1 - bz0 - 0.12) / 4) post(bx0 + 0.06, z);
  for (const z of [bz0 + 0.06, bz1 - 0.06]) post(ux0 - 0.06, z);
  box('wood', bx0 - 0.02, by + RH - 0.06, bz0, bx0 + 0.14, by + RH + 0.02, bz1, BEAM);
  for (const z of [bz0, bz1 - 0.12]) box('wood', bx0, by + RH - 0.06, z, ux0, by + RH + 0.02, z + 0.12, BEAM);
  box('wood', bx0, by + 0.08, bz0, bx0 + 0.1, by + 0.16, bz1, BEAM);
  const panel = (x0, z0, x1, z1) => { // резная доска: плоскость с вырезами (alphaTest), развёртка в метрах вдоль перил
    const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(len, RH - 0.22);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 0.56);
    P.rail.push(tint(g.applyMatrix4(M((x0 + x1) / 2, by + 0.16 + (RH - 0.22) / 2, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2)), WHITE));
  };
  panel(bx0 + 0.05, bz0, bx0 + 0.05, bz1); panel(bx0, bz0 + 0.06, ux0, bz0 + 0.06); panel(bx0, bz1 - 0.06, ux0, bz1 - 0.06);
  box('wood', bx0 - 0.3, by + RH - 0.22, bz0 + 0.2, bx0 - 0.04, by + RH - 0.02, bz1 - 0.2, [0.6, 0.45, 0.35]);
  geraniums((s, y, d) => [bx0 + 0.02 - d, y, ZC + s], -(bz1 - bz0) / 2 + 0.25, (bz1 - bz0) / 2 - 0.25, by + RH - 0.02, 0.19);
  // Крыша: два ската из доски (снизу обшивка, торцы — лобовая доска), сверху дранка; свес 1 м по бокам, 1,4 м спереди.
  const rx0 = X0 - 1.6, rx1 = X1 + 1.1, ov = 1.0, run = ZC - (Z0 - ov), slope = run / Math.cos(0.42);
  for (const s of [-1, 1]) {
    const zm = ZC + s * run / 2, yb = roofY(ZC) - (run / 2) * TAN, rot = s * 0.42, nrm = new THREE.Vector3(0, Math.cos(0.42), s * Math.sin(0.42));
    for (const [kind, t0, t1, col] of [['wood', 0, 0.16, [0.78, 0.56, 0.4]], ['roof', 0.16, 0.24, [0.32, 0.29, 0.27]]]) {
      const c = new THREE.Vector3(0, yb, zm).addScaledVector(nrm, (t0 + t1) / 2), g = boxUV(new THREE.BoxGeometry(rx1 - rx0, t1 - t0, slope + (kind === 'roof' ? 0.08 : 0)), TILE[kind]);
      P[kind].push(tint(g.applyMatrix4(M((rx0 + rx1) / 2, c.y, c.z, 0, rot)), col));
    }
  }
  box('roof', rx0, roofY(ZC) + 0.12, ZC - 0.22, rx1, roofY(ZC) + 0.3, ZC + 0.22, [0.22, 0.2, 0.19]); // конёк
  // Прогоны под крышей торчат из фронтонов; обвязка поверх стен.
  for (const dz of [0, -2.2, 2.2, -4.4, 4.4]) { const y = roofY(ZC + dz) - 0.24; box('wood', rx0 + 0.05, y, ZC + dz - 0.1, rx1 - 0.05, y + 0.24, ZC + dz + 0.1, BEAM); }
  for (const z of [uz0, uz1 - 0.2]) box('wood', ux0, U - 0.02, z, ux1, U + 0.14, z + 0.2, BEAM);
  // Труба из камня над южным скатом, от камина зала; сверху плита.
  box('stone', 20.55, G, Z0 + T, 21.45, 7.45, Z0 + T + 0.7, [0.85, 0.83, 0.8]);
  box('stone', 20.45, 7.45, Z0 + T - 0.1, 21.55, 7.55, Z0 + T + 0.8, [0.7, 0.7, 0.7]);
}

// ---------- Внутри ----------
const LAMPS = [[17.5, 2.35, -23.7], [17.5, 2.35, -30.3], [20.5, 2.35, -29.8], [23, 2.45, -29.2], [23, 2.45, -25.4], [21, 0.5, -32.2]]; // над столиками, над стойкой, камин
const TABLES = [[17.5, -23.7, 4], [17.5, -30.3, 4], [20.5, -29.8, 3]];
const STOOLS = [-30.4, -29.0, -27.6, -26.2, -24.8];
function chairGeo() {
  const parts = [new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(0, 0.46, 0), new THREE.BoxGeometry(0.42, 0.45, 0.04).translate(0, 0.7, -0.2)];
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) parts.push(new THREE.BoxGeometry(0.04, 0.46, 0.04).translate(x, 0.23, z));
  return mergeGeometries(parts.map((g) => boxUV(g, 0.8)));
}
function interior() {
  const OAK = [0.62, 0.44, 0.3], FLOOR = [0.9, 0.7, 0.52], DARK = [0.42, 0.3, 0.22];
  box('inWood', IN.x0 - T, 0, IN.z0, IN.x1, FL, IN.z1, FLOOR); // пол доской (и порог в проёме)
  box('inWood', IN.x0, G - 0.06, IN.z0, IN.x1, G, IN.z1, [0.85, 0.66, 0.5]); // потолок доской
  for (let x = IN.x0 + 1.2; x < IN.x1 - 0.5; x += 2) box('inWood', x - 0.1, G - 0.3, IN.z0, x + 0.1, G - 0.06, IN.z1, DARK); // балки
  // Панели по низу стен до 1 м (кроме проёмов: под окнами и так глухо, у двери разрыв).
  const pan = [0.75, 0.55, 0.4];
  for (const [z0, z1] of [[IN.z0, ZC - DW / 2], [ZC + DW / 2, IN.z1]]) box('inWood', IN.x0, FL, z0, IN.x0 + 0.03, 1.0, z1, pan, true);
  box('inWood', IN.x1 - 0.03, FL, IN.z0, IN.x1, 1.0, IN.z1, pan, true);
  box('inWood', IN.x0, FL, IN.z0, IN.x1, 1.0, IN.z0 + 0.03, pan, true); box('inWood', IN.x0, FL, IN.z1 - 0.03, IN.x1, 1.0, IN.z1, pan, true);
  for (const [z0, z1, x0, x1] of [[IN.z0, IN.z1, IN.x0, IN.x0 + 0.05], [IN.z0, IN.z1, IN.x1 - 0.05, IN.x1]]) box('inWood', x0, 0.98, z0, x1, 1.04, z1, DARK);
  box('inWood', IN.x0, 0.98, IN.z0, IN.x1, 1.04, IN.z0 + 0.05, DARK); box('inWood', IN.x0, 0.98, IN.z1 - 0.05, IN.x1, 1.04, IN.z1, DARK);
  // Стойка вдоль задней стены: корпус из досок, столешница темнее; за ней шкаф и три полки с бутылками.
  const cx = 22.6, cz0 = -31.3, cz1 = -24.4;
  box('inWood', cx, FL, cz0, cx + 0.6, 1.05, cz1, OAK, true);
  box('inWood', cx - 0.08, 1.05, cz0 - 0.05, cx + 0.65, 1.12, cz1 + 0.05, DARK);
  box('inWood', IN.x1 - 0.55, FL, cz0, IN.x1, 0.95, cz1, OAK, true);
  box('inWood', IN.x1 - 0.6, 0.95, cz0 - 0.03, IN.x1, 1.0, cz1 + 0.03, DARK);
  // Полки за стойкой: группами — бутылки разной формы, бокалы, стаканы, книги, ящик, бочонок; между группами пусто.
  for (const y of [1.35, 1.75, 2.15]) box('inWood', IN.x1 - 0.28, y - 0.04, cz0, IN.x1, y, cz1, DARK);
  const br = rng(5), sx = IN.x1 - 0.14;
  const cyl = (r0, r1, h, y0, seg = 10) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, y0 + h / 2, 0);
  const SHAPES = { // бутылки: тело, плечи, горлышко; [геометрия, ширина в ряду]
    wine: [mergeGeometries([cyl(0.037, 0.037, 0.2, 0), cyl(0.037, 0.014, 0.05, 0.2), cyl(0.014, 0.013, 0.08, 0.25)].map((g) => g.toNonIndexed())), 0.09],
    square: [mergeGeometries([new THREE.BoxGeometry(0.075, 0.17, 0.075).translate(0, 0.085, 0), cyl(0.02, 0.015, 0.05, 0.17)].map((g) => g.toNonIndexed())), 0.1],
    flask: [mergeGeometries([new THREE.SphereGeometry(0.055, 10, 8).scale(1, 1.1, 0.7).translate(0, 0.06, 0), cyl(0.013, 0.012, 0.07, 0.11)].map((g) => g.toNonIndexed())), 0.12],
    slim: [mergeGeometries([cyl(0.028, 0.028, 0.25, 0), cyl(0.028, 0.01, 0.04, 0.25), cyl(0.01, 0.01, 0.05, 0.29)].map((g) => g.toNonIndexed())), 0.075],
  };
  const GLASS = { wine: [[0.08, 0.22, 0.1], [0.25, 0.12, 0.05], [0.2, 0.06, 0.06]], square: [[0.62, 0.4, 0.12], [0.75, 0.75, 0.68]], flask: [[0.75, 0.78, 0.72], [0.1, 0.25, 0.12]], slim: [[0.78, 0.8, 0.75], [0.5, 0.35, 0.08]] };
  const wineGlass = mergeGeometries([cyl(0.03, 0.03, 0.004, 0), cyl(0.004, 0.004, 0.09, 0.004), cyl(0.012, 0.036, 0.08, 0.094)].map((g) => g.toNonIndexed()));
  const tumbler = cyl(0.033, 0.036, 0.085, 0).toNonIndexed();
  const at = (z, y) => new THREE.Vector3(sx + (br() - 0.5) * 0.06, y, z);
  const shelf = (y, z0, z1) => {
    for (let z = z0; z < z1;) {
      const kind = br(), room = z1 - z;
      if (kind < 0.3) { // пусто
        z += 0.35 + br() * 0.6;
      } else if (kind < 0.62) { // бутылки одного вида группой, кое-где выше и ниже
        const names = Object.keys(SHAPES), nm = names[Math.floor(br() * names.length)], [geo, w] = SHAPES[nm], n = 3 + Math.floor(br() * 5);
        for (let i = 0; i < n && z < z1; i++, z += w) { const k = 0.9 + br() * 0.25, cols = GLASS[nm]; put('bottles', geo.clone(), new THREE.Matrix4().compose(at(z + w / 2, y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), br() * 3), new THREE.Vector3(k, k * (0.9 + br() * 0.2), k)), cols[Math.floor(br() * cols.length)]); }
        z += 0.12;
      } else if (kind < 0.76) { // бокалы или стаканы рядом
        const wg = br() < 0.5, n = 4 + Math.floor(br() * 4);
        for (let i = 0; i < n && z < z1; i++, z += 0.085) put('bottles', (wg ? wineGlass : tumbler).clone(), M(sx + (i % 2) * 0.07 - 0.03, y, z + 0.04), [0.82, 0.86, 0.86]);
        z += 0.15;
      } else if (kind < 0.88 && room > 0.4) { // книги корешками, последняя завалилась
        const n = 5 + Math.floor(br() * 5), BK = [[0.35, 0.05, 0.04], [0.06, 0.18, 0.1], [0.05, 0.08, 0.25], [0.32, 0.2, 0.08], [0.55, 0.45, 0.3]];
        for (let i = 0; i < n; i++) { const t = 0.03 + br() * 0.025, h = 0.19 + br() * 0.08, last = i === n - 1; put('inPaint', new THREE.BoxGeometry(0.16, h, t).translate(0, h / 2, 0).toNonIndexed(), M(sx, y, z + t / 2 + (last ? 0.06 : 0), 0, last ? -0.45 : 0), BK[Math.floor(br() * BK.length)]); z += t + 0.003; }
        z += 0.22;
      } else if (room > 0.5) { // ящик с бутылками или бочонок
        if (br() < 0.5) { box('inWood', sx - 0.13, y, z, sx + 0.13, y + 0.2, z + 0.42, [0.7, 0.5, 0.35]); for (let i = 0; i < 4; i++) put('bottles', cyl(0.014, 0.013, 0.09, 0.2).toNonIndexed(), M(sx + (i % 2 ? 0.06 : -0.06), y, z + 0.1 + (i >> 1) * 0.22), GLASS.wine[i % 3]); z += 0.55; }
        else { put('inWood', cyl(0.13, 0.13, 0.3, 0, 16).toNonIndexed(), M(sx, y, z + 0.16), [0.62, 0.42, 0.28]); for (const h of [0.05, 0.25]) put('inPaint', cyl(0.135, 0.135, 0.025, h, 16).toNonIndexed(), M(sx, y, z + 0.16), [0.12, 0.11, 0.1]); z += 0.42; }
      } else z += 0.3;
    }
  };
  shelf(1.35, cz0 + 0.08, cz1 - 0.08); shelf(1.75, cz0 + 0.08, cz1 - 0.08); shelf(2.15, cz0 + 0.5, cz1 - 1.6); // верхняя полка наполовину пустая
  // На шкафу: бочонок на подставке, поднос со стаканами.
  put('inWood', cyl(0.17, 0.17, 0.42, 0, 16).toNonIndexed(), M(IN.x1 - 0.06, 1.18, cz1 - 0.45, 0, 0, Math.PI / 2), [0.62, 0.42, 0.28]); // лёжа, дном к стене
  for (const p of [0.06, 0.335]) put('inPaint', cyl(0.175, 0.175, 0.025, 0, 16).toNonIndexed(), M(IN.x1 - 0.06 - p, 1.18, cz1 - 0.45, 0, 0, Math.PI / 2), [0.12, 0.11, 0.1]);
  box('inWood', IN.x1 - 0.45, 1.0, cz1 - 0.65, IN.x1 - 0.15, 1.04, cz1 - 0.25, DARK);
  for (let i = 0; i < 6; i++) put('bottles', tumbler.clone(), M(IN.x1 - 0.38 + (i % 3) * 0.08, 1.0, cz0 + 0.5 + (i / 3 | 0) * 0.08), [0.82, 0.86, 0.86]);
  // Табуреты у стойки, столики со стульями.
  for (const z of STOOLS) { // табурет: круглое сиденье, четыре ножки, подножка
    put('inWood', boxUV(new THREE.CylinderGeometry(0.19, 0.17, 0.07, 16).toNonIndexed(), 0.8), M(cx - 0.45, FL + 0.72, z), OAK);
    for (const [dx, dz] of [[0.1, 0.1], [-0.1, 0.1], [0.1, -0.1], [-0.1, -0.1]]) put('inWood', new THREE.BoxGeometry(0.04, 0.7, 0.04), M(cx - 0.45 + dx, FL + 0.35, z + dz), DARK);
    put('inWood', new THREE.BoxGeometry(0.24, 0.03, 0.24), M(cx - 0.45, FL + 0.28, z), DARK);
  }
  const chair = chairGeo();
  for (const [x, z, n] of TABLES) {
    put('inWood', boxUV(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20).toNonIndexed(), 0.9), M(x, 0.77 + FL - 0.05, z), OAK);
    put('inWood', new THREE.CylinderGeometry(0.05, 0.07, 0.72, 10).toNonIndexed(), M(x, FL + 0.36, z), DARK);
    put('inWood', new THREE.CylinderGeometry(0.25, 0.28, 0.04, 14).toNonIndexed(), M(x, FL + 0.02, z), DARK);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4; put('inWood', chair.clone(), M(x + Math.sin(a) * 0.62, FL, z + Math.cos(a) * 0.62, a + Math.PI), OAK); }
  }
  // Камин у южной стены: опоры и полка из камня, внутри топка с огнём, над ним штукатурный короб трубы.
  const fz = IN.z0;
  box('inStone', 20.0, FL, fz, 22.0, FL + 0.12, fz + 0.95, [0.8, 0.78, 0.74]); // под
  for (const [a, b] of [[20.1, 20.5], [21.5, 21.9]]) box('inStone', a, FL + 0.12, fz, b, 1.3, fz + 0.6);
  box('inStone', 20.5, FL + 0.12, fz, 21.5, 1.3, fz + 0.08, [0.25, 0.22, 0.2]); // закопчённая задняя стенка
  box('inWood', 20.0, 0.95, fz, 22.0, 1.3, fz + 0.62, DARK); // балка-перемычка
  box('inWood', 19.95, 1.3, fz, 22.05, 1.37, fz + 0.7, DARK); // полка
  box('inPlaster', 20.3, 1.37, fz, 21.7, G - 0.06, fz + 0.5, [0.97, 0.95, 0.9]);
  for (const [dx, a] of [[-0.15, 0.3], [0.12, -0.25]]) put('inWood', new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8).toNonIndexed(), M(21 + dx, FL + 0.2, fz + 0.3, a, 0, Math.PI / 2), DARK); // поленья
  // Лампы над столиками и стойкой: шнур и абажур (светится).
  for (const [x, y, z] of LAMPS.slice(0, 5)) {
    put('inWood', new THREE.CylinderGeometry(0.006, 0.006, G - 0.06 - y, 4), M(x, (G - 0.06 + y) / 2, z), [0.15, 0.15, 0.15]);
    put('glow', new THREE.CylinderGeometry(0.07, 0.24, 0.22, 16, 1, true), M(x, y, z), [0.95, 0.62, 0.3]);
    put('glow', new THREE.SphereGeometry(0.05, 8, 6), M(x, y - 0.08, z), [1, 0.92, 0.75]);
  }
}

// ---------- Материалы ----------
const loader = new THREE.TextureLoader();
const tex = (n, data) => { const t = loader.load(`/tex/${n}.webp`); t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
// Свет зала: солнца внутри нет, рассеянный свет неба втрое слабее, светят лампы и камин (тёплые, мягко, без теней).
const lamp = { pos: { value: LAMPS.map((p) => new THREE.Vector3(...p)) }, pow: { value: [1.6, 1.6, 1.6, 1.4, 1.4, 1.2] } };
function inside(m) {
  m.customProgramCacheKey = () => 'house-in';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.lampP = lamp.pos; sh.uniforms.lampI = lamp.pow;
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = 'varying vec3 vWp; uniform vec3 lampP[6]; uniform float lampI[6];\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      vec3 wn = inverseTransformDirection(normal, viewMatrix), acc = vec3(0.);
      for (int i = 0; i < 6; i++) { vec3 d = lampP[i] - vWp; float r2 = dot(d, d); acc += lampI[i] * (.3 + .7 * max(dot(wn, d * inversesqrt(r2)), 0.)) / (1. + r2 * .55); }
      reflectedLight.directDiffuse = diffuseColor.rgb * acc * vec3(1., .66, .38);
      reflectedLight.directSpecular *= 0.;
      reflectedLight.indirectDiffuse *= .3; reflectedLight.indirectSpecular *= .3;`);
  };
  return m;
}
// Стекло: тёмное, отражает небо (окружение сцены); насквозь видно комнату, под острым углом — больше отражения.
function glassMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#0d1416', roughness: 0.04, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 2.6, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      float fr = pow(1. - abs(dot(normalize(vViewPosition), normal)), 3.);
      gl_FragColor.a = clamp(.14 + .7 * fr + .9 * dot(gl_FragColor.rgb, vec3(.33)), 0., .92);`);
  };
  return m;
}
// Резные доски перил: доски с вырезами-сердечками на прозрачном, волокна нарисованы.
function railTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d'), r = rng(23);
  for (let i = 0; i < 2; i++) {
    const x = i * 128 + 4, w = 120;
    g.fillStyle = '#9a6a45'; g.fillRect(x, 0, w, 512);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(70,40,22,${0.08 + r() * 0.15})`; g.fillRect(x + r() * w, 0, 1 + r() * 2, 512); }
    g.fillStyle = 'rgba(40,24,14,0.6)'; g.fillRect(x, 0, 3, 512); g.fillRect(x + w - 3, 0, 3, 512);
    g.globalCompositeOperation = 'destination-out'; // вырезы: сердце посередине, капли сверху и снизу
    const cx = x + w / 2;
    g.beginPath(); g.moveTo(cx, 300); g.bezierCurveTo(cx - 70, 240, cx - 40, 170, cx, 205); g.bezierCurveTo(cx + 40, 170, cx + 70, 240, cx, 300); g.fill();
    for (const y of [70, 440]) { g.beginPath(); g.ellipse(cx, y, 14, 34, 0, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// За стеклом второго этажа: по бокам шторы в складках, посередине полутёмная комната.
function curtainTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x++) {
    const e = Math.min(x, 127 - x) / 64, drape = e < 0.42, v = drape ? 205 + 32 * Math.sin(x * 0.7) : 46 + 14 * Math.sin(x * 0.2);
    g.fillStyle = drape ? `rgb(${v},${v - 10},${v - 30})` : `rgb(${v + 10},${v},${v - 8})`; g.fillRect(x, 0, 1, 64);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#1e3b2f'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#d9c38a'; x.lineWidth = 5; x.strokeRect(10, 10, 492, 108);
  x.fillStyle = '#f1ead8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 64px Georgia, "Times New Roman", serif'; x.fillText('CLUBHAUS', 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- Дверь ----------
// Петли у северного косяка, ближе к залу; створка закрыта поперёк проёма и открывается внутрь (к +x) на 100°.
const HX = X0 + T * 0.62, HZ = ZC + DW / 2 - 0.02, LEAF = DW - 0.04, OPEN = 1.75;
const doorSeg = [HX, HZ, HX, HZ - LEAF]; // створка для столкновений: меняется на месте, club.js держит ссылку
export const door = {
  pos: new THREE.Vector3(X0 + T / 2, FL, ZC), // середина проёма
  open: false, a: 0, from: 0, t0: -1e9,
  // Открыть или закрыть: створка поворачивается плавно за 0,9 с; проход открывается сразу.
  toggle(now = performance.now() / 1000) {
    this.from = this.angle(now); this.t0 = now; this.open = !this.open;
    const a = this.open ? OPEN : 0; doorSeg[2] = HX + Math.sin(a) * LEAF; doorSeg[3] = HZ - Math.cos(a) * LEAF;
    return this.open;
  },
  angle(now = performance.now() / 1000) { const u = Math.min(1, (now - this.t0) / 0.9), e = u * u * (3 - 2 * u); return this.from + ((this.open ? OPEN : 0) - this.from) * e; },
};
function doorLeaf(wood, paint) {
  const pivot = new THREE.Group(); pivot.position.set(HX, 0, HZ); pivot.name = 'door'; pivot.userData.door = door; // тестам: дверь по сцене
  const parts = [boxUV(new THREE.BoxGeometry(0.05, DH - 0.02, LEAF), 1.4, true).translate(0, FL + DH / 2, -LEAF / 2)];
  for (const y of [0.35, DH - 0.35]) parts.push(boxUV(new THREE.BoxGeometry(0.03, 0.12, LEAF - 0.1), 1.4).translate(0.04, FL + y, -LEAF / 2)); // поперечины изнутри
  const leaf = new THREE.Mesh(tint(mergeGeometries(parts.map((g) => g.toNonIndexed())), [0.5, 0.33, 0.22]), wood);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: 0.8, roughness: 0.35 }));
  handle.position.set(-0.06, FL + 1.05, -LEAF + 0.12);
  const handle2 = handle.clone(); handle2.position.x = 0.06;
  leaf.castShadow = leaf.receiveShadow = true; leaf.frustumCulled = false;
  leaf.onBeforeRender = () => { pivot.rotation.y = -door.angle(); pivot.updateMatrixWorld(true); }; // матрица сразу: кадр без запаздывания
  pivot.add(leaf, handle, handle2);
  return pivot;
}

// ---------- Игроки в зале ----------
// У игроков свои материалы: свет зала (шейдер ламп) их не видит, а небо и окружение светят как на улице — Лёва в
// зале выходил светлее комнаты. indoor(x, z): 0 снаружи, 1 в зале, через проём двери нарастает за 1,2 м.
export function indoor(x, z) {
  if (x < X0 - 0.2 || x > IN.x1 || z < IN.z0 || z > IN.z1) return 0;
  return Math.min(1, (x - X0 + 0.2) / 1.2);
}
// Игроков в зале — тусклее и теплее (цвет материалов), отражения неба слабее. players — Player (pos, wrap, racket);
// материалы трогаем, только когда доля «внутри» поменялась. Крючок — в draw() main.js.
const WARM = new THREE.Color(0.6, 0.48, 0.38);
export function shadeIndoors(players) {
  for (const p of players) {
    if (!p?.wrap) continue;
    const f = indoor(p.pos.x, p.pos.z);
    if (p.indoorF === f) continue;
    p.indoorF = f;
    for (const root of [p.wrap, p.racket]) root?.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        const u = (m.userData.outdoor ??= { color: m.color?.clone(), env: m.envMapIntensity ?? 1 });
        if (u.color) m.color.copy(u.color).lerp(u.color.clone().multiply(WARM), f);
        m.envMapIntensity = u.env * (1 - 0.65 * f);
      }
    });
  }
}

// Стены и мебель для столкновений (формат pushOut из club.js): прямоугольники [x0, z0, x1, z1], круги [x, z, r],
// отрезки [ax, az, bx, bz] (створка), пол зала [x0, z0, x1, z1, y]. Стены первого этажа — с проёмом двери.
export const HOUSE = {
  boxes: [[X0, Z0, X0 + T, ZC - DW / 2], [X0, ZC + DW / 2, X0 + T, Z1], [X1 - T, Z0, X1, Z1], [X0, Z0, X1, Z0 + T], [X0, Z1 - T, X1, Z1],
    [22.52, -31.35, 23.25, -24.35], [IN.x1 - 0.6, -31.35, IN.x1, -24.35], [20.0, IN.z0, 22.0, IN.z0 + 0.6]], // стойка, шкаф, камин
  circles: [...TABLES.map(([x, z]) => [x, z, 0.82]), ...STOOLS.map((z) => [22.15, z, 0.2])],
  segs: [doorSeg],
  floors: [[X0, IN.z0, IN.x1, IN.z1, FL]], // от порога до задней стены
};

export function buildHouse() {
  for (const k of Object.keys(P)) P[k].length = 0;
  shell(); interior();
  const D = (n) => tex(n), N = (n) => tex(`${n}-n`, true);
  const stone = new THREE.MeshStandardMaterial({ map: D('stone'), normalMap: N('stone'), roughness: 0.92, vertexColors: true });
  const plaster = new THREE.MeshStandardMaterial({ map: D('plaster'), normalMap: N('plaster'), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, vertexColors: true, color: '#f4f1ea' });
  const wood = new THREE.MeshStandardMaterial({ map: D('wood'), normalMap: N('wood'), roughness: 0.8, vertexColors: true });
  const roof = new THREE.MeshStandardMaterial({ map: D('slate'), normalMap: N('slate'), roughness: 0.85, vertexColors: true });
  const paint = new THREE.MeshStandardMaterial({ color: '#f2efe8', normalMap: N('wood'), normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.5, vertexColors: true });
  const mats = {
    stone, plaster, wood, roof, paint, glass: glassMat(),
    curtain: new THREE.MeshLambertMaterial({ map: curtainTexture(), vertexColors: true }),
    rail: new THREE.MeshStandardMaterial({ map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    gerLeaf: cardMat(gerLeafTex()), gerFlower: cardMat(gerFlowerTex()), gerTrail: cardMat(gerTrailTex(false)), gerTrailF: cardMat(gerTrailTex(true)),
    inPlaster: inside(plaster.clone()), inWood: inside(wood.clone()), inStone: inside(stone.clone()),
    bottles: inside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 })),
    inPaint: inside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  const g = new THREE.Group(); g.name = 'house';
  for (const [k, list] of Object.entries(P)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { for (const a of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) x.deleteAttribute(a); return x; })), mats[k]);
    const outside = !k.startsWith('in') && !['bottles', 'glow', 'glass', 'curtain'].includes(k);
    mesh.castShadow = outside; mesh.receiveShadow = outside; mesh.name = 'house-' + k;
    g.add(mesh);
  }
  // Табличка над дверью.
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
  sg.position.set(X0 - 0.03, FL + DH + 0.5, ZC); sg.rotation.y = -Math.PI / 2; g.add(sg);
  // Огонь в камине: две скрещённые карточки пламени, светятся и дрожат.
  const fire = new THREE.Group(); fire.position.set(21, FL + 0.14, IN.z0 + 0.32);
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 128;
  const fx = fc.getContext('2d'), grd = fx.createRadialGradient(32, 112, 4, 32, 90, 60);
  grd.addColorStop(0, 'rgba(255,240,180,1)'); grd.addColorStop(0.35, 'rgba(255,150,40,0.9)'); grd.addColorStop(0.7, 'rgba(200,60,10,0.4)'); grd.addColorStop(1, 'rgba(120,20,0,0)');
  fx.fillStyle = grd; fx.beginPath(); fx.moveTo(32, 2); fx.bezierCurveTo(60, 60, 64, 128, 32, 128); fx.bezierCurveTo(0, 128, 4, 60, 32, 2); fx.fill();
  const fm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const a of [0.5, -0.5]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6).translate(0, 0.3, 0), fm); f.rotation.y = a; fire.add(f); }
  fire.children[0].onBeforeRender = () => { const t = performance.now() / 1000; fire.scale.set(1, 0.85 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3), 1); lamp.pow.value[5] = 1.1 + 0.25 * Math.sin(t * 11) * Math.sin(t * 4.1); };
  g.add(fire, doorLeaf(mats.wood, mats.paint));
  return g;
}
