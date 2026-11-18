// Теннис: Лёва против соперника на грунте. WASD/стрелки — бег, K — форхенд, J — бэкхенд, L — укороченный,
// Shift + удар — кручёный, высокий мяч — смэш сам. Направление в момент удара — куда полетит мяч.
// Подача: K или пробел — сверху (держишь — сильнее), J — снизу; стрелки — широко, в «T» или в тело.
// На телефоне — джойстик и кнопки. В dev каждый розыгрыш пишется в logs/play-<дата>.jsonl (vite.config.js).
// Проверка поз: ?pose=fh&s=-0.17&cam=1 (s — секунды от удара). ?auto — Лёвой играет ИИ.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCourt, COURT, CourtMarks, ClayDust } from './court.js';
import { HAZE, AIR_DENSITY, SUN, outdoorEnv, shadeIndoors } from './env.js';
import { buildBall } from './ball.js';
import { fitRacketModel, dressRacket } from './racket.js';
import { Player, POWER, holdOf, powerOf } from './player.js';
import { Game, AI } from './game.js';
import { Club } from './club.js';
import { ROSTER, setOpponent, rivalPicker } from './rivals.js';
import { Practice } from './practice.js';
import { Girls } from './girls.js';
import { STROKES, sample } from './swing.js';
import { makeSound } from './sound.js';
import { solveShot, step as ballStep } from './physics.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // цвет как на фото: AgX выбеливал насыщенный грунт до лососевого, а зелень до серой
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HAZE, AIR_DENSITY); // воздушная перспектива по высоте (env-sky.js): долина в дымке, вершины чище, корт без неё
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(outdoorEnv(), 0.04).texture;
scene.environmentIntensity = 0.6; // небо и грунт темнее комнатных ламп RoomEnvironment: при 0.32 лицо в тени проваливалось
scene.add(new THREE.HemisphereLight('#dce8ff', '#a65a35', 0.55)); // заполняющий свет слабее — тени глубже, картинка не плоская
// Солнце после обеда (SUN в env-sky.js): слева, 35° над горизонтом, тёплое; тени длинные, горы освещены сбоку.
const sun = new THREE.DirectionalLight('#ffe2b8', 4.2);
sun.position.copy(SUN).multiplyScalar(40);
sun.castShadow = true;
const SM = innerWidth < 768 ? 2048 : 4096;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -31, right: 26, top: 30.5, bottom: -15.5, near: 1, far: 90 }); // корт, ели слева, шале, изгородь
sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const court = buildCourt();
scene.add(court);
const marks = new CourtMarks(), dust = new ClayDust();
scene.add(marks.mesh, dust.mesh);

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30000); // дальняя граница 30 км: горы вокруг долины до 18 км
// Метка отскока: кольцо там, где мяч соперника ударится о корт; к отскоку сжимается и гаснет.
const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.renderOrder = 2;
scene.add(ring);
function showLanding(now) {
  const L = game.landing;
  if (!L || now > L.t + 0.2 || game.state !== 'rally') { ring.material.opacity = 0; return; }
  const u = THREE.MathUtils.clamp((now - L.t0) / Math.max(L.t - L.t0, 0.1), 0, 1);
  ring.position.set(L.pos.x, 0.012, L.pos.z);
  ring.scale.setScalar(1.8 - 0.8 * u);
  ring.material.opacity = now > L.t ? 0.35 * (1 - (now - L.t) / 0.2) : 0.15 + 0.3 * u;
}
// Куда встать под мяч соперника: тихое кольцо там, где удобно бить (тот же расчёт, что у ИИ). Гаснет, когда Лёва
// почти на месте или уже нажал удар: дальше это его выбор. Сбоку, особенно слева на бэкхенде, иначе трудно прикинуть.
// Рисуем две ступни, а не кольцо: кольцо уже значит «тут отскок», а следы читаются как «встань сюда».
const spot = new THREE.Group(), spotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
for (const s of [-1, 1]) {
  const foot = new THREE.Mesh(new THREE.CircleGeometry(1, 24), spotMat);
  foot.rotation.x = -Math.PI / 2; foot.scale.set(0.075, 0.14, 1); foot.position.x = s * 0.2; foot.renderOrder = 2;
  spot.add(foot);
}
spot.material = spotMat;
scene.add(spot);
let spotPlan = null, spotAt = 0;
function showSpot(now, dt) {
  const g = game, L = g.lev, b = g.b;
  const incoming = b.live && g.state === 'rally' && g.lastHitter === g.opp && !L.stroke && !g.autoLev; // за замену играет ИИ — подсказки не нужны
  if (incoming && now >= spotAt) { spotAt = now + 0.1; const p = L.plan(b, now, 0); spotPlan = p && !p.out ? p : null; }
  if (!incoming) spotPlan = null;
  let want = 0;
  if (spotPlan) {
    spot.position.set(spotPlan.stand.x, 0.013, spotPlan.stand.z);
    want = 0.32 * THREE.MathUtils.smoothstep(L.pos.distanceTo(spotPlan.stand), 0.25, 0.8);
  }
  spot.material.opacity += (want - spot.material.opacity) * Math.min(1, dt * 10);
}
// Подсказка направления — тихая, чтобы не отвлекать от мяча: появляется только на замахе (удар уже нажат) и гаснет к удару.
// У точки удара по грунту бегут волной три светящихся шеврона туда, куда полетит мяч; цвет — удар: плоский белый,
// кручёный салатовый, резаный голубой. На половине соперника — едва заметное кольцо приземления. Стрелки и WASD
// плавно поворачивают их.
const aimGuide = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.2); shape.lineTo(0.24, -0.06); shape.lineTo(0.15, -0.06); shape.lineTo(0, 0.08); shape.lineTo(-0.15, -0.06); shape.lineTo(-0.24, -0.06); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const chevrons = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.order = 'YXZ'; m.renderOrder = 3; scene.add(m);
    return m;
  });
  const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const dot = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), dotMat);
  dot.rotation.x = -Math.PI / 2; dot.renderOrder = 3; scene.add(dot);
  const COLORS = { flat: new THREE.Color('#ffffff'), top: new THREE.Color('#d6ef3c'), slice: new THREE.Color('#9fd8ff') };
  const color = new THREE.Color('#ffffff'), meter = new THREE.Color(), WHITE = new THREE.Color('#ffffff'), GOLD = new THREE.Color('#ffc24a');
  const goal = new THREE.Vector3(); let next = 0, alpha = 0, yaw = 0, ready = false, depth = 1;
  return {
    update(dt, now) {
      const lev = game.lev, st = lev.stroke;
      const active = started && !game.autoLev && game.state === 'rally' && game.lastHitter === game.opp && game.b.live && st && !st.contacted && st.pred;
      if (active && now >= next) {
        next = now + 0.08;
        goal.copy(game.shotFor(lev, st, 0.9).target).setY(0.05); // 5 см над кортом: ниже их перекрывает окружение
        const from = st.cross ?? lev.pos;
        const want = Math.atan2(goal.x - from.x, goal.z - from.z);
        depth = THREE.MathUtils.clamp(from.distanceTo(goal) / 21, 0.5, 1.2); // короче удар — короче цепочка
        if (!ready) { yaw = want; dot.position.copy(goal); ready = true; }
        yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * 0.5;
      }
      if (!active) ready = false;
      const k = 1 - Math.exp(-dt * 10);
      dot.position.lerp(goal, k);
      if (st) color.lerp(COLORS[st.type.endsWith('top') ? 'top' : st.type.endsWith('slice') || st.drop ? 'slice' : 'flat'], k);
      const lvl = POWER.filter((t) => (st ? holdOf(st, now) : 0) >= t).length; // уровень силы: сколько стрелок горит
      const fade = st && st.tContact - now < (lvl ? 0.05 : 0.12) ? 0 : 1; // к удару гаснет — смотришь на мяч, а не на стрелки; шкала силы — позже
      alpha += ((active ? fade : 0) - alpha) * Math.min(1, dt * 10);
      // Шевроны сбоку у точки удара (со стороны ракетки): перед Лёвой их закрыло бы тело. Волна бежит к цели.
      const at = st?.cross ?? lev.pos;
      // Пока держишь удар — стрелки шкалой силы: загораются по очереди (0,15 / 0,4 / 0,7 с), от белого к золотому,
      // на максимуме мягко пульсируют; отпустил — горит достигнутое. Без удержания — тихая волна к цели, как раньше.
      meter.copy(WHITE).lerp(GOLD, lvl / 3);
      chevrons.forEach((m, i) => {
        const d = (0.7 + i * (0.45 + 0.08 * lvl)) * depth, ph = ((now * 1.6 - i * 0.22) % 1 + 1) % 1;
        m.position.set(at.x + Math.sin(yaw) * d, 0.05, at.z + Math.cos(yaw) * d);
        m.rotation.set(-Math.PI / 2, yaw + Math.PI, 0); // лёжа на корте, носом по направлению удара
        m.scale.setScalar((0.85 + i * 0.12) * (1 + 0.06 * lvl));
        const lit = i < lvl;
        m.material.color.copy(lit ? meter : color);
        m.material.opacity = alpha * (lvl ? (lit ? 0.62 + (lvl === 3 ? 0.16 * Math.sin(now * 8) : 0) : 0.1) : 0.22 + 0.4 * Math.pow(Math.sin(Math.PI * ph), 2));
      });
      dotMat.color.copy(color); dotMat.opacity = 0.32 * alpha;
    },
  };
})();

