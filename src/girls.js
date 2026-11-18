// Девушки на корте 2 (Лёва, 18.11): Алина и Соня играют свои розыгрыши, с ними можно познакомиться на прогулке.
// Корт 2 — отдельный розыгрыш (Rally2 на правилах game.js) в своих осях: девушки, мяч и метки живут в группе stage.
// На время шага игры группа стоит в нуле (оси корта = мир, весь код игрока и мяча считает как на корте 1), для кадра —
// на COURT2_X. Вне кадра корт 2 шагает 15 раз в секунду (девушки отсекаются по кадру), издалека — без настоящих
// теней (пятно под ногами).
// Разговор: «E — поговорить» у калитки корта 2 или рядом с девушкой в паузе, диалог внизу экрана (1–3 или нажатие),
// память в localStorage. «Сыграем?» — матч с ней на корте 1 вместо соперника до двух геймов; «Кофе» — она идёт
// на террасу к точке MEET и садится.
// При слиянии с interact.js: каждую точку из this.spots — в register({ pos, r, label, act }), свою кнопку убрать.
import * as THREE from 'three';
import { Player } from './player.js';
import { Game, AI } from './game.js';
import { COURT, GATE, COURT2_X } from './court.js';
import { step, solveShot, BALL_R } from './physics.js';
import { buildBall } from './ball.js';
import { fitRacketModel, dressRacket } from './racket.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const rnd = () => Math.random();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const GZ = (GATE.z0 + GATE.z1) / 2;
const Q = new URLSearchParams(location.search);

// Кофе на террасе: где она сидит (у столика PLACES.table в env.js, x 11,7, z −26,2, настил 0,15 м), куда лицом
// (как netYaw: лицом в (sin yaw, 0, cos yaw)) и высота сиденья над настилом. Стулья переделывает «жизнь клуба» —
// при слиянии поставить сюда место стула.
export const MEET = { pos: [10.95, 0.15, -25.55], yaw: Math.atan2(0.75, -0.65), h: 0.45 };
// С калитки корта 2 на террасу по дорожкам клуба (PATHS в env-club.js), мир.
const TO_TERRACE = [[-28.7, 3.99], [-26.8, 3.99], [-25.6, 14], [-23, 23.6], [-12, 25.3], [-2, 25.7], [6, 24.7], [10.3, 21.6], [11.4, 15.8], [10.85, 10.2], [10.85, -19.3], [10.6, -23.8]].map(([x, z]) => V(x, z));

export const GIRLS = [
  { id: 'alina', name: 'Алина', who: 'Брюнетка в белом', model: 'girl1', height: 1.7, side: 1, skill: 0.62, racket: 'white', cloth: '#f4f4f4' },
  { id: 'sonya', name: 'Соня', who: 'Рыжая в сиреневом', model: 'girl2', height: 1.68, side: -1, skill: 0.56, racket: 'neon', cloth: '#b9a6e0' },
];

// Неразрывный пробел после предлогов, союзов и «не», перед тире и частицами (правила Лёвы), без lookbehind.
const SHORT = 'в|во|и|а|о|об|у|к|ко|с|со|на|не|ни|но|да|по|за|до|из|от|для|без|при|про|над|под|что|как|я|ты|мы|он|она|это|так|уже|ещё|мне';
const RE_SHORT = new RegExp(`(^|[\\s«(])(${SHORT}) `, 'gi');
export const typo = (s) => s.replace(RE_SHORT, '$1$2 ').replace(RE_SHORT, '$1$2 ').replace(/ (—|же|ли|бы)(?=[\s.,!?…]|$)/g, ' $1');

