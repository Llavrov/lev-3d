// Тренер: 3D-человек показывает упражнение в движении, мышцы подсвечены тремя цветами, подсказка по фазам.
// ?ex=<id> — упражнение (src/trainer/ex), ?model=<имя> — модель из /models (по умолчанию coach-v2), ?muscles=all — карта мышц
// каждой своим цветом (?muscles=quads,glutes — только эти, off — без подсветки), ?debug — window.__trainer: set(t), view(имя),
// pause(bool), audit(), cam(…), pose(имя), muscles([…]).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Rig } from '../swing.js';
import { useDQS } from '../dqs.js';
import { EXERCISES, exerciseById, phaseAt, cycleOf, typo, RU, MUSCLES } from './exercises.js';
import { mapMuscles, patchMaterial, setTargets, stepMuscles, setJoints, DEBUG_COLORS } from './muscles.js';
import { setupBody, testPose } from './poses.js';

const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug');
let SHOW = Q.get('muscles') === 'all' ? MUSCLES : Q.get('muscles') === 'off' ? [''] : (Q.get('muscles') ?? '').split(',').filter((m) => MUSCLES.includes(m)); let ALL = SHOW.length > 0;
const MODEL = /^[\w-]+$/.test(Q.get('model') ?? '') ? Q.get('model') : 'coach-v2';
const ex = exerciseById(Q.get('ex'));
const COL = { work: '#ff4d2e', stretch: '#2aa8ff', careful: '#ffc21a' };
const VIEWS = { front: 0, side: ex.sideFrom === 'left' ? Math.PI / 2 : -Math.PI / 2, back: Math.PI }; // азимут камеры: тело смотрит в +Z, сбоку — с правой стороны (−X), если снаряд не там
const EL = 0.1; // камера чуть сверху
const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(pointer: coarse)').matches;

// ---------- Сцена ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.1;
const BG = '#17181b';
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG); scene.fog = new THREE.Fog(BG, 7, 16);
scene.add(new THREE.HemisphereLight('#e8ecf5', '#2a2622', 0.9));
const sun = new THREE.DirectionalLight('#fff3e6', 2.6);
sun.position.set(1.6, 4.2, 2.4); sun.castShadow = true;
sun.shadow.mapSize.setScalar(mobile ? 1024 : 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2.6, bottom: -1.4, near: 0.5, far: 10 });
scene.add(sun);
const rim = new THREE.DirectionalLight('#cfe0ff', 1.1); rim.position.set(-2.5, 2.5, -3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: '#222428', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1; controls.maxDistance = 12;
controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI / 2 - 0.03; // не под пол

// ---------- Экран ----------
const pick = $('ex');
pick.innerHTML = EXERCISES.map((e) => `<option value="${e.id}"${e === ex ? ' selected' : ''}>${typo(e.name)}</option>`).join('');
pick.addEventListener('change', () => { const q = new URLSearchParams(location.search); q.set('ex', pick.value); location.search = q.toString(); });
document.title = ex.name;
$('legend').innerHTML = ALL
  ? SHOW.filter(Boolean).map((m) => `<li><i style="background:${DEBUG_COLORS[MUSCLES.indexOf(m)]}"></i><span>${typo(RU[m])}</span></li>`).join('')
  : [['work', 'Работают', ex.muscles.work.filter((m) => !ex.muscles.careful.includes(m))], ['stretch', 'Тянутся', ex.muscles.stretch], ['careful', 'Беречь', ex.muscles.careful]]
    .filter(([, , l]) => l.length)
    .map(([k, t, l]) => `<li data-k="${k}"><i style="background:${COL[k]}"></i><span><b>${t}</b> ${typo(l.map((m) => RU[m] ?? m).join(', '))}</span></li>`).join('');
if (ALL) $('legend').classList.add('all');
let paused = false, slow = false, t = 0, anim = null, view = ex.view ?? 'side';
$('pause').addEventListener('click', () => setPause(!paused));
$('slow').addEventListener('click', () => { slow = !slow; $('slow').setAttribute('aria-pressed', slow); });
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => go(b.dataset.view));
function setPause(p) { paused = p; $('pause').textContent = p ? 'Дальше' : 'Пауза'; $('pause').setAttribute('aria-pressed', p); }
function markView() { for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === view); }
controls.addEventListener('start', () => { anim = null; }); // палец или мышь — ракурс больше не доводим

