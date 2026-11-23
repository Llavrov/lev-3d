// Тренер: 3D-человек показывает упражнение шагами, как сторис. Сначала движение целиком в обычном темпе, потом каждая
// фаза медленно: камера подъезжает к мышцам фазы, тело темнеет, мышца светится (и под одеждой); в конце — что беречь.
// Подпись внизу появляется слово за словом. Тап справа — следующий шаг, слева — предыдущий, удержание — пауза (и можно
// покрутить камеру), свайп вбок — другое упражнение. Расписание шагов и текст: show.js.
// ?ex=<id> — упражнение (src/trainer/ex), ?model=<имя> — модель из /models (по умолчанию coach-v2), ?muscles=all — карта мышц
// каждой своим цветом (?muscles=quads,glutes — только эти, off — без подсветки), ?debug — window.__trainer: set(t), step(i, u),
// view(имя), pause(bool), audit(), keys(), cam(…), pose(имя), muscles([…]).
// В приложении Lev Pro Max страница стоит в iframe: шаг и упражнение уходят родителю (postMessage, type: 'state'), а он
// присылает ход голосового вопроса (type: 'ask'): показ встаёт, вопрос и ответ идут в ту же подпись.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Rig } from '../swing.js';
import { useDQS } from '../dqs.js';
import { EXERCISES, exerciseById, phaseAt, cycleOf, typo, RU, MUSCLES } from './exercises.js';
import { mapMuscles, patchMaterial, setTargets, stepMuscles, setJoints, muscleFocus, JOINT_BONES, U, DEBUG_COLORS } from './muscles.js';
import { setupBody, testPose } from './poses.js';
import { buildSteps, cycleTime, wordsShown, words } from './show.js';

const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug');
let SHOW = Q.get('muscles') === 'all' ? MUSCLES : Q.get('muscles') === 'off' ? [''] : (Q.get('muscles') ?? '').split(',').filter((m) => MUSCLES.includes(m)); let ALL = SHOW.length > 0;
const MODEL = /^[\w-]+$/.test(Q.get('model') ?? '') ? Q.get('model') : 'coach-v2';
const ex = exerciseById(Q.get('ex')), steps = buildSteps(ex);
const COL = { work: '#ff4d2e', stretch: '#2aa8ff', careful: '#ffc21a' };
const VIEWS = { front: 0, side: ex.sideFrom === 'left' ? Math.PI / 2 : -Math.PI / 2, back: Math.PI }; // азимут камеры: тело смотрит в +Z, сбоку — с правой стороны (−X), если снаряд не там
const EL = 0.1; // камера чуть сверху
const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(pointer: coarse)').matches;
const clamp = THREE.MathUtils.clamp, deg = THREE.MathUtils.degToRad;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// ---------- Экран ----------
const pick = $('ex');
pick.innerHTML = EXERCISES.map((e) => `<option value="${e.id}"${e === ex ? ' selected' : ''}>${typo(e.name)}</option>`).join('');
const openEx = (id) => { const q = new URLSearchParams(location.search); q.set('ex', id); location.search = q.toString(); };
pick.addEventListener('change', () => openEx(pick.value));
document.title = ex.name;
$('bars').innerHTML = steps.map(() => '<i><b></b></i>').join('');
const fills = [...$('bars').querySelectorAll('b')];
if (ALL) { // проверка карты мышц: каждой свой цвет и подпись
  $('legend').innerHTML = SHOW.filter(Boolean).map((m) => `<li><i style="background:${DEBUG_COLORS[MUSCLES.indexOf(m)]}"></i><span>${typo(RU[m])}</span></li>`).join('');
  $('legend').hidden = false;
}