// ---------- Корт 2: розыгрыш девушек ----------
// Те же правила, что на корте 1, но между очками пешком: кто ближе к мячу на своей половине, подбирает его, обе идут
// на места к подаче. held: девушка занята — разговор (точка, куда подойти) или 'away' (матч с Лёвой, кофе): вторая
// ждёт на своём месте, розыгрыша нет.
class Rally2 extends Game {
  constructor(o) { super(o); this.held = new Map(); this.go = false; this.calm = 0; }
  // Любительский уровень: ошибки чаще, чем у соперника Лёвы (сила 0,7), розыгрыши по 4–10 ударов.
  get level() { return [0.38, 0.5]; }
  resetPoint(now, second = false) {
    if (second || this.go) { this.go = false; for (const p of [this.lev, this.opp]) p.free = false; return super.resetPoint(now, second); }
    this.state = 'walk'; this.calm = 0;
    const b = this.b;
    this.picker = Math.abs(b.pos.x) < 8.6 && Math.abs(b.pos.z) < 19 ? (b.pos.z * this.lev.side > 0 ? this.lev : this.opp) : null;
    if (this.picker) this.ballMesh.visible = true;
    for (const p of [this.lev, this.opp]) if (this.held.get(p) !== 'away') Object.assign(p, { free: true, idle: false, stroke: null, split: null, sliding: 0 });
  }
  // Невынужденная ошибка любителя: ~9% ударов в сетку, в аут или за боковую (у ИИ корта 1 их почти нет).
  contact(p, st) {
    const served = this.serving, before = this.lastHitter;
    super.contact(p, st);
    if (served || before === p || this.lastHitter !== p || rnd() > 0.09) return;
    const b = this.b, t = new THREE.Vector3(b.pos.x * 0.5, 0, -p.side * 10), r = rnd();
    if (r < 0.4) t.z = -p.side * 0.4; else if (r < 0.7) t.z = -p.side * (12.4 + rnd()); else t.x = Math.sign(rnd() - 0.5) * (4.4 + rnd() * 0.8);
    b.vel.copy(solveShot(b.pos, t, b.vel.length() * (r < 0.4 ? 0.85 : 1), b.spin));
  }
  spotOf(p) { return p.home.clone().add(V(p === this.server ? 0.5 * p.side : -0.3 * p.side, 0)); }
  // Пауза сразу: розыгрыш обрывается без очка (её окликнули — мяч ловят рукой), дальше пешком.
  hold(p, what, now) { this.held.set(p, what); if (this.state !== 'walk') this.resetPoint(now); }
  update(dt, now) {
    this.ai.skill = clamp(this.ai.skill, ...this.level);
    if (this.state !== 'walk') return super.update(dt, now, null);
    this.now = now;
    const b = this.b;
    if (b.live) { // мяч докатывается
      for (let i = 0; i < 4; i++) step(b, dt / 4);
      if ((b.vel.lengthSq() < 0.05 && b.pos.y < 0.05) || Math.abs(b.pos.z) > 19.5 || Math.abs(b.pos.x) > 9) { b.live = false; if (Math.abs(b.pos.x) > 8.6 || Math.abs(b.pos.z) > 19) { this.picker = null; this.ballMesh.visible = false; } }
      this.ballMesh.position.copy(b.pos).y += BALL_R * 0.7;
    }
    let busy = false;
    for (const p of [this.lev, this.opp]) {
      const h = this.held.get(p);
      if (h === 'away') { busy = true; continue; } // её ведёт Girls (матч, кофе)
      let to = h ?? (p === this.picker ? b.pos.clone().setY(0) : this.spotOf(p));
      if (p === this.picker && p.pos.distanceTo(to) < 0.45) { this.picker = null; this.ballMesh.visible = false; to = this.spotOf(p); } // подобрала
      const d = to.clone().sub(p.pos).setY(0), len = d.length(), there = len < 0.18;
      if (!there) p.free = true; else if (!h) p.free = false; // на месте — разворот к сетке; у Лёвы стоит, как подошла
      if (!there || h || p === this.picker) busy = true;
      p.update(dt, now, there ? new THREE.Vector3() : d.divideScalar(len).multiplyScalar(Math.min(1.3, len * 2 + 0.25)), b.live ? b : null);
    }
    this.calm = busy ? 0 : this.calm + dt;
    if (this.calm > 0.6) { this.go = true; this.resetPoint(now); }
  }
}

// ---------- Память ----------
const KEY = 'lev3d-girls';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* без памяти — знакомство на эту игру */ } };
const fresh = () => ({ met: false, talks: 0, mood: 0, coffee: 0, stood: false, played: 0, won: 0, lost: 0, last: null });

// ---------- Интерфейс: кнопка «Поговорить» и диалог внизу ----------
const CSS = `
#ctalk[hidden] { display: none; }
#gtalk { position: fixed; left: calc(12px + env(safe-area-inset-left)); right: calc(12px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); max-width: 540px; margin: 0 auto; padding: 14px 16px 12px; border-radius: 16px; background: rgba(16, 24, 20, .74); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #fff; z-index: 20; box-sizing: border-box; }
#gtalk[hidden] { display: none; }
#gtalk .who { font-size: 13px; font-weight: 600; color: var(--accent, #d6ef3c); margin: 0 44px 4px 0; }
#gtalk .say { margin: 0 44px 12px 0; font-size: 17px; line-height: 1.35; }
#gtalk .opts { display: grid; gap: 8px; }
#gtalk .opts button { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 12px; background: rgba(255, 255, 255, .07); color: #fff; font: 500 16px/1.3 system-ui, -apple-system, sans-serif; text-align: left; cursor: pointer; }
#gtalk .opts button:active, #gtalk .opts button:hover { background: rgba(255, 255, 255, .16); }
#gtalk kbd { flex: none; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 5px; background: #e9ece8; color: #18210c; font: 600 12px/20px system-ui, sans-serif; text-align: center; box-shadow: 0 1px 0 #8f9690; }
#gtalk .x { position: absolute; top: 4px; right: 4px; width: 44px; height: 44px; border: 0; background: none; color: #fff; opacity: .7; cursor: pointer; display: grid; place-items: center; }
@media (pointer: coarse) { #gtalk kbd { display: none; } }`;

