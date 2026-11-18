// Работа за деньги (Лёва, 18.11): доска объявлений на стене клубного дома у двери — «E посмотреть работу», один экран
// со списком и «Взять». После работы — пауза 4 минуты реального времени. Деньги — economy.earn, усталость и рост — stats.
// - Урок с новичком (корт 1): ученик (модель замены) на месте соперника, у Лёвы корзина. Держишь K (на телефоне —
//   «Набросить») — кольцо на корте уходит дальше, A/D или джойстик — в сторону; отпустил — Лёва набрасывает снизу
//   (подача 'srv-u', мяч свечой в кольцо с разбросом). Удобный мяч падает в зелёную зону, ученик (слабый ИИ) бьёт,
//   иногда мимо. 10 мячей; 30 CHF × качество (0,5–1) + чаевые за серию удобных.
// - Смена баристы (терраса, 3 минуты игры): гости садятся за столики (поза SIT, как девушки на кофе), над гостем значок
//   заказа. Лёва берёт у стойки нужное (interact.js: взять кофе, бокал, налить из графина в стакан) и ставит гостю на стол.
//   12 CHF за смену, по 3 за заказ, чаевые за скорость, всего до 40 CHF. Ракетка на смену ложится на стойку.
// - Спарринг с гостем (корт 1): гость слабее (сила 0,38–0,5) вместо соперника, 10 розыгрышей без счёта.
//   25 CHF + 2 за длинный розыгрыш (от 6 ударов), −1 за виннер Лёвы; бонус 0–10.
// Корт на время работы — как матч с девушкой (girls.js): соперник уходит, после всё обратно со счётом, Лёва уходит с корта
// на прогулку (club.exit), замена возвращается. Крючки в main.js: initJobs(ctx) при загрузке, update(dt, now) после шага.
import * as THREE from 'three';
import { Player } from './player.js';
import { AI, gauss } from './game.js';
import { solveShot, inSingles } from './physics.js';
import { Vessel, MAT, initMat } from './props.js';
import { registerVessel } from './interact.js';
import { fitRacketModel, dressRacket } from './racket.js';
import { ROSTER } from './rivals.js';
import { MEET, typo } from './girls.js';
import { earn } from './economy.js';
import { stats, safeStore } from './stats.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const NB = ' ';
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const $ = (id) => document.getElementById(id);

// ---------- Плата (test/jobs.test.mjs) ----------
// Урок: 30 CHF × качество (0,5–1 по доле удобных мячей) + чаевые за самую длинную серию удобных подряд.
export function lessonPay(good, n, streak) {
  const base = Math.round(30 * (0.5 + (0.5 * good) / n)), tip = streak >= 8 ? 6 : streak >= 5 ? 4 : streak >= 3 ? 2 : 0;
  return { base, tip, total: base + tip };
}
// Бариста: 12 за смену и по 3 за заказ, чаевые за скорость (до 25 с — 2, до 45 с — 1); всего не больше 40.
export const tipFor = (sec) => (sec < 25 ? 2 : sec < 45 ? 1 : 0);
export function baristaPay(waits) {
  const tip = waits.reduce((s, t) => s + tipFor(t), 0);
  return { tip, total: Math.min(40, 12 + 3 * waits.length + tip) };
}
// Спарринг: 25 + 2 за длинный розыгрыш, −1 за виннер Лёвы; бонус 0–10.
export function sparPay(long, winners) { const bonus = clamp(2 * long - winners, 0, 10); return { bonus, total: 25 + bonus }; }

// Пауза после работы — в памяти браузера: { coach: до какого времени, … }.
const KEY = 'lev-jobs', PAUSE = 4 * 60e3, N_FEEDS = 10, N_RALLIES = 10, SHIFT = 180;
const store = safeStore();
export const waitMin = (id, now = Date.now()) => Math.max(0, Math.ceil(((+store.get(KEY)?.[id] || 0) - now) / 60e3));
const rest = (id) => store.set(KEY, { ...(store.get(KEY) ?? {}), [id]: Date.now() + PAUSE });

const JOBS = [
  { id: 'coach', name: 'Урок с новичком', pay: `30${NB}CHF`, long: `10${NB}мячей`, start: startLesson },
  { id: 'barista', name: 'Смена баристы', pay: `до${NB}40${NB}CHF`, long: `3${NB}мин`, start: startBar },
  { id: 'spar', name: 'Спарринг с гостем', pay: `25${NB}CHF`, long: `10${NB}розыгрышей`, start: startSpar },
];

let C = null; // game, lev, club, scene, court, loader, interact, hands, terrace (T из props.js), axes() — направление с клавиш
const J = { cur: null, open: false, toastAt: 0, guests: [], spawned: [], models: new Map() };

export function initJobs(ctx) {
  C = ctx;
  makeUi();
  const b = boardMesh(); b.position.set(14.58, 1.62, -28.5); b.rotation.y = -Math.PI / 2; ctx.terrace.group.add(b); // стена дома между дверью (z −27,6…−26,4) и ставней окна (env-house.js: фасад x 14,6)
  ctx.interact.register({ pos: V(14.45, 1.5, -28.5), r: 1.5, y: 1.5, label: (st) => (J.cur || st.held || st.chair || st.seated ? null : 'посмотреть работу'), act: () => openBoard() });
  addEventListener('keydown', key, true); addEventListener('keyup', keyUp, true); // раньше main.js: K урока, Q — бросить работу
  if (window.__lev) window.__lev.jobs = { J, openBoard, closeBoard, take, stop, charge, release, get cur() { return J.cur; } };
}