// ---------- Показ ----------
// si — шаг, tau — секунда шага. Показ стоит, пока палец держит экран (held), идёт голосовой вопрос (ask) или отладка
// поставила паузу. dbgT — отладка задала секунду цикла напрямую: тогда шаги не идут и тело показано целиком.
let si = 0, tau = 0, t = 0, held = false, stop = false, dbgT = null, ask = null, askTau = 0;
let spans = [], shown = 0, view = ex.view ?? 'side';
const paused = () => held || stop || !!ask;
const cue = $('cue');
function caption(html) { cue.innerHTML = html; spans = [...cue.querySelectorAll('span')]; shown = 0; }
const spell = (text) => words(text).map((w) => `<span>${esc(w)}</span>`).join(' ');
function stepCaption(time) { for (const n = Math.min(spans.length, wordsShown(time)); shown < n; shown++) spans[shown].classList.add('on'); }
function setStep(i, at = 0) {
  si = (i % steps.length + steps.length) % steps.length; tau = at; manual = false; dbgT = null;
  const st = steps[si];
  caption((st.kind === 'phase' ? `<b>${esc(typo(st.title))}.</b> ` : '') + spell(st.text));
  tell();
}
// Родителю (приложение): что сейчас на экране. Он кладёт это в контекст голосового вопроса.
function tell() {
  if (parent === window) return;
  const st = steps[si];
  parent.postMessage({ source: 'trainer', type: 'state', ex: { id: ex.id, name: ex.name }, step: { i: si, n: steps.length, title: st.title, text: st.text } }, location.origin);
}
// Ход голосового вопроса от родителя: listening — пауза; thinking — вопрос и «Думаю»; answer — ответ слово за словом
// (стоит, пока не тапнешь); error — что не вышло; idle — дальше показ.
function setAsk(d) {
  if (d.state === 'idle') { if (ask) { ask = null; setStep(si, tau); } return; }
  ask = d; askTau = 0;
  const q = d.question ? `<i>${esc(typo(d.question))}</i>` : '';
  if (d.state === 'thinking') caption(q + '<span class="on wait">Думаю</span>');
  else if (d.state === 'answer') caption(q + spell(d.text ?? ''));
  else if (d.state === 'error') caption(`<span class="on">${esc(typo(d.text ?? 'Не получилось. Попробуй ещё раз.'))}</span>`);
}
addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.source === 'app' && e.data.type === 'ask') setAsk(e.data); });

// ---------- Камера ----------
// Просвет кадра, свободный от текста: на телефоне между заголовком и подписью, на ПК правее панели слева.
// Общий план держит весь габарит движения за цикл (T.bounds), а не одну позу. Камера идёт к цели плавно; пальцем
// (удержание и ведение) её можно покрутить, тогда до смены шага цель не действует.
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
  const tv = Math.tan(deg(camera.fov / 2)) * band.fy * 0.94, th = Math.tan(deg(camera.fov / 2)) * camera.aspect * band.fx * 0.94;
  let d = 0;
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    d = Math.max(d, r.dot(dir) + Math.abs(r.dot(right)) / th, r.dot(dir) + Math.abs(r.dot(up)) / tv);
  }
  return { target: c, d, az };
}
const cam = { az: 0, el: EL, d: 5, c: new THREE.Vector3(0, 0.9, 0) }, goal = { az: 0, el: EL, d: 5, c: new THREE.Vector3(0, 0.9, 0) };
let manual = false;
function wholeGoal() { const f = fit(VIEWS[view]); goal.az = f.az; goal.el = EL; goal.d = f.d; goal.c.copy(f.target); }
// Крупный план мышц и суставов list: центр — середина их точек на коже, камера со стороны, куда смотрит кожа, но ближе
// к обычному ракурсу (за тело без нужды не уходим) и не из-под пола. Дистанция — чтобы участок занял около трети кадра.
function focusGoal(list) {
  const f = muscleFocus(T.mesh, list.filter((m) => MUSCLES.includes(m))), pts = f?.points ?? [];
  for (const j of list) if (JOINT_BONES[j]) for (const s of ['Left', 'Right']) pts.push(T.rig.b[s + JOINT_BONES[j]].getWorldPosition(new THREE.Vector3()));
  if (!pts.length) return wholeGoal();
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
  // Куда смотрит кожа участка; у суставов без мышц — наружу от середины тела (плечи лежащего видно со стороны головы).
  const out = f?.normal ?? c.clone().sub(T.bounds.getCenter(new THREE.Vector3())).normalize();
  const base = sph(VIEWS[view], EL), dir = out.multiplyScalar(0.6).addScaledVector(base, 0.4).normalize();
  goal.c.copy(c); goal.az = Math.atan2(dir.x, dir.z); goal.el = clamp(Math.asin(clamp(dir.y, -1, 1)), deg(4), deg(60));
  // Дистанция по самим точкам: участок занимает до половины высоты просвета и до 0,72 его ширины, вокруг видно тело.
  const look = sph(goal.az, goal.el), right = new THREE.Vector3(Math.cos(goal.az), 0, -Math.sin(goal.az)), up = new THREE.Vector3().crossVectors(look, right);
  const tv = Math.tan(deg(camera.fov / 2)) * band.fy * 0.5, th = Math.tan(deg(camera.fov / 2)) * camera.aspect * band.fx * 0.72;
  let d = 0;
  for (const p of pts) { const r = p.clone().sub(c); d = Math.max(d, r.dot(look) + Math.abs(r.dot(right)) / th, r.dot(look) + Math.abs(r.dot(up)) / tv); }
  const far = fit(VIEWS[view]).d, box = T.bounds.clone().expandByScalar(0.25);
  d = clamp(d, 1.8, far * 0.9);
  while (d < far && box.containsPoint(c.clone().addScaledVector(look, d))) d += 0.2; // камера не внутри тела и снарядов
  goal.d = d;
}
function stepCam(dt) {
  if (!manual) {
    const a = dt == null ? 1 : 1 - Math.exp(-dt / 0.5);
    cam.az += Math.atan2(Math.sin(goal.az - cam.az), Math.cos(goal.az - cam.az)) * a; // по короткой дуге
    cam.el += (goal.el - cam.el) * a; cam.d += (goal.d - cam.d) * a; cam.c.lerp(goal.c, a);
  }
  camera.position.copy(cam.c).addScaledVector(sph(cam.az, cam.el), cam.d);
  camera.lookAt(cam.c);
}