function makeUi() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const btn = document.createElement('button'); btn.id = 'ctalk'; btn.hidden = true; btn.innerHTML = 'Поговорить<kbd>E</kbd>';
  document.getElementById('cbar')?.append(btn);
  const box = document.createElement('div'); box.id = 'gtalk'; box.hidden = true;
  box.innerHTML = '<p class="who"></p><p class="say"></p><div class="opts"></div><button class="x" aria-label="Закрыть"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  document.body.append(box);
  return { btn, box, who: box.querySelector('.who'), say: box.querySelector('.say'), opts: box.querySelector('.opts'), x: box.querySelector('.x') };
}

// Пятно тени под ногами на корте 2 издалека, где настоящие тени выключены.
function blob() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1;
  return m;
}

// Звуки корта 2 — тише с расстояния до камеры и панорамой по ней; шорох скольжения и тон силы — только корт 1.
function farSound(sound, camera, at) {
  const v = new THREE.Vector3(), r = new THREE.Vector3();
  const wrap = (fn) => (o = {}) => {
    const d = camera.position.distanceTo(at), k = clamp(6 / Math.max(d, 1), 0, 0.7);
    if (k < 0.05) return;
    r.setFromMatrixColumn(camera.matrixWorld, 0); v.copy(at).sub(camera.position).normalize();
    fn({ ...o, vol: (o.vol ?? 1) * k, pan: clamp(v.dot(r), -1, 1) });
  };
  return { step: wrap(sound.step), plant: wrap((o) => sound.plant?.(o)), hit: wrap(sound.hit), bounce: wrap(sound.bounce), net: wrap(sound.net), whoosh: wrap(sound.whoosh), slide() {}, charge() {}, unlock() {} };
}