// Сила удара в мире игры, тонко: шлейф за головкой ракетки у касания и след мяча после сильного удара (яркость и
// длина — от силы), на максимуме — едва заметное кольцо в точке удара. Пока копишь — тихий нарастающий тон.
const powerFx = (() => {
  const N = 14, hist = { rk: [], ball: [] }, trail = { until: 0, k: 0 };
  const ribbon = (color) => {
    const g = new THREE.BufferGeometry(), idx = [];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 8), 4));
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    // Сложением света: лента может только светлеть картинку. При обычном смешивании Лёва видел вместо неё чёрные полосы.
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    m.frustumCulled = false; m.renderOrder = 4; m.visible = false; m.userData.color = new THREE.Color(color); scene.add(m);
    return m;
  };
  const tail = ribbon('#fff6e0');
  // Обод ракетки «режет воздух» (просьба Лёвы вместо ленты): пока копишь силу, по ободу проступает тонкий контур,
  // в замахе за ним остаются 3 следа прошлых положений обода. Цвет от холодного белого к золоту, как у стрелок.
  const HEAD_Y = 0.36, HEAD_A = 0.182, HEAD_B = 0.142, cool = new THREE.Color('#d6ecff'), gold = new THREE.Color('#ffd06a'); // чуть шире рамы: светится по краю, а не прячется за ней
  const rimGeo = new THREE.RingGeometry(0.92, 1, 72), rimLocal = new THREE.Matrix4().makeTranslation(0, HEAD_Y, 0).multiply(new THREE.Matrix4().makeScale(HEAD_B, HEAD_A, 1));
  const rims = [0, 1, 2, 3].map(() => {
    const m = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 4; scene.add(m); return m;
  });
  const rimHist = [];
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 32), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0, depthWrite: false }));
  ring.renderOrder = 4; ring.userData.t0 = -9; scene.add(ring);
  const side = new THREE.Vector3(), seg = new THREE.Vector3(), view = new THREE.Vector3();
  // Последние точки за dur секунд (не больше N, от свежей к старой).
  const pick = (h, now, dur) => { const a = h.filter((e) => now - e.t <= dur), k = Math.max(1, Math.ceil(a.length / N)); return a.filter((_, i) => i % k === 0).map((e) => e.p); };
  // Лента по точкам: ширина w у головы сходит на нет к хвосту, развёрнута к камере.
  const draw = (m, pts, w, a) => {
    const n = Math.min(pts.length, N), P = m.geometry.attributes.position, C = m.geometry.attributes.color, c = m.userData.color;
    m.visible = n > 1 && a > 0.01;
    if (!m.visible) return;
    for (let i = 0; i < N; i++) {
      const j = Math.min(i, n - 1), p = pts[j], u = j / (n - 1);
      seg.subVectors(pts[Math.max(0, j - 1)], pts[Math.min(n - 1, j + 1)]); view.subVectors(camera.position, p);
      side.crossVectors(seg, view).normalize().multiplyScalar(w * (1 - u));
      P.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z); P.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const al = a * (1 - u) * (1 - u);
      C.setXYZW(i * 2, c.r, c.g, c.b, al); C.setXYZW(i * 2 + 1, c.r, c.g, c.b, al);
    }
    P.needsUpdate = C.needsUpdate = true;
  };
  return {
    track(now) { // каждый шаг игры: где головка ракетки Лёвы и мяч
      const add = (h, p) => { h.unshift({ t: now, p: p.clone() }); if (h.length > 40) h.length = 40; };
      if (game.lev.sweetNow) add(hist.rk, game.lev.sweetNow);
      add(hist.ball, game.b.pos);
    },
    shot(p, power, at) {
      if (p !== game.lev || power < 0.3) return;
      trail.until = game.now + 0.3 + 0.2 * power; trail.k = power;
      if (power >= 0.95) { ring.position.copy(at); ring.userData.t0 = game.now; }
    },
    update(dt, now) {
      const st = game.lev.stroke, pw = st && st.holdTo !== undefined ? powerOf(st, now) : 0;
      const near = st && now > st.tContact - 0.12 && now < st.tContact + 0.1;
      const racket = game.lev.racket; racket.updateMatrixWorld();
      rimHist.unshift({ t: now, m: racket.matrixWorld.clone().multiply(rimLocal) }); if (rimHist.length > 24) rimHist.length = 24;
      const col = cool.clone().lerp(gold, Math.min(1, pw * 1.1)), charging = st && !st.contacted && st.holdTo === null;
      rims.forEach((m, i) => {
        const h = rimHist.find((e) => now - e.t >= i * 0.022) ?? rimHist.at(-1); // следы — где обод был 22, 44, 66 мс назад
        m.matrix.copy(h.m); m.matrixWorldNeedsUpdate = true; m.material.color.copy(col); // родитель — сцена, мировая = своя
        const glow = i === 0 && charging && pw > 0.1 ? (0.1 + 0.25 * pw) * (0.85 + 0.15 * Math.sin(now * 18)) : 0; // копишь — обод мерцает
        const swing = near && pw > 0.25 ? 0.4 * pw * (1 - i / 4) : 0; // замах — обод и следы за ним
        m.material.opacity = Math.max(glow, swing);
        m.visible = m.material.opacity > 0.01;
      });
      const left = trail.until - now; // след мяча: длина — сколько он пролетел за 0,045 с, быстрее — длиннее
      draw(tail, pick(hist.ball, now, 0.045), 0.028, left > 0 && game.b.live ? Math.min(1, left / 0.15) * 0.35 * trail.k : 0);
      const u = (now - ring.userData.t0) / 0.1;
      ring.material.opacity = u >= 0 && u < 1 ? 0.45 * (1 - u) : 0;
      ring.scale.setScalar(1 + 0.8 * Math.min(1, Math.max(0, u))); ring.lookAt(camera.position);
      sound.charge?.(started && st && st.holdTo === null && !st.contacted ? pw : -1);
    },
  };
})();