// ---------- Управление ----------
// Тап (короткое нажатие без движения): справа — следующий шаг, в левой трети — предыдущий; при открытом ответе на вопрос
// тап закрывает его. Удержание от 0,22 с — пауза, ведение пальца при удержании крутит камеру. Быстрое движение вбок с
// самого начала — другое упражнение.
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {} // палец ушёл за край холста — отпускание всё равно придёт сюда
  press = { x: e.clientX, y: e.clientY, hold: false, moved: false, az: cam.az, el: cam.el };
  press.timer = setTimeout(() => { if (press && !press.moved) { press.hold = true; held = true; } }, 220);
});
canvas.addEventListener('pointermove', (e) => {
  if (!press) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.hold) { if (Math.hypot(dx, dy) > 10) press.moved = true; return; }
  manual = true; cam.az = press.az - dx * 0.008; cam.el = clamp(press.el + dy * 0.006, 0.03, 1.2);
});
function release(e, cancel) {
  if (!press) return;
  clearTimeout(press.timer);
  const p = press, dx = e.clientX - p.x, dy = e.clientY - p.y; press = null;
  if (p.hold) { held = false; return; }
  if (cancel) return;
  if (ask) { if (ask.state === 'answer' || ask.state === 'error') setAsk({ state: 'idle' }); return; }
  if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) return openEx(EXERCISES[(EXERCISES.indexOf(ex) + (dx < 0 ? 1 : -1) + EXERCISES.length) % EXERCISES.length].id);
  if (!p.moved) setStep(si + (e.clientX < innerWidth * 0.33 ? -1 : 1));
}
canvas.addEventListener('pointerup', (e) => release(e, false));
canvas.addEventListener('pointercancel', (e) => release(e, true));
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  if (e.key === 'ArrowRight') setStep(si + 1); else if (e.key === 'ArrowLeft') setStep(si - 1); else if (e.key === ' ') { stop = !stop; e.preventDefault(); }
});

