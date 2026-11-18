// Альпийская долина вокруг клуба: ровное дно с лугами, склоны в еловом лесу, выше альпийские луга, скалы и снег.
// Рельеф по рецепту «Восхождения» (projects/ascent/src/world.js): вершины с тремя гребнями сливаются мягким максимумом,
// сверху гребневый шум. Скала там, где склон круче, снег выше линии и на пологом. Корт в центре, долина вдоль оси z.
// Клуб стоит на пологом холме: на площадке мягкие бугры (ровно у кортов, дорожек, дома), к краям газон сходит вниз,
// вокруг бугры, вперёд (−z) длинный склон к дну долины на 18 м ниже.
import * as THREE from 'three';
import { SUN } from './env-sky.js';

const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches; // телефон: земля клуба крупнее

function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct) { let a = 0.5, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x, z); x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; } return s; }
function ridged(x, z, oct) { // острые гребни: 1 - |шум|, в квадрате
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const c = 2 * vnoise(x, z) - 1, v = 1 - Math.sqrt(c * c + 0.0004); s += a * v * v; n += a; x = x * 2.07 + 31.7; z = z * 2.07 + 11.3; a *= 0.5; }
  return s / n;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// x, z, высота, спад, фаза гребней. В дальнем конце долины (−z, куда смотрит игровая камера) большая снежная вершина.
const PEAKS = [
  [-500, -9800, 3300, 2500, 0.4], [2700, -8400, 2500, 1900, 1.7], [-3800, -7600, 2500, 1900, 2.9],
  [3300, -3600, 2000, 1500, 0.9], [3900, 700, 2300, 1700, 2.2], [3100, 4800, 1900, 1500, 4.1],
  [-3400, -2800, 2200, 1600, 3.3], [-3900, 1900, 2400, 1800, 0.2], [-3000, 5800, 1900, 1500, 5.0],
  [300, 9400, 2900, 2300, 1.4], [-2800, 8400, 2300, 1800, 3.8], [3600, 8800, 2200, 1700, 0.6],
  [-7200, -1500, 3000, 2600, 2.4], [7400, -2400, 3100, 2600, 1.1], [7000, 5200, 2700, 2300, 3.6], [-6800, 6400, 2600, 2200, 0.8],
];
const K = 90; // мягкость слияния вершин, м

// Площадка клуба: по ней ходят, на ней корты, дом, дорожки, скамейки. Ровно только там (FLAT), на газоне бугры.
export const PAD = { x0: -54, x1: 58, z0: -44, z1: 37 }; // от корта 2 слева до дороги справа: стоянка и вход тоже ровные
export const DROP = 18; // дно долины ниже площадки клуба, м
const LIP = 0.45; // к краям площадки газон сходит вниз на столько, м: дальше склон холма
export const padDist = (x, z) => Math.hypot(Math.max(PAD.x0 - x, 0, x - PAD.x1), Math.max(PAD.z0 - z, 0, z - PAD.z1));
const padIn = (x, z) => Math.min(x - PAD.x0, PAD.x1 - x, z - PAD.z0, PAD.z1 - z); // насколько глубоко внутри площадки, м
// Холм клуба: последние 7 м площадки газон сходит на LIP вниз, за краем пологие бугры по метру, дальше склон к дну
// долины — вперёд (−z) длиннее, его видно с корта над забором как бровку, за которой открывается долина.
function knoll(x, z) {
  const d = padDist(x, z);
  if (d === 0) return -LIP * smooth(7, 0, padIn(x, z));
  const reach = 140 + 130 * smooth(0, -220, z);
  return -LIP - (DROP - LIP) * smooth(10, reach, d) + (fbm(x / 24, z / 24, 2) - 0.5) * 3.2 * smooth(1, 16, d) * smooth(220, 60, d);
}