const ballMesh = buildBall();
ballMesh.scale.setScalar(1.7); // настоящий мяч с 24 м — точка; в играх его рисуют крупнее
ballMesh.visible = false;
scene.add(ballMesh);

// ---------- Интерфейс ----------
const $ = (id) => document.getElementById(id);
const hud = {
  score(g) {
    const [a, b] = g.ended ? ['', ''] : g.call(); // матч кончился: очков последнего гейма на табло нет
    $('pl').textContent = a; $('po').textContent = b; $('nl').textContent = g.lev.human ? 'Лёва' : 'Замена';
    $('gl').textContent = g.games.get(g.lev); $('go').textContent = g.games.get(g.opp);
    $('sets').textContent = g.sets.map(([a, b]) => `${a}:${b}`).join(' · '); // прошлые сеты, счёт Лёвы первым
    $('srv-l').classList.toggle('on', g.server === g.lev); $('srv-o').classList.toggle('on', g.server === g.opp);
  },
  stamina(g) {
    for (const [p, id] of [[g.lev, 'st-l'], [g.opp, 'st-o']]) {
      const v = Math.round(p.stamina * 100) / 100, el = $(id);
      if (el.v === v) continue;
      el.v = v; el.firstChild.style.transform = `scaleX(${v})`;
      el.classList.toggle('on', v < 0.9); el.classList.toggle('low', v < 0.4);
    }
  },
  hint(t) { $('hint').textContent = t; },
  serveHint: matchMedia('(pointer: coarse)').matches ? 'Подача\u00a0— «Сверху» или\u00a0«Снизу»' : 'K\u00a0— подача сверху, J\u00a0— снизу', // на телефоне кнопки ударов на подаче подписаны «Сверху» и «Снизу»
  flash(t, good) {
    const el = $('msg');
    el.textContent = t; el.className = good ? 'show good' : 'show';
    clearTimeout(hud.ft); hud.ft = setTimeout(() => { el.className = ''; }, 1400);
  },
};