// ---------- Девушки ----------
export class Girls {
  constructor({ scene, game, club, camera, sound, loader }) {
    Object.assign(this, { scene, game, club, camera, sound, loader });
    this.stage = new THREE.Group(); this.stage.name = 'girls'; scene.add(this.stage);
    this.mem = load();
    this.girls = []; this.acc = 0; this.seen = true; this.shadows = null; this.dlg = null; this.match = null; this.spots = [];
    this.sphere = new THREE.Sphere(V(COURT2_X, 0, 1), 21); this.fr = new THREE.Frustum(); this.m4 = new THREE.Matrix4();
    this.ui = makeUi();
    this.ui.btn.addEventListener('click', (e) => { e.currentTarget.blur(); this.act(); });
    this.ui.x.addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => this.key(e), true); // раньше main.js: E у девушки — разговор, а не скамейка
    const play = ['play', 'pLessons', 'pWall'].map((id) => document.getElementById(id)).filter(Boolean);
    if (Q.has('girl')) for (const b of play) b.disabled = true; // ?girl=1|2 — сразу матч с ней (проверка): ждать модель
    this.ready = this.load().then(() => {
      if (Q.has('girl')) { this.startMatch(this.girls[clamp(+Q.get('girl') - 1, 0, 1)], this.game.now ?? 0); for (const b of play) b.disabled = false; }
    });
    if (window.__lev) window.__lev.girls = this; // ?debug
  }

  async load() {
    const opt = (url) => this.loader.loadAsync(url).catch(() => null);
    const [m1, m2, sub, rw, rn] = await Promise.all([...GIRLS.map((c) => opt(`/models/${c.model}.glb`)), opt('/models/sub.glb'), opt('/models/racket-white.glb'), opt('/models/racket-neon.glb')]);
    const rackets = { white: rw && fitRacketModel(rw.scene), neon: rn && fitRacketModel(rn.scene) };
    this.stage.position.x = 0; this.stage.updateMatrixWorld(true);
    const ps = GIRLS.map((c, i) => {
      const gltf = [m1, m2][i] ?? sub; // модели ещё нет — замена, перекрашенная в её форму
      const p = new Player(this.stage, gltf, { side: c.side, height: c.height, racketColor: '#e8e8e8', cloth: [m1, m2][i] ? null : c.cloth });
      if (rackets[c.racket]) dressRacket(p.racket, rackets[c.racket].clone(true));
      p.measure();
      const g = { c, p, i, where: 'court', job: null, mem: { ...fresh(), ...this.mem[c.id] }, blob: blob(), meshes: [] };
      // Отсекать по кадру (у игроков корта 1 отсечение выключено): сфера по позе покоя с запасом на руки и ракетку.
      p.wrap.traverse((o) => { if (!o.isMesh) return; g.meshes.push(o); if (o.isSkinnedMesh) { o.computeBoundingSphere(); o.boundingSphere.radius *= 1.6; o.frustumCulled = true; } });
      this.stage.add(g.blob);
      return g;
    });
    this.girls = ps;
    const at = this.sphere.center;
    this.sim = new Rally2({ lev: ps[0].p, opp: ps[1].p, ballMesh: buildBall(), hud: { score() {}, hint() {}, flash() {}, serveHint: '' }, sound: farSound(this.sound, this.camera, at), aimLev: null });
    this.sim.ballMesh.scale.setScalar(1.7); this.sim.ballMesh.visible = false; this.stage.add(this.sim.ballMesh);
    this.sim.autoLev = new AI(ps[0].p, this.sim); this.sim.autoLev.skill = 0.5; this.sim.ai.skill = 0.44;
    this.sim.now = this.game.now ?? 0;
    this.sim.resetPoint(this.sim.now);
    this.stage.position.x = COURT2_X; this.stage.updateMatrixWorld(true);
  }

  remember(g, patch) { Object.assign(g.mem, patch); this.mem[g.c.id] = g.mem; save(this.mem); }
  world(g) { return g.where === 'court' ? g.p.pos.clone().setX(g.p.pos.x + COURT2_X) : g.p.pos.clone(); }

  // ---------- Шаг ----------
  update(dt, now) {
    if (!this.sim) return;
    const cam = this.camera;
    this.fr.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    this.seen = this.fr.intersectsSphere(this.sphere); // корт 2 в кадре — шаг каждый кадр, иначе 15 раз в секунду
    const sharp = this.seen && cam.position.distanceTo(this.sphere.center) < 32; // близко — настоящие тени, издалека пятно
    if (sharp !== this.shadows) { this.shadows = sharp; for (const g of this.girls) if (g.where === 'court') this.shade(g, sharp); }
    this.acc += dt;
    if (this.seen || this.acc >= 1 / 15) {
      const h = Math.min(this.acc, 0.1); this.acc = 0;
      this.stage.position.x = 0; this.stage.updateMatrixWorld();
      this.sim.update(h, now);
      for (const g of this.girls) if (g.where === 'court') g.blob.position.set(g.p.pos.x, 0.012, g.p.pos.z);
      this.stage.position.x = COURT2_X; this.stage.updateMatrixWorld();
    }
    for (const g of this.girls) if (g.where === 'world' && g.job !== 'match') this.stroll(g, dt, now);
    if (this.match) this.watchMatch(now);
    this.near(now);
  }
  shade(g, on) { for (const m of g.meshes) m.castShadow = on; g.p.racket.traverse((o) => { if (o.isMesh) o.castShadow = on; }); g.blob.visible = !on && g.where === 'court'; }

  // Перенести девушку с корта 2 в мир (матч, кофе) или обратно; side — сторона корта (+1 ближняя, −1 дальняя).
  move(g, where, side, at) {
    const p = g.p, parent = where === 'court' ? this.stage : this.scene;
    parent.add(p.wrap, p.racket);
    g.where = where;
    p.side = side; p.netYaw = side > 0 ? Math.PI : 0; p.right.set(side, 0, 0); p.fwd.set(0, 0, -side); p.home.set(0, 0, side * (COURT.len / 2 + 0.8));
    p.place(at);
    this.shade(g, where === 'world' || !!this.shadows);
  }

  // ---------- Кто рядом: «Поговорить» ----------
  // Точки разговора: у калитки корта 2 (с той, что ближе к калитке), рядом с девушкой на корте 2, у столика на террасе.
  near(now) {
    const c = this.club, L = c.lev, ok = c.mode === 'walk' && !L.seat && !c.path && !this.dlg;
    let best = null;
    if (ok) {
      const at = L.pos.clone().setY(0), gate = V(COURT2_X + GATE.x, GZ);
      for (const g of this.girls) {
        const d = this.world(g).setY(0).distanceTo(at);
        if (g.where === 'court' && !g.job && d < 2.2 && (!best || d < best.d)) best = { g, d, kind: 'talk' };
        if (g.job === 'coffee' && g.p.seat?.w === 1 && d < 2.2 && (!best || d < best.d)) best = { g, d, kind: 'cafe' };
      }
      const dg = gate.distanceTo(at);
      if (!best && dg < 2.8) {
        const free = this.girls.filter((g) => g.where === 'court' && !g.job);
        const g = free.sort((a, b) => this.world(a).distanceTo(gate) - this.world(b).distanceTo(gate))[0];
        if (g) best = { g, d: dg, kind: 'talk' };
      }
    }
    this.target = best;
    this.ui.btn.hidden = !best;
    // Ушёл от места разговора дальше 3,5 м — разговор окончен.
    if (this.dlg?.at && L.pos.distanceTo(this.dlg.at) > 3.5) this.close();
    if (this.dlg?.until && now > this.dlg.until) this.close();
  }
  act() { if (this.target) this.talk(this.target.g, this.target.kind); }
  key(e) {
    if (e.repeat) return;
    if (this.dlg && /^Digit[1-3]$/.test(e.code)) { this.choose(+e.code.slice(5) - 1); e.stopImmediatePropagation(); return; }
    if (this.dlg && e.code === 'Escape') { this.close(); return; }
    if (e.code === 'KeyE' && this.target && !this.dlg) { this.act(); e.stopImmediatePropagation(); }
  }

  // ---------- Разговор ----------
  talk(g, kind = 'talk') {
    const L = this.club.lev, now = this.sim.now;
    if (kind === 'talk') { // подходит к Лёве: за калиткой — к проёму изнутри, на корте — на 1,2 м к нему
      const me = L.pos.clone().setX(L.pos.x - COURT2_X).setY(0), inside = Math.abs(me.x) < GATE.x && Math.abs(me.z) < COURT.len / 2 + COURT.runBack;
      const spot = inside ? me.clone().add(g.p.pos.clone().sub(me).setY(0).setLength(1.2)) : V(GATE.x - 0.75, GZ);
      spot.x = clamp(spot.x, -7.4, 7.4); spot.z = g.c.side > 0 ? clamp(spot.z, 0.8, 17.8) : clamp(spot.z, -17.8, -0.8); // своя половина
      this.sim.hold(g.p, spot, now);
    }
    this.dlg = { g, asked: {}, kind, at: L.pos.clone() };
    this.remember(g, { talks: g.mem.talks + 1 });
    this.show(kind === 'cafe' ? 'cafe' : g.mem.met ? 'hub' : 'hello');
  }
  close() {
    const d = this.dlg; if (!d) return;
    this.dlg = null; this.ui.box.hidden = true;
    if (d.g.where === 'court' && !d.g.job) this.sim.held.delete(d.g.p); // назад к игре
    if (d.kind === 'cafe' && d.g.job === 'coffee') this.leaveCafe(d.g);
  }
  // Реплика и варианты: opts — [[текст, () => следующий узел | null (закрыть)]].
  show(name) {
    const d = this.dlg, g = d.g, n = this.node(g, name, d);
    d.node = n;
    this.ui.who.textContent = g.mem.met ? g.c.name : g.c.who;
    this.ui.say.textContent = typo(n.say);
    this.ui.opts.replaceChildren(...n.opts.map(([t], i) => {
      const b = document.createElement('button'); b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`; b.lastChild.textContent = typo(t);
      b.addEventListener('click', () => this.choose(i)); return b;
    }));
    this.ui.box.hidden = false;
  }
  choose(i) {
    const d = this.dlg, o = d?.node.opts[i];
    if (!o) return;
    const next = o[1]();
    if (next && this.dlg === d) this.show(next); else if (!next && this.dlg === d) this.close();
  }
  // Последняя реплика без вариантов: висит несколько секунд (после матча, после отказа).
  say(g, text, sec = 6) {
    this.dlg = { g, asked: {}, kind: 'say', post: true, until: this.sim.now + sec };
    this.ui.who.textContent = g.mem.met ? g.c.name : g.c.who; this.ui.say.textContent = typo(text); this.ui.opts.replaceChildren(); this.ui.box.hidden = false;
  }

  // ---------- Тексты ----------
  // Алина — сдержанная, ироничная, играла в юниорах. Соня — лёгкая, смешливая, подкалывает Алину.
  node(g, name, d) {
    const A = g.c.id === 'alina', m = g.mem, mood = (k) => this.remember(g, { mood: clamp(m.mood + k, -1, 1) });
    const other = this.girls[1 - g.i].c.name;
    const jokes = ['Грунт сегодня скользкий. Я проверил собой', 'У меня подача снизу. Это не слабость, это стиль', 'Тренер сказал мне меньше думать. Я перестарался'];
    const joke = d.joke ??= pick(jokes);
    const hub = () => [['Сыграем?', () => 'play'], ['Пойдём на кофе? Терраса рядом', () => 'coffee'], [joke, () => 'joke']];
    const bye = (t) => [t, () => null];
    switch (name) {
      case 'hello': return {
        say: A ? 'Мяч не наш, если что. Мы свои не теряем.' : 'Привет! Мы не слишком громко? Это Алина так кричит на подаче.',
        opts: [['Я Лёва, играю на первом корте', () => 'meet'], [A ? 'Классный у тебя бэкхенд' : 'Красивый у тебя форхенд', () => 'praise'], bye('Я просто посмотреть')] };
      case 'meet': this.remember(g, { met: true }); mood(0.1); return {
        say: A ? 'Алина. Видела тебя на первом: подача снизу, но бегаешь хорошо.' : 'Соня! А это Алина, она делает вид, что ей не интересно.',
        opts: [['Сыграем как-нибудь?', () => 'play'], ['Может, кофе после тренировки?', () => 'coffee'], [joke, () => 'joke']] };
      case 'praise': mood(0.12); return {
        say: !m.met ? (A ? 'Спасибо. Двуручный, восемь лет ставила.' : 'Ой, спасибо! Скажи это Алине, она говорит, что я бью как на пляже.')
          : (A ? 'Ты уже говорил. Но приятно.' : 'Ещё раз, пожалуйста, Алина не расслышала!'),
        opts: m.met ? hub() : [['Я Лёва, кстати', () => 'meet'], bye('Не буду мешать')] };
      case 'joke': { const good = rnd() < (A ? 0.45 : 0.8) + 0.2 * m.mood; mood(good ? 0.15 : -0.05); d.joke = pick(jokes.filter((j) => j !== joke)); return {
        say: A ? (good ? 'Ладно, это было смешно.' : 'Смешно. Почти.') : (good ? 'Ха! Запомню, буду говорить Алине.' : 'Это была шутка? Не поняла, но мне нравится.'),
        opts: m.met ? hub() : [['Я Лёва, кстати', () => 'meet'], bye('Ладно, не мешаю')] }; }
      case 'hub': { let say;
        if (m.stood) { say = A ? 'Я сидела на террасе одна. Кофе остыл.' : 'Ты позвал меня на кофе и пропал. Я запомнила!'; this.remember(g, { stood: false }); mood(-0.1); }
        else if (m.last === 'lost') say = A ? 'Реванш пришёл просить?' : 'Ну что, отыгрываться пришёл?';
        else if (m.last === 'won') say = A ? 'Победитель вернулся. Я всё ещё злюсь.' : 'О, чемпион первого корта!';
        else if (m.coffee) say = A ? 'Привет. Кофе в тот раз был неплохой.' : 'Привет! Ты мне должен ещё один капучино.';
        else say = m.mood > 0.25 ? (A ? 'Лёва, привет. Опять мимо проходил?' : 'Лёва! Привет!') : (A ? 'А, это ты. Привет.' : 'Привет-привет.');
        return { say, opts: hub() }; }
      case 'play': {
        if (d.asked.play) return { say: A ? 'Я уже ответила.' : 'Мы же решили!', opts: hub().slice(1) };
        d.asked.play = true;
        const yes = A ? m.mood > -0.4 && rnd() < 0.8 : rnd() < 0.6 + 0.3 * m.mood;
        if (yes) return { say: A ? 'Давай. До двух геймов. Не поддавайся, я замечу.' : 'Давай! Только не смейся, если я промахнусь по мячу.',
          opts: [['Пошли на первый корт', () => { this.startMatch(g, this.game.now); return null; }], ['Давай в другой раз', () => { mood(-0.05); return 'later'; }]] };
        return { say: A ? `Не сегодня. У нас с ${other === 'Соня' ? 'Соней' : other} тренировка до конца часа.` : 'В другой раз, ладно? Сегодня у меня всё в сетку.',
          opts: d.asked.coffee ? [bye('Понял, не мешаю')] : [['Тогда кофе?', () => 'coffee'], bye('Понял, не мешаю')] }; }
      case 'coffee': {
        if (d.asked.coffee) return { say: A ? 'Я уже ответила.' : 'Мы же решили!', opts: [hub()[0], bye('Ладно')] };
        d.asked.coffee = true;
        const yes = A ? m.mood >= 0.2 || m.talks >= 3 || m.coffee > 0 : m.mood >= -0.1 && rnd() < 0.85;
        if (yes) return { say: A ? 'Ладно. Флэт уайт без сахара. Дойду до террасы после розыгрыша.' : 'Конечно! Капучино с корицей. Иду!',
          opts: [['Жду на террасе', () => { this.startCoffee(g); return null; }]] };
        mood(-0.05);
        return { say: A ? 'Я на тренировке. Давай в другой раз.' : 'Ой, сегодня не могу. В другой раз — обещаю.',
          opts: d.asked.play ? [bye('Ладно, удачи')] : [['Тогда сыграем?', () => 'play'], bye('Ладно, удачи')] }; }
      case 'later': return { say: A ? 'Как скажешь.' : 'Договорились!', opts: [bye('Пока')] };
      case 'cafe': return {
        say: A ? 'Без сахара? Отлично. Ну, рассказывай: давно играешь?' : 'С корицей! Ты запомнил. Давно играешь?',
        opts: [['С детства. Потом бросил, сейчас вернулся', () => { mood(0.1); return 'cafe2'; }], ['Второй год. Подачу пока не освоил', () => { mood(A ? 0.05 : 0.15); return 'cafe2'; }], [`А вы с ${A ? 'Соней' : 'Алиной'} давно играете?`, () => { mood(0.1); return 'cafe3'; }]] };
      case 'cafe2': return { say: A ? 'Видно. Ноги помнят, руки пока нет.' : 'Видно, что любишь. Это главное.', opts: [['Повторим как-нибудь?', () => 'cafe4'], bye('Мне пора на корт')] };
      case 'cafe3': return { say: A ? 'С университета. Она мажет, я ругаюсь, обеим нравится.' : 'С универа! Она строгая, но без неё я бы бросила.', opts: [['Повторим как-нибудь?', () => 'cafe4'], bye('Мне пора на корт')] };
      case 'cafe4': mood(0.1); return { say: A ? (m.mood > 0.4 ? 'Может быть. Если подачу поставишь.' : 'Посмотрим.') : 'Обязательно! Мне пора, Алина там одна мячи собирает.', opts: [bye('Пока')] };
    }
    return { say: '…', opts: [bye('Пока')] };
  }

  // ---------- Матч с ней на корте 1 ----------
  // Соперник уходит со сцены, она встаёт на его место (сторона −1), счёт с нуля, до двух геймов; сила чуть ниже
  // обычного соперника (0,7). После матча — всё обратно: соперник, его счёт и подача, она — на корт 2.
  startMatch(g, now) {
    const G = this.game, c = this.club;
    this.dlg = null; this.ui.box.hidden = true;
    if (c.active) c.back(now);
    const old = G.opp, lev = G.lev;
    this.match = { g, old, ai: G.ai, pts: [G.pts.get(lev), G.pts.get(old)], games: [G.games.get(lev), G.games.get(old)], levServed: G.server === lev, t0: now };
    g.job = 'match'; this.sim.hold(g.p, 'away', this.sim.now);
    this.move(g, 'world', -1, V(0, -(COURT.len / 2 + 0.8)));
    Object.assign(g.p, { free: false, seat: null, stamina: 1, mood: 0, idle: false });
    old.wrap.visible = old.racket.visible = false; old.onContact = old.onStep = old.onPlant = old.onSlide = null;
    G.opp = g.p; G.hook(g.p);
    G.pts = new Map([[lev, 0], [g.p, 0]]); G.games = new Map([[lev, 0], [g.p, 0]]);
    G.server = rnd() < 0.5 ? lev : g.p;
    G.ai = new AI(g.p, G); G.ai.skill = g.c.skill;
    this.oppName(g.c.name);
    G.resetPoint(now);
    G.hud.flash(typo(`Матч с ${g.c.id === 'alina' ? 'Алиной' : 'Соней'} до двух геймов`), true);
  }
  watchMatch(now) {
    const M = this.match, G = this.game, g = M.g;
    G.ai.skill = Math.min(G.ai.skill, g.c.skill + 0.2); // не «босс»: слабее обычного соперника
    const left = this.club.active, a = G.games.get(G.lev) ?? 0, b = G.games.get(g.p) ?? 0;
    if (!left && !(G.state === 'over' && (a >= 2 || b >= 2) && now > G.nextAt - 0.4)) return;
    this.endMatch(left ? 'left' : a > b ? 'won' : 'lost', now);
  }
  endMatch(res, now) {
    const M = this.match, G = this.game, g = M.g, old = M.old;
    this.match = null;
    g.p.onContact = g.p.onStep = g.p.onPlant = g.p.onSlide = null;
    G.opp = old; G.hook(old); G.ai = M.ai;
    G.pts = new Map([[G.lev, M.pts[0]], [old, M.pts[1]]]); G.games = new Map([[G.lev, M.games[0]], [old, M.games[1]]]);
    G.server = M.levServed ? G.lev : old;
    old.wrap.visible = old.racket.visible = true; old.place(old.home);
    this.oppName('Соперник');
    if (G.state !== 'away') G.resetPoint(now); else G.hud.score(G);
    this.home(g);
    if (res !== 'left') this.remember(g, { played: g.mem.played + 1, won: g.mem.won + (res === 'won'), lost: g.mem.lost + (res === 'lost'), last: res });
    const A = g.c.id === 'alina';
    this.say(g, res === 'won' ? (A ? 'Ладно, ты сильнее. Пока что.' : 'Нечестно, ты же каждый день тут играешь!')
      : res === 'lost' ? (A ? 'Подача снизу тебя подводит. Приходи ещё.' : 'Я выиграла? Я выиграла! Алина, ты видела?')
        : (A ? 'Сбежал? Засчитаю как победу.' : 'Эй, мы не доиграли!'));
    G.hud.flash(res === 'won' ? 'Победа' : res === 'lost' ? typo(`${g.c.name} выиграла`) : 'Матч не доигран', res === 'won');
  }
  oppName(t) { const el = document.getElementById('st-o')?.parentElement?.querySelector('small'); if (el) el.textContent = t; }
  // Назад на корт 2: у калитки изнутри, дальше сама идёт на своё место.
  home(g) {
    g.job = null; g.path = null; g.p.seat = null;
    this.move(g, 'court', g.c.side, V(GATE.x - 0.7, GZ));
    this.sim.hook(g.p);
    Object.assign(g.p, { free: true, bounds: null, ground: null });
    this.sim.held.delete(g.p);
    if (this.sim.state !== 'walk') this.sim.resetPoint(this.sim.now);
  }

  // ---------- Кофе ----------
  // Она идёт с корта 2 по дорожкам на террасу и садится у столика (MEET). Ждёт Лёву до 4 минут; не пришёл —
  // запомнит. Поговорили — встаёт и идёт обратно на корт 2.
  startCoffee(g) {
    const now = this.sim.now;
    g.job = 'coffee'; this.sim.hold(g.p, 'away', now);
    this.move(g, 'world', g.c.side, this.world(g));
    Object.assign(g.p, { free: true, idle: false, stroke: null, ground: (x, z) => (this.club.obs ? this.club.ground(x, z) : 0) });
    const [mx, , mz] = MEET.pos, f = V(Math.sin(MEET.yaw), Math.cos(MEET.yaw));
    g.path = [V(COURT2_X + GATE.x - 0.6, GZ), V(COURT2_X + GATE.x + 0.8, GZ), ...TO_TERRACE, V(mx, mz).addScaledVector(f, 0.55)];
    g.wait = null; g.back = false;
    this.say(g, g.c.id === 'alina' ? 'Иду. Не опаздывай.' : 'Бегу! Займи столик.', 3);
  }
  leaveCafe(g) {
    if (g.p.seat) g.p.seat.up = true;
    this.remember(g, { coffee: g.mem.coffee + 1 });
    g.back = true; g.path = null; g.wait = null;
  }
  // Идёт по дорожке в мире; вне кадра — втрое быстрее (никто не смотрит).
  stroll(g, dt, now) {
    const p = g.p, seen = this.fr.containsPoint(p.pos.clone().setY(1));
    if (g.back && !p.seat && !g.path) g.path = [...TO_TERRACE].reverse().concat(V(COURT2_X + GATE.x + 0.8, GZ), V(COURT2_X + GATE.x - 0.7, GZ));
    for (let k = 0; k < (seen ? 1 : 3); k++) {
      let move = new THREE.Vector3();
      if (g.path?.length) {
        while (g.path.length > 1 && p.pos.distanceTo(g.path[0].clone().setY(p.pos.y)) < 0.5) g.path.shift();
        const d = g.path[0].clone().sub(p.pos).setY(0), len = d.length();
        if (g.path.length === 1 && len < 0.15) {
          g.path = null;
          if (g.back) return this.home(g); // дошла до калитки корта 2
          const [mx, my, mz] = MEET.pos, f = V(Math.sin(MEET.yaw), Math.cos(MEET.yaw)), r = V(-Math.cos(MEET.yaw), Math.sin(MEET.yaw));
          p.seat = { at: V(mx, mz, my), from: p.pos.clone(), yaw: MEET.yaw, h: MEET.h, w: 0, feet: [-1, 1].map((s) => V(mx, mz, my).addScaledVector(f, 0.5).addScaledVector(r, s * 0.15)) };
          g.wait = now + 240;
        } else move = d.divideScalar(Math.max(len, 1e-6)).multiplyScalar(g.path.length > 1 ? 1.25 : Math.min(1.25, len * 2.5 + 0.15));
      }
      p.update(dt, now, move, null);
    }
    if (g.wait && now > g.wait && !this.dlg) { this.remember(g, { stood: true }); g.back = true; g.wait = null; if (p.seat) p.seat.up = true; } // не пришёл
  }
}