// Шаг: после game.update и прогулки (и в __lev.step).
export function update(dt, now) {
  if (!C) return;
  const S = J.cur;
  if (S?.kind === 'coach' && S.save) lessonTick(now);
  if (S?.kind === 'spar' && S.save) sparTick(now);
  barTick(dt, now);
  if (J.toastAt && now > J.toastAt) { J.toastAt = 0; if (!J.cur) $('job').hidden = true; }
  if (J.open && now > (J.boardAt ?? 0)) { J.boardAt = now + 1; renderBoard(); } // «через 4 мин» тикает
}

// ---------- Доска и экран работ ----------
function boardMesh() {
  initMat();
  const W = 0.96, H = 0.72, c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#b3824f'; x.fillRect(0, 0, 640, 480); // пробка: зерно светлое и тёмное
  for (let i = 0; i < 6000; i++) { const d = r() < 0.55; x.fillStyle = `rgba(${d ? '80,46,22' : '236,196,146'},${0.12 + r() * 0.25})`; x.fillRect(r() * 640, r() * 480, 1 + r() * 2.5, 1 + r() * 2); }
  // Листки: заголовок, цена, строки «от руки», отрывные полоски снизу, кнопка сверху.
  const sheets = [[30, 38, 'Тренер', '30 CHF', -0.05, '#c23b2a'], [232, 58, 'Бариста', 'до 40 CHF', 0.035, '#2a64b8'], [434, 30, 'Спарринг', '25 CHF', -0.025, '#2f8a4a']];
  for (const [sx, sy, title, price, a, pin] of sheets) {
    x.save(); x.translate(sx + 88, sy + 170); x.rotate(a);
    x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
    x.fillStyle = '#f6f1e3'; x.fillRect(-88, -170, 176, 330);
    x.shadowColor = 'transparent';
    x.fillStyle = '#1e2a24'; x.textAlign = 'center'; x.font = '700 30px system-ui, sans-serif'; x.fillText(title, 0, -108);
    x.fillStyle = '#b5462a'; x.font = '700 26px system-ui, sans-serif'; x.fillText(price, 0, -70);
    x.strokeStyle = 'rgba(40,50,60,.55)'; x.lineWidth = 2.2; x.lineCap = 'round';
    for (let k = 0; k < 4; k++) { // строки «от руки»
      const y = -32 + k * 24, w = 120 - (k === 3 ? 50 : r() * 25);
      x.beginPath(); x.moveTo(-60, y); for (let u = 0; u <= w; u += 6) x.lineTo(-60 + u, y + Math.sin(u * 0.45 + k) * 2.2); x.stroke();
    }
    x.strokeStyle = 'rgba(40,50,60,.35)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(-88, 82); x.lineTo(88, 82); x.stroke(); x.setLineDash([]);
    for (let k = 1; k < 7; k++) { x.beginPath(); x.moveTo(-88 + k * 25, 82); x.lineTo(-88 + k * 25, 160); x.stroke(); } // отрывные полоски
    x.fillStyle = pin; x.beginPath(); x.arc(0, -150, 9, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.arc(-3, -153, 3, 0, 7); x.fill();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const g = new THREE.Group(); g.name = 'job-board';
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  face.position.z = 0.012; face.receiveShadow = true; g.add(face);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.02), MAT.teak); back.receiveShadow = true; g.add(back);
  for (const [w, h, px, py] of [[W + 0.08, 0.04, 0, H / 2 + 0.02], [W + 0.08, 0.04, 0, -H / 2 - 0.02], [0.04, H, -W / 2 - 0.02, 0], [0.04, H, W / 2 + 0.02, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), MAT.oak); m.position.set(px, py, 0.012); m.castShadow = m.receiveShadow = true; g.add(m); // рамка
  }
  return g;
}

const CSS = `
#jobs { position: fixed; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(8, 12, 10, .35); }
#jobs[hidden] { display: none; }
#jobs .sheet { border-radius: 16px; }
#jobs ul { list-style: none; margin: 0; padding: 0; }
#jobs li { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; min-height: 64px; border-top: 1px solid rgba(255, 255, 255, .08); }
#jobs li:first-child { border-top: 0; }
#jobs .nm { display: grid; gap: 3px; font-size: 16px; font-weight: 600; }
#jobs .nm small { font-size: 14px; font-weight: 500; opacity: .72; font-variant-numeric: tabular-nums; }
#jobs .go { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 96px; min-height: 44px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--accent, #d6ef3c); color: #18210c; font: 600 15px/1 system-ui, -apple-system, sans-serif; cursor: pointer; }
#jobs .go kbd { min-width: 18px; height: 18px; padding: 0 4px; margin: 0; font-size: 11px; border-radius: 4px; box-shadow: 0 1px 0 #6f7a2a; }
#jobs .wait { min-width: 96px; text-align: center; font-size: 14px; opacity: .65; white-space: nowrap; }
#job { position: fixed; z-index: 2; left: 16px; right: 16px; top: calc(66px + env(safe-area-inset-top)); display: grid; justify-items: center; gap: 8px; text-align: center; text-shadow: 0 1px 8px rgba(0, 0, 0, .45); pointer-events: none; }
#job[hidden], #jobbar[hidden] { display: none; }
#job p { margin: 0; font-size: 17px; line-height: 1.45; max-width: 34em; }
#job kbd { vertical-align: 1px; }
#job .dots { display: flex; gap: 6px; }
#job .dots i { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, .8); }
#job .dots i.on { background: var(--accent, #d6ef3c); border-color: var(--accent, #d6ef3c); }
#job .dots i.off { background: rgba(255, 255, 255, .45); border-color: transparent; }
#jobbar { position: fixed; z-index: 2; top: calc(10px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left)); }
#jobbar button { min-height: 44px; padding: 0 14px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 12px; background: rgba(16, 24, 20, .55); color: #fff; font: 600 16px/1 system-ui, -apple-system, sans-serif; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px; -webkit-tap-highlight-color: transparent; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
#jobbar kbd { min-width: 20px; height: 20px; padding: 0 5px; margin: 0; font-size: 11px; border-radius: 5px; box-shadow: 0 1px 0 #8f9690; }
#jobFeed { display: none; position: fixed; z-index: 2; right: calc(16px + env(safe-area-inset-right)); bottom: calc(28px + env(safe-area-inset-bottom)); width: 96px; height: 96px; border: 0; border-radius: 50%;
  background: rgba(16, 24, 20, .62); color: #fff; font: 700 15px/1.2 system-ui, -apple-system, sans-serif; touch-action: none; -webkit-tap-highlight-color: transparent; }
#jobFeed.on { background: var(--accent, #d6ef3c); color: #18210c; }
body.job #cbar { display: none !important; }
body.jobs-open #act, body.jobs-open #cbar { visibility: hidden; }
body.job-court #hud { visibility: hidden; }
body.job-lesson #pad, body.job-lesson #hint { display: none !important; }
@media (pointer: coarse) { body.job-lesson #jobFeed { display: block; } #jobbar kbd, #jobs .go kbd { display: none; } }
@media (max-width: 640px) { #jobbar { top: calc(64px + env(safe-area-inset-top)); } #job { top: calc(148px + env(safe-area-inset-top)); } #job p { font-size: 16px; } /* под кошельком (profile.css, 64–135 px) */ #jobs { align-items: flex-end; } #jobs .sheet { border-radius: 16px 16px 0 0; } }`;