// ---------- Управление ----------
const keys = new Set(), stick = new THREE.Vector2();
let topMode = false, sliceMode = false;
const held = (...c) => c.some((k) => keys.has(k));
// Бег и прицел. Направление, нажатое уже в замахе (до мяча меньше 0,7 с), только целит и не двигает до отпускания или
// до 0,3 с после удара: Лёва поворачивает удар, а не уходит в сторону; держит дольше — значит, бежит. Зажатое раньше ведёт бег,
// а у мяча тело встаёт само (умная остановка, player.runLeft). Джойстик так же: увёл в другую сторону в замахе — прицел,
// пока не вернул в центр. run = true — только то, что ведёт бег; иначе всё зажатое (прицел).
const aimOnly = new Set(), stickRef = new THREE.Vector2();
let stickAim = false;
const swinging = () => { const st = game?.lev.stroke; return !!st && !st.contacted && st.tContact - game.now < 0.7; };
function axes(run = false) {
  const on = (...c) => c.some((k) => keys.has(k) && !(run && aimOnly.has(k))), sx = run && stickAim ? 0 : stick.x, sy = run && stickAim ? 0 : stick.y;
  const x = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0) + sx;
  const f = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0) + sy;
  const v = new THREE.Vector2(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(f, -1, 1));
  return v.length() > 1 ? v.normalize() : v;
}
function levMove() {
  const st = game.lev.stroke;
  if (!st || game.now > st.tContact + 0.3) { aimOnly.clear(); stickAim = false; } // удар доигран: зажатое дальше — снова бег
  if (stick.length() < 0.2) { stickAim = false; stickRef.set(0, 0); }
  else if (!swinging()) stickRef.copy(stick);
  else if (stickRef.lengthSq() < 0.04 || stick.dot(stickRef) < 0.8 * stick.length() * stickRef.length()) stickAim = true; // в замахе тронул или увёл в сторону
  const a = axes(true);
  return new THREE.Vector3(a.x, 0, -a.y); // вперёд — к сетке, это −Z
}
// Куда летит мяч Лёвы: влево/вправо и глубже/короче — по направлению в момент удара.
// A/D+S — острый короткий угол к боковой у линии подачи (кручёный ныряет в корт, соперника выносит за боковую),
// A/D+W — глубоко в угол. L+W — свеча (game.shotFor).
function aimLev() {
  const a = axes(), sx = Math.abs(a.x) > 0.3 ? Math.sign(a.x) : 0;
  if (sx && a.y < -0.3) return new THREE.Vector3(sx * 3.85, 0, -6.2);
  if (sx && a.y > 0.3) return new THREE.Vector3(sx * 3.4, 0, -10.8);
  const x = sx ? sx * 3.0 : -Math.sign(game.lev.pos.x || 1) * 1.6; // без направления — по диагонали
  const z = a.y > 0.3 ? -10.6 : a.y < -0.3 ? -6.8 : -9.4;
  return new THREE.Vector3(x, 0, z);
}
let game = null, started = false, servingUi = false;
const sound = makeSound();

// Журнал игры: нажатия, удары, промахи, очки и раз в 0,2 с положение и ввод. Читается для настройки управления.
const log = (() => {
  const buf = [], session = new Date().toISOString();
  const flush = () => {
    if (!buf.length) return;
    if (Q.has('nolog')) return void buf.splice(0); // прогоны тестировщика не пишут в журнал игры Лёвы
    const body = JSON.stringify({ session, events: buf.splice(0) });
    if (!navigator.sendBeacon?.('/api/log', new Blob([body], { type: 'application/json' }))) fetch('/api/log', { method: 'POST', body, keepalive: true }).catch(() => {});
  };
  setInterval(flush, 4000);
  addEventListener('pagehide', flush);
  if (Q.has('debug')) window.__events = [];
  return (type, data = {}) => { const e = { t: +(game?.now ?? 0).toFixed(3), type, ...data }; buf.push(e); window.__events?.push(e); };
})();

