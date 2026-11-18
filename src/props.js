// Терраса кодом (18.11, вместо слитых в комья моделей Meshy): столики с зонтами, стулья, барная стойка с табуретами,
// чашки кофе на блюдцах с паром, бокалы вина, стаканы, графин с водой. Каждый предмет — отдельный объект: его можно
// взять, поставить, выпить, налить, переставить (interact.js). Размеры настоящие, в метрах; у каждого предмета начало
// координат внизу по центру, «лицо» (куда смотрит сидящий, перед стойки) — +z.
// Материалы в MAT: текстуры дерева, ткани и камня рисуются на холсте, их можно заменить фото (Poly Haven) одной строкой.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  return t;
}

// ---------- Материалы ----------
// Дерево: тик, волокна вдоль v, доски разного тона и редкие сучки. Карта шероховатости — те же волокна.
function woodTex(base, seed) {
  const r = rng(seed);
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, a = 0.04 + r() * 0.1, dark = r() < 0.6;
      g.strokeStyle = dark ? `rgba(40,22,10,${a})` : `rgba(255,230,190,${a * 0.6})`; g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y / (40 + r() * 30) + i) * (1.5 + r() * 2), y);
      g.stroke();
    }
    for (let k = 0; k < 3; k++) { // сучок: тёмный овал с кольцами
      const x = r() * w, y = r() * h;
      for (let j = 5; j > 0; j--) { g.fillStyle = `rgba(50,26,12,${0.12 + 0.05 * (5 - j)})`; g.beginPath(); g.ellipse(x, y, j * 1.6, j * 4.5, 0, 0, 7); g.fill(); }
    }
  });
}
// Ткань зонта: суровое полотно, переплетение мелкой сеткой, у края (u → 1) подгиб темнее.
const fabricTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rng(5);
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(120,100,70,${0.04 + r() * 0.04})`; g.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 1, h); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
  const hem = g.createLinearGradient(w * 0.9, 0, w, 0); hem.addColorStop(0, 'rgba(150,120,80,0)'); hem.addColorStop(0.25, 'rgba(150,120,80,0.28)'); hem.addColorStop(1, 'rgba(150,120,80,0.28)');
  g.fillStyle = hem; g.fillRect(w * 0.9, 0, w * 0.1, h);
  g.fillStyle = 'rgba(90,70,45,0.35)'; g.fillRect(w * 0.925, 0, 1.5, h); // строчка подгиба
});
// Камень стойки: светлый тёплый мрамор с мягкими прожилками.
const stoneTex = () => canvasTex(512, 256, (g, w, h) => {
  const r = rng(13);
  g.fillStyle = '#d9d4cb'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) { const v = 180 + r() * 60; g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.25)`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 10, 0, 7); g.fill(); }
  for (let k = 0; k < 7; k++) {
    g.strokeStyle = `rgba(120,112,104,${0.15 + r() * 0.25})`; g.lineWidth = 0.6 + r() * 1.4;
    let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 40; s++) { x += 6 + r() * 10; y += (r() - 0.5) * 14; g.lineTo(x, y); }
    g.stroke();
  }
});
// Пенка капучино: кремовая середина, к краю темнее, мелкие пузырьки.
const cremaTex = () => canvasTex(128, 128, (g, w) => {
  const r = rng(21), gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, '#d8b38a'); gr.addColorStop(0.55, '#b98451'); gr.addColorStop(0.85, '#7a4a24'); gr.addColorStop(1, '#3d2210');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,240,220,${r() * 0.18})`; g.beginPath(); g.arc(r() * w, r() * w, 0.5 + r() * 1.5, 0, 7); g.fill(); }
}, { srgb: true });
// Пар: мягкое облачко с краем, гаснущим в ноль.
const puffTex = () => canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

// Материалы создаются при первой постройке (initMat): модуль грузят и тесты в Node, где нет холста.
export const MAT = {};
export function initMat() {
  if (MAT.teak) return MAT;
  return Object.assign(MAT, {
    teak: new THREE.MeshStandardMaterial({ map: woodTex('#9a6538', 3), roughness: 0.62 }),
    oak: new THREE.MeshStandardMaterial({ map: woodTex('#b98a55', 7), roughness: 0.55 }),
    frame: new THREE.MeshStandardMaterial({ color: '#2b4536', roughness: 0.42, metalness: 0.55 }), // крашеный металл, как у кафе на скрине
    iron: new THREE.MeshStandardMaterial({ color: '#2a2a28', roughness: 0.55, metalness: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08d4a', roughness: 0.3, metalness: 0.9 }),
    fabric: new THREE.MeshStandardMaterial({ map: fabricTex(), roughness: 0.92, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.32 }),
    china: new THREE.MeshPhysicalMaterial({ color: '#f5f2ea', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    // Стекло без прохода преломления (дорого на такой сцене): прозрачное, блики и края дают отражения неба.
    glass: new THREE.MeshPhysicalMaterial({ color: '#f4fbff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 2.2, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false }),
    coffee: new THREE.MeshStandardMaterial({ color: '#2a160b', roughness: 0.3, envMapIntensity: 0.4 }),
    crema: new THREE.MeshStandardMaterial({ map: cremaTex(), roughness: 0.35 }),
    wine: new THREE.MeshStandardMaterial({ color: '#5c0819', roughness: 0.55, transparent: true, opacity: 0.95, envMapIntensity: 0.12, depthWrite: false }), // отражение неба красило вино в сиреневый
    water: new THREE.MeshPhysicalMaterial({ color: '#cfe8f0', roughness: 0.02, transparent: true, opacity: 0.22, envMapIntensity: 2, depthWrite: false }),
    steam: new THREE.SpriteMaterial({ map: puffTex(), transparent: true, depthWrite: false, opacity: 0 }),
  });
}


// Брусок с развёрткой по длинной стороне: волокна дерева идут вдоль бруска, а не поперёк, масштаб — 0,6 м на текстуру.
const plankRnd = rng(77);
function plank(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, ou = plankRnd(), ov = plankRnd() * 4; // у каждого бруска свой кусок текстуры: сучки не в ряд
  const dims = [w, h, d], long = dims.indexOf(Math.max(...dims));
  for (let i = 0; i < p.count; i++) {
    const ax = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))], face = ax.indexOf(Math.max(...ax));
    const other = [0, 1, 2].filter((a) => a !== face), vAx = other.includes(long) ? long : other[1], uAx = other.find((a) => a !== vAx);
    const c = (a) => p.getComponent(i, a);
    uv.setXY(i, c(uAx) / 0.6 + 0.37 * face + ou, c(vAx) / 0.6 + ov);
  }
  return g;
}
const tube = (a, b, r, seg = 8) => { // труба от a до b
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
};
const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; };
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---------- Посуда ----------
// Внутренний профиль сосуда [[r, y], …] снизу вверх: по нему жидкость — тело вращения до уровня y с крышкой.
function radiusAt(inner, y) {
  const k = Math.max(1, inner.findIndex(([, yy]) => yy >= y)), [r0, y0] = inner[k - 1], [r1, y1] = inner[Math.min(k, inner.length - 1)];
  return y1 > y0 ? r0 + (r1 - r0) * THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1) : r1;
}
function liquid(inner, y) {
  const pts = [[0, inner[0][1]]];
  for (const [r, yy] of inner) { if (yy >= y) break; pts.push([r * 0.985, yy]); }
  pts.push([radiusAt(inner, y) * 0.985, y], [0, y]);
  return lathe(pts, 28);
}

// Сосуд: стенка, жидкость, уровень fill 0..1 (от дна до края налива). kind: cup | wine | water | carafe.
// grip — где его держит ладонь (в осях сосуда): g — точка хвата, d — от ладони до точки, fist — насколько сжаты пальцы.
const VESSELS = {
  // Капучино 180 мл: стенка фарфора, ручка вбок (+x), блюдце отдельно.
  cup: { outer: [[0, 0], [0.024, 0], [0.026, 0.004], [0.031, 0.02], [0.039, 0.046], [0.0435, 0.068], [0.044, 0.071]], inner: [[0.023, 0.009], [0.03, 0.022], [0.0375, 0.046], [0.0415, 0.068]],
    top: 0.071, lo: 0.012, hi: 0.06, mat: 'china', drink: 'coffee', name: 'кофе', grip: { g: V(0.056, 0.042, 0), d: 0.012, fist: 0.95 }, sip: 0.22 },
  wine: { outer: [[0, 0], [0.036, 0], [0.037, 0.003], [0.006, 0.005], [0.0036, 0.014], [0.0036, 0.086], [0.008, 0.092], [0.026, 0.103], [0.04, 0.127], [0.0435, 0.15], [0.041, 0.175], [0.034, 0.198]],
    inner: [[0.004, 0.095], [0.024, 0.104], [0.0385, 0.127], [0.0415, 0.15], [0.039, 0.175]], top: 0.198, lo: 0.098, hi: 0.142, mat: 'glass', drink: 'wine', name: 'бокал', grip: { g: V(0.0036, 0.05, 0), d: 0.012, fist: 1 }, sip: 0.2 },
  water: { outer: [[0, 0], [0.031, 0], [0.0325, 0.003], [0.037, 0.105]], inner: [[0.029, 0.009], [0.0345, 0.105]], top: 0.105, lo: 0.012, hi: 0.088, mat: 'glass', drink: 'water', name: 'стакан', grip: { g: V(0.035, 0.055, 0), d: 0.006, fist: 0.62 }, sip: 0.25 },
  carafe: { outer: [[0, 0], [0.05, 0], [0.056, 0.01], [0.063, 0.06], [0.059, 0.12], [0.041, 0.17], [0.025, 0.2], [0.023, 0.25], [0.028, 0.266]],
    inner: [[0.05, 0.008], [0.059, 0.06], [0.055, 0.12], [0.038, 0.17], [0.021, 0.2], [0.02, 0.25]], top: 0.266, lo: 0.01, hi: 0.165, mat: 'glass', drink: 'water', name: 'графин', grip: { g: V(0.024, 0.215, 0), d: 0.008, fist: 0.9 } },
};

export class Vessel {
  constructor(kind, fill = 0.8) {
    initMat();
    const k = this.k = VESSELS[kind];
    this.kind = kind; this.name = k.name; this.grip = k.grip;
    this.obj = new THREE.Group(); this.obj.name = kind;
    const wall = mesh(lathe([...k.outer, ...k.inner.slice().reverse()], 36), MAT[k.mat], kind === 'cup');
    wall.renderOrder = 2; this.obj.add(wall); // стекло после жидкости: жидкость видна сквозь стенку
    if (kind === 'cup') { // ручка: дужка трубкой, концы утоплены в стенку
      const c = new THREE.CatmullRomCurve3([V(0.034, 0.058, 0), V(0.054, 0.058, 0), V(0.064, 0.045, 0), V(0.058, 0.026, 0), V(0.032, 0.022, 0)]);
      this.obj.add(mesh(new THREE.TubeGeometry(c, 24, 0.0048, 10), MAT.china));
    }
    this.liq = mesh(new THREE.BufferGeometry(), MAT[k.drink], false); this.liq.renderOrder = 1; this.obj.add(this.liq);
    if (kind === 'cup') { this.crema = mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), MAT.crema, false); this.obj.add(this.crema); } // пенка сверху
    if (kind === 'cup') { // пар над горячим кофе: облачка поднимаются, расплываются и гаснут
      this.steam = []; for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(MAT.steam.clone()); s.userData.ph = i / 5; this.steam.push(s); this.obj.add(s); }
    }
    this.fill = -1; this.setFill(fill);
  }
  get empty() { return this.fill < 0.04; }
  setFill(f) {
    f = THREE.MathUtils.clamp(f, 0, 1);
    if (Math.abs(f - this.fill) < 0.004) return;
    this.fill = f; this.liq.geometry.dispose();
    this.liq.visible = f > 0.01;
    const y = this.k.lo + (this.k.hi - this.k.lo) * f;
    this.liq.geometry = f > 0.01 ? liquid(this.k.inner, y) : new THREE.BufferGeometry();
    if (this.crema) { this.crema.visible = f > 0.01; this.crema.position.y = y + 0.0008; this.crema.scale.setScalar(radiusAt(this.k.inner, y) * 0.985); }
  }
  update(dt, now, tilt = 0) {
    if (!this.steam) return;
    const y0 = this.k.lo + (this.k.hi - this.k.lo) * this.fill;
    for (const s of this.steam) {
      const a = ((now / 2.4 + s.userData.ph) % 1 + 1) % 1, sw = Math.sin(now * 1.3 + s.userData.ph * 9);
      s.position.set(sw * 0.012 * a, y0 + 0.012 + a * 0.15, Math.cos(now * 1.1 + s.userData.ph * 7) * 0.01 * a);
      s.scale.setScalar(0.025 + a * 0.07);
      s.material.opacity = (this.fill > 0.05 ? 0.16 : 0) * Math.sin(Math.PI * a) * (1 - tilt);
      s.material.rotation = s.userData.ph * 6 + a;
    }
  }
}
function saucer() {
  initMat();
  return mesh(lathe([[0, 0], [0.045, 0], [0.05, 0.004], [0.07, 0.012], [0.073, 0.0145], [0.0705, 0.0155], [0.05, 0.0085], [0.031, 0.0095], [0, 0.0095]], 36), MAT.china);
}

// ---------- Мебель ----------
// Стул бистро: рама из крашеной трубы, сиденье и спинка — тиковые рейки. Сиденье 0,45 м, верх спинки 0,86 м.
// grips — где берут руками при переноске: верх задних ножек (лево +x, право −x), в осях стула.
export function chair() {
  initMat();
  const g = new THREE.Group(); g.name = 'chair';
  const fr = [], r = 0.011;
  for (const s of [-1, 1]) {
    fr.push(tube(V(s * 0.2, 0, 0.19), V(s * 0.19, 0.44, 0.17), r)); // передняя ножка
    fr.push(tube(V(s * 0.2, 0, -0.2), V(s * 0.19, 0.44, -0.17), r), tube(V(s * 0.19, 0.44, -0.17), V(s * 0.19, 0.86, -0.24), r)); // задняя ножка и стойка спинки
    fr.push(tube(V(s * 0.195, 0.43, 0.18), V(s * 0.195, 0.43, -0.18), r)); // царга сиденья
    fr.push(tube(V(s * 0.2, 0.16, 0.18), V(s * 0.2, 0.16, -0.19), r * 0.8)); // распорка
  }
  fr.push(tube(V(-0.195, 0.43, 0.18), V(0.195, 0.43, 0.18), r), tube(V(-0.19, 0.43, -0.17), V(0.19, 0.43, -0.17), r));
  for (const s of [-1, 1]) fr.push(new THREE.SphereGeometry(r * 1.1, 8, 6).translate(s * 0.19, 0.86, -0.24));
  g.add(mesh(mergeGeometries(fr), MAT.frame));
  const slats = [];
  for (let i = 0; i < 5; i++) slats.push(plank(0.42, 0.018, 0.068).translate(0, 0.452, 0.152 - i * 0.076));
  for (const [y, z] of [[0.64, -0.2], [0.79, -0.228]]) slats.push(plank(0.4, 0.07, 0.016).rotateX(-0.17).translate(0, y, z));
  g.add(mesh(mergeGeometries(slats), MAT.teak));
  g.userData = { seat: V(0, 0.45, 0.02), grips: [V(0.19, 0.84, -0.235), V(-0.19, 0.84, -0.235)], r: 0.24 };
  return g;
}
// Барный табурет: тик, четыре ножки враспор, кольцо-подножка из латуни. Сиденье 0,76 м.
export function stool() {
  initMat();
  const g = new THREE.Group(); g.name = 'stool';
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.045, 28).translate(0, 0.74, 0), MAT.teak));
  const legs = [];
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; legs.push(tube(V(Math.cos(a) * 0.12, 0.72, Math.sin(a) * 0.12), V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), 0.016)); }
  g.add(mesh(mergeGeometries(legs), MAT.teak));
  g.add(mesh(new THREE.TorusGeometry(0.168, 0.008, 6, 32).rotateX(Math.PI / 2).translate(0, 0.27, 0), MAT.brass));
  g.userData = { r: 0.22 };
  return g;
}
// Столик под зонт: круглая тиковая столешница 0,74 м, четыре ножки по краю (по центру проходит стойка зонта).
export function table() {
  initMat();
  const g = new THREE.Group(); g.name = 'table';
  const top = new THREE.CylinderGeometry(0.4, 0.4, 0.03, 40); top.translate(0, 0.725, 0);
  const uv = top.attributes.uv, p = top.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.6 + 0.5, p.getZ(i) / 0.6 + 0.5); // доски вдоль x
  g.add(mesh(top, MAT.teak));
  const fr = [new THREE.TorusGeometry(0.3, 0.012, 6, 36).rotateX(Math.PI / 2).translate(0, 0.69, 0), new THREE.TorusGeometry(0.26, 0.009, 6, 36).rotateX(Math.PI / 2).translate(0, 0.2, 0)];
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; fr.push(tube(V(Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3), V(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34), 0.013)); }
  fr.push(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16).translate(0, 0.745, 0)); // втулка под стойку зонта
  g.add(mesh(mergeGeometries(fr), MAT.frame));
  g.userData = { top: 0.74, r: 0.4 };
  return g;
}
// Барная стойка вдоль x, перед (к гостям) в +z: тиковые доски вертикально, мраморная столешница со свесом к гостям,
// латунная подножка. Высота 1,1 м.
export function bar(len = 2.2) {
  initMat();
  const g = new THREE.Group(); g.name = 'bar';
  const boards = [], n = Math.round(len / 0.12);
  for (let i = 0; i < n; i++) boards.push(plank(len / n - 0.004, 1.02, 0.03).translate(-len / 2 + (i + 0.5) * (len / n), 0.53, 0.25));
  for (const s of [-1, 1]) boards.push(plank(0.03, 1.02, 0.52).translate(s * (len / 2 - 0.015), 0.53, 0));
  boards.push(plank(len, 0.06, 0.03).translate(0, 0.03, 0.27)); // цоколь
  g.add(mesh(mergeGeometries(boards), MAT.teak));
  g.add(mesh(new THREE.BoxGeometry(len - 0.06, 1.0, 0.46).translate(0, 0.52, -0.02), MAT.iron)); // тёмный короб внутри
  const top = new THREE.BoxGeometry(len + 0.1, 0.045, 0.66); top.translate(0, 1.075, 0.06);
  g.add(mesh(top, MAT.stone));
  g.add(mesh(mergeGeometries([tube(V(-len / 2 + 0.1, 0.2, 0.38), V(len / 2 - 0.1, 0.2, 0.38), 0.022, 12),
    ...[-0.35, 0, 0.35].map((k) => tube(V(k * len, 0.2, 0.38), V(k * len, 0.2, 0.27), 0.012))]), MAT.brass));
  g.userData = { top: 1.098, len };
  return g;
}

// ---------- Зонт ----------
// Восемь спиц на верхушке стойки, бегунок со стяжками скользит по стойке. open 0..1: 1 — раскрыт (спицы чуть ниже
// горизонта), 0 — сложен (спицы почти вдоль стойки, ткань собрана складками). Ткань — восемь клиньев сеткой, между
// спицами провисает, сложенная — выпирает наружу складками.
const RIBS = 8, RIB = 1.45, HUB = 2.36, STRETCH = 0.75, AT = 0.45, NU = 7, NV = 5;
export class Umbrella {
  constructor() {
    initMat();
    this.obj = new THREE.Group(); this.obj.name = 'umbrella';
    this.open = 1; this.want = 1;
    this.obj.add(mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.06, 32).translate(0, 0.03, 0), MAT.iron)); // чугунное основание
    this.obj.add(mesh(new THREE.CylinderGeometry(0.019, 0.022, HUB + 0.12, 12).translate(0, (HUB + 0.12) / 2, 0), MAT.oak));
    this.obj.add(mesh(new THREE.SphereGeometry(0.035, 12, 8).scale(1, 1.6, 1).translate(0, HUB + 0.16, 0), MAT.oak)); // навершие
    this.runner = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 12), MAT.oak); this.obj.add(this.runner);
    const rib = new THREE.CylinderGeometry(0.0065, 0.005, 1, 6).translate(0, 0.5, 0), str = new THREE.CylinderGeometry(0.005, 0.005, 1, 6).translate(0, 0.5, 0);
    this.ribs = []; this.str = [];
    for (let i = 0; i < RIBS; i++) { const a = mesh(rib, MAT.oak), b = mesh(str, MAT.oak, false); this.ribs.push(a); this.str.push(b); this.obj.add(a, b); }
    const P = [], U = [], I = [];
    for (let k = 0; k < RIBS; k++) for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { P.push(0, 0, 0); U.push(i / NU, j / NV); }
    const at = (k, i, j) => k * (NU + 1) * (NV + 1) + i * (NV + 1) + j;
    for (let k = 0; k < RIBS; k++) for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) I.push(at(k, i, j), at(k, i + 1, j), at(k, i, j + 1), at(k, i, j + 1), at(k, i + 1, j), at(k, i + 1, j + 1));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I);
    this.cloth = mesh(geo, MAT.fabric.clone()); this.cloth.frustumCulled = false; this.obj.add(this.cloth); // своя ткань: гаснет, когда закрывает Лёву (club.js)
    this.fadeTo = 1;
    this.shape(1);
  }
  get folded() { return this.want < 0.5; }
  toggle() { this.want = this.want > 0.5 ? 0 : 1; }
  // Угол спицы к горизонту: раскрыт −12°, сложен −84°.
  shape(o) {
    const e = o * o * (3 - 2 * o), ang = THREE.MathUtils.degToRad(-84 + 72 * e), hub = V(0, HUB, 0);
    const dir = (k) => { const a = (k / RIBS) * Math.PI * 2; return V(Math.cos(a) * Math.cos(ang), Math.sin(ang), Math.sin(a) * Math.cos(ang)); };
    const mid = hub.clone().add(V(Math.cos(ang) * RIB * AT, Math.sin(ang) * RIB * AT, 0)), yr = mid.y - Math.sqrt(Math.max(0, STRETCH ** 2 - mid.x ** 2));
    this.runner.position.set(0, yr, 0);
    const q = new THREE.Quaternion();
    for (let k = 0; k < RIBS; k++) {
      const d = dir(k), r = this.ribs[k], s = this.str[k];
      r.position.copy(hub); r.quaternion.setFromUnitVectors(UP, d); r.scale.set(1, RIB, 1);
      const m = hub.clone().addScaledVector(d, RIB * AT), from = V(0, yr, 0), sd = m.clone().sub(from);
      s.position.copy(from); s.quaternion.copy(q.setFromUnitVectors(UP, sd.clone().normalize())); s.scale.set(1, sd.length(), 1);
    }
    // Ткань: точка (u вдоль спицы, v поперёк клина) между спицами k и k+1, у края между спицами провисает,
    // сложенная — собирается складками наружу.
    const p = this.cloth.geometry.attributes.position, A = V(), B = V(), C = V();
    for (let k = 0; k < RIBS; k++) {
      const d0 = dir(k), d1 = dir((k + 1) % RIBS);
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
        const u = i / NU, v = j / NV, w = Math.sin(Math.PI * v);
        A.copy(hub).addScaledVector(d0, RIB * u * 1.01); B.copy(hub).addScaledVector(d1, RIB * u * 1.01);
        C.lerpVectors(A, B, v);
        const out = C.clone().sub(V(0, C.y, 0)); const ol = out.length() || 1;
        C.y += 0.018 + 0.005 * u; // ткань над спицами
        C.y -= w * u * 0.05 * e; // провис у края раскрытого
        C.addScaledVector(out, (w * Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.07 * (1 - e)) / ol); // складки сложенного
        p.setXYZ(k * (NU + 1) * (NV + 1) + i * (NV + 1) + j, C.x, C.y, C.z);
      }
    }
    p.needsUpdate = true; this.cloth.geometry.computeVertexNormals();
  }
  update(dt) {
    const m = this.cloth.material, tr = this.fadeTo < 0.99 || m.opacity < 0.99;
    m.opacity += (this.fadeTo - m.opacity) * Math.min(1, dt * 8);
    if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; } // программу меняем только на переходе
    if (Math.abs(this.open - this.want) < 1e-3) return;
    this.open += Math.sign(this.want - this.open) * Math.min(Math.abs(this.want - this.open), dt / 1.4);
    this.shape(this.open);
  }
}

// ---------- Терраса ----------
// Настил x 10,2…14,6, z −35…−19 на высоте DECK (env.js). Стойка у стены шале, два столика под зонтами со стульями,
// у стойки табуреты. Возвращает предметы для interact.js: vessels (что можно взять), surfaces (куда поставить: места
// spots в мире), chairs, umbrellas; update(dt, now) — пар и зонты.
export function buildTerrace(deck) {
  const g = new THREE.Group(); g.name = 'terrace';
  const out = { group: g, vessels: [], surfaces: [], chairs: [], umbrellas: [] }; // препятствия для прогулки club.js берёт по именам (bar, table, stool, umbrella)
  const put = (o, x, z, rot = 0, y = deck) => { o.position.set(x, y, z); o.rotation.y = rot; g.add(o); return o; };
  // Поверхность: места на ней — точки в мире; saucer — блюдце на месте (чашка встаёт на него).
  const surface = (name, pts, y, at, r) => { const s = { name, pos: at, r, spots: pts.map(([x, z, sc]) => ({ pos: V(x, y, z), saucer: !!sc, item: null })) }; out.surfaces.push(s); return s; };
  const place = (v, spot, rot = 0) => { spot.item = v; v.spot = spot; v.obj.position.copy(spot.pos); if (spot.saucer) v.obj.position.y += 0.0095; v.obj.rotation.y = rot; g.add(v.obj); out.vessels.push(v); };

  // Барная стойка лицом к корту (−x), у стены шале; два табурета.
  const B = put(bar(2.2), 13.62, -21.8, -Math.PI / 2), top = deck + B.userData.top;
  const bs = surface('стойка', [[13.5, -22.6], [13.5, -22.25], [13.5, -21.9], [13.5, -21.55], [13.5, -21.2], [13.5, -20.9]], top, V(13.4, top, -21.8), 1.25);
  place(new Vessel('carafe', 0.85), bs.spots[2], 0.6);
  place(new Vessel('wine', 0.7), bs.spots[0], 1); place(new Vessel('wine', 0.55), bs.spots[1], 2);
  place(new Vessel('water', 0), bs.spots[3], 0.3); place(new Vessel('water', 0), bs.spots[4], 1.4);
  for (const z of [-22.35, -21.25]) put(stool(), 12.95, z, 0.3);

  // Два столика под зонтами, у каждого по три стула лицом к столу; на столе чашки кофе на блюдцах (у столика 2 — ещё стакан).
  for (const [x, z, n] of [[11.75, -26.2, 2], [11.75, -31.4, 1]]) {
    put(table(), x, z);
    const u = new Umbrella(); put(u.obj, x, z); out.umbrellas.push(u);
    const ty = deck + 0.74, seats = [[-0.66, 0], [0.66, 0], [0, 0.68]];
    const s = surface('стол', [...seats.map(([dx, dz]) => [x + dx * 0.33, z + dz * 0.33, true]), [x + 0.1, z - 0.2]], ty, V(x, ty, z), 1.2);
    for (const [dx, dz] of seats) {
      const c = chair(); put(c, x + dx, z + dz, Math.atan2(-dx, -dz)); // лицом к столу
      out.chairs.push({ obj: c, ...c.userData });
    }
    s.spots.forEach((sp) => { if (sp.saucer) { const m = saucer(); m.position.copy(sp.pos); g.add(m); } });
    for (let i = 0; i < n; i++) place(new Vessel('cup', 0.8), s.spots[i], Math.atan2(seats[i][0], seats[i][1]) + 2.2);
    if (n === 1) place(new Vessel('water', 0.6), s.spots[3]);
  }
  out.update = (dt, now) => { for (const v of out.vessels) v.update(dt, now, v.tilt ?? 0); for (const u of out.umbrellas) u.update(dt); };
  return out;
}