function makeUi() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  document.body.insertAdjacentHTML('beforeend', `
    <div id="jobs" role="dialog" aria-modal="true" aria-labelledby="jobsH" hidden><div class="sheet">
      <div class="head"><b id="jobsH">Работа</b><button class="x" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <ul id="jobsList"></ul></div></div>
    <div id="job" aria-live="polite" hidden><p></p><span class="dots"></span></div>
    <div id="jobbar" hidden><button id="jobExit" type="button">Закончить<kbd>Q</kbd></button></div>
    <button id="jobFeed" type="button">Набросить</button>`);
  $('jobs').addEventListener('click', (e) => { const b = e.target.closest('[data-job]'); if (b) take(b.dataset.job); else if (e.target.id === 'jobs' || e.target.closest('.x')) closeBoard(); });
  $('jobExit').addEventListener('click', (e) => { e.currentTarget.blur(); stop(false); });
  const fb = $('jobFeed');
  fb.addEventListener('pointerdown', (e) => { e.preventDefault(); charge(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) fb.addEventListener(ev, () => release());
}

function openBoard() {
  if (J.open || J.cur) return;
  J.open = true; $('jobs').hidden = false; renderBoard(); document.body.classList.add('jobs-open');
  C.lev.vel.set(0, 0, 0);
}
function closeBoard() { J.open = false; $('jobs').hidden = true; document.body.classList.remove('jobs-open'); }
function renderBoard() {
  const tired = stats.fatigue >= 92;
  $('jobsList').innerHTML = JOBS.map((j, i) => {
    const w = waitMin(j.id), act = tired ? '<span class="wait">Устал</span>' : w ? `<span class="wait">через ${w}${NB}мин</span>` : `<button type="button" class="go" data-job="${j.id}"><kbd>${i + 1}</kbd>Взять</button>`;
    return `<li><span class="nm">${typo(j.name)}<small>${j.pay} · ${j.long}</small></span>${act}</li>`;
  }).join('');
}

// Взять работу: модели грузятся (ученик, гости), потом работа начинается сама.
async function take(id) {
  const j = JOBS.find((x) => x.id === id);
  if (!j || J.cur || waitMin(id) || stats.fatigue >= 92 || C.club.mode !== 'walk' || C.club.ride?.active) return;
  closeBoard();
  const pending = J.cur = { kind: id };
  try { await j.start(pending); } catch (e) { console.error('работа не началась', e); if (J.cur === pending) J.cur = null; }
}

// Строка работы под счётом и кнопка «Закончить».
function line(html, dots = null) {
  const el = $('job'); el.hidden = false; el.firstChild.innerHTML = html; J.toastAt = 0;
  el.lastChild.innerHTML = dots ? dots.map((k) => `<i${k ? ` class="${k}"` : ''}></i>`).join('') : '';
}
function toast(text, sec = 6) { line(text); J.toastAt = C.game.now + sec; }
function setMode(kind) {
  const b = document.body.classList;
  b.toggle('job', !!kind); b.toggle('job-court', kind === 'coach' || kind === 'spar'); b.toggle('job-lesson', kind === 'coach');
  $('jobbar').hidden = !kind;
}
const kb = (k, touch) => (TOUCH ? touch : `<kbd>${k}</kbd>`);

// Конец работы: paid — довёл до конца (деньги, итог одной строкой, пауза), иначе бросил — без оплаты.
function stop(paid, amount = 0, why = '', summary = '') {
  const S = J.cur; if (!S) return;
  const now = C.game.now;
  if (S.kind === 'barista' && S.t0 != null) barEnd(S);
  if (S.save) { for (const o of S.props ?? []) o.removeFromParent(); giveCourt(S.save, now); }
  J.cur = null; setMode(null); $('jobFeed').classList.remove('on');
  if (!paid) return toast('Работа брошена, без оплаты', 4);
  earn(amount, why); rest(S.kind);
  C.game.hud.flash(`+${amount}${NB}CHF`, true);
  toast(typo(summary));
}

// ---------- Люди: ученик, гости ----------
const loadModel = (url) => { if (!J.models.has(url)) J.models.set(url, C.loader.loadAsync(url)); return J.models.get(url); };
// court — с ракеткой из Meshy (racket: red | white | neon) и замером поз для ИИ; иначе гость без ракетки.
async function person(url, side, height, racket = null) {
  const p = new Player(C.scene, await loadModel(url), { side, height, racketColor: '#2f7d4f' });
  if (racket) {
    const rk = await loadModel(`/models/racket-${racket}.glb`).catch(() => null);
    if (rk) dressRacket(p.racket, (rk.fit ??= fitRacketModel(rk.scene)).clone(true)); // без файла — ракетка кодом
    p.measure();
  } else p.racket.visible = false; // гости в повседневном — без ракеток
  C.scene.remove(p.wrap, p.racket);
  return p;
}

// Корт 1 на время работы: соперник уходит со сцены, на его место — p со своим ИИ (сила skill); счёт, подача, итог
// матча и журнал — как были, после работы всё обратно. Лёва на корт (замена уходит), как в матче с девушкой.
function takeCourt(p, skill, now) {
  const G = C.game, c = C.club;
  if (c.active) c.back(now);
  const old = G.opp, lev = G.lev;
  const save = { old, ai: G.ai, pts: G.pts, games: G.games, sets: G.sets, tb: G.tb, bestOf: G.bestOf, ended: G.ended, server: G.server, onMatch: G.onMatch, log: G.log };
  old.wrap.visible = old.racket.visible = false; old.onContact = old.onStep = old.onPlant = old.onSlide = null;
  C.scene.add(p.wrap, p.racket);
  G.opp = p; G.hook(p);
  G.pts = new Map([[lev, 0], [p, 0]]); G.games = new Map([[lev, 0], [p, 0]]);
  Object.assign(G, { sets: [], tb: null, ended: null, server: lev, onMatch: null, bestOf: 1 });
  G.ai = new AI(p, G); G.ai.skill = skill;
  p.place(p.home); p.stamina = 1; p.mood = 0;
  G.hud.hint('');
  return save;
}
function giveCourt(save, now) {
  const G = C.game, p = G.opp, old = save.old;
  p.onContact = p.onStep = p.onPlant = p.onSlide = null; p.stroke = null;
  C.scene.remove(p.wrap, p.racket);
  G.opp = old; G.hook(old);
  Object.assign(G, { ai: save.ai, pts: save.pts, games: save.games, sets: save.sets, tb: save.tb, bestOf: save.bestOf, ended: save.ended, server: save.server, onMatch: save.onMatch, log: save.log, drill: null, autoLev: null });
  delete G.serveShot; // урок подменял полёт подачи на свой наброс
  old.wrap.visible = old.racket.visible = true; old.place(old.home);
  G.b.live = false; G.ballMesh.visible = false; G.landing = null;
  if (C.club.sub) C.club.exit(C.club.sub, now); else G.resetPoint(now); // Лёва уходит с корта к калитке, замена — на корт, матч с того же счёта
}

// ---------- Урок с новичком ----------
const ZONE = { x: 1.6, z: -8.6, hw: 1.0, hd: 1.4 }; // удобно ученику: сбоку от середины, между линией подачи и задней
const FEED_AT = V(0.6, 0, 6.8); // Лёва за линией подачи: ближе — ИИ ученика считал его «у сетки» и бил свечой

async function startLesson(pending) {
  const p = J.student ??= await person('/models/sub.glb', -1, 1.8, 'white');
  if (J.cur !== pending) return;
  const G = C.game, L = C.lev, now = G.now;
  const S = J.cur = { kind: 'coach', save: takeCourt(p, 0.42, now), n: 0, good: 0, ret: 0, streak: 0, best: 0, res: [], feed: null, charge: null, readyAt: now + 1, t: now, endAt: 0, zx: -ZONE.x };
  L.place(FEED_AT.clone());
  // Лёва стоит у корзины: после наброса (шаг подачи в корт) сам отходит на место; клавиши направления только целят.
  G.autoLev = { update: () => { const d = FEED_AT.clone().sub(L.pos).setY(0), k = d.length(); return k < 0.06 ? d.set(0, 0, 0) : d.setLength(Math.min(0.35, k * 1.5)); }, serveDir: () => null };
  G.serveShot = () => ({ target: S.aim.clone(), aim: S.aim.clone(), power: 0, dir: null, speed: 0, spin: 40, lob: -0.4, kind: 'feed' }); // свеча под 0,41 рад (game.fly)
  G.drill = { update: (t) => { const dt = clamp(t - S.t, 0, 0.1); S.t = t; G.opp.update(dt, t, G.ai.update(t), G.b); }, afterStep() {}, bounce: lessonBounce, miss: () => lessonDone(false) };
  G.state = 'drill'; G.b.live = false; G.ballMesh.visible = false;
  // Ученик иногда мажет и по удобному мячу: в сетку или за заднюю линию Лёвы.
  p.onContact = (pp, st) => {
    const before = G.lastHitter; G.contact(pp, st);
    if (before === pp || G.lastHitter !== pp || Math.random() > (S.feed?.good ? 0.12 : 0.3)) return;
    const b = G.b; b.vel.copy(solveShot(b.pos, V(b.pos.x * 0.5, 0, Math.random() < 0.6 ? -0.4 : 13.2), b.vel.length() * 0.85, b.spin)); G.markLanding();
  };
  const zone = S.zone = zoneMesh(), ring = S.ring = ringMesh(), basket = C.court.getObjectByName('balls')?.clone();
  zone.position.set(S.zx, 0.013, ZONE.z); ring.visible = false;
  S.props = [zone, ring];
  if (basket) { basket.position.set(FEED_AT.x + 0.75, 0, FEED_AT.z + 0.4); basket.rotation.y = 0.4; S.props.push(basket); }
  C.scene.add(...S.props);
  setMode('coach'); lessonLine();
}
function lessonLine() {
  const S = J.cur, dots = Array.from({ length: N_FEEDS }, (_, i) => (i < S.res.length ? (S.res[i] ? 'on' : 'off') : ''));
  line(S.res.length < 2 ? typo(`Держи ${kb('K', '«Набросить»')} — мяч летит дальше, ${TOUCH ? 'джойстик' : `${kb('A')} ${kb('D')}`} — в сторону. Отпусти, когда кольцо в зелёной зоне`)
    : `Удобных ${S.good} из ${S.res.length}`, dots);
}
// Куда полетит наброс без разброса: держишь дольше — дальше (за 1,3 с от сетки до аута), стрелки — в сторону.
const aimOf = (S, now) => { const k = clamp((now - S.charge.t0) / 1.3, 0, 1), a = C.axes(); return V(clamp(a.x, -1, 1) * 2, 0, -(3 + 10.5 * k)); };
function charge() {
  const S = J.cur, G = C.game;
  if (S?.kind !== 'coach' || !S.save || S.charge || G.state !== 'drill' || G.now < S.readyAt || S.n >= N_FEEDS || G.lev.stroke) return;
  S.charge = { t0: G.now }; $('jobFeed').classList.add('on');
}
function release() {
  const S = J.cur, G = C.game;
  $('jobFeed').classList.remove('on');
  if (S?.kind !== 'coach' || !S.charge) return;
  const base = aimOf(S, G.now); S.charge = null;
  S.aim = base.clone().add(V(gauss() * 0.3, 0, gauss() * 0.4));
  Object.assign(G, { state: 'serve', server: G.lev, serveNo: 1 });
  G.serve(G.lev, G.now, 'under');
  if (G.state !== 'rally') { G.state = 'drill'; return; }
  S.n++; S.feed = { good: false, done: false }; S.ringAt = base;
}
// Отскок: h — кто бил (Лёва — наброс, ученик — ответ), n — какой отскок с удара.
function lessonBounce(pos, h, n) {
  const G = C.game, S = J.cur;
  if (G.state !== 'rally' || !S?.feed) return;
  if (h === G.lev) {
    if (n === 1 && pos.z < 0) { S.feed.good = Math.abs(pos.x - S.zx) <= ZONE.hw && Math.abs(pos.z - ZONE.z) <= ZONE.hd; return; }
    return lessonDone(false); // не перелетел или ученик не достал
  }
  lessonDone(n === 1 && pos.z > 0 && inSingles(pos)); // ответ ученика в корт
}
function lessonDone(ret) {
  const G = C.game, S = J.cur, f = S?.feed;
  if (!f || f.done) return;
  f.done = true; G.state = 'drill'; G.serving = null;
  S.good += f.good; S.ret += ret; S.streak = f.good ? S.streak + 1 : 0; S.best = Math.max(S.best, S.streak); S.res.push(f.good);
  G.hud.flash(f.good ? (ret ? 'Удобно, отбил' : 'Удобно, но мимо') : 'Неудобный мяч', f.good);
  S.readyAt = G.now + 0.6;
  if (S.n >= N_FEEDS) S.endAt = G.now + 1.4;
  S.zx = (S.n % 4 < 2 ? -1 : 1) * ZONE.x; // по два мяча под форхенд ученика (слева от Лёвы), потом под бэкхенд
  lessonLine();
}
function lessonTick(now) {
  const S = J.cur;
  if (C.club.active) return stop(false); // увели с корта
  S.zone.position.x += (S.zx - S.zone.position.x) * 0.2;
  const at = S.charge ? aimOf(S, now) : S.feed && !S.feed.done ? S.ringAt : null;
  S.ring.visible = !!at; if (at) S.ring.position.set(at.x, 0.014, at.z);
  if (S.endAt && now >= S.endAt) {
    const pay = lessonPay(S.good, N_FEEDS, S.best), q = 0.5 + (0.5 * S.good) / N_FEEDS;
    stats.tire(3); stats.train('technique', 4 * q);
    stop(true, pay.total, 'Урок с новичком', `Урок окончен: удобных ${S.good} из ${N_FEEDS}${pay.tip ? `, чаевые ${pay.tip}${NB}CHF` : ''}`);
  }
}
// Зона на корте: мягкий салатовый прямоугольник со скруглением и каймой.
function zoneMesh() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 180;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(214,239,60,.30)'; x.strokeStyle = 'rgba(214,239,60,.95)'; x.lineWidth = 6;
  x.beginPath(); x.roundRect(5, 5, 118, 170, 18); x.fill(); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.hw * 2, ZONE.hd * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
  return m;
}
const ringMesh = () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.37, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; return m; };

