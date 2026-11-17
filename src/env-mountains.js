// Альпийская долина вокруг клуба: ровное дно с лугами, склоны в еловом лесу, выше альпийские луга, скалы и снег.
// Рельеф по рецепту «Восхождения» (projects/ascent/src/world.js): вершины с тремя гребнями сливаются мягким максимумом,
// сверху гребневый шум. Скала там, где склон круче, снег выше линии и на пологом. Корт в центре, долина вдоль оси z.
// Клуб стоит на пологом холме: площадка ровная, вокруг бугры, вперёд (−z) длинный склон к дну долины на 18 м ниже.
import * as THREE from 'three';
import { SUN } from './env-sky.js';

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

// Площадка клуба: тут ровно (y = 0), по ней ходят, на ней корт, шале, дорожки, скамейки.
export const PAD = { x0: -24, x1: 34, z0: -44, z1: 31 };
export const DROP = 18; // дно долины ниже площадки клуба, м
export const padDist = (x, z) => Math.hypot(Math.max(PAD.x0 - x, 0, x - PAD.x1), Math.max(PAD.z0 - z, 0, z - PAD.z1));
// Холм клуба: за краем площадки пологие бугры по метру, дальше склон к дну долины — вперёд (−z) длиннее, его видно
// с корта над забором как бровку, за которой открывается долина.
function knoll(x, z) {
  const d = padDist(x, z);
  if (d === 0) return 0;
  const reach = 140 + 130 * smooth(0, -220, z);
  return -DROP * smooth(10, reach, d) + (fbm(x / 24, z / 24, 2) - 0.5) * 3.2 * smooth(1, 16, d) * smooth(220, 60, d);
}

