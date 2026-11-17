// Грунтовый корт как на видео Лёвы: размеры по правилам ITF, сетка с провисом, рабица по периметру.
// Ось Z вдоль корта, сетка на z = 0, игрок у задней линии z = +11.885 и смотрит в сторону -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEnv } from './env.js';

export const COURT = { len: 23.77, wide: 10.97, single: 8.23, service: 6.4, runBack: 8, runSide: 3.66 }; // за линией 8 м, как на больших кортах
const HALF_L = COURT.len / 2, HALF_W = COURT.wide / 2;

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

// Грунт: фото-текстура крошки от GPT (art/clay.png → tools/clay-texture.py → public/tex), плитка 2.5 м с рельефом зерна.
// Поверх — крупные пятна на весь корт: светлая вытоптанная зона за задними линиями, тёмные пятна влажного грунта.
// Без них плитка повторяется заметно.
const W_ALL = COURT.wide + COURT.runSide * 2, L_ALL = COURT.len + COURT.runBack * 2;
function macroTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d'), sx = 256 / W_ALL, sz = 512 / L_ALL;
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 512, 1024);
  g.scale(2, 2); // рисуем в единицах 256×512, холст вдвое подробнее: пятна до 15 см
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (x, z, r, v, a) => {
    const gr = g.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - r, z - r, r * 2, r * 2);
  };
  for (let i = 0; i < 60; i++) blob(rnd() * 256, rnd() * 512, 15 + rnd() * 50, rnd() < 0.5 ? 190 : 70, 0.22);
  // Вытоптано: полоса шириной с корт за каждой задней линией и дорожка вдоль неё.
  for (const zc of [-HALF_L - 1.2, HALF_L + 1.2]) for (let k = 0; k < 14; k++) blob(128 + (rnd() - 0.5) * 7 * sx, (zc + L_ALL / 2 + (rnd() - 0.5) * 2.4) * sz, (1.6 + rnd()) * sx, 175, 0.35);
  // Волокуша: корт затирают сеткой, остаются длинные чуть изогнутые полосы вдоль корта, светлее и темнее.
  for (let i = 0; i < 30; i++) {
    const x0 = rnd() * 256, v = rnd() < 0.5 ? 160 : 100, bend = (rnd() - 0.5) * 50;
    g.strokeStyle = `rgba(${v},${v},${v},0.16)`; g.lineWidth = (0.5 + rnd() * 0.9) * sx;
    g.beginPath(); g.moveTo(x0, -10); g.bezierCurveTo(x0 + bend, 170, x0 - bend, 340, x0 + (rnd() - 0.5) * 20, 522); g.stroke();
  }
  // У ограждения грунт темнее и влажнее: туда не достаёт солнце, вдоль стенки поливают из шланга.
  const edge = (x0, y0, x1, y1, w, h) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(60,60,60,0.55)'); gr.addColorStop(1, 'rgba(60,60,60,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
  const e = 1.4 * sx;
  edge(0, 0, e, 0, e, 512); edge(256, 0, 256 - e, 0, e, 512); edge(0, 0, 0, e, 256, e); edge(0, 512, 0, 512 - e, 256, e);
  // Пятна по 15–80 см: где грунт прибит и влажнее (темнее), где насыпана свежая крошка (светлее). Как на видео Лёвы:
  // издали корт пёстрый, без них он ровно-розовый.
  for (let i = 0; i < 2600; i++) blob(rnd() * 256, rnd() * 512, (0.08 + rnd() * rnd() * 0.5) * sx, rnd() < 0.55 ? 40 : 215, 0.3 + rnd() * 0.3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  return t;
}
function clayMaterial() {
  const load = new THREE.TextureLoader(), rep = [W_ALL / 2.5, L_ALL / 2.5];
  const tex = (url, srgb) => {
    const t = load.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const m = new THREE.MeshStandardMaterial({ map: tex('/tex/clay.webp', true), normalMap: tex('/tex/clay-normal.webp'), roughnessMap: tex('/tex/clay-rough.webp'), roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1) });
  const macro = macroTexture();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.macro = { value: macro };
    sh.vertexShader = 'varying vec2 vMacro;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMacro = uv;');
    sh.fragmentShader = 'uniform sampler2D macro; varying vec2 vMacro;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
       float mc = texture2D(macro, vMacro).r; diffuseColor.rgb *= mix(0.72, 1.28, mc);
       diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.62) * vec3(1.19, 1.31, 0.64); // по видео Лёвы: терракота, без кислотного оранжевого
       // Песок: та же крошка ещё раз, мельче в 5 раз и под углом — вблизи видно отдельные крупинки, вдали она сливается.
       vec2 suv = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 5.3 + 0.37;
       float sand = dot(texture2D(map, suv).rgb, vec3(0.3, 0.59, 0.11)) / 0.34;
       float fade = clamp(1.0 - length(vViewPosition) / 28.0, 0.0, 1.0);
       diffuseColor.rgb *= mix(1.0, clamp(sand, 0.6, 1.5), 0.45 * fade);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       roughnessFactor = clamp(roughnessFactor - (sand - 1.0) * 0.25 * fade, 0.55, 1.0); // светлые крупинки чуть блестят`);
  };
  return m;
}