// ---------- Модель ----------
const T = { scene, ex, legR: null, gear: new THREE.Group() };
T.add = (...o) => T.gear.add(...o);
scene.add(T.gear);
function poseAt(s) { const ph = phaseAt(ex, s); ph.t = s; ex.pose(T, ph); return ph; }
let focusK = 0; // 0 — обычная подсветка, 1 — просвет
function show(dt) {
  const st = steps[si], whole = dbgT != null || st.kind === 'whole' || ALL;
  t = dbgT ?? cycleTime(st, tau);
  const ph = poseAt(t);
  T.wrap.updateMatrixWorld(true);
  const pulse = DEBUG ? 0.85 : 0.62 + 0.3 * Math.sin(performance.now() / 1000 * Math.PI * 2 / 1.8), map = {};
  if (ALL) for (const m of SHOW) map[m] = [DEBUG_COLORS[MUSCLES.indexOf(m)], 0.95];
  else if (whole) {
    for (const m of ex.muscles.work) map[m] = [COL.work, 0.9];
    if (ph.phase.stretch) for (const m of ex.muscles.stretch) map[m] = [COL.stretch, 0.9]; // на растяжении тянущиеся синие поверх работающих
    for (const m of ex.muscles.careful) map[m] = [COL.careful, pulse];
  } else for (const m of st.focus.list) map[m] = [COL[st.focus.role], st.focus.role === 'careful' ? pulse : 0.95];
  setTargets(map);
  setJoints(T.rig, ALL ? [] : whole ? ex.muscles.careful : st.focus.role === 'careful' ? st.focus.list : [], pulse);
  stepMuscles(dt);
  focusK += ((whole ? 0 : 1) - focusK) * (dt == null ? 1 : 1 - Math.exp(-dt / 0.35));
  U.uFocus.value = focusK;
  if (whole) wholeGoal(); else focusGoal(st.focus.list);
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
loader.load(`${import.meta.env.BASE_URL}models/${MODEL}.glb`, (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
    if (o.isSkinnedMesh) { T.mesh = o; T.legR = mapMuscles(o); patchMaterial(o.material); }
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
  layout();
  setStep(0); show(null); stepCam(null);
  document.body.classList.add('ready'); window.__ready = true;
  if (DEBUG) window.__trainer = {
    ready: true,
    set(s) { stop = true; dbgT = s; manual = false; show(null); stepCam(null); return phaseAt(ex, s); }, // секунда цикла напрямую, тело целиком
    step(i, u = 0) { stop = true; setStep(i, u * steps[(i % steps.length + steps.length) % steps.length].dur); stepCaption(tau); show(null); show(null); stepCam(null); return steps[si]; }, // шаг показа в доле u его длины
    steps,
    view(name) { view = name; manual = false; show(null); stepCam(null); },
    pause(p = true) { stop = !!p; },
    cam(x, y, z, tx, ty, tz) { manual = true; cam.c.set(tx, ty, tz); const o = new THREE.Vector3(x - tx, y - ty, z - tz); cam.d = o.length(); cam.az = Math.atan2(o.x, o.z); cam.el = Math.asin(o.y / cam.d); stepCam(null); }, // крупный план для проверки
    pose(name) { stop = true; testPose(T, name); },
    muscles(list) { SHOW = list; ALL = list.length > 0; show(null); }, // карта по одной мышце без перезагрузки
    audit() { const r = ex.audit(T); return { violations: r.bad, ...r.m }; },
    // Позы для виджета Telegram (voice-bot/workout_tech.py): суставы и снаряды в плоскости ракурса, метры, y от пола.
    // По две точки на фазу (начало и середина), у поочерёдных упражнений только первый цикл. Сборка: tools/trainer-keys.mjs.
    keys(name = ex.flat ?? ex.view ?? 'side') {
      const az = VIEWS[name], R = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
      const P = (p) => [+p.dot(R).toFixed(3), +p.y.toFixed(3)], B = (n) => T.rig.b[n].getWorldPosition(new THREE.Vector3());
      const rect = (o) => { // габарит объекта в плоскости ракурса: [минимум, максимум]
        const b = new THREE.Box3().setFromObject(o, true), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        for (let i = 0; i < 8; i++) { const q = P(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); for (const k of [0, 1]) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
        return [lo, hi];
      };
      const thin = (o) => o.isMesh && o.geometry.parameters?.radiusTop < 0.006; // трос: рисуем линией, а не габаритом
      const gear = T.gear.children.filter((o) => o.visible), seen = gear.map(() => new Set()), frames = [];
      let s0 = 0;
      for (const ph of ex.phases) {
        for (const u of [0, 0.5]) {
          poseAt(s0 + ph.tempo_s * u); T.wrap.updateMatrixWorld(true); T.gear.updateMatrixWorld(true);
          const head = T.rig.b.HeadTop_End ? B('Head').lerp(B('HeadTop_End'), 0.5) : B('Head').multiplyScalar(2).sub(B('Neck'));
          const pts = [head, B('Spine1')];
          for (const s of ['Left', 'Right']) pts.push(B(s + 'Arm'), B(s + 'ForeArm'), B(s + 'Hand'));
          for (const s of ['Left', 'Right']) pts.push(B(s + 'UpLeg'), B(s + 'Leg'), B(s + 'Foot'), B(s + 'ToeBase'));
          const row = pts.map(P);
          gear.forEach((o, i) => {
            const pair = thin(o) ? [P(o.localToWorld(new THREE.Vector3(0, -0.5, 0))), P(o.localToWorld(new THREE.Vector3(0, 0.5, 0)))] : rect(o);
            seen[i].add(JSON.stringify(pair)); row.push(...pair);
          });
          frames.push(row);
        }
        s0 += ph.tempo_s;
      }
      // Неподвижные снаряды (скамья, стойка блока) отдаём один раз и по частям, подвижные остаются точками в кадрах.
      const fixed = [], moving = [], drop = new Set();
      gear.forEach((o, i) => {
        if (seen[i].size > 1) return moving.push({ line: thin(o), at: 16 + 2 * i });
        drop.add(16 + 2 * i).add(17 + 2 * i);
        o.traverse((m) => { if (m.isMesh) fixed.push(rect(m).flat()); });
      });
      const keep = frames[0].map((_, i) => i).filter((i) => !drop.has(i));
      for (const g of moving) g.at = keep.indexOf(g.at);
      show(null);
      return { id: ex.id, name: ex.name, view: name, near: name === 'side' ? (ex.sideFrom === 'left' ? 'L' : 'R') : '', muscles: ex.muscles,
        ru: Object.fromEntries(Object.values(ex.muscles).flat().map((m) => [m, RU[m] ?? m])),
        phases: ex.phases.map((p) => ({ name: p.name, cue: p.cue, tempo_s: p.tempo_s, stretch: !!p.stretch })),
        frames: frames.map((f) => keep.map((i) => f[i])), moving, fixed };
    },
    ask: setAsk, // проверка подписи вопроса и ответа без приложения
    state: () => ({ step: si, tau: +tau.toFixed(2), held, stop, ask: ask?.state ?? null, shown, words: spans.length, focus: +focusK.toFixed(2) }),
    bounds: () => T.bounds,
    cycle: cycleOf(ex) * (ex.span ?? 1),
    legR: T.legR,
    T,
  };
}, undefined, (e) => { console.error('модель не загрузилась', e); cue.textContent = 'Модель не загрузилась. Обнови страницу.'; });

// Размер холста меняем в начале кадра: смена размера стирает холст, а событие могло прийти после отрисовки.
let resized = true;
addEventListener('resize', () => { resized = true; });
let last = performance.now();
renderer.setAnimationLoop((now) => {
  if (resized) { resized = false; layout(); }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (T.rig) {
    if (ask?.state === 'answer') { askTau += dt; stepCaption(askTau); }
    else if (!ask) {
      if (!paused() && dbgT == null) { tau += dt; if (tau >= steps[si].dur) setStep(si + 1); }
      stepCaption(tau);
    }
    fills.forEach((b, k) => { b.style.transform = `scaleX(${k < si ? 1 : k > si ? 0 : Math.min(1, tau / steps[si].dur)})`; });
    if (!(DEBUG && stop)) show(dt); // в отладке на паузе позу не трогаем: её ставят set, step и pose
    stepCam(dt);
  }
  renderer.render(scene, camera);
});