// kind 'auto' — форхенд или бэкхенд по стороне, где будет мяч (укороченный, кручёный I, резаный U). spin — 'top' | 'cut'.
function hit(kind, drop = false, key = '', spin = null) {
  if (!game || !started || club?.active) return;
  sound.unlock();
  if (game.state === 'serve' && game.server === game.lev) { // J (бэкхенд) — снизу, остальное — сверху; держишь — копишь силу
    game.serve(game.lev, game.now, kind === 'bh' ? 'under' : 'over');
    const st = game.lev.stroke;
    if (st?.serve === 'over' && game.serving === game.lev) Object.assign(st, { holdTo: null, holdKey: key || 'touch' });
    return;
  }
  if (key === 'Space') return; // пробел только подаёт: раньше в розыгрыше он бил форхендом и перебивал нажатый бэкхенд
  const lev = game.lev, cut = !drop && (spin === 'cut' || sliceMode || held('AltLeft', 'AltRight')), top = !drop && !cut && (spin === 'top' || topMode || held('ShiftLeft', 'ShiftRight'));
  if (kind === 'auto') {
    const pr = lev.predict(game.b, game.now);
    kind = pr && (pr.pos.x - lev.pos.x) * lev.side < -0.1 ? 'bh' : 'fh';
  }
  const ok = lev.press(kind + (cut ? '-slice' : top ? '-top' : ''), game.now, game.b, null, { drop });
  if (ok && !drop) Object.assign(lev.stroke, { holdTo: null, holdKey: key || 'touch' }); // держит удар — копит силу
  const st = lev.stroke;
  log('press', { key, kind, top, cut, drop, ok, as: st?.type, lead: st ? +(st.tContact - st.tPress).toFixed(2) : null, pred: st?.pred ?? false, wait: !!st?.wait, h: st?.h != null ? +st.h.toFixed(2) : null,
    pos: [+lev.pos.x.toFixed(2), +lev.pos.z.toFixed(2)], ball: game.b.live ? game.b.pos.toArray().map((v) => +v.toFixed(2)) : null, rally: game.state === 'rally' });
}
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault(); // Alt без меню браузера
  if (e.repeat) return;
  keys.add(e.code);
  if (!started && (e.code === 'Space' || e.code === 'Enter')) return start();
  if (!$('end').hidden && e.code === 'Enter') return again();
  if (!started && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return switchRacket(e.code === 'ArrowLeft' ? -1 : 1);
  if (clubKey(e.code)) return;
  if (/^(Key[WASD]|Arrow)/.test(e.code)) { if (swinging()) aimOnly.add(e.code); log('key', { k: e.code, down: 1, aim: aimOnly.has(e.code) }); }
  if (e.code === 'KeyK') hit('fh', false, e.code);
  if (e.code === 'KeyJ') hit('bh', false, e.code);
  if (e.code === 'KeyL') hit('auto', true, e.code);
  // Кручёный и резаный — правой рукой (I, U), сторона сама: по журналу 17.11 Shift и Alt левой рукой, которая держит WASD,
  // Лёва почти не нажимал (20 раз на 1400 ударов). Shift и Alt тоже работают.
  if (e.code === 'KeyI') hit('auto', false, e.code, 'top');
  if (e.code === 'KeyU') hit('auto', false, e.code, 'cut');
  document.querySelectorAll(`#lesson kbd[data-k="${e.code}"]`).forEach((k) => { k.classList.add('on'); setTimeout(() => k.classList.remove('on'), 250); });
  if (e.code === 'Space') hit('fh', false, e.code);
});
// ---------- Прогулка по клубу (club.js) ----------
// Q — уйти с корта, E — сесть на скамейку или встать, V — вид (со скамейки → ТВ → крупно за заменой), R — вернуться на корт.
// Те же действия кнопками (#cbar), ходьба — WASD или джойстик, Shift или джойстик до упора — бегом.
let club = null, sub = null, subReady = null, girls = null; // girls — девушки на корте 2 (girls.js)
function clubKey(code) {
  if (!started || !game || game.drill) return false;
  if (code === 'KeyQ' && !club.active) return leave(), true;
  if (!club.active) return false;
  if (code === 'KeyE') { if (club.mode === 'sit') club.stand(); else club.sit(); } else if (code === 'KeyV') club.nextView(); else if (code === 'KeyR') club.back(game.now, Q.has('auto')); else return false;
  return true;
}
async function leave() {
  if (club.active || club.leaving) return;
  if (game.state === 'match-over') { endUi(null); game.newMatch(game.now, false); } // замена начнёт новый матч
  club.leaving = true; loadTown(); club.exit(await subReady, game.now); club.leaving = false; // замена догружается в фоне
}
// Дорога, городок, велосипед и машина (town.js, vehicle.js) — отдельным куском после старта: на загрузку сайта не влияют.
let townReady = null;
const loadTown = () => (townReady ??= Promise.all([import('./town.js'), import('./vehicle.js')]).then(([{ Town }, { Rides }]) => {
  club.world = new Town(scene);
  club.ride = new Rides({ scene, club, town: club.world });
}));
const walkInput = () => { const a = axes(); return { x: a.x, y: a.y, run: held('ShiftLeft', 'ShiftRight') || stick.length() > 0.95, hb: held('Space') }; }; // hb — ручник в машине
function clubUi(mode, canSit, view, act) {
  document.body.classList.toggle('club', !!mode);
  $('cexit').hidden = !!mode; $('cback').hidden = !mode; $('cview').hidden = mode !== 'sit';
  $('csit').hidden = !(mode === 'sit' || (mode === 'walk' && canSit)); $('csit').firstChild.textContent = mode === 'sit' ? 'Встать' : act ?? 'Сесть';
  if (!mode) court.getObjectByName('fence-near').visible = false; // снова матч: камера за этой стенкой
}
for (const [id, code] of [['cexit', 'KeyQ'], ['csit', 'KeyE'], ['cview', 'KeyV'], ['cback', 'KeyR']]) $(id).addEventListener('click', (e) => { e.currentTarget.blur(); clubKey(code); });
const clubCam = (dt) => { court.getObjectByName('fence-near').visible = club.camera(dt, camera, follow); };

// Отпустил клавишу удара (или тач-кнопку) — сила дальше не растёт.
function release(key) { const st = game?.lev.stroke; if (st && st.holdTo === null && (st.holdKey === key || !key)) st.holdTo = game.now; }
addEventListener('keyup', (e) => { keys.delete(e.code); aimOnly.delete(e.code); release(e.code); if (/^(Key[WASD]|Arrow)/.test(e.code)) log('key', { k: e.code, down: 0 }); });
addEventListener('blur', () => { keys.clear(); aimOnly.clear(); release(''); });