// Линии: белая лента, края присыпаны крошкой и чуть размыты, по ленте пыль.
// Плитка — 6 м ленты: на ней места, где крошку замело на ленту пятнами, — по видео линии на грунте не белоснежные.
function lineMaterial() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 1024;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(236,228,216,0)'); gr.addColorStop(0.12, 'rgba(236,228,216,1)'); gr.addColorStop(0.88, 'rgba(236,228,216,1)'); gr.addColorStop(1, 'rgba(236,228,216,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 1024);
  for (let i = 0; i < 3600; i++) { g.fillStyle = `rgba(196,98,58,${Math.random() * 0.5})`; g.fillRect(Math.random() * 64, Math.random() * 1024, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  for (let i = 0; i < 28; i++) { // заметённые места: рыжая пелена на ленте
    const y = Math.random() * 1024, h = 20 + Math.random() * 90, a = 0.15 + Math.random() * 0.4;
    const gy = g.createLinearGradient(0, y, 0, y + h); gy.addColorStop(0, 'rgba(190,100,62,0)'); gy.addColorStop(0.5, `rgba(190,100,62,${a})`); gy.addColorStop(1, 'rgba(190,100,62,0)');
    g.fillStyle = gy; g.fillRect(Math.random() * 20, y, 30 + Math.random() * 30, h);
  }
  // Лента прибита гвоздями через 25 см: шляпка в рыжей пыли.
  for (let k = 0; k < 24; k++) { const y = (k + 0.5) * 1024 / 24; g.fillStyle = 'rgba(150,120,100,0.9)'; g.beginPath(); g.arc(32, y, 3.2, 0, 7); g.fill(); g.fillStyle = 'rgba(80,60,50,0.9)'; g.beginPath(); g.arc(32.6, y + 0.6, 1.8, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
}

function lines() {
  const group = new THREE.Group(), mat = lineMaterial(), W = 0.05, Y = 0.002;
  const strip = (x0, z0, x1, z1, w = W) => {
    const along = Math.abs(z1 - z0) > Math.abs(x1 - x0), len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) || w;
    const geo = new THREE.PlaneGeometry(w * 1.25, len); // ширина с запасом под размытый край
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 6 + Math.random());
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; if (!along) m.rotation.z = Math.PI / 2;
    m.position.set((x0 + x1) / 2, Y, (z0 + z1) / 2); m.receiveShadow = true;
    group.add(m);
  };
  const S = COURT.single / 2;
  for (const z of [-HALF_L, HALF_L]) strip(-HALF_W, z, HALF_W, z, 0.1); // задние линии по правилам до 10 см
  for (const x of [-HALF_W, HALF_W, -S, S]) strip(x, -HALF_L, x, HALF_L);
  for (const z of [-COURT.service, COURT.service]) strip(-S, z, S, z);
  strip(0, -COURT.service, 0, COURT.service);
  for (const z of [-HALF_L, HALF_L]) strip(0, z - Math.sign(z) * 0.1, 0, z); // центральная метка
  return group;
}

// Сетка: верх провисает с 1.07 м у стоек до 0.914 м в центре, низ чуть отходит назад. Ячейка 4.5 см:
// тёмный шнур с узлами в прозрачной текстуре; alphaToCoverage сглаживает шнур вдали, иначе сетка рябит и пропадает.
function net() {
  const group = new THREE.Group(), POST = HALF_W + 0.914, H_POST = 1.07, H_MID = 0.914;
  group.name = 'net'; // в тренировке «Стенка» сетку прячем
  const top = (x) => H_MID + (H_POST - H_MID) * (x / POST) ** 2;
  const geo = new THREE.PlaneGeometry(POST * 2, 1, 96, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), v = p.getY(i) + 0.5; // 0 внизу, 1 вверху
    p.setY(i, 0.03 + v * (top(x) - 0.03));
    p.setZ(i, Math.sin(Math.PI * v) * 0.025 * (1 - (x / POST) ** 2)); // сетка чуть надута ветром
  }
  geo.computeVertexNormals();
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + POST) / 0.045, p.getY(i) / 0.045);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#1a1d1b'; g.lineWidth = 10; g.strokeRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(3, 3, 122, 122);
  g.fillStyle = '#121413'; for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  const netMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9 }));
  netMesh.castShadow = true;
  group.add(netMesh);

  // Трос в белой ленте с прошивкой, центральный ремень, стойки с ручкой натяжки.
  const white = new THREE.MeshStandardMaterial({ color: '#f4f3ee', roughness: 0.65 });
  const pts = []; for (let i = 0; i <= 60; i++) { const x = -POST + (i / 60) * POST * 2; pts.push(new THREE.Vector3(x, top(x) - 0.028, 0)); }
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.03, 8), white);
  band.scale.z = 0.22; band.castShadow = true; group.add(band);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, H_MID, 0.012), white);
  strap.position.y = H_MID / 2; strap.castShadow = true; group.add(strap);
  const postMat = new THREE.MeshPhysicalMaterial({ color: '#1d3a2d', roughness: 0.35, metalness: 0.5, clearcoat: 0.6 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H_POST + 0.06, 20), postMat);
    post.position.set(s * POST, (H_POST + 0.06) / 2, 0); post.castShadow = true; group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), postMat);
    cap.position.set(s * POST, H_POST + 0.06, 0); group.add(cap);
    const crank = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), postMat);
    crank.position.set(s * (POST + 0.05), 0.75, 0); group.add(crank);
  }
  return group;
}