// ---------- Камера ----------
// Просвет кадра, свободный от текста и кнопок: на телефоне между заголовком и кнопками, на ПК правее панели слева.
// Камера каждого ракурса держит весь габарит движения за цикл (T.bounds), а не одну позу.
let band = { fx: 1, fy: 1 };
function layout() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const top = $('top').getBoundingClientRect().bottom + 8;
  let bottom = $('bottom').getBoundingClientRect().top - 8, left = 12, right = W - 12;
  if (W >= 760) { bottom = H - 16; left = $('bottom').getBoundingClientRect().right + 24; }
  bottom = Math.max(bottom, top + H * 0.3);
  band = { fx: (right - left) / W, fy: (bottom - top) / H };
  camera.setViewOffset(W, H, W / 2 - (left + right) / 2, H / 2 - (top + bottom) / 2, W, H);
  camera.updateProjectionMatrix();
}
const sph = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
function fit(az) {
  const box = T.bounds ?? new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 1.9, 0.4));
  const c = box.getCenter(new THREE.Vector3()), dir = sph(az, EL), right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), up = new THREE.Vector3().crossVectors(dir, right);
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * band.fy * 0.94, th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * band.fx * 0.94;
  let d = 0;
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    d = Math.max(d, r.dot(dir) + Math.abs(r.dot(right)) / th, r.dot(dir) + Math.abs(r.dot(up)) / tv);
  }
  return { target: c, d, az };
}
function go(name, instant = false) {
  view = name; markView();
  const f = fit(VIEWS[name]), off = camera.position.clone().sub(controls.target);
  const az0 = Math.atan2(off.x, off.z); let az1 = f.az;
  while (az1 - az0 > Math.PI) az1 -= 2 * Math.PI; while (az1 - az0 < -Math.PI) az1 += 2 * Math.PI;
  anim = { t: instant ? 1 : 0, az0, az1, el0: Math.asin(THREE.MathUtils.clamp(off.y / (off.length() || 1), -1, 1)), d0: off.length() || f.d, d1: f.d, c0: controls.target.clone(), c1: f.target };
  stepView(0);
  controls.update();
}
function stepView(dt) {
  if (!anim) return;
  const a = anim; a.t = Math.min(1, a.t + dt / 0.7);
  const u = a.t * a.t * (3 - 2 * a.t);
  controls.target.lerpVectors(a.c0, a.c1, u);
  camera.position.copy(controls.target).addScaledVector(sph(a.az0 + (a.az1 - a.az0) * u, a.el0 + (EL - a.el0) * u), a.d0 + (a.d1 - a.d0) * u);
  if (a.t >= 1) anim = null;
}