// ---------- Спарринг ----------
async function startSpar(pending) {
  const r = ROSTER.find((x) => x.id === 'ch'); // гость клуба — швейцарец из rivals.js, но слабее турнирного
  const p = J.sparer ??= await person(r.model, -1, r.height, r.racket);
  if (J.cur !== pending) return;
  p.style = r.style;
  const G = C.game, now = G.now;
  const S = J.cur = { kind: 'spar', save: takeCourt(p, 0.45, now), n: 0, long: 0, win: 0, endAt: 0 };
  const log = S.save.log;
  G.log = (t, d) => { if (t === 'point') sparPoint(d); log(t, d); }; // очко: длина розыгрыша и виннеры
  G.resetPoint(now);
  setMode('spar'); sparLine();
}
function sparPoint(d) {
  const G = C.game, S = J.cur;
  if (S?.kind !== 'spar') return;
  S.n++; S.long += d.rally >= 6; S.win += d.winner === 'lev' && (d.why === 'Виннер' || d.why === 'Не достал');
  for (const m of [G.pts, G.games]) for (const k of m.keys()) m.set(k, 0); // без счёта: геймы не играются
  G.server = G.other(G.server); // подают по очереди
  if (S.n >= N_RALLIES) S.endAt = G.now + 1.6;
  sparLine();
}
function sparLine() {
  const S = J.cur;
  line(S.n === 0 ? typo('Бонус за длинные розыгрыши, виннеры его уменьшают') : `Розыгрыш ${Math.min(S.n + 1, N_RALLIES)} из ${N_RALLIES} · длинных ${S.long}`);
}
function sparTick(now) {
  const S = J.cur, G = C.game;
  if (C.club.active) return stop(false);
  G.ai.skill = clamp(G.ai.skill, 0.38, 0.5); // гость слабее обычного соперника, игра подстраивает силу только в этих пределах
  if (S.endAt && now >= S.endAt) {
    const pay = sparPay(S.long, S.win);
    stats.tire(2);
    stop(true, pay.total, 'Спарринг с гостем', `Спарринг окончен: длинных розыгрышей ${S.long}${pay.bonus ? `, бонус ${pay.bonus}${NB}CHF` : ''}`);
  }
}