// Следы на грунте: отметки мяча (тёмный овал с наплывом крошки), полосы от скольжения. Рисуются на холст поверх корта
// и остаются до конца игры — как на настоящем грунте.
export class CourtMarks {
  constructor() {
    this.cw = 1024; this.ch = 2048;
    const c = this.canvas = document.createElement('canvas'); c.width = this.cw; c.height = this.ch;
    this.g = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W_ALL, L_ALL), new THREE.MeshStandardMaterial({ map: this.tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = 0.003; this.mesh.receiveShadow = true;
    this.wear();
    this.dirty = false;
  }
  // Корт до нас играли: у задних линий натоптано, следы подошв и скольжений, по дальней зоне старые отметки мячей.
  // Всё бледнее свежих следов, чтобы новые читались.
  wear() {
    const g = this.g, k = this.cw / W_ALL; let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 260; i++) { // подошвы: пара овалов, носок и пятка
        const x = gauss() * 3.2, z = side * (HALF_L + 0.6 + gauss() * 1.4), a = r() * Math.PI * 2, [px, py] = this.px(x, z);
        g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = `rgba(110,44,22,${0.05 + r() * 0.08})`;
        g.beginPath(); g.ellipse(0.05 * k, 0, 0.09 * k, 0.045 * k, 0, 0, 7); g.ellipse(-0.1 * k, 0, 0.05 * k, 0.04 * k, 0, 0, 7); g.fill(); g.restore();
      }
      for (let i = 0; i < 26; i++) { // старые скольжения: размазанные тёмные дуги вдоль задней линии
        const [x0, y0] = this.px(gauss() * 3.5, side * (HALF_L + 0.5 + gauss() * 1.2)), len = (0.5 + r() * 1.1) * k, a = (r() < 0.8 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.8;
        g.strokeStyle = `rgba(105,40,20,${0.06 + r() * 0.06})`; g.lineWidth = (0.12 + r() * 0.1) * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.cos(a) * len / 2 + (r() - 0.5) * 0.3 * k, y0 + Math.sin(a) * len / 2 + (r() - 0.5) * 0.3 * k, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g.stroke();
      }
      for (let i = 0; i < 70; i++) { // отметки мячей: у задней линии и в квадратах подачи
        const deep = r() < 0.7, x = (r() - 0.5) * (deep ? 9 : 7.5), z = side * (deep ? HALF_L - 0.3 - r() * 4.5 : 1 + r() * 5.2);
        g.globalAlpha = 0.25 + r() * 0.3; this.ball(new THREE.Vector3(x, 0, z), new THREE.Vector3(r() - 0.5, 0, -side).normalize()); g.globalAlpha = 1;
      }
    }
  }
  px(x, z) { return [(x + W_ALL / 2) / W_ALL * this.cw, (z + L_ALL / 2) / L_ALL * this.ch]; }
  ball(pos, dir) {
    const [x, y] = this.px(pos.x, pos.z), k = this.cw / W_ALL, a = Math.atan2(dir.z, dir.x), g = this.g;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(120,48,24,0.55)'; g.beginPath(); g.ellipse(0, 0, 0.055 * k, 0.03 * k, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(232,150,105,0.5)'; g.beginPath(); g.ellipse(0.05 * k, 0, 0.018 * k, 0.03 * k, 0, 0, Math.PI * 2); g.fill();
    g.restore(); this.dirty = true;
  }
  slide(a, b) {
    const [x0, y0] = this.px(a.x, a.z), [x1, y1] = this.px(b.x, b.z), k = this.cw / W_ALL, g = this.g;
    // Без круглых концов: кусочки следа рисуются каждый кадр, и скругления внахлёст давали цепочки бусин, похожие на буквы.
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(110,44,22,0.16)'; g.lineWidth = 0.13 * k; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(236,160,112,0.2)'; g.lineWidth = 0.08 * k; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    this.dirty = true;
  }
  update() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; } }
}