// ---------- План клуба (метры) ----------
// Дорожки: [ширина, [[x, z], …]]. От калитки к дорожке вдоль корта, по ней на террасу (z −19) и назад, к входу в клуб.
export const PATHS = [
  [1.2, [[9.2, 3.99], [10.85, 3.99]]],
  [1.4, [[10.85, 10.2], [10.85, -19.3]]],
  [1.5, [[10.85, 10.2], [11.4, 15.8], [10.3, 21.6], [6, 24.7], [-2, 25.7], [-12, 25.3], [-23, 23.6], [-25.6, 14], [-26.8, 3.99], [-28.7, 3.99]]], // за спиной Лёвы к калитке корта 2
  [1.6, [[10.6, 20.4], [15.5, 25.6], [26, 28.8], [38, 30.2], [48.5, 30.6]]], // ко входу с дороги и стоянке
  [7, [[51.3, 22], [51.3, 32]]], // гравийная стоянка у дороги (дорога на x ≈ 57.5)
];
// Насколько точка дальше края дорожки, м (минус — на дорожке). Деревья и камни ставим не ближе пары метров.
export function pathGap(x, z) {
  let best = Infinity;
  for (const [w, pts] of PATHS) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - w / 2);
  }
  return best;
}
// Ровные места без бугров (кроме дорожек): корты с изгородью, терраса с домом — прямоугольники [x0, z0, x1, z1];
// скамейки, фонари, табличка, флаг, фонтан — круги [x, z, r]. Модули клуба дописывают свои при загрузке модуля
// (FLAT.circles.push), до постройки мира: высоту (heightAt) спрашивают уже при постройке.
export const FLAT = { rects: [[-10.5, -21.3, 10.4, 21.2], [-48.4, -21.2, -27.6, 21.2], [9.8, -35.6, 26.6, -18.6]], circles: [] };
function flatGap(x, z) {
  let d = pathGap(x, z);
  for (const [x0, z0, x1, z1] of FLAT.rects) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
  for (const [cx, cz, r] of FLAT.circles) d = Math.min(d, Math.hypot(x - cx, z - cz) - r);
  return d;
}
// Рельеф газона: длинные мягкие холмы ~27 м и ложбины, от −0,75 до +1,2 м — только вдали от ровного (нарастают за 14 м, без
// ступенек), бугры ~11 м до ±0,35 м и кочки ~3 м до ±6 см — ближе. За краем площадки гаснет за 8 м (там бугры холма).
// Только в рамке GRID: там земля мелкой сеткой.
export const GRID = { x0: PAD.x0 - 8, x1: PAD.x1 + 8, z0: PAD.z0 - 8, z1: PAD.z1 + 8 };
function relief(x, z) {
  if (x <= GRID.x0 || x >= GRID.x1 || z <= GRID.z0 || z >= GRID.z1) return 0;
  const k = smooth(8, 0, padDist(x, z)); if (k === 0) return 0;
  const d = flatGap(x, z); if (d <= 0.4) return 0;
  const hill = (smooth(0.3, 0.85, vnoise(x / 27 + 1.7, z / 27 - 4.1)) * 1.95 - 0.75) * smooth(1.5, 14, d);
  const bump = (vnoise(x / 11 + 3.1, z / 11 - 7.3) - 0.5) * 0.7 * smooth(0.4, 5, d) + (vnoise(x / 3 - 11, z / 3 + 5) - 0.5) * 0.12 * smooth(0.4, 2.5, d);
  return (hill + bump) * k;
}
// Высота, по которой ходят (газон, дорожки, корт): на ровном месте 0. Земля рисуется на 5 см ниже (heightAt).
export const groundAt = (x, z) => heightAt(x, z) + 0.05;

export function heightAt(x, z) {
  // Дно долины: ровное у клуба, полкилометра в ширину; хвосты гор на него не заползают.
  const floor = Math.max(smooth(420, 1700, Math.abs(x + 180 * Math.sin(z / 1400))), smooth(2600, 6500, Math.abs(z)));
  let y = 0;
  if (floor > 0) { // на дне долины горы дают ноль: вершины не считаем (земля клуба — десятки тысяч вызовов)
    let e = 1;
    for (const p of PEAKS) {
      const dx = x - p[0], dz = z - p[1], d = Math.sqrt(dx * dx + dz * dz + 1e4);
      const crest = 1 - Math.abs(Math.sin(1.5 * Math.atan2(dz, dx) + p[4]));
      e += Math.exp((p[2] * Math.exp((-d * (1 - 0.45 * crest)) / p[3])) / K) - 1;
    }
    y = Math.log(e) * K * floor;
    y += (ridged(x / 1300, z / 1300, 5) - 0.42) * 0.5 * y; // рёбра и кулуары пропорционально высоте: дно остаётся ровным
    y += (ridged(x / 380, z / 380, 4) - 0.42) * 0.22 * y * smooth(400, 1500, y); // выше леса — скальные гребешки и осыпи
  }
  y += (fbm(x / 160, z / 160, 3) - 0.47) * 10 * smooth(240, 500, Math.hypot(x, z)); // пологие бугры луга
  if (Math.abs(x) < 700 && Math.abs(z) < 700) y += knoll(x, z) + DROP + relief(x, z); // дальше холм уже сошёл на нет
  return y - DROP - 0.05;
}