// Телефон: джойстик там, где коснулся левой половины экрана, кнопки справа.
const joy = $('joy'), knob = $('knob');
let joyId = null, joyO = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || e.clientX > innerWidth * 0.55) return;
  joyId = e.pointerId; joyO.set(e.clientX, e.clientY);
  joy.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`; joy.classList.add('on');
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  const d = new THREE.Vector2(e.clientX - joyO.x, -(e.clientY - joyO.y)).divideScalar(50);
  if (d.length() > 1) d.normalize();
  stick.copy(d);
  knob.style.transform = `translate(${d.x * 40}px, ${-d.y * 40}px)`;
});
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; stick.set(0, 0); knob.style.transform = ''; joy.classList.remove('on'); };
canvas.addEventListener('pointerup', joyEnd); canvas.addEventListener('pointercancel', joyEnd);
$('bfh').addEventListener('pointerdown', (e) => { e.preventDefault(); hit('fh'); });
$('bbh').addEventListener('pointerdown', (e) => { e.preventDefault(); hit('bh'); });
for (const id of ['bfh', 'bbh']) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $(id).addEventListener(ev, () => release('touch'));
$('bdrop').addEventListener('pointerdown', (e) => { e.preventDefault(); hit('auto', true); });
const toggle = (id, on) => { const b = $(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); };
$('btop').addEventListener('click', () => { topMode = !topMode; if (topMode) sliceMode = false; toggle('btop', topMode); toggle('bcut', sliceMode); });
$('bcut').addEventListener('click', () => { sliceMode = !sliceMode; if (sliceMode) topMode = false; toggle('btop', topMode); toggle('bcut', sliceMode); });

// mode: 'match' | 'lessons' | 'wall'. Тренировка — тот же корт и управление, но без соперника (practice.js).
function start(mode = 'match') {
  if (!game || started) return;
  started = true;
  sound.unlock();
  $('start').classList.add('done');
  document.body.classList.remove('menu');
  court.getObjectByName('fence-near').visible = false; // в игре камера стоит за этой стенкой
  log('mode', { mode, bestOf });
  if (mode === 'match') { game.bestOf = bestOf; setTimeout(loadTown, 1500); return game.resetPoint(game.now ?? 0); }
  document.body.classList.add('practice');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* без памяти — рекорд на эту игру */ } } };
  const ui = { text: (h) => { $('ltext').innerHTML = h; }, dots: (n, need) => { $('ldots').innerHTML = need && need < 9 ? Array.from({ length: need }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('') : ''; }, flash: (h, good) => hud.flash(h.replace(/&nbsp;/g, '\u00a0'), good) };
  game.drill = new Practice(game, mode, { scene, court, ui, store, touch: matchMedia('(pointer: coarse)').matches });
  $('pnext').hidden = mode !== 'lessons';
}
// Сколько сетов: 1 или до двух побед (из трёх). Запоминаем выбор на этом устройстве.
let bestOf = (() => { try { return localStorage.getItem('bestOf') === '3' ? 3 : 1; } catch { return 1; } })();
const bestOfUi = () => document.querySelectorAll('#bestof button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.n === bestOf));
document.querySelectorAll('#bestof button').forEach((b) => b.addEventListener('click', () => { bestOf = +b.dataset.n; try { localStorage.setItem('bestOf', bestOf); } catch { /* без памяти — на эту игру */ } bestOfUi(); }));
bestOfUi();
// Конец матча: итог одним экраном. За Лёву играет ИИ или замена (Лёва гуляет по клубу) — следующий матч сам через 3 с.
function endUi(w) {
  $('end').hidden = !w; document.body.classList.toggle('ended', !!w);
  if (!w) return;
  $('endT').textContent = w === game.lev ? 'Лёва выиграл' : 'Соперник выиграл';
  $('endS').textContent = game.sets.map(([a, b]) => `${a}:${b}`).join(' · ');
}
const again = () => { endUi(null); game.newMatch(game.now); };
$('again').addEventListener('click', again);
$('toClub').addEventListener('click', () => { endUi(null); leave(); });
$('play').addEventListener('click', () => start());
$('pLessons').addEventListener('click', () => start('lessons'));
$('pWall').addEventListener('click', () => start('wall'));
$('pnext').addEventListener('click', () => game?.drill?.skip());
$('pexit').addEventListener('click', () => location.reload()); // shortcut: выход — перезагрузка в меню; сцена после тренировки не чистится

// ---------- Модели ----------
const bar = document.querySelector('#loader b');
// Модели: Лёва, соперник из Meshy (если файла нет — Лёва в тёмной форме) и ракетки из Meshy (если нет — ракетка кодом).
const RACKETS = ['red', 'white', 'neon'];
let myRacket = (() => { try { return localStorage.getItem('racket'); } catch { return null; } })();
if (!RACKETS.includes(myRacket)) myRacket = 'red';
const racketModels = {};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const loadOpt = (url) => loader.loadAsync(url).catch(() => null);
const dressAll = () => {
  if (!game) return;
  const oppRacket = RACKETS.find((r) => r !== myRacket && racketModels[r]) ?? null;
  const subRacket = RACKETS.find((r) => r !== myRacket && r !== oppRacket && racketModels[r]) ?? oppRacket; // у замены третья
  for (const [p, name] of [[club?.lev ?? game.lev, myRacket], [game.opp, game.opp.rival?.racket ?? oppRacket], [sub, subRacket]]) {
    if (!p) continue;
    if (name && racketModels[name]) dressRacket(p.racket, racketModels[name].clone(true));
  }
  $('rkName').textContent = RACKET_NAMES[myRacket];
};
// Ракетка выбирается на стартовом экране стрелками: меняется прямо в руке у Лёвы, он ею тут же машет.
const RACKET_NAMES = { red: 'Красная', white: 'Бело-синяя', neon: 'Неон' };
function switchRacket(dir) {
  const have = RACKETS.filter((r) => racketModels[r]);
  if (!have.length || started) return;
  myRacket = have[(have.indexOf(myRacket) + dir + have.length) % have.length];
  try { localStorage.setItem('racket', myRacket); } catch { /* без памяти — только на эту игру */ }
  dressAll();
  game?.lev.press(Math.random() < 0.5 ? 'fh' : 'bh', game.now, null); // показать ракетку в деле
}
$('rkPrev').addEventListener('click', () => switchRacket(-1));
$('rkNext').addEventListener('click', () => switchRacket(1));
Promise.all(RACKETS.map((r) => loadOpt(`/models/racket-${r}.glb`).then((g) => { if (g) racketModels[r] = fitRacketModel(g.scene); })))
  .then(() => { document.getElementById('rk').hidden = !Object.keys(racketModels).length; dressAll(); });

// lev.glb и opp.glb — веса почищены, скелет со скрутками рук (копия -v2, собирает tools/rig-build.sh);
// ?rig=1 — сырые веса Meshy для сравнения, ?rig=<имя> — любой собранный вариант <модель>-v<имя>.glb.
const RIG = /^\w+$/.test(Q.get('rig') ?? '') ? '-v' + Q.get('rig') : '';
loader.load(`/models/lev${RIG}.glb`, async (gltf) => {
  const oppGltf = await loadOpt(`/models/opp${RIG}.glb`);
  const lev = new Player(scene, gltf, { side: 1, human: true });
  const opp = oppGltf
    ? new Player(scene, oppGltf, { side: -1, height: 1.85, racketColor: '#1d4f91' })
    : new Player(scene, gltf, { side: -1, racketColor: '#1d4f91', cloth: '#22324a' });
  game = new Game({ lev, opp, ballMesh, hud, sound, aimLev, axes: () => axes(), log, marks, dust });
  game.onShot = (p, power, at) => powerFx.shot(p, power, at);
  game.onMatch = (w) => { if (club.active || game.autoLev) game.restartAt = game.now + 3; else endUi(w); };
  opp.measure();
  log('start', { reach: lev.measure(), opp: !!oppGltf, racket: myRacket, w: innerWidth, h: innerHeight, touch: matchMedia('(pointer: coarse)').matches });
  club = new Club({ game, lev, court, sound, onMode: clubUi });
  girls = new Girls({ scene, game, club, camera, sound, loader });
  // Замена (club.js): модель из Meshy грузится после старта, без неё — соперник в голубом.
  subReady = loadOpt('/models/sub.glb').then((g) => {
    sub = new Player(scene, g ?? oppGltf ?? gltf, { side: 1, height: 1.8, racketColor: '#2f7d4f', cloth: g ? null : '#86bfe6' });
    sub.wrap.visible = sub.racket.visible = false; sub.measure(); dressAll();
    return sub;
  });
  game.now = 0;
  const rival = ROSTER.find((r) => r.id === Q.get('rival')); // ?rival=gh|ch|jp|ru — соперник из rivals.js; ждём после клуба и часов: кадры идут и во время загрузки
  if (rival) await setOpponent(game, rival);
  if (Q.has('debug')) rivalPicker(game, dressAll); // выбор соперника на стартовом экране
  dressAll();
  if (Q.has('auto')) { game.autoLev = new AI(lev, game); start(); }
  hud.score(game);
  $('loader').classList.add('done'); window.__ready = true; // заставка index.html больше не покажет «не запустилась»
  for (const id of ['play', 'pLessons', 'pWall']) $(id).disabled = false;
}, (e) => { if (e.total) bar.style.width = `${(e.loaded / e.total) * 100}%`; }, (err) => {
  console.error('модель не загрузилась', err);
  $('loader').querySelector('p').textContent = 'Модель не загрузилась, обнови страницу';
});

// ---------- Камера ----------
const camEye = new THREE.Vector3(0, 3.6, 19), camLook = new THREE.Vector3(0, 0.6, 0), look = camLook.clone();
// Камера спокойная: за Лёвой по ширине на треть, по глубине наполовину, иначе корт качается от каждого шага.
function follow(dt) {
  const L = game.lev.pos, portrait = innerWidth / innerHeight < 0.8, home = game.lev.home.z, close = Q.has('close');
  if (close) { camEye.set(L.x + 1.2, 1.5, L.z + 3.4); camLook.set(L.x, 0.7, L.z - 2); } // крупно, чтобы смотреть шаги
  else {
    // За Лёвой по ширине на 60 %: при трети он уходил к краю, и слева бэкхенд закрывало телом. Чуть выше — видно, сколько до мяча вбок.
    camEye.set(L.x * 0.6, portrait ? 6.4 : 5.0, home + (L.z - home) * 0.6 + (portrait ? 8 : 7.3));
    camLook.set(L.x * 0.42, 0.2, home + (L.z - home) * 0.4 - 9);
  }
  const k = 1 - Math.exp(-dt * (close ? 8 : 3));
  camera.position.lerp(camEye, k); look.lerp(camLook, k);
  camera.lookAt(look);
}

// Камера стартового экрана: спереди-сбоку от Лёвы, медленно качается по дуге; в кадре он с ракеткой на фоне корта.
function menuCam(dt) {
  const L = game.lev.pos, t = game.now, a = Math.sin(t * 0.22) * 0.75, portrait = innerWidth / innerHeight < 0.8;
  const r = portrait ? 4.4 : 3.4;
  camEye.set(L.x + Math.sin(a) * r, 1.35, L.z - Math.cos(a) * r);
  camLook.set(L.x, portrait ? 0.75 : 0.95, L.z);
  const k = 1 - Math.exp(-dt * 2.5);
  camera.position.lerp(camEye, k); look.lerp(camLook, k);
  camera.lookAt(look);
}

// Проверка поз удара: ?pose=fh&s=0&cam=0..2
const POSE = Q.get('pose');

let controls = null;
if (POSE) {
  controls = new OrbitControls(camera, canvas);
  const VIEWS = [[-0.4, 2.0, 5.0], [4.6, 1.45, -1.2], [-1.4, 1.5, -5.8]];
  const home = new THREE.Vector3(0, 0, COURT.len / 2 + 0.8);
  camera.position.fromArray(VIEWS[+(Q.get('cam') ?? 0)]).add(home);
  controls.target.set(0, 1.05, 0).add(home);
  $('start').classList.add('done');
}

// Затенение окружения (контактные тени под ногами, у сетки, в складках) — только на компьютере, телефону дорого.
let composer = null;
if (!matchMedia('(pointer: coarse)').matches && !Q.has('noao')) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 0.35, distanceFallOff: 1, thickness: 1, scale: 1.4, samples: 12 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
}
const draw = () => { shadeIndoors([club?.lev, game?.opp, sub]); return composer ? composer.render() : renderer.render(scene, camera); }; // в зале дома игроки тусклее и теплее (env-house.js)

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 60 : 42;
  camera.updateProjectionMatrix();
}
let needResize = true;
addEventListener('resize', () => { needResize = true; }); // размер меняем в начале кадра, иначе холст мигает в браузере Telegram

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  if (needResize) { resize(); needResize = false; }
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game && POSE) {
    const [A, B, u] = sample(STROKES[POSE], parseFloat(Q.get('s') ?? 0));
    const { rk, face } = game.lev.rig.pose(A, B, u);
    game.lev.rig.placeRacket(rk, face);
    controls.update();
  } else if (game && window.__pause) { // ?debug: тест шагает игру сам через __lev.step
    if (!window.__camHold) { if (club?.active) clubCam(dt); else follow(dt); }
  } else if (game) {
    game.now += dt;
    if (started) {
      const a = axes();
      game.update(dt, game.now, levMove());
      club.update(dt, game.now, walkInput());
      powerFx.track(game.now);
      if (game.state === 'rally' && game.now >= (game.nextSample ?? 0)) {
        game.nextSample = game.now + 0.2;
        const L = game.lev;
        log('s', { p: [+L.pos.x.toFixed(2), +L.pos.z.toFixed(2)], v: +L.vel.length().toFixed(2), in: [+a.x.toFixed(1), +a.y.toFixed(1)], b: game.b.pos.toArray().map((v) => +v.toFixed(1)), st: L.stroke?.type ?? null, sta: +L.stamina.toFixed(2) });
      }
    } else {
      // Стартовый экран: Лёва в стойке иногда машет ракеткой, камера медленно облетает его спереди.
      if (game.now >= (game.nextShadow ?? 2)) { game.nextShadow = game.now + 3.2; game.lev.press(['fh', 'bh', 'fh-top', 'bh-slice'][Math.floor(game.now / 3.2) % 4], game.now, null); }
      game.lev.update(dt, game.now, new THREE.Vector3(), game.b);
      game.opp.update(dt, game.now, new THREE.Vector3(), game.b);
    }
    girls?.update(dt, game.now);
    if (club.active) clubCam(dt); else if (started) follow(dt); else menuCam(dt);
    const srv = started && game.state === 'serve' && game.server === game.lev && !game.autoLev && game.drill?.mode !== 'wall';
    if (srv !== servingUi) { servingUi = srv; document.body.classList.toggle('serving', srv); } // кнопки ударов на подаче — «Сверху» и «Снизу»
    showLanding(game.now); showSpot(game.now, dt);
    aimGuide.update(dt, game.now);
    powerFx.update(dt, game.now);
  }
  if (!window.__noDraw) draw(); // тестировщик гоняет игру без отрисовки и снимает кадры сам
});

if (Q.has('debug')) window.__lev = {
  scene, camera, get game() { return game; },
  // Пошаговая проверка: __pause = true, потом step(секунды, движение {x, y}) — игра идёт ровно на заданное время.
  step(sec, a = null, h = window.__dt ?? 1 / 120) { // без a — бег от зажатых клавиш, как в игре; __dt — шаг кадра (проверка на 30–60 кадрах)
    for (let i = 0; i < Math.max(1, Math.round(sec / h)); i++) { game.now += h; game.update(h, game.now, a ? new THREE.Vector3(a.x, 0, -a.y) : levMove()); club.update(h, game.now, a ?? walkInput()); girls?.update(h, game.now); powerFx.track(game.now); }
  },
  get club() { return club; },
  loadTown: () => loadTown(),
  render() { window.__camHold = false; if (club.active) { club.snap(camera, follow); clubCam(0); } else follow(1); showLanding(game.now); showSpot(game.now, 1); aimGuide.update(0.2, game.now); powerFx.update(0, game.now); draw(); }, // кадр сразу, не дожидаясь requestAnimationFrame
  shot(eye, at) { window.__camHold = true; camera.position.fromArray(eye); camera.lookAt(new THREE.Vector3(...at)); draw(); }, // кадр с любой точки — смотреть соперника и ракетки
  // Поза удара в момент s (с от удара) на месте, без игры: смотреть руки, кисти, ноги крупно.
  pose(type, s, who = 'lev') { const p = game[who], [A, B, u] = sample(STROKES[type], s); const r = p.rig.pose(A, B, u, { Left: p.feet.Left, Right: p.feet.Right, crouch: 0.07 }); p.rig.placeRacket(r.rk, r.face); },
  bone(name, who = 'lev') { return game[who].rig.b[name].getWorldPosition(new THREE.Vector3()).toArray(); },
};