// Пыль грунта: облачка от скольжения и отскока. Частицы — точки с мягким краем, растут и тают.
export class ClayDust {
  constructor(n = 240) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.size = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { color: { value: new THREE.Color('#c8764a') }, scale: { value: 600 } },
      vertexShader: 'attribute float life; attribute float size; uniform float scale; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); if (vL <= 0.0 || d > 0.5) discard; gl_FragColor = vec4(color, (1.0 - d * 2.0) * 0.35 * vL); }',
    }));
    this.mesh.frustumCulled = false;
  }
  puff(p, v, count = 4, spread = 0.4) {
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n;
      this.pos.set([p.x + (Math.random() - 0.5) * 0.1, 0.03, p.z + (Math.random() - 0.5) * 0.1], i * 3);
      this.vel.set([v.x * 0.3 + (Math.random() - 0.5) * spread, 0.25 + Math.random() * 0.35, v.z * 0.3 + (Math.random() - 0.5) * spread], i * 3);
      this.life[i] = 1; this.size[i] = 0.08 + Math.random() * 0.06;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.9; this.size[i] += dt * 0.25;
      for (let a = 0; a < 3; a++) { this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; this.vel[i * 3 + a] *= 1 - dt * 2.5; }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = g.attributes.life.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}

// Калитка в боковом заборе со стороны шале (x > 0), у сетки рядом со скамейками: проём z0…z1 высотой 2.1 м, створка
// открыта наружу. Через неё выходят к дорожке вдоль корта и на террасу (env-club.js).
export const GATE = { x: HALF_W + COURT.runSide, z0: 3.39, z1: 4.59, h: 2.1 };