// Дорога и река вдоль долины (x от z): шейдер склона рисует их лентами, вдоль реки растут деревья, дома их обходят.
export const roadX = (z) => -180 * Math.sin(z / 1400) + 70 * Math.sin(z / 430 + 1);
export const riverX = (z) => -180 * Math.sin(z / 1400) - 160 + 55 * Math.sin(z / 260) + 25 * Math.sin(z / 97 + 2);

// Доли леса, скалы и снега в точке: по высоте над дном долины и крутизне (ny — y нормали). Те же пороги шейдер ломает шумом.
function zones(x, z, y, ny) {
  y += DROP;
  const n = fbm(x / 500, z / 500, 3);
  const rock = smooth(0.8, 0.66, ny) + smooth(2500, 2900, y + n * 400) * smooth(0.9, 0.75, ny);
  const snow = smooth(2150, 2450, y + (n - 0.5) * 500) * smooth(0.55, 0.72, ny);
  const forest = smooth(6, 40, y) * smooth(1800, 1500, y + (n - 0.5) * 300) * smooth(0.6, 0.74, ny) * smooth(0.3, 0.42, n + 0.08 * Math.sin(x / 300));
  return [forest, Math.min(1, rock), snow];
}

// Полярная сетка: по кругу гуще в сторону игровой камеры (−z) и меню (+z), по радиусу шаг растёт с удалением.
function ring(r0, r1, ratio, nA) {
  const rs = []; for (let r = r0; r < r1 * ratio; r *= ratio) rs.push(Math.min(r, r1));
  const nr = rs.length, pos = new Float32Array(nr * (nA + 1) * 3), zone = new Float32Array(nr * (nA + 1) * 4);
  for (let j = 0, k = 0; j < nr; j++) for (let i = 0; i <= nA; i++, k++) {
    const t = (i / nA) * Math.PI * 2, a = t - 0.28 * Math.sin(2 * t); // плотнее у a = 0 и π
    const x = Math.sin(a) * rs[j], z = -Math.cos(a) * rs[j];
    pos.set([x, heightAt(x, z), z], k * 3);
  }
  const idx = [];
  for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, b = a + nA + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  for (let k = 0; k < pos.length / 3; k++) {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], e = Math.max(8, Math.hypot(x, z) * 0.012);
    // Кривизна: в ложбинах и кулуарах темнее (там тень и сырость), на гребнях светлее.
    const curv = (heightAt(x + e, z) + heightAt(x - e, z) + heightAt(x, z + e) + heightAt(x, z - e) - 4 * y) / (e * 4);
    zone.set([...zones(x, z, y, nrm[k * 3 + 1]), Math.min(1.15, Math.max(0.55, 1 - curv * 0.9))], k * 4);
  }
  g.setAttribute('zone', new THREE.BufferAttribute(zone, 4));
  g.setAttribute('sunvis', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  return g;
}

// Тени гребней: из каждой вершины идём к солнцу шагами, растущими на 30 %, и смотрим, не выше ли склон луча.
// Край мягкий: чем ближе луч к рельефу, тем темнее. Считаем в фоне кусками по 6 мс — старт не ждёт, тень проявляется
// плавно за секунду (bake.value от 0 к 1).
function bakeSun(geos, bake) {
  const jobs = geos.map((g) => ({ p: g.attributes.position.array, n: g.attributes.normal.array, v: g.attributes.sunvis, i: 0 }));
  const top = 3700 - DROP;
  const slice = () => {
    const end = performance.now() + 6;
    for (const j of jobs) {
      const { p, n, v } = j, cnt = v.count;
      for (; j.i < cnt && performance.now() < end; j.i++) {
        const i = j.i, x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        if (n[i * 3] * SUN.x + n[i * 3 + 1] * SUN.y + n[i * 3 + 2] * SUN.z < 0.02) continue; // к солнцу спиной: темно и так
        if (x * x + z * z < 600 * 600) continue; // клуб на солнце всегда: корт освещает настоящее солнце с картой теней
        let vis = 1;
        for (let t = 25; t < 12000; t *= 1.3) {
          const ry = y + SUN.y * t; if (ry > top) break;
          vis = Math.min(vis, (ry - heightAt(x + SUN.x * t, z + SUN.z * t)) / (t * 0.06) + 0.5);
          if (vis <= 0) break;
        }
        v.array[i] = Math.max(0, Math.min(1, vis));
      }
      if (j.i < cnt) return setTimeout(slice, 0);
    }
    for (const j of jobs) j.v.needsUpdate = true;
    const t0 = performance.now(), fade = () => { bake.value = Math.min(1, (performance.now() - t0) / 1200); if (bake.value < 1) requestAnimationFrame(fade); };
    fade();
  };
  setTimeout(slice, 300);
}