export function heightAt(x, z) {
  let e = 1;
  for (const p of PEAKS) {
    const dx = x - p[0], dz = z - p[1], d = Math.sqrt(dx * dx + dz * dz + 1e4);
    const crest = 1 - Math.abs(Math.sin(1.5 * Math.atan2(dz, dx) + p[4]));
    e += Math.exp((p[2] * Math.exp((-d * (1 - 0.45 * crest)) / p[3])) / K) - 1;
  }
  let y = Math.log(e) * K;
  // Дно долины: ровное у клуба, полкилометра в ширину; хвосты гор на него не заползают.
  const floor = Math.max(smooth(420, 1700, Math.abs(x + 180 * Math.sin(z / 1400))), smooth(2600, 6500, Math.abs(z)));
  y *= floor;
  y += (ridged(x / 1300, z / 1300, 5) - 0.42) * 0.5 * y; // рёбра и кулуары пропорционально высоте: дно остаётся ровным
  y += (ridged(x / 380, z / 380, 4) - 0.42) * 0.22 * y * smooth(400, 1500, y); // выше леса — скальные гребешки и осыпи
  y += (fbm(x / 160, z / 160, 3) - 0.47) * 10 * smooth(240, 500, Math.hypot(x, z)); // пологие бугры луга
  if (Math.abs(x) < 700 && Math.abs(z) < 700) y += knoll(x, z) + DROP; // дальше холм уже сошёл на нет
  return y - DROP - 0.05;
}

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
`;

// Цвет склона считается в пикселе: доли из вершин плюс шум, поэтому кромки снега, скал и леса рваные и чёткие,
// а не размытые по ячейке сетки. На внутреннем кольце (CLUB) вблизи — фото газона, дорожки и клумбы с карты клуба.
// Солнце на склоне гасят тень гребней (запечена в вершины) и тени облаков, плывущие по горам.
function terrainMaterial(U, club) {
  const m = new THREE.MeshLambertMaterial();
  if (club) { m.defines = { CLUB: '' }; m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 4; } // газон под кортом не мерцает сквозь грунт издали
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, club ?? {});
    sh.vertexShader = 'attribute vec4 zone; attribute float sunvis; varying vec4 vZone; varying float vSun; varying vec3 vW, vN;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vZone = zone; vSun = sunvis; vW = position; vN = normal;');
    sh.fragmentShader = `varying vec4 vZone; varying float vSun; varying vec3 vW, vN; uniform float time, bake;
      #ifdef CLUB
        uniform sampler2D clubMap, grassT, gravelT; uniform vec4 clubRect, pad;
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
      vec3 c = mix(meadow, alpine, alt);
      c = mix(c, forestC, smoothstep(.45, .55, vZone.x + (nn - .5) * .5));
      // Скала: вертикальные промоины и полки, в крутых местах темнее; под скалой осыпь светлее.
      float sy = normalize(vN).y;
      rockC *= (.7 + .45 * vn(vec2((vW.x - vW.z) / 35., vW.y / 160.))) * mix(1., .6, smoothstep(.6, .3, sy));
      float rk = smoothstep(.45, .6, vZone.y + (n2 - .5) * .5 + (n3 - .5) * .25);
      c = mix(c, mix(rockC, vec3(.3, .29, .27), smoothstep(.62, .75, sy) * .6), rk);
      c = mix(c, snowC, smoothstep(.45, .55, vZone.z + (nn - .5) * .6));
      #ifdef CLUB
        vec2 q = vW.xz;
        float near = 1. - smoothstep(90., 260., dist);
        vec2 cu = (q - clubRect.xy) / clubRect.z;
        vec3 k = texture2D(clubMap, clamp(cu, 0., 1.)).rgb * step(0., min(cu.x, cu.y)) * step(max(cu.x, cu.y), 1.);
        vec2 pd2 = max(max(pad.xy - q, q - pad.zw), 0.); float pd = length(pd2); // за краем площадки, м
        // Газон: фото травы двумя плитками разного размера, смешанными пятнами, — без заметного повтора.
        vec3 ga = texture2D(grassT, q / .9).rgb, gb = texture2D(grassT, mat2(.8, .6, -.6, .8) * q / 1.45 + .37).rgb; // на фото кадр ~1 м газона
        vec3 lawn = mix(ga, gb, smoothstep(.3, .7, vn(q / 3.7)));
        float pat = vn(q / 13.) * .55 + vn(q / 4.1) * .3 + vn(q / 1.3) * .15;
        lawn *= mix(vec3(1.15, 1.05, .7), vec3(.8, .92, .86), smoothstep(.3, .7, pat)) * vec3(.5, .37, .5); // суше и желтее / сочнее; фото травы слишком кислотное
        // Полосы стрижки вдоль корта по 2 м — газон клуба ухоженный. За площадкой газон переходит в некошеный луг.
        lawn = mix(vec3(dot(lawn, vec3(.3, .59, .11))), lawn, .72); // фото травы насыщеннее живого газона
        float mown = 1. - smoothstep(0., 5., pd);
        lawn *= 1. + .045 * mown * (1. - k.b) * (step(.5, fract(q.x / 4. + .1)) * 2. - 1.);
        float rough = max(k.b, smoothstep(3., 16., pd) * .75);
        lawn = mix(lawn, lawn * vec3(.92, .86, .6) * (.8 + .4 * vn(q * 1.7)), rough);
        // Клумба: тёмная земля с корой.
        lawn = mix(lawn, vec3(.045, .032, .024) * (.6 + .8 * vn(q * 7.)), smoothstep(.4, .6, k.g + (vn(q * 3.) - .5) * .25));
        // Дорожка из гравия с рваным краем.
        float pe = k.r + (vn(q * 2.2) - .5) * .3 + (vn(q * 9.) - .5) * .14;
        vec3 grav = texture2D(gravelT, q / .55).rgb; grav = (grav - .3) * 1.7 + .3; // на фото кадр ~0.5 м: камешки 2–8 мм, контраст сильнее
        grav = max(grav, 0.) * (.8 + .3 * vn(q / 2.5)) * vec3(.56, .52, .46);
        lawn = mix(lawn, grav, smoothstep(.47, .55, pe));
        // Вокруг корта крошка, вынесенная обувью, — рыжая кайма за бордюром.
        float cd = max(abs(q.x) - 9.3, abs(q.y) - 20.04);
        lawn = mix(lawn, mix(grav, vec3(.42, .17, .08), .55), smoothstep(.7, .1, cd + (vn(q * 3.) - .5) * .5) * step(0., cd + .2) * .8);
        c = mix(c, lawn, near);
      #endif
      diffuseColor.rgb *= c * vZone.w;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // Тень гребней и облаков: облака на ~3 км плывут, тени от них ложатся на горы дальше 400 м от клуба.
        vec2 cs = (vW.xz + SUN_XZ * (3200. - vW.y)) / 2600. + vec2(time * .0035, time * .001);
        float cloud = smoothstep(.55, .75, vn(cs) * .65 + vn(cs * 2.3 + 4.) * .35) * smoothstep(400., 1500., length(vW.xz));
        reflectedLight.directDiffuse *= mix(1., vSun, bake) * (1. - .7 * cloud);`)
      .replace('void main() {', `const vec2 SUN_XZ = vec2(${(SUN.x / SUN.y).toFixed(4)}, ${(SUN.z / SUN.y).toFixed(4)});\nvoid main() {`);
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
    if (padDist(x, z) < 6) continue;
    const sp = SPRITES[Math.floor(r() * SPRITES.length)], h = 14 + r() * 16, w = h * ((sp[2] - sp[0]) / (sp[3] - sp[1])) * 1.0;
    to.set(-x, 0, -z).normalize(); side.crossVectors(up, to).normalize();
    const b = P.length / 3;
    for (const [i, j] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      P.push(x + side.x * i * w / 2, y - 1 + j * h, z + side.z * i * w / 2);
      n.copy(to).multiplyScalar(0.7).addScaledVector(side, i * 0.7).addScaledVector(up, 0.25).normalize(); N.push(n.x, n.y, n.z);
      U.push(i < 0 ? sp[0] : sp[2], j ? sp[1] : sp[3]);
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

// club: { clubMap, grassT, gravelT, clubRect, pad } — текстуры и карта клуба для внутреннего кольца (env-club.js).
export function buildMountains(club) {
  if (!club?.clubMap) club = null;
  const g = new THREE.Group(); g.name = 'mountains';
  const U = { time: { value: 0 }, bake: { value: 0 } };
  const geos = [ring(6, 420, 1.07, 128), ring(420, 18000, 1.055, 512)];
  geos.forEach((geo, i) => {
    const m = new THREE.Mesh(geo, terrainMaterial(U, i === 0 ? club : null)); m.frustumCulled = false; m.receiveShadow = true; g.add(m);
    if (i === 0) m.onBeforeRender = () => { U.time.value = performance.now() / 1000; };
  });
  bakeSun(geos, U.bake);
  g.userData.addForest = (atlas) => { if (!g.getObjectByName('forest')) g.add(forest(atlas, 5000)); };
  return g;
}