// Ограждение: стойки и рабица 3.6 м во всю высоту. Зелёную ветрозащиту сняли (17.11): сквозь сетку видно долину,
// шале и террасу. Внизу по периметру бетонный бордюр, в нём стоят стойки.
function fence(num = '1') {
  const group = new THREE.Group(), H = 3.6, STEP = 3;
  group.name = 'fence';
  const X = HALF_W + COURT.runSide, Z = HALF_L + COURT.runBack;
  const link = canvasTex(64, (g, s) => { // рабица: ромб 5 см
    g.strokeStyle = '#2a3a33'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s / 2, 0); g.lineTo(s, s / 2); g.lineTo(s / 2, s); g.closePath(); g.stroke();
  });
  const linkMat = new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: '#26332d', roughness: 0.5, metalness: 0.5 });
  // Кусок рабицы от a до b вдоль стенки (локальный x), по высоте от y0 до y1.
  const mesh = (a, b, y0, y1) => {
    const len = b - a, h = y1 - y0, lg = new THREE.PlaneGeometry(len, h), lu = lg.attributes.uv;
    for (let i = 0; i < lu.count; i++) lu.setXY(i, (lu.getX(i) * len + a) / 0.07, (lu.getY(i) * h + y0) / 0.07);
    const l = new THREE.Mesh(lg, linkMat); l.position.set((a + b) / 2, (y0 + y1) / 2, 0); return l;
  };
  const tube = (r, len) => new THREE.CylinderGeometry(r, r, len, 8, 1, true);
  const wall = (len, x, z, rot, gap = null) => { // gap: [a, b] — проём калитки в локальных x стенки
    const wg = new THREE.Group(); wg.position.set(x, 0, z); wg.rotation.y = rot; group.add(wg);
    const n = Math.round(len / STEP), step = len / n;
    if (!gap) wg.add(mesh(-len / 2, len / 2, 0, H));
    else wg.add(mesh(-len / 2, gap[0], 0, H), mesh(gap[1], len / 2, 0, H), mesh(gap[0], gap[1], GATE.h, H));
    const parts = [tube(0.024, len).rotateZ(Math.PI / 2).translate(0, H, 0)]; // верхняя труба
    const xs = []; for (let i = 0; i <= n; i++) xs.push(-len / 2 + i * step);
    if (gap) {
      for (const g of gap) if (xs.every((p) => Math.abs(p - g) > 0.05)) xs.push(g);
      parts.push(tube(0.024, gap[1] - gap[0]).rotateZ(Math.PI / 2).translate((gap[0] + gap[1]) / 2, GATE.h, 0)); // перекладина над проёмом
    }
    for (const px of xs) parts.push(new THREE.CylinderGeometry(0.035, 0.035, H + 0.05, 10).translate(px, (H + 0.05) / 2, -0.04));
    const posts = new THREE.Mesh(mergeGeometries(parts), steel); posts.castShadow = true; wg.add(posts);
    if (gap) { // створка: рама из трубы и рабица, на петлях у стойки gap[1], открыта наружу на 100°
      const w = gap[1] - gap[0] - 0.04, hh = GATE.h - 0.08, door = new THREE.Group();
      door.position.set(gap[1] - 0.02, 0.05, 0); door.rotation.y = -1.75; wg.add(door);
      const frame = [tube(0.02, w).rotateZ(Math.PI / 2).translate(-w / 2, 0, 0), tube(0.02, w).rotateZ(Math.PI / 2).translate(-w / 2, hh, 0),
        tube(0.02, hh).translate(0, hh / 2, 0), tube(0.02, hh).translate(-w, hh / 2, 0)];
      const fm = new THREE.Mesh(mergeGeometries(frame), steel); fm.castShadow = true; door.add(fm);
      door.add(mesh(-w, 0, 0, hh));
    }
    return wg;
  };
  wall(X * 2, 0, -Z, 0); wall(Z * 2, -X, 0, Math.PI / 2); wall(Z * 2, X, 0, -Math.PI / 2, [GATE.z0, GATE.z1]);
  // Бордюр по периметру: бетон 15 см, на 5 см над землёй; в проёме калитки тоже — порожек.
  const curb = new THREE.MeshStandardMaterial({ color: '#a7a399', roughness: 0.9 });
  for (const [w, d, x, z] of [[X * 2 + 0.3, 0.15, 0, -Z - 0.075], [X * 2 + 0.3, 0.15, 0, Z + 0.075], [0.15, Z * 2, -X - 0.075, 0], [0.15, Z * 2, X + 0.075, 0]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), curb); c.position.set(x, 0, z); c.receiveShadow = true; group.add(c);
  }
  wall(X * 2, 0, Z, Math.PI).name = 'fence-near'; // за спиной Лёвы: в игре прячем, чтобы камере было куда отъехать
  // Таблички с номером корта у сетки. Надпись клуба на стенке пробовали: в меню она оказывалась за головой Лёвы.
  const plate = canvasTex(128, (g, s) => {
    g.fillStyle = '#f1efe8'; g.fillRect(0, 0, s, s); g.strokeStyle = '#1e4335'; g.lineWidth = 6; g.strokeRect(8, 8, s - 16, s - 16);
    g.fillStyle = '#1e4335'; g.font = '700 84px system-ui, -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, s / 2, s / 2 + 4);
  });
  for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 }));
    m.position.set(sd * (X - 0.08), 2.0, 1.6); m.rotation.y = -sd * Math.PI / 2; group.add(m);
  }
  return group;
}

// Корт 2 — соседний, слева за елями (COURT2_X): тот же грунт, линии, сетка и забор с калиткой, табличка «2».
// Свои имена у групп, чтобы getObjectByName('net' | 'fence-near') находил корт 1.
export const COURT2_X = -38;
function neighbour(clay) {
  const g = new THREE.Group(); g.name = 'court2'; g.position.x = COURT2_X;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W_ALL, L_ALL), clay);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  const n = net(), f = fence('2'); n.name = 'net2'; f.name = 'fence2'; f.getObjectByName('fence-near').name = 'fence2-near';
  g.add(ground, lines(), n, f);
  return g;
}

export function buildCourt() {
  const group = new THREE.Group(), clay = clayMaterial();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W_ALL, L_ALL), clay);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  // Луг, долина и горы вокруг — в env.js.
  group.add(ground, lines(), net(), fence(), buildEnv(), neighbour(clay));
  return group;
}