const NOISE = /* glsl */ `
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f); return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
// Рёбра и кулуары скалы вдоль линии падения: a — вдоль горизонтали склона, y — высота. fine > 1 — только крупные (0..1).
float ribs(float a, float y, float fine){
  float r1 = 1. - abs(vn(vec2(a / 85., y / 380.)) * 2. - 1.);
  if (fine > 1.) return r1;
  return r1 * 30. + (1. - abs(vn(vec2(a / 28., y / 120.) + 7.) * 2. - 1.)) * 10. * fine;
}
`;

// Цвет склона считается в пикселе: доли из вершин плюс шум, поэтому кромки снега, скал и леса рваные и чёткие,
// а не размытые по ячейке сетки. На внутреннем кольце (CLUB) вблизи — фото газона, дорожки и клумбы с карты клуба.
// Солнце на склоне гасят тень гребней (запечена в вершины) и тени облаков, плывущие по горам.
// hole — рамка, где кольцо не рисуется: там земля клуба мелкой сеткой (clubGround).
function terrainMaterial(U, club, hole) {
  const m = new THREE.MeshLambertMaterial();
  if (club) { m.defines = { CLUB: '' }; m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 4; } // газон под кортом не мерцает сквозь грунт издали
  if (hole) m.defines.HOLE = '';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, club ?? {}, hole ? { hole: { value: hole } } : {});
    sh.vertexShader = 'attribute vec4 zone; attribute float sunvis; varying vec4 vZone; varying float vSun; varying vec3 vW, vN;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vZone = zone; vSun = sunvis; vW = position; vN = normal;');
    sh.fragmentShader = `varying vec4 vZone; varying float vSun; varying vec3 vW, vN; uniform float time, bake;
      #ifdef CLUB
        uniform sampler2D clubMap, lawnT, lawnN, dirtT, dirtN, gravelT, gravelN; uniform vec4 clubRect, pad;
      #endif
      #ifdef HOLE
        uniform vec4 hole;
      #endif
      ${NOISE}
      ` + sh.fragmentShader.replace('#include <map_fragment>', `
      float dist = length(vW - cameraPosition);
      float n1 = vn(vW.xz / 90.), n2 = vn(vW.xz / 23.), n3 = vn(vW.xz / 6.);
      float nn = n1 * .55 + n2 * .3 + n3 * .15;
      // Луга на дне долины участками: скошенные светлее и желтее, некошеные темнее; по межам полоса темнее.
      vec2 fp = mat2(.96, .28, -.28, .96) * vW.xz / vec2(70., 150.) + vec2(vn(vW.xz / 40.) * .25, 0.);
      vec2 ff = fract(fp); float edge = smoothstep(.06, .0, min(min(ff.x, 1. - ff.x) * 2.1, min(ff.y, 1. - ff.y)));
      float flat_ = smoothstep(.93, .985, normalize(vN).y) * smoothstep(400., 60., vW.y);
      float parcel = (h12(floor(fp)) - .5) * flat_;
      vec3 meadow = mix(vec3(.075, .1, .03), vec3(.13, .135, .045), smoothstep(.25, .8, n1 * .6 + n3 * .15 + parcel * .45 + .2));
      meadow *= 1. - .12 * edge * flat_;
      vec3 alpine = mix(vec3(.11, .11, .05), vec3(.15, .13, .08), n2), snowC = vec3(.86, .89, .93);
      vec3 rockC = mix(vec3(.16, .15, .14), vec3(.32, .3, .27), n2 * .6 + n3 * .4);
      vec3 forestC = mix(vec3(.014, .028, .016), vec3(.03, .05, .028), n3); // ельник: заметно темнее луга, кроны пятнами
      float alt = smoothstep(1500., 1900., vW.y + (nn - .5) * 300.);
      meadow *= mix(1., .62, smoothstep(40., 500., vW.y)) * mix(1., .8, 1. - flat_); // на склонах луг темнее и бурее, не салатовые пятна
      vec3 c = mix(meadow, alpine, alt);
      c = mix(c, forestC, smoothstep(.45, .55, vZone.x + (nn - .5) * .5));
      // Скала: вертикальные промоины и полки, в крутых местах темнее; под скалой осыпь светлее.
      float sy = normalize(vN).y;
      // Рельеф скалы для света: рёбра и кулуары вдоль линии падения, мельче — уступы. Октавы гаснут, когда мельче пикселя.
      vec3 Nn = normalize(vN); vec2 tng = normalize(vec2(-Nn.z, Nn.x) + 1e-4); float along = dot(vW.xz, tng);
      float pix = dist * .0012;
      float rib = ribs(along, vW.y, 99.), rib2 = 1. - abs(vn(vec2(along / 28., vW.y / 120.) + 7.) * 2. - 1.);
      rockC *= (.55 + .6 * rib * rib) * (.85 + .3 * rib2) * mix(1., .6, smoothstep(.6, .3, sy));
      float rk = smoothstep(.45, .6, vZone.y + (n2 - .5) * .5 + (n3 - .5) * .25);
      c = mix(c, mix(rockC, vec3(.3, .29, .27), smoothstep(.62, .75, sy) * .6), rk);
      c = mix(c, snowC, smoothstep(.45, .55, vZone.z + (nn - .5) * .6 + (rib - .5) * .3));
      float bumpK = mix(.15, 1., rk) * smoothstep(.97, .8, Nn.y) * smoothstep(250., 900., dist); // только склоны; у клуба рельеф настоящий
      #ifdef CLUB
        vec2 q = vW.xz;
        float near = 1. - smoothstep(90., 260., dist);
        vec2 cu = (q - clubRect.xy) / clubRect.z;
        vec3 k = texture2D(clubMap, clamp(cu, 0., 1.)).rgb * step(0., min(cu.x, cu.y)) * step(max(cu.x, cu.y), 1.);
        vec2 pd2 = max(max(pad.xy - q, q - pad.zw), 0.); float pd = length(pd2); // за краем площадки, м
        // Газон: Poly Haven leafy_grass (кадр 2 м) двумя плитками разного шага и поворота, смешанными пятнами, — без
        // повтора ни сверху, ни у ног. На фото поверх травы бурые листья: травинки красим в зелень, листья — в клевер.
        vec2 u1 = q / 1.7, u2 = mat2(.8, .6, -.6, .8) * q / 2.9 + .37;
        float bl = smoothstep(.25, .75, vn(q / 4.3));
        vec3 gt = mix(texture2D(lawnT, u1).rgb, texture2D(lawnT, u2).rgb, bl);
        vec2 gN = mix(texture2D(lawnN, u1).xy * 2. - 1., mat2(.8, -.6, .6, .8) * (texture2D(lawnN, u2).xy * 2. - 1.), bl);
        float gl = dot(gt, vec3(.3, .59, .11)), gr = clamp((gt.g - gt.r) * 7. + .55, 0., 1.);
        float clover = smoothstep(.5, .78, vn(q / 2.3 + 13.) * .75 + vn(q / .7) * .25) * .6;
        vec3 lawn = mix(mix(vec3(.16, .22, .07), vec3(.11, .2, .08), clover), vec3(.2, .3, .08), gr) * gl * 2.1;
        // Пятна крупно и мелко: суше и желтее / сочнее.
        float pat = vn(q / 13.) * .55 + vn(q / 4.1) * .3 + vn(q / 1.3) * .15;
        lawn *= mix(vec3(1.08, 1.04, .82), vec3(.9, .97, .92), smoothstep(.3, .7, pat));
        // Полосы стрижки по 2 м вдоль корта: трава наклонена, поэтому полоса светлее или темнее смотря откуда смотреть,
        // сверху их почти нет. За площадкой газон переходит в некошеный луг.
        float mown = 1. - smoothstep(0., 5., pd);
        lawn *= 1. + .035 * mown * (1. - k.b) * clamp(sin(q.x * 1.5708 + .3) * 2.5, -1., 1.) * normalize(vW - cameraPosition).z;
        // Бугры светом заметнее: склон к солнцу светлее, от солнца темнее — сверх обычного освещения (оно у газона плоское
        // из-за сильного рассеянного света неба).
        lawn *= (1. + clamp(2.6 * (dot(normalize(vN), GSUN) - GSUN.y), -.25, .25)) * vec3(.93, .94, .92);
        float rough = max(k.b, smoothstep(3., 16., pd) * .75);
        lawn = mix(lawn, lawn * vec3(.95, .88, .62) * (.8 + .4 * vn(q * 1.7)), rough);
        // Проплешины — вытоптанная земля пятнами; у стволов и на клумбах тёмная земля (на клумбах ещё темнее, с корой).
        vec3 soilC = dot(texture2D(dirtT, q / 2.).rgb, vec3(.33)) * vec3(.5, .38, .27);
        vec2 dN = texture2D(dirtN, q / 2.).xy * 2. - 1.;
        float bald = smoothstep(.8, .9, vn(q / 2.6 + 2.7) * .6 + vn(q / .9 - 4.) * .4) * smoothstep(.55, .75, vn(q / 17. + 9.)) * mown * (1. - k.b);
        lawn = mix(lawn, mix(soilC * .9, lawn * .8, smoothstep(.4, .7, vn(q * 2.3))), bald * .8); // земля сквозь редкую траву
        float soil = smoothstep(.28, .5, k.g + (vn(q * 3.) - .5) * .3);
        lawn = mix(lawn, soilC * mix(.62, .38, step(.7, k.g)) * (.75 + .5 * vn(q * 7.)), soil);
        // Дорожка из гравия (Poly Haven gravel_floor_02, кадр 2 м) с рваным краем.
        float pe = k.r + (vn(q * 2.2) - .5) * .3 + (vn(q * 9.) - .5) * .14, wp = smoothstep(.47, .55, pe);
        vec3 grav = texture2D(gravelT, q / 2.).rgb * (.8 + .3 * vn(q / 2.5)) * vec3(.8, .77, .72);
        vec2 rN = texture2D(gravelN, q / 2.).xy * 2. - 1.;
        lawn = mix(lawn, grav, wp);
        // Вокруг корта крошка, вынесенная обувью, — рыжая кайма за бордюром.
        float cd = min(max(abs(q.x) - 9.3, abs(q.y) - 20.04), max(abs(q.x + 38.) - 9.3, abs(q.y) - 20.04)); // корт 1 и корт 2
        float kay = smoothstep(.7, .1, cd + (vn(q * 3.) - .5) * .5) * step(0., cd + .2) * .8;
        lawn = mix(lawn, mix(grav, vec3(.42, .17, .08), .55), kay);
        vec2 cN = mix(mix(gN * .8, dN, max(bald, soil)), rN * 1.2, max(wp, kay)) * near; // наклон нормали по картам
        c = mix(c, lawn, near);
      #endif
      // Дорога (асфальт 7 м) и река (14 м, в ней небо) по дну долины; у реки берег темнее и сырее.
      float fw = fwidth(vW.x) + fwidth(vW.z) + .01, rz = vW.z;
      float roadD = abs(vW.x - (-180. * sin(rz / 1400.) + 70. * sin(rz / 430. + 1.)));
      float rivD = abs(vW.x - (-180. * sin(rz / 1400.) - 160. + 55. * sin(rz / 260.) + 25. * sin(rz / 97. + 2.)));
      float low = smoothstep(60., 20., vW.y + 18.) * smoothstep(.9, .97, normalize(vN).y);
      c *= 1. - .35 * smoothstep(30., 8., rivD) * low;
      c = mix(c, vec3(.1, .1, .1), smoothstep(2.6 + fw, 2.6 - fw, roadD) * low);
      c = mix(c, vec3(.16, .22, .28), smoothstep(7. + fw, 7. - fw, rivD) * low);
      diffuseColor.rgb *= c * vZone.w;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef CLUB
          if (near > .01) normal = normalize(normal + mat3(viewMatrix) * vec3(cN.x, 0., cN.y)); // зерно газона, земли, гравия
        #endif
        if (bumpK > .001) { // наклон рельефа скалы разностями в мире: по контуру (a) и по высоте (y) — гладко, без ступенек
          float e = max(pix * 1.5, 3.), fine = smoothstep(40., 12., pix);
          float h0 = ribs(along, vW.y, fine), ha = (ribs(along + e, vW.y, fine) - h0) / e, hy = (ribs(along, vW.y + e, fine) - h0) / e;
          vec3 T1 = vec3(tng.x, 0., tng.y), U = vec3(0., 1., 0.) - Nn * Nn.y; float sinT = length(U); U /= max(sinT, 1e-3);
          normal = normalize(normal - mat3(viewMatrix) * (ha * T1 + hy * sinT * U) * bumpK * .8);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // Тень гребней и облаков: облака на ~3 км плывут, тени от них ложатся на горы дальше 400 м от клуба.
        vec2 cs = (vW.xz + SUN_XZ * (3200. - vW.y)) / 2600. + vec2(time * .0035, time * .001);
        float cloud = smoothstep(.55, .75, vn(cs) * .65 + vn(cs * 2.3 + 4.) * .35) * smoothstep(400., 1500., length(vW.xz));
        reflectedLight.directDiffuse *= mix(1., vSun, bake) * (1. - .7 * cloud);`)
      .replace('void main() {', `const vec2 SUN_XZ = vec2(${(SUN.x / SUN.y).toFixed(4)}, ${(SUN.z / SUN.y).toFixed(4)});
const vec3 GSUN = vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)});\nvoid main() {
        #ifdef HOLE
          if (vW.x > hole.x && vW.x < hole.z && vW.z > hole.y && vW.z < hole.w) discard;
        #endif`);
  };
  return m;
}

