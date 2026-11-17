// Ракетка в красно-чёрной гамме, как у Лёвы на видео, без чужих логотипов.
// Начало координат — точка хвата (середина ручки), ось +Y к голове, струнная плоскость XY, нормаль струн +Z.
// Размеры как у ракетки 100 кв. дюймов: длина 68.6 см, голова 33 × 25 см, обод 23 мм в глубину.
import * as THREE from 'three';

const HEAD_A = 0.165, HEAD_B = 0.125, HEAD_Y = 0.36, BEAM = 0.0105, DEPTH = 2.1; // DEPTH: обод в 2 раза глубже, чем толщина в плоскости

function ellipsePoint(t, shrink = 0) {
  return new THREE.Vector3(Math.cos(t) * (HEAD_B - shrink), HEAD_Y + Math.sin(t) * (HEAD_A - shrink), 0);
}

// Струны: прозрачная текстура с решёткой 16 основных и 19 поперечных, наложенная на овал внутри обода.
function strings() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 680;
  const g = c.getContext('2d'), mains = 16, crosses = 19;
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ece6d4'; g.lineWidth = 3.2;
  for (let i = 0; i < mains; i++) { const x = ((i + 0.5) / mains) * c.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  g.strokeStyle = '#d9d2bd';
  for (let i = 0; i < crosses; i++) { const y = ((i + 0.5) / crosses) * c.height; g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const a = HEAD_A - BEAM * 0.6, b = HEAD_B - BEAM * 0.6;
  const shape = new THREE.Shape(); shape.absellipse(0, 0, b, a, 0, Math.PI * 2);
  const geo = new THREE.ShapeGeometry(shape, 64);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + b) / (2 * b), (p.getY(i) + a) / (2 * a));
  geo.translate(0, HEAD_Y, 0);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }));
}

// Обмотка: белый овергрип внахлёст по спирали.
function gripTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, 128, 512);
  g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 3;
  for (let y = -128; y < 640; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + 128); g.stroke(); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 128, Math.random() * 512, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildRacket(color = '#b5122a') {
  const group = new THREE.Group(); group.name = 'racket';
  const red = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 });

  // Обод: верхние три четверти красные, низ головы и мост чёрные.
  const ring = (t0, t1, mat) => {
    const pts = []; for (let i = 0; i <= 64; i++) pts.push(ellipsePoint(t0 + (t1 - t0) * (i / 64)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, BEAM, 10), mat);
    m.scale.z = DEPTH; return m;
  };
  group.add(ring(-Math.PI * 0.32, Math.PI * 1.32, red), ring(Math.PI * 1.3, Math.PI * 1.7 + 0.02, black));

  // Горло: два плеча от низа головы сходятся к ручке.
  for (const s of [-1, 1]) {
    const start = ellipsePoint(-Math.PI / 2 + s * 0.62);
    const pts = [start, new THREE.Vector3(s * 0.05, 0.135, 0), new THREE.Vector3(s * 0.016, 0.085, 0)];
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, BEAM * 0.95, 10), black);
    arm.scale.z = DEPTH * 0.92; group.add(arm);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.0165, 0.04, 8), black);
  collar.position.y = 0.075; collar.rotation.y = Math.PI / 8; group.add(collar);

  // Ручка восьмигранная, под овергрипом; торец чёрный.
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.2, 8, 1), new THREE.MeshStandardMaterial({ map: gripTexture(), roughness: 0.85 }));
  grip.position.y = -0.045; grip.rotation.y = Math.PI / 8; group.add(grip);
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.018, 0.016, 8), black);
  butt.position.y = -0.152; butt.rotation.y = Math.PI / 8; group.add(butt);

  group.add(strings());
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.userData.sweet = new THREE.Vector3(0, HEAD_Y - 0.02, 0); // центр удара на струнах
  return group;
}

// Ракетка из Meshy (public/models/racket-*.glb): выравниваем под ту же разметку, что у ракетки кодом —
// ручка вниз, голова вверх по +Y, струны в плоскости XY, точка хвата в начале координат, длина 68.5 см.
// Ось длины — самая длинная сторона рамки, толщина — самая короткая; голова на том конце, где модель шире.
export function fitRacketModel(scene) {
  const pts = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 4000))) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone());
  });
  const box = new THREE.Box3().setFromPoints(pts), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const axes = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a)); // длина, ширина, толщина
  const L = axes[0], Wd = axes[1], T = axes[2];
  const len = size.getComponent(L);
  const spread = (sign) => {
    const sel = pts.filter((q) => sign * (q.getComponent(L) - c.getComponent(L)) > len * 0.3);
    return sel.length ? Math.max(...sel.map((q) => q.getComponent(Wd))) - Math.min(...sel.map((q) => q.getComponent(Wd))) : 0;
  };
  const headSign = spread(1) >= spread(-1) ? 1 : -1;
  // Базис: Y — к голове, Z — нормаль струн, X — поперёк.
  const ey = new THREE.Vector3().setComponent(L, headSign), ez = new THREE.Vector3().setComponent(T, 1);
  const ex = new THREE.Vector3().crossVectors(ey, ez);
  const rot = new THREE.Matrix4().makeBasis(ex, ey, ez).invert();
  const k = 0.685 / len;
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(scene);
  scene.position.sub(c); // центр рамки в начало
  inner.quaternion.setFromRotationMatrix(rot);
  inner.scale.setScalar(k);
  inner.position.set(0, 0.685 / 2 - 0.16, 0); // торец ручки на −16 см, как у ракетки кодом
  holder.add(inner);
  holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return holder;
}

// Подменить рамку ракетки моделью: группа, её положение и центр удара остаются, меняется только то, что внутри.
export function dressRacket(racket, model) {
  for (const ch of [...racket.children]) racket.remove(ch);
  racket.add(model);
}