// ---------- Смена баристы ----------
// Гости заходят на террасу с дорожки и идут к стулу проходом вдоль края настила (x 10,45) или вдоль дома (x 13,2).
const ENTRY = [V(10.85, 0, -15), V(10.85, 0, -19.3), V(10.45, 0, -23.5)];
const ORDERS = ['cup', 'cup', 'water', 'wine'], PATIENCE = 75;
const SUPPLY = [[0, 'cup'], [1, 'wine'], [3, 'water'], [4, 'water'], [5, 'cup']]; // места стойки (props.js): кофе, бокал, пустые стаканы; графин — на своём

async function startBar(pending) {
  if (!J.guests.length) J.guests = await Promise.all(['gh', 'jp', 'ru'].map(async (id) => { const r = ROSTER.find((x) => x.id === id); return { p: await person(r.model, 1, r.height), state: 'off', icon: iconSprite() }; }));
  if (J.cur !== pending) return;
  const T = C.terrace, now = C.game.now, bar = T.surfaces.find((s) => s.name === 'стойка');
  const S = J.cur = { kind: 'barista', t0: now, end: now + SHIFT, next: now + 1.5, waits: [], stash: [], supply: [], lineAt: 0 };
  // Родная посуда террасы (кроме графина) убирается на смену; на стойку — своя, взял — через 1,5 с ставится новая.
  for (const v of T.vessels) if (v.kind !== 'carafe') { S.stash.push([v, v.spot]); if (v.spot) v.spot.item = null; v.spot = null; v.obj.visible = false; }
  for (const [i, kind] of SUPPLY) { const spot = bar.spots[i]; S.supply.push({ spot, kind, wait: 0 }); if (!spot.item) spawn(kind, spot); }
  // Ракетка — на стойку: лежит у дальнего края, головкой к табуретам.
  const rk = S.rk = C.lev.racket.clone(true);
  rk.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.12));
  rk.position.set(13.76, bar.spots[0].pos.y + 0.012, -21.35); T.group.add(rk);
  C.lev.racket.visible = false;
  for (const g of J.guests) { C.scene.add(g.p.wrap, g.p.racket, g.icon); g.p.wrap.visible = false; g.icon.visible = false; g.state = 'off'; }
  setMode('barista'); barLine(now);
}
function barLine(now) {
  const S = J.cur, left = Math.max(0, Math.ceil(S.end - now)), mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  line(now - S.t0 < 20 ? typo('Возьми у стойки то, что над гостем, и поставь ему на стол') : `Осталось ${mm} · обслужено ${S.waits.length}`);
}
function spawn(kind, spot) {
  const T = C.terrace, v = new Vessel(kind, kind === 'water' ? 0 : kind === 'wine' ? 0.7 : 0.8);
  v.obj.position.copy(spot.pos); if (spot.saucer) v.obj.position.y += 0.0095; v.obj.rotation.y = Math.random() * 6;
  spot.item = v; v.spot = spot; T.group.add(v.obj); T.vessels.push(v);
  v.reg = registerVessel(C.interact, C.hands, v); J.spawned.push(v);
  return v;
}
function drop(v) { // убрать посуду смены
  const T = C.terrace;
  if (v.spot) v.spot.item = null;
  v.spot = null; C.interact.unregister(v.reg); v.obj.removeFromParent();
  T.vessels.splice(T.vessels.indexOf(v), 1); J.spawned.splice(J.spawned.indexOf(v), 1);
  v.obj.traverse((o) => { o.geometry?.dispose(); if (o.isSprite) o.material.dispose(); }); // материалы общие (props.js), кроме пара
}
// Место на стуле — как у Лёвы (interact.js): сиденье в мире, куда лицом, подход сбоку со стороны дорожки (+z).
function chairSeat(ch) {
  const o = ch.obj; o.updateWorldMatrix(true, false);
  const d = V(0, 0, 1).transformDirection(o.matrixWorld), yaw = Math.atan2(d.x, d.z), f = V(Math.sin(yaw), 0, Math.cos(yaw)), r = V(-Math.cos(yaw), 0, Math.sin(yaw));
  const at = o.localToWorld(ch.seat.clone()), h = at.y; at.y = 0;
  return { at, h, yaw, f, r, ap: at.clone().addScaledVector(r, 0.6 * (r.z >= 0 ? 1 : -1)).addScaledVector(f, 0.1) };
}
const ground = (x, z) => C.club.ground(x, z);
function freeChair() {
  const L = C.lev, taken = J.guests.filter((g) => g.state !== 'off').map((g) => g.chair);
  const ok = C.terrace.chairs.filter((ch) => {
    if (ch.carried || taken.includes(ch)) return false;
    const s = chairSeat(ch);
    return Math.hypot(s.at.x - MEET.pos[0], s.at.z - MEET.pos[2]) > 0.4 && !(L.seat && L.seat.at.distanceTo(s.at.clone().setY(L.seat.at.y)) < 0.4); // не стул свидания и не Лёвин
  });
  return ok[Math.floor(Math.random() * ok.length)] ?? null;
}
function seatGuest(g, ch, now) {
  const s = g.seat = chairSeat(ch), p = g.p;
  g.chair = ch; g.state = 'in'; g.order = null; g.v = null; g.t = now;
  g.table = C.terrace.surfaces.filter((x) => x.name === 'стол').sort((a, b) => Math.hypot(a.pos.x - s.at.x, a.pos.z - s.at.z) - Math.hypot(b.pos.x - s.at.x, b.pos.z - s.at.z))[0];
  g.aisle = s.ap.x > 12 ? [V(13.2, 0, -23.5), V(13.2, 0, s.ap.z)] : [V(10.45, 0, s.ap.z)];
  Object.assign(p, { free: true, seat: null, ground, bounds: null, idle: false });
  p.place(ENTRY[0].clone()); p.wrap.visible = true;
  g.path = [...ENTRY.slice(1), ...g.aisle, s.ap].map((v) => v.clone());
}
function leave(g) { if (g.p.seat) g.p.seat.up = true; g.state = 'up'; g.icon.visible = false; }
function barTick(dt, now) {
  const S = J.cur?.kind === 'barista' && J.cur.t0 != null ? J.cur : null;
  if (!S && !J.guests.some((g) => g.state !== 'off')) return;
  if (S && !C.club.walking) return stop(false); // ушёл на корт или к стенке
  if (S && now >= S.end) {
    const pay = baristaPay(S.waits);
    stats.tire(5); stats.train('stamina', 3);
    return stop(true, pay.total, 'Смена баристы', `Смена окончена: обслужено ${S.waits.length}${pay.tip ? `, чаевые ${pay.tip}${NB}CHF` : ''}`);
  }
  if (S) {
    // Новый гость: сначала до двух за столиками, с минуты — до трёх; за 25 с до конца смены — уже никого.
    const on = J.guests.filter((g) => g.state !== 'off').length, g = J.guests.find((x) => x.state === 'off');
    if (now >= S.next && now < S.end - 25 && g && on < (now - S.t0 < 60 ? 2 : 3)) { const ch = freeChair(); if (ch) seatGuest(g, ch, now); S.next = now + 4 + Math.random() * 4; }
    for (const s of S.supply) { // взяли со стойки — новая через 1,5 с
      if (s.spot.item || J.spawned.length > 16) { s.wait = 0; continue; }
      if (!s.wait) s.wait = now + 1.5; else if (now > s.wait) { spawn(s.kind, s.spot); s.wait = 0; }
    }
    const cf = C.terrace.vessels.find((v) => v.kind === 'carafe'); if (cf?.spot && cf.fill < 0.3) cf.setFill(0.85); // графин на стойке доливается
    if (now > S.lineAt) { S.lineAt = now + 0.5; barLine(now); }
  }
  for (const g of J.guests) {
    if (g.state === 'off') continue;
    const p = g.p;
    let move = new THREE.Vector3();
    if (g.path) {
      const m = C.club.steer(p, g.path, 1);
      if (m) move = m;
      else if (g.state === 'in') { // дошёл до стула — садится
        g.path = null; const s = g.seat;
        p.seat = { at: s.at.clone().setY(ground(s.at.x, s.at.z)), from: p.pos.clone(), yaw: s.yaw, h: s.h, w: 0, chair: true,
          feet: [-1, 1].map((sg) => { const q = s.at.clone().addScaledVector(s.f, 0.5).addScaledVector(s.r, sg * 0.15); return q.setY(ground(q.x, q.z)); }) };
        g.state = 'sit'; g.t = now + 1.5;
      } else { g.path = null; g.state = 'off'; p.wrap.visible = false; if (g.v && J.spawned.includes(g.v)) drop(g.v); g.v = null; } // ушёл с террасы
    }
    p.update(dt, now, move, null);
    if (g.state === 'sit' && p.seat?.w === 1 && now > g.t) { g.state = 'wait'; g.order = ORDERS[Math.floor(Math.random() * ORDERS.length)]; g.t = now; }
    if (g.state === 'wait') {
      if (S) serveCheck(g, S, now);
      if (g.state === 'wait' && (!S || now - g.t > PATIENCE)) { if (S) C.game.hud.flash('Гость ушёл без заказа', false); leave(g); }
    }
    if (g.state === 'drink') { if (g.v?.spot) g.v.setFill(g.v.fill - dt * 0.02); if (now - g.t > 12 || !S) leave(g); }
    if (g.state === 'up' && !p.seat) { g.state = 'out'; g.path = [g.seat.ap, ...g.aisle.slice().reverse(), ...ENTRY.slice().reverse(), V(10.85, 0, -11)].map((v) => v.clone()); }
    // Значок над головой: заказ, после — галочка на 1,5 с.
    const show = g.state === 'wait' ? g.order : g.state === 'drink' && now < g.ok ? 'ok' : null;
    g.icon.visible = !!show;
    if (show) { g.icon.material = iconMat(show); g.icon.position.copy(p.rig.b.Head.getWorldPosition(g.icon.position)).y += 0.48; }
  }
  if (!S && !J.cur && J.guests.every((g) => g.state === 'off')) for (const g of J.guests) C.scene.remove(g.p.wrap, g.p.racket, g.icon); // смена кончилась, все ушли
}
// Заказ на столе: сосуд того же вида, полный, ближе к этому гостю, чем к соседу по столику.
function serveCheck(g, S, now) {
  for (const sp of g.table.spots) {
    const v = sp.item;
    if (!v || v.lock || v.kind !== g.order || v.fill < (v.kind === 'water' ? 0.4 : 0.3)) continue;
    const near = J.guests.filter((x) => x.table === g.table && ['sit', 'wait', 'drink'].includes(x.state)).sort((a, b) => sp.pos.distanceTo(a.seat.at.clone().setY(sp.pos.y)) - sp.pos.distanceTo(b.seat.at.clone().setY(sp.pos.y)))[0];
    if (near !== g) continue;
    v.lock = true; g.v = v; g.state = 'drink'; S.waits.push(now - g.t); g.t = now; g.ok = now + 1.5;
    return;
  }
}
// Конец смены: деньги, гости допивают и уходят, посуда смены убирается, родная — на места, ракетка — Лёве.
function barEnd(S) {
  const T = C.terrace, H = C.hands;
  if (H.held || H.job) H.reset();
  for (const g of J.guests) { if (['in', 'sit', 'wait', 'drink'].includes(g.state)) leave(g); g.v = null; }
  for (const v of [...J.spawned]) drop(v);
  for (const [v, sp] of S.stash) {
    const s = T.surfaces.find((x) => x.spots.includes(sp)), spot = sp && !sp.item ? sp : s?.spots.find((x) => !x.item);
    v.obj.visible = !!spot; if (!spot) continue;
    spot.item = v; v.spot = spot; v.obj.position.copy(spot.pos); if (spot.saucer) v.obj.position.y += 0.0095;
  }
  T.vessels.find((v) => v.kind === 'carafe')?.setFill(0.85);
  S.rk.removeFromParent(); C.lev.racket.visible = true;
}
function iconSprite() { const s = new THREE.Sprite(iconMat('cup')); s.scale.setScalar(0.3); s.renderOrder = 10; s.visible = false; return s; }
// Значки заказа — своя рисовка (не эмодзи): цветная скруглённая плашка и белый знак — чашка, бокал, стакан, галочка.
const ICONS = {};
function iconMat(kind) {
  if (ICONS[kind]) return ICONS[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), col = { cup: '#9a6a44', wine: '#9b2c4b', water: '#3c8dc5', ok: '#4f9a3a' }[kind];
  x.fillStyle = col; x.beginPath(); x.roundRect(8, 8, 112, 112, 30); x.fill();
  x.strokeStyle = x.fillStyle = '#fff'; x.lineWidth = 7; x.lineCap = x.lineJoin = 'round';
  x.beginPath();
  if (kind === 'cup') {
    x.moveTo(34, 54); x.lineTo(82, 54); x.lineTo(78, 84); x.quadraticCurveTo(76, 94, 66, 94); x.lineTo(50, 94); x.quadraticCurveTo(40, 94, 38, 84); x.closePath(); x.fill();
    x.beginPath(); x.arc(84, 68, 9, -Math.PI / 2, Math.PI / 2); x.stroke();
    x.beginPath(); x.moveTo(28, 104); x.lineTo(92, 104); x.stroke();
    x.lineWidth = 5; for (const sx of [50, 66]) { x.beginPath(); x.moveTo(sx, 44); x.bezierCurveTo(sx - 6, 38, sx + 6, 32, sx, 24); x.stroke(); }
  } else if (kind === 'wine') {
    x.moveTo(42, 26); x.lineTo(86, 26); x.quadraticCurveTo(88, 70, 64, 72); x.quadraticCurveTo(40, 70, 42, 26); x.fill();
    x.beginPath(); x.moveTo(64, 72); x.lineTo(64, 98); x.moveTo(48, 100); x.lineTo(80, 100); x.stroke();
  } else if (kind === 'water') {
    x.moveTo(40, 26); x.lineTo(88, 26); x.lineTo(81, 100); x.lineTo(47, 100); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(44, 60); x.lineTo(84, 60); x.lineTo(81, 100); x.lineTo(47, 100); x.closePath(); x.fill();
  } else { x.lineWidth = 11; x.moveTo(36, 66); x.lineTo(56, 86); x.lineTo(92, 44); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (ICONS[kind] = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
}

// ---------- Клавиши ----------
// Доска открыта — её клавиши (1–3 взять, Esc и E закрыть), остальное не уходит в игру. На работе Q — бросить;
// в уроке K и пробел — наброс (держишь — дальше), другие удары молчат; на смене R не уводит на корт.
const FEED = ['KeyK', 'Space'], STROKE = ['KeyJ', 'KeyL', 'KeyI', 'KeyU'];
function key(e) {
  if (J.open) {
    if (e.repeat) return e.stopImmediatePropagation();
    if (/^Digit[1-3]$/.test(e.code)) take(JOBS[+e.code.slice(5) - 1].id);
    else if (e.code === 'Escape' || e.code === 'KeyE') closeBoard();
    return e.stopImmediatePropagation();
  }
  const S = J.cur; if (!S) return;
  if (e.code === 'KeyQ') { if (!e.repeat) stop(false); return e.stopImmediatePropagation(); }
  if (S.kind === 'barista' && e.code === 'KeyR') return e.stopImmediatePropagation();
  if (S.kind === 'coach' && (FEED.includes(e.code) || STROKE.includes(e.code))) { e.preventDefault(); if (!e.repeat && FEED.includes(e.code)) charge(); return e.stopImmediatePropagation(); }
}
function keyUp(e) { if (J.cur?.kind === 'coach' && FEED.includes(e.code)) release(); }