// Еловый лес на склонах и перелески на лугу дальше 75 м: одна карточка на дерево, повёрнута к корту
// (камера дальше 20 м от центра не уходит, с её места карточку не видно с ребра).
// Спрайты из атласа Ильдара (trees.glb, Background_Tree_Atlas). Нормаль карточки изогнута как у цилиндра:
// у каждой ели освещённый и теневой бок.
const SPRITES = [[0.375, 0.006, 0.4875, 0.5], [0.25, 0.02, 0.375, 0.5], [0.72, 0.7, 0.825, 0.995], [0.84, 0.375, 0.995, 0.625], [0.38, 0.52, 0.5, 1]];
function forest(atlas, count) {
  let s = 99; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const P = [], N = [], U = [], I = [], up = new THREE.Vector3(0, 1, 0), to = new THREE.Vector3(), side = new THREE.Vector3(), n = new THREE.Vector3();
  for (let k = 0; k < 60000 && P.length / 12 < count; k++) {
    const a = r() * Math.PI * 2, rad = 75 + Math.pow(r(), 1.5) * 2800, x = Math.sin(a) * rad, z = -Math.cos(a) * rad, y = heightAt(x, z);
    const e = 6, ny = 2 * e / Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), 2 * e, heightAt(x, z + e) - heightAt(x, z - e));
    // Перелески на дне долины. Вдоль долины за дальним торцом пусто: игровая камера видит над забором полосу
    // в несколько градусов, и ближний лесок закрыл бы всю долину до горы.
    const grove = rad < 900 && !(z < -30 && Math.abs(x) < 40 + 0.3 * -z) ? Math.min(1, Math.max(0, (vnoise(x / 90, z / 90) - 0.58) * 10)) : 0;
    if (Math.max(zones(x, z, y, ny)[0], grove) < 0.5 + (r() - 0.5) * 0.4) continue;
    if (padDist(x, z) < 6 || Math.abs(x - riverX(z)) < 9 || Math.abs(x - roadX(z)) < 6) continue;
    const sp = SPRITES[Math.floor(r() * SPRITES.length)], h = 14 + r() * 16, w = h * ((sp[2] - sp[0]) / (sp[3] - sp[1])) * 1.0;
    to.set(-x, 0, -z).normalize(); side.crossVectors(up, to).normalize();
    const b = P.length / 3;
    for (const [i, j] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      P.push(x + side.x * i * w / 2, y - 1 + j * h, z + side.z * i * w / 2);
      n.copy(to).multiplyScalar(0.7).addScaledVector(side, i * 0.7).addScaledVector(up, 0.25).normalize(); N.push(n.x, n.y, n.z);
      U.push(i < 0 ? sp[0] + 0.005 : sp[2] - 0.005, j ? sp[1] + 0.008 : sp[3] - 0.003); // отступ внутрь: край соседнего спрайта атласа висел над елью чёрточкой
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // Деревья вдоль реки: ряд по обоим берегам с просветами — как на настоящих долинах.
  for (let z = -7000; z < 7000; z += 14 + r() * 26) {
    if (vnoise(z / 300, 3.3) < 0.35) continue;
    const sgn = r() < 0.5 ? -1 : 1, x = riverX(z) + sgn * (9 + r() * 10), y = heightAt(x, z);
    if (padDist(x, z) < 20) continue;
    const sp = SPRITES[Math.floor(r() * SPRITES.length)], h = 10 + r() * 9, w = h * ((sp[2] - sp[0]) / (sp[3] - sp[1]));
    to.set(-x, 0, -z).normalize(); side.crossVectors(up, to).normalize();
    const b = P.length / 3;
    for (const [i, j] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      P.push(x + side.x * i * w / 2, y - 1 + j * h, z + side.z * i * w / 2);
      n.copy(to).multiplyScalar(0.7).addScaledVector(side, i * 0.7).addScaledVector(up, 0.25).normalize(); N.push(n.x, n.y, n.z);
      U.push(i < 0 ? sp[0] + 0.005 : sp[2] - 0.005, j ? sp[1] + 0.008 : sp[3] - 0.003); // отступ внутрь: край соседнего спрайта атласа висел над елью чёрточкой
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const m = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });
  // Атлас у Ильдара с осенним оттенком: тёплое тянем к хвойной зелени (приём из Монтерозы, дешёвая версия).
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    float warm = clamp((diffuseColor.r - diffuseColor.b) * 3.0, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.05, .11, .04) * (0.6 + dot(diffuseColor.rgb, vec3(1.5))), warm * .8) * vec3(.6, .66, .6);`); };
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.name = 'forest';
  return mesh;
}

// Земля клуба мелкой сеткой (0,6 м, на телефоне 0,9) в рамке GRID: бугры газона видны и светом, и тенью; внутреннее
// кольцо там не рисуется. Нормали — разностями высот, в ложбинке чуть темнее, на бугре светлее (zone.w). По краю
// юбка на 0,6 м вниз: стык с кольцом без щели.
// Высоты земли клуба в узлах сетки (считаются один раз) и они же текстурой: по ней трава у камеры встаёт на бугры.
let HG = null;
export function groundGrid() {
  if (HG) return HG;
  const s = COARSE ? 0.9 : 0.6, nx = Math.round((GRID.x1 - GRID.x0) / s), nz = Math.round((GRID.z1 - GRID.z0) / s);
  const sx = (GRID.x1 - GRID.x0) / nx, sz = (GRID.z1 - GRID.z0) / nz, h = new Float32Array((nx + 1) * (nz + 1)), h16 = new Uint16Array(h.length);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) h16[j * (nx + 1) + i] = THREE.DataUtils.toHalfFloat(h[j * (nx + 1) + i] = heightAt(GRID.x0 + i * sx, GRID.z0 + j * sz));
  const tex = new THREE.DataTexture(h16, nx + 1, nz + 1, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return (HG = { nx, nz, sx, sz, h, tex });
}
function clubGround(mat) {
  const { nx, nz, sx, sz, h } = groundGrid();
  const H = (i, j) => h[Math.min(nz, Math.max(0, j)) * (nx + 1) + Math.min(nx, Math.max(0, i))];
  const W = nx + 3, D = nz + 3, pos = new Float32Array(W * D * 3), nrm = new Float32Array(W * D * 3), zone = new Float32Array(W * D * 4), idx = [];
  for (let j = -1, k = 0; j <= nz + 1; j++) for (let i = -1; i <= nx + 1; i++, k++) {
    const ci = Math.min(nx, Math.max(0, i)), cj = Math.min(nz, Math.max(0, j)), y = H(ci, cj);
    pos.set([GRID.x0 + ci * sx, y - (ci !== i || cj !== j ? 0.6 : 0), GRID.z0 + cj * sz], k * 3);
    const dx = (H(ci + 1, cj) - H(ci - 1, cj)) / (2 * sx), dz = (H(ci, cj + 1) - H(ci, cj - 1)) / (2 * sz), l = Math.hypot(dx, 1, dz);
    nrm.set([-dx / l, 1 / l, -dz / l], k * 3);
    const curv = (H(ci + 1, cj) + H(ci - 1, cj) + H(ci, cj + 1) + H(ci, cj - 1) - 4 * y) / (sx * sz);
    zone.set([0, 0, 0, Math.min(1.06, Math.max(0.88, 1 - curv * 2.5))], k * 4); // в ложбинке темнее, на бугре светлее
  }
  for (let j = 0; j < D - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + W; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('zone', new THREE.BufferAttribute(zone, 4)); g.setAttribute('sunvis', new THREE.BufferAttribute(new Float32Array(W * D).fill(1), 1));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'ground'; m.userData.groundAt = groundAt; // тестам: высота по сцене
  return m;
}

// club: { clubMap, lawnT, lawnN, … } — текстуры и карта клуба для земли клуба и внутреннего кольца (env-club.js).
export function buildMountains(club) {
  if (!club?.clubMap) club = null;
  const g = new THREE.Group(); g.name = 'mountains';
  const U = { time: { value: 0 }, bake: { value: 0 } };
  const geos = [ring(6, 420, 1.07, 128), ring(420, 18000, 1.055, 512)];
  geos.forEach((geo, i) => {
    const m = new THREE.Mesh(geo, terrainMaterial(U, i === 0 ? club : null, i === 0 && club ? new THREE.Vector4(GRID.x0, GRID.z0, GRID.x1, GRID.z1) : null)); m.frustumCulled = false; m.receiveShadow = true; g.add(m);
    if (i === 0) m.onBeforeRender = () => { U.time.value = performance.now() / 1000; };
  });
  if (club) g.add(clubGround(terrainMaterial(U, club)));
  bakeSun(geos, U.bake);
  g.userData.addForest = (atlas) => { if (!g.getObjectByName('forest')) g.add(forest(atlas, 5000)); };
  return g;
}