// ---------- Модель ----------
const T = { scene, ex, legR: null, gear: new THREE.Group() };
T.add = (...o) => T.gear.add(...o);
scene.add(T.gear);
let shownPhase = -1;
function poseAt(s) { const ph = phaseAt(ex, s); ph.t = s; ex.pose(T, ph); return ph; }
function show(dt) {
  const ph = poseAt(t);
  if (ALL) setTargets(Object.fromEntries(SHOW.map((m) => [m, [DEBUG_COLORS[MUSCLES.indexOf(m)], 0.95]])));
  else {
    const pulse = 0.62 + 0.3 * Math.sin(performance.now() / 1000 * Math.PI * 2 / 1.8);
    const map = {};
    for (const m of ex.muscles.work) map[m] = [COL.work, 0.9];
    if (ph.phase.stretch) for (const m of ex.muscles.stretch) map[m] = [COL.stretch, 0.9]; // на растяжении тянущиеся синие поверх работающих
    for (const m of ex.muscles.careful) map[m] = [COL.careful, DEBUG ? 0.85 : pulse];
    setTargets(map);
    setJoints(T.rig, ex.muscles.careful, DEBUG ? 0.85 : pulse);
  }
  stepMuscles(dt);
  if (ph.i !== shownPhase) {
    shownPhase = ph.i;
    $('cue').innerHTML = `<b>${typo(ph.phase.name[0].toUpperCase() + ph.phase.name.slice(1))}.</b> ${typo(ph.phase.cue)}`;
    const k = ph.phase.stretch ? 'stretch' : 'work';
    const on = (k2) => k2 === 'careful' || k2 === 'work' && ex.muscles.work.some((m) => !(ph.phase.stretch && ex.muscles.stretch.includes(m)) && !ex.muscles.careful.includes(m)) || k2 === k;
    for (const li of document.querySelectorAll('#legend li[data-k]')) li.classList.toggle('dim', !on(li.dataset.k));
  }
}
// Габарит движения за цикл: кости и снаряды в 24 точках (у поочерёдных упражнений — за оба цикла), плюс толщина тела.
function measure() {
  const box = new THREE.Box3(), span = cycleOf(ex) * (ex.span ?? 1);
  for (let i = 0; i < 24; i++) {
    poseAt(span * i / 24);
    T.wrap.updateMatrixWorld(true);
    for (const { bone } of T.rig.all) box.expandByPoint(bone.getWorldPosition(new THREE.Vector3()));
    T.gear.updateMatrixWorld(true);
    if (T.gear.children.some((o) => o.visible)) box.union(new THREE.Box3().setFromObject(T.gear, true));
  }
  box.expandByScalar(0.12); box.min.y = Math.max(box.min.y, -0.02);
  T.bounds = box;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load(`/models/${MODEL}.glb`, (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
    if (o.isSkinnedMesh) { T.legR = mapMuscles(o); patchMaterial(o.material); }
  });
  if (!Q.has('lbs')) useDQS(model);
  const box = new THREE.Box3().setFromObject(model);
  model.scale.multiplyScalar(1.82 / (box.max.y - box.min.y));
  const wrap = new THREE.Group(); wrap.add(model); scene.add(wrap); wrap.updateMatrixWorld(true);
  T.wrap = wrap; T.rig = new Rig(model, new THREE.Object3D()); // ракетки нет: пустышка, чтобы Rig.audit не падал
  setupBody(T);
  ex.setup?.(T);
  // Эталон стоп для проверки «не сдвинулась»: поза в момент ex.refT (по умолчанию начало цикла).
  poseAt(ex.refT ?? 0);
  T.ref = Object.fromEntries(['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].filter((n) => T.rig.b[n]).map((n) => [n, T.rig.b[n].getWorldPosition(new THREE.Vector3())]));
  measure();
  layout(); go(view, true);
  show(null);
  document.body.classList.add('ready'); window.__ready = true;
  if (DEBUG) window.__trainer = {
    ready: true,
    set(s) { setPause(true); t = s; show(null); return phaseAt(ex, s); },
    view(name, instant = true) { go(name, instant); },
    pause(p = true) { setPause(!!p); },
    cam(x, y, z, tx, ty, tz) { anim = null; controls.target.set(tx, ty, tz); camera.position.set(x, y, z); controls.update(); }, // крупный план для проверки
    pose(name) { setPause(true); testPose(T, name); },
    muscles(list) { SHOW = list; ALL = list.length > 0; show(null); }, // карта по одной мышце без перезагрузки
    audit() { const r = ex.audit(T); return { violations: r.bad, ...r.m }; },
    bounds: () => T.bounds,
    cycle: cycleOf(ex) * (ex.span ?? 1),
    legR: T.legR,
    T,
  };
}, undefined, (e) => { console.error('модель не загрузилась', e); $('cue').textContent = 'Модель не загрузилась. Обнови страницу.'; });

// Размер холста меняем в начале кадра: смена размера стирает холст, а событие могло прийти после отрисовки.
let resized = true, lastW = 0;
addEventListener('resize', () => { resized = true; });
let last = performance.now();
renderer.setAnimationLoop((now) => {
  if (resized) { resized = false; layout(); if (T.bounds && innerWidth !== lastW) go(view, true); lastW = innerWidth; } // панель браузера меняет только высоту — камеру не дёргаем
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (T.rig) {
    if (!paused) t += dt * (slow ? 0.4 : 1);
    if (!paused || !DEBUG) show(dt);
  }
  stepView(dt);
  controls.update();
  renderer.render(scene, camera);
});
