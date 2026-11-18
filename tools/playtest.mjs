#!/usr/bin/env node
// Тестировщик «Лёвы на корте»: гоняет игру в безголовом Chromium на ускоренном времени (игра шагает по 1/120 с без
// отрисовки), пишет журнал, проверяет анатомию поз и снимает кадры. Нужен запущенный dev-сервер (npm run dev, порт 3952).
// Лёвой управляют только клавишами, как живой человек: бег — WASD (зажал, отпустил с опозданием на реакцию), удары K/J/L.
//
//   node tools/playtest.mjs match --points 30 --bot human --out test-out/match   матч: Лёвой играет бот через клавиатуру
//   node tools/playtest.mjs match --bot ai                                       Лёвой играет ИИ соперника (?auto)
//   node tools/playtest.mjs cases --out test-out/cases [--only volley,short] [--reps 6] [--frames]   сценарии
//   node tools/playtest.mjs move                                                 разгон, остановка, разворот, спринт
//   node tools/playtest.mjs touch                                                телефон: подсказка и подача кнопкой
//   node tools/playtest.mjs poses --out test-out/poses                           все удары по фазам крупно, оба игрока
//   node tools/playtest.mjs netshots --out test-out/net [--only volley,half-volley]  у сетки: кадры сзади и сбоку вокруг касания
//
// В out: summary.json (сводка), events.jsonl (журнал игры), audit.jsonl (анатомия), frames/*.png (кадры).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), cmd = argv[0] ?? 'match';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const URL = opt('url', 'http://localhost:3952'), OUT = opt('out', `test-out/${cmd}`), POINTS = +opt('points', 20), SHOTS = +opt('shots', 8);
const BOT = opt('bot', 'human'), SEED = +opt('seed', 1), HZ = +opt('hz', 120); // --hz 60 / 30 — игра шагает кадрами ноутбука
mkdirSync(join(OUT, 'frames'), { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(cmd === 'touch' || (cmd === 'fx' && argv.includes('--phone')) ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 960, height: 960 } });
page.on('pageerror', (e) => console.error('ОШИБКА СТРАНИЦЫ:', e.message));
async function load() {
  await page.goto(`${URL}/?debug&noao&nolog${BOT === 'ai' && cmd === 'match' ? '&auto' : ''}${opt('q', '')}`, { timeout: 180000 }); // загруженная машина грузит страницу дольше 30 с; --q "&rig=1" — свои параметры страницы
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.evaluate((HZ) => {
    window.__pause = true; window.__noDraw = true; window.__dt = 1 / HZ;
    for (const id of ['loader', 'start']) document.getElementById(id).style.display = 'none';
  }, HZ);
}
await load();

const shot = async (name) => { await page.screenshot({ path: join(OUT, 'frames', name + '.png') }); };
// Крупно игрок: сбоку-спереди и кисть с ракеткой.
async function closeups(name, who = 'lev') {
  await page.evaluate((who) => {
    const p = __lev.game[who], P = p.pos, s = p.side;
    __lev.shot([P.x + 2.4 * s, 1.35, P.z - 1.6 * s], [P.x, 0.95, P.z]);
  }, who);
  await shot(name + '-body');
  await page.evaluate((who) => {
    const p = __lev.game[who], h = __lev.bone('RightHand', who), s = p.side;
    __lev.shot([h[0] + 0.55 * s, h[1] + 0.25, h[2] - 0.65 * s], h);
  }, who);
  await shot(name + '-hand');
}

if (cmd === 'poses') {
  const audits = [];
  await page.evaluate(() => document.getElementById('play').click());
  for (const who of ['lev', 'opp']) for (const type of ['fh', 'bh', 'fh-top', 'bh-top', 'fh-slice', 'bh-slice', 'oh', 'vfh', 'vbh', 'vfh-lo', 'vbh-lo', 'vfh-hi', 'vbh-hi', 'vfh-half', 'vbh-half']) for (const s of [-0.45, -0.17, 0, 0.12, 0.2, 0.5, 0.7, 0.9]) { // 0.7 — возврат, 0.9 — стойка, её видно на стартовом экране
    const a = await page.evaluate(([who, type, s]) => { __lev.pose(type, s, who); return __lev.game[who].rig.audit(); }, [who, type, s]);
    audits.push({ who, type, s, ...a });
    if (s === -0.17 || s === 0 || s === 0.2) await closeups(`${who}-${type}-${s}`, who);
  }
  // Язык тела между очками: кулак, голова вниз, без сил (руки на коленях) — в пике позы.
  for (const who of ['lev', 'opp']) for (const [type, t, sta] of [['fist', 0.5, 1], ['down', 0.9, 1], ['tired', 1.5, 0.2]]) {
    const a = await page.evaluate(([who, type, t, sta]) => {
      const g = __lev.game, p = g[who], V = p.pos.constructor;
      p.place(p.home); p.idle = true; p.stamina = sta; p.gest = { k: type === 'tired' ? null : type, t0: g.now - t };
      for (let i = 0; i < 30; i++) p.update(1 / 120, g.now, new V(), g.b); // голова и поза успевают встать
      const r = p.rig.audit(); p.idle = false; p.stamina = 1; p.gest = null; return r;
    }, [who, type, t, sta]);
    audits.push({ who, type, s: 'body', ...a });
    await closeups(`${who}-body-${type}`, who);
    await page.evaluate((who) => { const p = __lev.game[who], P = p.pos, s = p.side; __lev.shot([P.x - 0.3 * s, 1.6, P.z + 4.2 * s], [P.x, 1.0, P.z]); }, who); // сзади, как в игре
    await shot(`${who}-body-${type}-back`);
  }
  // Сидя на скамейке (club.js, player.stroll): таз на высоте сиденья 0,44 м, ступни перед ней, ракетка у правой ноги.
  for (const who of ['lev', 'opp']) {
    const a = await page.evaluate((who) => {
      const g = __lev.game, p = g[who], V = p.pos.constructor, at = p.home.clone(), yaw = p.netYaw;
      const f = new V(Math.sin(yaw), 0, Math.cos(yaw)), r = new V(-Math.cos(yaw), 0, Math.sin(yaw));
      p.free = true; p.seat = { at, from: at.clone().addScaledVector(f, 0.55), yaw, h: 0.44, w: 0, feet: [-1, 1].map((s) => at.clone().addScaledVector(f, 0.5).addScaledVector(r, s * 0.15)) };
      for (let i = 0; i < 150; i++) p.update(1 / 120, g.now, new V(), g.b);
      return { ...p.rig.audit(), hips: +p.rig.b.Hips.getWorldPosition(new V()).y.toFixed(3) };
    }, who);
    audits.push({ who, type: 'sit', s: 'sit', ...a });
    await closeups(`${who}-sit`, who);
    await page.evaluate((who) => { const p = __lev.game[who]; p.seat = null; p.free = false; p.place(p.home); }, who);
  }
  writeFileSync(join(OUT, 'audit.jsonl'), audits.map((a) => JSON.stringify(a)).join('\n'));
  const bad = audits.filter((a) => a.Left.elbowBack || a.Right.elbowBack || a.Left.kneeBack || a.Right.kneeBack || (a.Right.wrist ?? 0) > 50 || (a.gripGap ?? 0) > 0.05 || (a.leftOn > 0.5 && a.Left.elbow < 25)); // левая на ракетке почти прямой рукой: плечо выкручено, локоть на коже вывернут
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ poses: audits.length, bad: bad.length, badList: bad }, null, 2));
  console.log(`позы: ${audits.length}, с нарушениями: ${bad.length}`);
  for (const b of bad) console.log(' ', b.who, b.type, b.s, JSON.stringify({ L: b.Left, R: b.Right, grip: b.gripGap }));
  await browser.close();
  process.exit(0);
}

// Телефон: подсказка подачи без пробела, подача кнопкой «Форхенд».
if (cmd === 'touch') {
  await page.evaluate(() => document.getElementById('play').click());
  const r = await page.evaluate(() => {
    const g = __lev.game, hint = document.getElementById('hint').textContent, before = g.state;
    document.getElementById('bfh').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    return { coarse: matchMedia('(pointer: coarse)').matches, hint, before, after: g.state, served: __events.some((e) => e.type === 'serve' && e.who === 'lev') };
  });
  console.log(`${r.coarse && /Удар/.test(r.hint) && r.served ? 'OK  ' : 'FAIL'} подача с телефона`, JSON.stringify(r));
  writeFileSync(join(OUT, 'touch.json'), JSON.stringify(r, null, 2));
}

// ---------- Кадры силы удара (fx): шкала стрелок, шлейф ракетки, кольцо, след мяча — игровой камерой ----------
if (cmd === 'fx') {
  await page.evaluate(() => document.getElementById('play').click());
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await page.evaluate(async () => {
    const ph = await import('/src/physics.js'), g = __lev.game, L = g.lev, O = g.opp, b = g.b, V = L.pos.constructor;
    L.place(new V(0.33, 0, 12.7)); O.place(O.home.clone()); g.ai.newPoint();
    g.state = 'rally'; g.serving = null; g.lastHitter = O; g.rally = 1; g.bounces = 0;
    const from = new V(0, 1, -12); b.pos.copy(from); b.spin = 60; b.live = true; b.bounces = 0; g.ballMesh.visible = true;
    b.vel.copy(ph.solveShot(from, new V(1.1, 0, 9.6), 22, 60));
    window.__eta = () => { const p = L.predict(b, g.now); return p ? p.t - g.now : 9; };
  });
  const down = touch ? () => page.evaluate(() => document.getElementById('bfh').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })))
    : () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' })));
  const stepUntil = (cond) => page.evaluate((c) => { const f = eval(c); for (let i = 0; i < 600 && !f(); i++) __lev.step(window.__dt); }, cond);
  await stepUntil('() => __eta() < 0.85'); await down();
  const tag = touch ? 'phone' : 'laptop';
  for (const [name, cond] of [['1-hold-0.2', '() => __lev.game.now - __lev.game.lev.stroke.tPress >= 0.2'], ['2-hold-0.45', '() => __lev.game.now - __lev.game.lev.stroke.tPress >= 0.45'],
    ['3-hold-max', '() => __lev.game.now - __lev.game.lev.stroke.tPress >= 0.72'], ['4-contact-0.05', '() => __lev.game.lev.stroke.tContact - __lev.game.now <= 0.05'],
    ['5-contact+0.04', '() => __lev.game.now - __lev.game.lev.stroke.tContact >= 0.04'], ['6-ball+0.2', '() => __lev.game.now - __lev.game.lev.stroke.tContact >= 0.2']]) {
    await stepUntil(cond); await page.evaluate(() => __lev.render()); await shot(`${tag}-${name}`);
  }
  console.log('кадры:', join(OUT, 'frames'));
  await browser.close();
  process.exit(0);
}

// ---------- Клавиатура в странице ----------
// Как живой игрок: зажал направление, отпустил, когда дошёл, с опозданием на реакцию (late, с). mv — клавиши бега,
// остальные зажатые (прицел) бег не трогает.
const IO = () => {
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const held = new Set(), mv = new Set();
  window.__io = {
    held, mv,
    hold(c, run = false) { if (run) mv.add(c); else mv.delete(c); if (!held.has(c)) { held.add(c); key(c, true); } },
    release(c) { mv.delete(c); if (held.has(c)) { held.delete(c); key(c, false); } },
    releaseAll() { for (const c of [...held]) this.release(c); },
    tap(c) { key(c, true); key(c, false); },
    // Цель tgt (точка на корте) для Лёвы: вправо D, к сетке W (−z). mayPress — можно ли зажимать новые клавиши.
    goTo(L, tgt, late = 0.1, mayPress = true) {
      const axis = (delta, v, pos, neg) => {
        const k = mv.has(pos) ? 1 : mv.has(neg) ? -1 : 0;
        if (k && delta * k < v * k * late + 0.08) this.release(k > 0 ? pos : neg);
        else if (!k && mayPress && Math.abs(delta) > 0.3 && !held.has(delta > 0 ? neg : pos)) this.hold(delta > 0 ? pos : neg, true);
      };
      axis(tgt.x - L.pos.x, L.vel.x, 'KeyD', 'KeyA');
      axis(L.pos.z - tgt.z, -L.vel.z, 'KeyW', 'KeyS');
    },
  };
};
// Параллельно правят код другие агенты: Vite перезагружает страницу посреди прогона. Тогда поднимаем заново и повторяем.
let RUNCASE = null;
async function boot(reload) {
  if (reload) await load();
  await page.evaluate(IO);
  await page.evaluate(() => document.getElementById('play').click());
  if (RUNCASE) await page.evaluate(RUNCASE);
}
const safe = async (fn) => {
  for (let k = 0; ; k++) {
    try { return await fn(); } catch (e) {
      if (k > 3 || !/destroyed|navigat|closed|__runCase|__lev/.test(e.message)) throw e;
      console.log('  страница перезагрузилась, повтор'); await boot(true);
    }
  }
};
await boot(false);

const by = (arr, f) => arr.reduce((m, e) => ((m[f(e)] = (m[f(e)] ?? 0) + 1), m), {});
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
const r2 = (v) => (v == null ? v : +v.toFixed(2));

// ---------- Движение: разгон, остановка, разворот ----------
if (cmd === 'move') {
  const m = await page.evaluate(() => {
    const g = __lev.game, L = g.lev, io = __io, V = L.pos.constructor;
    g.state = 'test'; g.b.live = false; g.ballMesh.visible = false;
    const reset = () => { io.releaseAll(); L.place(new V(-6.5, 0, 12)); __lev.step(0.3); L.place(new V(-6.5, 0, 12)); }; // слева: есть куда разогнаться вправо
    const until = (cond, max = 3) => { for (let t = 0; t < max; t += 1 / 120) { if (cond(t)) return +t.toFixed(3); __lev.step(1 / 120); } return null; };
    const out = {};
    reset(); io.hold('KeyD', true);
    out.toShuffle = until(() => L.vel.length() >= 3.06);
    reset(); io.hold('KeyD', true);
    out.sprintOnset = until(() => L.vel.length() > 3.6);
    reset(); io.hold('KeyD', true);
    out.toSprint = until(() => L.vel.length() >= 5.4);
    for (const [name, hold] of [['stopShuffle', 0.3], ['stopSprint', 1.2]]) {
      reset(); io.hold('KeyD', true); __lev.step(hold); const x0 = L.pos.x, v0 = L.vel.length(); io.release('KeyD');
      out[name] = { from: +v0.toFixed(2), t: until(() => L.vel.length() < 0.2), slide: +(L.pos.x - x0).toFixed(2) };
    }
    for (const [name, hold] of [['reverseShuffle', 0.3], ['reverseSprint', 1.2]]) {
      reset(); io.hold('KeyD', true); __lev.step(hold); io.release('KeyD'); io.hold('KeyA', true);
      out[name] = until(() => L.vel.x <= -3.0);
    }
    reset(); io.hold('KeyD', true); __lev.step(1.2); const v0 = L.vel.length(); io.hold('KeyW', true);
    let vmin = 9; until(() => { vmin = Math.min(vmin, L.vel.length()); return false; }, 0.5);
    out.addDiagonal = { from: +v0.toFixed(2), min: +vmin.toFixed(2), after: +L.vel.length().toFixed(2) };
    reset(); const x0 = L.pos.x; io.hold('KeyD', true); __lev.step(0.08); io.release('KeyD'); __lev.step(0.6);
    out.tap80ms = +(L.pos.x - x0).toFixed(2);
    io.releaseAll();
    return out;
  });
  console.log(JSON.stringify(m, null, 2));
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(m, null, 2));
  await browser.close();
  process.exit(0);
}

// ---------- Сценарии ----------
// Каждый кейс: где стоит Лёва, как летит мяч (from → to со скоростью и вращением или готовая скорость vel), сценарий
// ввода script(t, io, r) каждый кадр (r — случайные числа повтора) и проверка ok(рез). io: hold/release/tap, goTo(цель),
// once(имя, fn), eta() — сколько до мяча в плоскости удара, plan() — где встать (как у ИИ), stand(тип).
const STAND = `io.goTo(io.plan()?.stand ?? io.L.pos, r[1] * 0.15 + 0.05, !io.L.stroke)`;
const CASES = [
  { name: 'wide-fh', what: 'Широкий форхенд: бежит вправо 3,5 м, жмёт K на бегу; чётные повторы отпускают D сами, нечётные держат до конца',
    lev: [0, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => { if (t < 0.25) return; if (io.rep % 2) { if (!io.L.stroke?.contacted) io.hold('KeyD', true); } else ${STAND};
      if (io.eta() < 0.55 + r[2] * 0.3) io.once('press', () => io.tap('KeyK'));
      if (io.rep % 3 === 1 && io.eta() < 0.25) io.hold('KeyA'); }`,
    ok: (x) => x.hit && !x.body },
  { name: 'wide-bh', what: 'Широкий бэкхенд: зеркально влево, J',
    lev: [0, 12.7], from: [1, 1, -12], to: [-3.9, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => { if (t < 0.25) return; if (io.rep % 2) { if (!io.L.stroke?.contacted) io.hold('KeyA', true); } else ${STAND};
      if (io.eta() < 0.55 + r[2] * 0.3) io.once('press', () => io.tap('KeyJ'));
      if (io.rep % 3 === 1 && io.eta() < 0.25) io.hold('KeyD'); }`,
    ok: (x) => x.hit && !x.body },
  { name: 'body', what: 'Мяч в корпус: повторы 0–3 стоят и жмут K или J — отбил (J, зажатый бэкхенд) или честно проиграл очко (мяч в теле у стойки); 4,5 — шаг в сторону и K — отбивает',
    lev: [0, 12.7], from: [0, 1, -12], to: [0, 9.0], speed: 22, spin: 60,
    script: `(t, io, r) => { if (io.rep >= 4 && t > 0.3) ${STAND};
      if (io.eta() < 0.5) io.once('press', () => io.tap(io.rep >= 4 || io.rep < 2 ? 'KeyK' : 'KeyJ')); }`,
    ok: (x) => (x.rep >= 4 ? x.hit : x.hit || (/^opp/.test(x.point ?? '') && (!x.body || x.bodyAxis < 0.3))) },
  { name: 'short', what: 'Короткий мяч: бежит вперёд от задней линии (W держит до удара), жмёт K на бегу',
    lev: [0, 12.7], from: [0, 1, -12], to: [0.8, 4.8], speed: 15, spin: 200,
    script: `(t, io, r) => { if (t < 0.25) return; const p = io.plan(); if (!p) return; const s = p.stand;
      if (io.rep % 2) { if (!io.L.stroke?.contacted) { io.hold('KeyW', true); if (Math.abs(s.x - io.L.pos.x) > 0.3) io.hold(s.x > io.L.pos.x ? 'KeyD' : 'KeyA', true); else io.release('KeyD'), io.release('KeyA'); } }
      else ${STAND};
      if (p.t - io.now < 0.5 + r[2] * 0.3) io.once('press', () => io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit && !x.body },
  { name: 'drop', what: 'Укороченный соперника: рывок с задней линии к сетке',
    lev: [0, 12.7], from: [0, 1, -11], to: [-1, 2.6], speed: 12, spin: -170,
    script: `(t, io, r) => { if (t < 0.25) return; const p = io.plan(); if (!p) { io.hold('KeyW', true); return; }
      io.goTo(p.stand, 0.08, !io.L.stroke);
      if (p.t - io.now < 0.45 + r[2] * 0.3) io.once('press', () => io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'lob-smash', what: 'Свеча через сетевика: пятится (S) под мяч и жмёт K — должен выйти смэш',
    lev: [0.3, 4], from: [0, 0.8, -11.5], vel: [0.3, 9.2, 12.8], spin: 80,
    script: `(t, io, r) => { if (t < 0.25) return; const z = io.descend(2.5); if (z == null) return;
      io.goTo(new io.V(io.L.pos.x, 0, z + 0.35), 0.08, !io.L.stroke);
      if (io.eta() < 0.45 + r[2] * 0.2) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit && x.stroke === 'oh' },
  { name: 'volley', what: 'Воллей у сетки: мяч с лёта на форхенд (чётные) и бэкхенд (нечётные), стоит',
    lev: [0, 4.2], from: [-0.5, 1.0, -11.5], to: [1.3, 8.0], speed: 24, spin: 50, flip: true,
    script: `(t, io, r) => { if (io.eta() < 0.3 + r[2] * 0.3) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit && /^v/.test(x.stroke ?? '') },
  { name: 'high-top', what: 'Высокий кручёный отскок: чётные стоят и бьют высоко, нечётные отходят назад (S)',
    lev: [0, 12.7], from: [0, 1, -12], vel: [0.9, 9, 19], spin: 450,
    script: `(t, io, r) => { if (io.rep % 2 && t > 0.3 && t < 0.9) io.hold('KeyS', true); if (t >= 0.9) io.release('KeyS');
      if (io.eta() < 0.4 + r[2] * 0.3) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'low-slice', what: 'Низкий резаный: стелется после отскока, стоит и бьёт',
    lev: [0, 12.7], from: [0, 0.9, -12], to: [1.0, 10.4], speed: 21, spin: -260,
    script: `(t, io, r) => { if (t > 0.3) ${STAND}; if (io.eta() < 0.4 + r[2] * 0.3) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'run-fh', what: 'Форхенд на бегу: держит D всё время, жмёт K поздно (за 0,25–0,35 с) на полной скорости',
    lev: [-3.5, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => { if (t > 0.2 && !io.L.stroke?.contacted) io.hold('KeyD', true); if (io.L.stroke?.contacted) io.release('KeyD');
      if (io.eta() < 0.25 + r[2] * 0.1) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit && !x.body },
  { name: 'late', what: 'Нажал поздно: за 0,12–0,22 с до мяча, стоит на месте',
    lev: [0, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => { if (t > 0.3) ${STAND}; if (io.eta() < 0.12 + r[2] * 0.1) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'early', what: 'Нажал рано: за 1,0–1,4 с до мяча, потом подходит клавишами',
    lev: [-0.8, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 19, spin: 60,
    script: `(t, io, r) => { if (io.eta() < 1.0 + r[2] * 0.4) io.once('press', () => io.tap('KeyK')); if (t > 0.3) io.goTo(io.plan()?.stand ?? io.L.pos, 0.1, true); }`,
    ok: (x) => x.hit },
  { name: 'switch', what: 'Смена стороны: K за 0,7 с, мяч уходит под бэкхенд, J за 0,35 с',
    lev: [0, 12.7], from: [1, 1, -12], to: [-0.7, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => { if (io.eta() < 0.7) io.once('k', () => io.tap('KeyK')); if (io.eta() < 0.3 + r[2] * 0.1) io.once('j', () => io.tap('KeyJ')); }`,
    ok: (x) => x.hit && /bh/.test(x.stroke ?? '') },
  { name: 'aim-still', what: 'Прицел в замахе: стоит в точке, K, затем A или D за 0,3 с и держит после удара — не сходит с места ни в замахе, ни сразу после (держит дольше 0,3 с — побежит)',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => {
      if (io.eta() < 0.55) io.once('press', () => io.tap('KeyK'));
      if (io.eta() < 0.3) io.hold(io.rep % 2 ? 'KeyD' : 'KeyA'); }`,
    ok: (x) => x.hit && x.drift < 0.3 && x.after < 0.3 && (x.shotX ?? 0) * (x.rep % 2 ? 1 : -1) > 1 },
  { name: 'lunge', what: 'Выпад к дальнему мячу: чётные стоят в 55 см от точки (выпад), нечётные в точке; после удара сразу A к центру. Выпад должен заносить и тормозить возврат',
    lev: [3.1, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60, dur: 3,
    script: `(t, io, r) => { if (t === 0 && io.rep % 2) io.L.place(new io.V(3.64, 0, 12.7));
      if (io.eta() < 0.5) io.once('press', () => io.tap('KeyK'));
      if (io.L.stroke?.contacted) io.hold('KeyA', true); }`,
    ok: (x) => x.hit && (x.rep % 2 ? x.carry < 0.1 : x.carry > 0.15) },
  { name: 'net-rush', what: 'Выход к сетке: из-за линии подачи бежит вперёд (W держит до удара), K за 0,7–0,9 с — встаёт там, где мяч на удобной высоте',
    lev: [0, 8.5], from: [-0.5, 1.0, -11.5], to: [1.0, 10.5], speed: 20, spin: 40,
    script: `(t, io, r) => { if (t > 0.3 && !io.L.stroke?.contacted) io.hold('KeyW', true); if (io.eta() < 0.7 + r[2] * 0.2) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit && x.ballY > 0.4 },
  { name: 'wide-volley', what: 'Широкий воллей: у сетки стоит, мяч в ~1,2 м сбоку — дотягивается выпадом',
    lev: [0, 4.2], from: [-0.5, 1.0, -11.5], to: [1.9, 8.0], speed: 24, spin: 50, flip: true,
    script: `(t, io, r) => { if (io.eta() < 0.45) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'wider-volley', what: 'Очень широкий воллей: мяч в ~1,7 м сбоку у сетки — скрестный шаг и выпад',
    lev: [0, 4.2], from: [-0.5, 1.0, -11.5], to: [2.5, 8.0], speed: 24, spin: 50, flip: true,
    script: `(t, io, r) => { if (io.eta() < 0.45) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'volley-body', what: 'Воллей в корпус: мяч в грудь у сетки, K или J — блок перед грудью или уход в сторону, мяч не в тело',
    lev: [0, 4.2], from: [-0.5, 1.0, -11.5], to: [0.1, 8.0], speed: 24, spin: 50,
    script: `(t, io, r) => { if (io.eta() < 0.35 + r[2] * 0.2) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit && !x.body },
  { name: 'volley-low', what: 'Низкий воллей: мяч ниже колена у сетки — глубоко в коленях, струны открыты',
    lev: [0, 4.0], from: [-0.5, 0.7, -11.5], to: [1.0, 4.0], speed: 16, spin: 300, flip: true,
    script: `(t, io, r) => { if (io.eta() < 0.3 + r[2] * 0.3) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit && /^v/.test(x.stroke ?? '') },
  { name: 'half-volley', what: 'Полулёт: мяч отскакивает у ног у сетки — короткий подъём сразу после отскока',
    lev: [0, 3.95], from: [-0.5, 1.0, -11.5], to: [1.0, 3.4], speed: 18, spin: 120, flip: true,
    script: `(t, io, r) => { if (io.eta() < 0.3 + r[2] * 0.3) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit },
  { name: 'volley-high', what: 'Высокий воллей: мяч выше плеча у сетки — атакующий удар сверху вниз',
    lev: [0, 4.2], from: [-0.5, 1.0, -11.5], to: [1.2, 10.5], speed: 24, spin: 0, flip: true,
    script: `(t, io, r) => { if (io.eta() < 0.3 + r[2] * 0.3) io.once('press', () => io.tap(io.rep % 2 ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit && /^v/.test(x.stroke ?? '') },
  { name: 'spam', what: 'Жмёт K пять раз подряд (каждые 0,08 с): один удар, попадает',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60,
    script: `(t, io, r) => { const e = io.eta(); for (let k = 0; k < 5; k++) if (e < 0.75 - k * 0.08) io.once('k' + k, () => io.tap('KeyK')); }`,
    ok: (x) => x.hit && x.presses.split(' ').length === 5 },
  { name: 'short-early', what: 'Короткий, нажал рано: K сразу, как мяч перелетел сетку (ещё не достать), и бежит вперёд — удар ждёт, пока добежит',
    lev: [0, 12.7], from: [0, 1, -12], to: [0.8, 4.8], speed: 15, spin: 200,
    script: `(t, io, r) => { if (t > 0.25 && !io.L.stroke?.contacted) io.hold('KeyW', true); if (io.b.pos.z > 0.5) io.once('press', () => io.tap('KeyK')); }`,
    ok: (x) => x.hit },
  // ---------- Сила, угол, сетка, свечи (статистика по многим повторам: --only power-still,normal-still … --reps 20) ----------
  { name: 'normal-still', stat: true, what: 'Обычный удар с места в угол (D+W), K нажал и отпустил',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 6,
    script: `(t, io) => { if (io.eta() < 0.6) io.once('k', () => io.tap('KeyK')); if (io.eta() < 0.3) { io.hold('KeyD'); io.hold('KeyW'); } if (io.L.stroke?.contacted) io.once('r', () => { io.release('KeyD'); io.release('KeyW'); }); }`,
    ok: (x) => x.levIn[0] === true },
  { name: 'power-still', stat: true, what: 'Сильный удар с места в угол (D+W): K держит 0,85 с до касания',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 6,
    script: `(t, io) => { if (io.eta() < 0.85) io.once('k', () => io.hold('KeyK')); if (io.eta() < 0.3) { io.hold('KeyD'); io.hold('KeyW'); } if (io.L.stroke?.contacted) io.once('r', () => { io.release('KeyK'); io.release('KeyD'); io.release('KeyW'); }); }`,
    ok: (x) => x.levIn[0] === true },
  { name: 'power-run', stat: true, what: 'Сильный на бегу: догоняет широкий мяч, K держит, тело ещё едет в момент удара',
    lev: [-4.15, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60, dur: 6,
    script: `(t, io) => { if (t > 0.15 && !io.L.stroke?.contacted) io.hold('KeyD', true); if (io.eta() < 0.75) io.once('k', () => io.hold('KeyK')); if (io.L.stroke?.contacted) io.once('r', () => { io.release('KeyK'); io.release('KeyD'); }); }`,
    ok: (x) => x.levIn[0] === true },
  { name: 'early-release', stat: true, what: 'Отпустил рано: K нажал за 0,85 с и отпустил через 0,08 с — обычный удар',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 3,
    script: `(t, io) => { if (io.eta() < 0.85) io.once('k', () => { io.hold('KeyK'); io.at = t; }); if (io.at != null && t > io.at + 0.08) io.release('KeyK'); }`,
    ok: (x) => (x.levShots[0]?.power ?? 1) < 0.05 },
  { name: 'angle-top', stat: true, what: 'Острый угол кручёным: Shift+K, в замахе A+S — мяч в корт у линии подачи, соперника выносит за боковую',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 4,
    script: `(t, io) => { if (io.eta() < 0.6) io.once('k', () => { io.hold('ShiftLeft'); io.tap('KeyK'); }); if (io.eta() < 0.3) { io.hold('KeyA'); io.hold('KeyS'); } if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); }`,
    ok: (x) => x.levIn[0] === true },
  { name: 'angle-flat', stat: true, what: 'Острый угол плоским (без Shift): рискованнее',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 4,
    script: `(t, io) => { if (io.eta() < 0.6) io.once('k', () => io.tap('KeyK')); if (io.eta() < 0.3) { io.hold('KeyA'); io.hold('KeyS'); } if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); }`,
    ok: (x) => x.levIn[0] === true },
  { name: 'angle-open-power', stat: true, what: 'Острый угол кручёным, потом сильный (держит K) в открытый корт: виннер',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 7,
    script: `(t, io, r) => { const g = io.g, O = g.opp;
      if (g.rally < 3) { if (io.eta() < 0.6) io.once('k', () => { io.hold('ShiftLeft'); io.tap('KeyK'); }); if (io.eta() < 0.3) { io.hold('KeyA'); io.hold('KeyS'); } if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); return; }
      if (g.lastHitter !== O) return; const p = io.plan(); if (!p) return; if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.08, true);
      if (p.t - io.now < 0.8) io.once('k2', () => { for (const c of [...io.mv]) io.release(c); io.hold(p.type === 'bh' ? 'KeyJ' : 'KeyK'); });
      if (p.t - io.now < 0.25) io.once('a2', () => { io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD'); io.hold('KeyW'); }); }`,
    ok: (x) => x.levWon },
  { name: 'angle-open-normal', stat: true, what: 'То же, но второй удар обычный (K нажал и отпустил)',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 7,
    script: `(t, io, r) => { const g = io.g, O = g.opp;
      if (g.rally < 3) { if (io.eta() < 0.6) io.once('k', () => { io.hold('ShiftLeft'); io.tap('KeyK'); }); if (io.eta() < 0.3) { io.hold('KeyA'); io.hold('KeyS'); } if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); return; }
      if (g.lastHitter !== O) return; const p = io.plan(); if (!p) return; if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.08, true);
      if (p.t - io.now < 0.6) io.once('k2', () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); });
      if (p.t - io.now < 0.25) io.once('a2', () => { io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD'); io.hold('KeyW'); }); }`,
    ok: (x) => x.levWon },
  { name: 'pass', stat: true, what: 'Соперник у сетки: Лёва обводит сильным (держит K), чётные — по линии (D), нечётные — накрест (A)',
    lev: [0.33, 12.7], opp: [0, -3.4], oppNet: true, from: [0, 1, -3.5], to: [1.1, 9.6], speed: 21, spin: 0, dur: 5,
    script: `(t, io) => { const g = io.g, O = g.opp;
      if (g.lastHitter === O && g.rally >= 3 && io.b.live) { const p = io.planV(); if (p) { if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.08, true); if (p.t - io.now < 0.6) io.once('k' + g.rally, () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); }); if (p.t - io.now < 0.25) io.once('a' + g.rally, () => io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD')); } return; }
      if (io.eta() < 0.8) io.once('k', () => io.hold('KeyK')); if (io.eta() < 0.3) io.hold(io.rep % 2 ? 'KeyA' : 'KeyD'); if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); }`,
    ok: (x) => x.levWon },
  { name: 'lob-over', stat: true, what: 'Соперник у сетки: Лёва свечой (L+W) через него — смэш соперника или мяч над ним (догоняет после отскока или проход)',
    lev: [0.33, 12.7], opp: [0, -3.4], oppNet: true, from: [0, 1, -3.5], to: [1.1, 9.6], speed: 21, spin: 0, dur: 6,
    script: `(t, io) => { const g = io.g, O = g.opp;
      if (g.lastHitter === O && g.rally >= 3 && io.b.live) { const p = io.planV(); if (p) { if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.08, true); if (p.t - io.now < 0.6) io.once('k' + g.rally, () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); }); if (p.t - io.now < 0.25) io.once('a' + g.rally, () => io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD')); } return; }
      if (io.eta() < 0.6) io.once('k', () => io.tap('KeyL')); if (io.eta() < 0.3) io.hold('KeyW'); if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); }`,
    ok: (x) => x.levWon },
  { name: 'opp-approach', stat: true, what: 'Лёва бьёт коротко (S): соперник атакует и выходит к сетке, следующий мяч — с лёта',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 8,
    script: `(t, io, r) => { const g = io.g, O = g.opp;
      if (g.rally < 3) { if (io.eta() < 0.6) io.once('k', () => io.tap('KeyK')); if (io.eta() < 0.3) io.hold('KeyS'); if (io.L.stroke?.contacted) io.once('r', () => io.releaseAll()); return; }
      if (g.lastHitter !== O) return; const p = io.plan(); if (!p) return; if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.08, true);
      if (p.t - io.now < 0.6) io.once('k2', () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); }); }`,
    ok: (x) => x.approach },
  // Лёва у сетки (z 4.5), соперник отвечает на его подход: свеча, если есть время, иначе обводка.
  { name: 'lev-net', stat: true, what: 'Лёва у сетки после подхода в угол: соперник обводит или свечой; Лёва с лёта, смэш, за глубокой свечой отходит',
    lev: [0.4, 4.6], opp: [0, -11.3], levHit: true, from: [0.6, 1.0, 9.5], to: [2.6, -9.6], speed: 21, spin: 120, dur: 7,
    script: `(t, io, r) => { const g = io.g, O = g.opp; if (g.lastHitter !== O || !io.b.live) return;
      const p = io.planV(); if (!p) { io.hold('KeyS', true); return; } io.release('KeyS');
      if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.06, true);
      if (p.t - io.now < 0.5) io.once('k' + g.rally, () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); });
      if (p.t - io.now < 0.25) io.once('a' + g.rally, () => io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD')); }`,
    ok: (x) => x.levWon },
  { name: 'lev-net-mid', stat: true, what: 'Лёва у сетки, подход глубоко в угол (средний по качеству)',
    lev: [0.4, 4.6], opp: [0, -11.3], levHit: true, from: [0.6, 1.0, 9.5], to: [3.3, -10.3], speed: 24, spin: 150, dur: 7,
    script: `(t, io, r) => { const g = io.g, O = g.opp; if (g.lastHitter !== O || !io.b.live) return;
      const p = io.planV(); if (!p) { io.hold('KeyS', true); return; } io.release('KeyS');
      if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.06, true);
      if (p.t - io.now < 0.5) io.once('k' + g.rally, () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); });
      if (p.t - io.now < 0.25) io.once('a' + g.rally, () => io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD')); }`,
    ok: (x) => x.levWon },
  { name: 'lev-net-wide', stat: true, what: 'Лёва у сетки, подход очень широкий: соперник растянут — свеча короче, Лёва смэширует',
    lev: [0.4, 4.6], opp: [0, -11.3], levHit: true, from: [0.6, 1.0, 9.5], to: [3.9, -7.5], speed: 22, spin: 150, dur: 7,
    script: `(t, io, r) => { const g = io.g, O = g.opp; if (g.lastHitter !== O || !io.b.live) return;
      const p = io.planV(); if (!p) { io.hold('KeyS', true); return; } io.release('KeyS');
      if (!io.L.stroke || io.L.stroke.contacted) io.goTo(p.stand, 0.06, true);
      if (p.t - io.now < 0.5) io.once('k' + g.rally, () => { for (const c of [...io.mv]) io.release(c); io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK'); });
      if (p.t - io.now < 0.25) io.once('a' + g.rally, () => io.hold(O.pos.x > 0 ? 'KeyA' : 'KeyD')); }`,
    ok: (x) => x.levWon },
  // Телефон (команда touch): джойстик пальцем по левой половине экрана, кнопка «Форхенд».
  { name: 'stick-aim', touch: true, what: 'Телефон: стоит в точке, «Форхенд», в замахе джойстик влево — прицел, а не шаг; держит после удара — не уходит',
    lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60,
    script: `(t, io) => { if (io.eta() < 0.55) io.once('press', () => io.btn('bfh')); if (io.eta() < 0.3) io.once('stick', () => io.stick(-1, 0)); }`,
    ok: (x) => x.hit && x.drift < 0.1 && x.after < 0.1 && x.shotX < -1 },
  { name: 'stick-run', touch: true, what: 'Телефон: джойстик вправо к широкому мячу, «Форхенд» на бегу, джойстик не отпускает — встаёт у мяча',
    lev: [0, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60,
    script: `(t, io) => { if (t > 0.25) io.once('stick', () => io.stick(1, 0)); if (io.eta() < 0.7) io.once('press', () => io.btn('bfh')); }`,
    ok: (x) => x.hit },
  { name: 'serve', what: 'Подача Лёвы пробелом: мяч в корт', serve: 'lev', script: `(t, io) => { if (t > 0.3) io.once('s', () => io.tap('Space')); }`, dur: 2.5,
    ok: (x) => x.serveIn },
  { name: 'return', what: 'Приём подачи соперника: бот встаёт и бьёт', serve: 'opp', lev: [0, 12.7], dur: 4,
    script: `(t, io, r) => { if (!io.g.b.live || io.g.lastHitter !== io.g.opp) return; ${STAND}; const p = io.plan(); if (p && p.t - io.now < 0.45 + r[2] * 0.3) io.once('press', () => io.tap(p.type === 'bh' ? 'KeyJ' : 'KeyK')); }`,
    ok: (x) => x.hit || /Аут|Сетка/.test(x.point ?? '') }, // подача соперника в аут — не вина Лёвы
  { name: 'opp-drop', what: 'Соперник догоняет укороченный Лёвы: Лёва жмёт L с задней линии',
    lev: [0, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 5,
    script: `(t, io, r) => { if (t > 0.3 && !io.L.stroke) ${STAND}; if (io.eta() < 0.5) io.once('press', () => { for (const c of [...io.mv]) io.release(c); io.tap('KeyL'); }); }`,
    ok: (x) => x.hit },
];

if (cmd === 'cases' || cmd === 'touch' || cmd === 'netshots') {
  RUNCASE = () => {
    window.__runCase = async (c, rep, seed) => {
      const ph = await import('/src/physics.js');
      const g = __lev.game, L = g.lev, O = g.opp, b = g.b, V = L.pos.constructor, io = __io;
      let s = seed * 7919 + rep * 104729 + 13; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const r = Array.from({ length: 6 }, rnd);
      io.releaseAll();
      for (const p of [L, O]) p.stroke = null;
      g.ai.planned = null; g.ai.reactAt = 0; g.landing = null;
      L.place(new V(...(c.lev ? [c.lev[0], 0, c.lev[1]] : [0, 0, 12.7]))); O.place(c.opp ? new V(c.opp[0], 0, c.opp[1]) : O.home.clone());
      g.ai.newPoint(); g.ai.skill = c.skill ?? 0.7; g.ai.net = g.ai.netTried = !!c.oppNet; g.ai.ran = 0; g.ai.slack = 0.5;
      __lev.step(0.05, { x: 0, y: 0 });
      if (c.serve) { g.server = c.serve === 'lev' ? L : O; g.resetPoint(g.now); if (c.serve === 'opp') g.serveAt = g.now + 0.3; }
      else {
        const from = new V(...c.from);
        g.state = 'rally'; g.serving = null; g.lastHitter = c.levHit ? L : O; g.rally = 1; g.bounces = 0;
        b.pos.copy(from); b.spin = c.spin; b.live = true; b.bounces = 0; g.ballMesh.visible = true;
        b.vel.copy(c.vel ? new V(...c.vel) : ph.solveShot(from, new V(c.to[0], 0, c.to[1]), c.speed, c.spin));
        if (c.flip && rep % 2) { b.pos.x *= -1; b.vel.x *= -1; } // зеркально: на другую сторону
      }
      const ev = window.__events, e0 = ev.length, t0 = g.now, done = new Set();
      let feet = null, plan = null, planAt = -1, pressPos = null, contactPos = null, contactT = null, after = null, vmax = 0, vAtContact = null, carry = 0, back = null, homeDir = null;
      const cx = {
        g, L, b, V, rep, mv: io.mv, get now() { return g.now; },
        hold: (k, run) => io.hold(k, run), release: (k) => io.release(k), tap: (k) => io.tap(k), releaseAll: () => io.releaseAll(),
        goTo: (tgt, late, may) => io.goTo(L, tgt, late, may),
        once: (n, fn) => { if (!done.has(n)) { done.add(n); fn(); } },
        eta: () => { const p = b.live && g.lastHitter !== L ? L.predict(b, g.now) : null; return p ? p.t - g.now : Infinity; },
        planV: () => (b.live && g.lastHitter !== L ? L.plan(b, g.now, 0, 0.35, true) ?? L.plan(b, g.now, 0, 0.25) : null),
        plan: () => { if (g.now - planAt > 0.1) { planAt = g.now; plan = b.live && g.lastHitter !== L ? L.plan(b, g.now, 0, 0.5) : null; if (plan?.out) plan = null; } return plan; },
        // Где мяч до отскока опустится до высоты h (для смэша): z на корте.
        // Палец на экране: джойстик (x, y от −1 до 1) и кнопки удара.
        stick: (x, y) => { const c = document.getElementById('c'), P = (t, cx, cy) => { try { c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true })); } catch {} }; P('pointerdown', 100, 600); P('pointermove', 100 + 50 * x, 600 - 50 * y); },
        btn: (id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })),
        descend: (h) => { const c = ph.copyBall(b); for (let i = 0; i < 400; i++) { ph.step(c, 1 / 120); if (c.vel.y < 0 && c.pos.y <= h) return c.pos.z; if (c.pos.y < 0.1) return null; } return null; },
      };
      const script = eval(c.script);
      const dur = c.stopAt ?? c.dur ?? 4; // stopAt — остановиться в этот момент (кадры netshots)
      for (let i = 0; i < dur / window.__dt; i++) {
        script(g.now - t0, cx, r);
        __lev.step(window.__dt);
        if (L.stroke && !pressPos) pressPos = L.pos.clone();
        if (pressPos && !contactPos) vmax = Math.max(vmax, L.vel.length());
        const c2 = ev.slice(e0).find((e) => e.type === 'contact' && e.who === 'lev');
        if (c2 && !contactPos) { feet = ['Left', 'Right'].map((k) => { const d = L.feet[k].pos.clone().sub(L.pos); return [+d.dot(L.right).toFixed(2), +d.dot(L.fwd).toFixed(2)]; }); contactPos = L.pos.clone(); contactT = g.now; vAtContact = L.vel.length(); homeDir = L.home.clone().sub(contactPos).setY(0).normalize(); }
        if (contactT && g.now - contactT < 0.5) carry = Math.max(carry, -L.pos.clone().sub(contactPos).dot(homeDir)); // занос после удара — прочь от центра
        if (contactT && back == null && L.vel.dot(homeDir) >= 3) back = +(g.now - contactT).toFixed(2); // когда побежал обратно на 3 м/с
        if (contactT && after == null && g.now - contactT >= 0.25) after = L.pos.distanceTo(contactPos); // сразу после удара не уходит
        if (ev.slice(e0).some((e) => e.type === 'point') && (!contactT || g.now - contactT > 0.7)) break;
      }
      io.releaseAll(); document.getElementById('c').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }));
      const E = ev.slice(e0), con = E.find((e) => e.type === 'contact' && e.who === 'lev'), body = E.find((e) => e.type === 'body' && (!con?.hit || e.t <= con.t + 0.05)); // мяч в тело до своего удара (или после промаха); ответ соперника не в счёт
      const shotE = E.find((e) => e.type === 'shot' && e.who !== 'opp'), pt = E.find((e) => e.type === 'point');
      const bIn = E.filter((e) => e.type === 'bounce');
      if (c.stopAt != null) return { tC: contactT == null ? null : contactT - t0 };
      const res = { rep, tC: contactT == null ? null : contactT - t0, feet, hit: !!con?.hit, d: con?.d ?? null, stroke: con?.stroke ?? null, side: con?.side, high: con?.high, deep: con?.deep, ballY: con?.ballY, lead: con?.lead,
        speedAtContact: con?.speed ?? null, vmax: +vmax.toFixed(2),
        drift: pressPos && contactPos ? +pressPos.distanceTo(contactPos).toFixed(2) : null, carry: +carry.toFixed(2), back, lunge: con?.lunge ?? null, after: after == null ? null : +after.toFixed(2),
        body: body ? body.part : null, bodyAxis: body?.axis ?? null, bodyLunge: body?.lunge ?? null, bodySwung: body?.swung ?? null,
        shotX: shotE?.target?.[0] ?? null, point: pt ? `${pt.winner}: ${pt.why}` : null,
        oppHit: E.some((e) => e.type === 'contact' && e.who === 'opp' && e.hit),
        serveIn: c.serve === 'lev' ? (bIn[0]?.in ?? false) : null,
        levWon: pt?.winner === 'lev', winner: pt?.winner === 'lev' && pt?.why === 'Виннер',
        levShots: E.filter((e) => e.type === 'shot' && e.who !== 'opp').map((e) => ({ kind: e.kind, power: e.power, speed: e.speed, lob: e.lob })),
        levIn: E.filter((e) => e.type === 'bounce' && e.by === 'lev').map((e) => e.in),
        aiShots: E.filter((e) => e.type === 'shot' && e.who === 'opp').map((e) => e.kind),
        aiStrokes: E.filter((e) => e.type === 'contact' && e.who === 'opp').map((e) => e.stroke + (e.hit ? '' : '-мимо')),
        faults: E.filter((e) => e.type === 'fault').length, approach: E.some((e) => e.type === 'approach'), oppWide: Math.max(0, ...E.filter((e) => e.type === 'contact' && e.who === 'opp').map((e) => Math.abs(e.pos[0]))), presses: E.filter((e) => e.type === 'press').map((e) => `${e.key}:${e.as}@${e.lead}`).join(' ') };
      g.state = 'test'; b.live = false;
      return res;
    };
  };
  await page.evaluate(RUNCASE);
  // Кадры игры у сетки: каждый кейс прогоняется до касания и заново до моментов вокруг него, снимки сзади (игровой
  // ракурс) и сбоку крупно. node tools/playtest.mjs netshots --out test-out/net [--only volley,half-volley]
  if (cmd === 'netshots') {
    const names = opt('only', 'volley,wide-volley,wider-volley,volley-body,volley-low,half-volley,volley-high,lob-smash').split(',');
    const run = (c, rep) => safe(() => page.evaluate(([c, rep, seed]) => __runCase(c, rep, seed), [{ ...c, ok: undefined }, rep, SEED]));
    for (const name of names) for (const rep of [0, 1]) {
      const c = CASES.find((k) => k.name === name), x = await run(c, rep);
      console.log(name, rep, x.stroke, x.hit ? 'попал' : 'мимо', 'd', x.d, 'tC', x.tC?.toFixed(2));
      if (x.tC == null) continue;
      for (const off of [-0.6, -0.3, -0.12, 0, 0.2, 0.6]) {
        await run({ ...c, stopAt: x.tC + off }, rep);
        for (const view of ['back', 'side']) {
          await page.evaluate(([view, sx]) => { const P = __lev.game.lev.pos; __lev.shot(view === 'back' ? [P.x, 1.6, P.z + 3.4] : [P.x + 3.2 * sx, 1.15, P.z - 0.6], [P.x, 0.8, P.z - 0.3]); }, [view, rep % 2 ? -1 : 1]);
          await shot(`${name}-${rep}-${view}-${off}`);
        }
      }
    }
    await browser.close();
    process.exit(0);
  }
  const only = opt('only', null)?.split(','), reps = +opt('reps', 6), frames = argv.includes('--frames');
  const rows = [];
  for (const c of CASES.filter((c) => (!only || only.includes(c.name)) && !!c.touch === (cmd === 'touch'))) {
    const res = [];
    for (let rep = 0; rep < reps; rep++) {
      const x = await safe(() => page.evaluate(([c, rep, seed]) => __runCase(c, rep, seed), [{ ...c, ok: undefined }, rep, SEED]));
      x.ok = c.ok(x);
      res.push(x);
      if (frames && rep === 0) { await page.evaluate(() => __lev.render()); await shot(`${c.name}-end`); }
    }
    const pass = res.filter((x) => x.ok).length;
    const row = { name: c.name, what: c.what, pass, reps, hit: res.filter((x) => x.hit).length, body: res.filter((x) => x.body).length,
      dMed: med(res.filter((x) => x.d != null).map((x) => x.d)), driftMed: med(res.filter((x) => x.drift != null).map((x) => x.drift)),
      vContactMed: med(res.filter((x) => x.speedAtContact != null).map((x) => x.speedAtContact)), runs: res };
    rows.push(row);
    if (c.stat) { // статистика по повторам: кто выиграл очко, попадания Лёвы в корт, тактика соперника
      const ls = res.flatMap((x) => x.levShots), li = res.flatMap((x) => x.levIn), cnt = (f) => res.filter(f).length;
      row.stats = { levWon: cnt((x) => x.levWon), winners: cnt((x) => x.winner), levIn: li.filter(Boolean).length, levBounces: li.length,
        power: med(ls.map((e) => e.power)), speed: med(ls.map((e) => e.speed)), aiLob: cnt((x) => x.aiShots.includes('lob')), aiPass: cnt((x) => x.aiShots.includes('pass')),
        aiSmash: cnt((x) => x.aiStrokes.some((k) => k.startsWith('oh'))), aiVolley: cnt((x) => x.aiStrokes.some((k) => /^v/.test(k))), approach: cnt((x) => x.approach),
        oppWide: cnt((x) => x.oppWide > 4.1), levSmash: cnt((x) => x.levShots.some((e) => e.kind === 'smash')) };
      const t = row.stats;
      console.log(`СТАТ ${c.name.padEnd(12)} очко Лёве ${t.levWon}/${reps} (виннеров ${t.winners})  в корт ${t.levIn}/${t.levBounces}  сила~${t.power} скорость~${t.speed}  соперник: свеча ${t.aiLob} обводка ${t.aiPass} смэш ${t.aiSmash} воллей ${t.aiVolley} к сетке ${t.approach} за боковой ${t.oppWide}  смэш Лёвы ${t.levSmash}`);
    } else {
      console.log(`${pass === reps ? 'OK  ' : 'FAIL'} ${c.name.padEnd(10)} ${pass}/${reps}  попал ${row.hit}  в тело ${row.body}  d~${row.dMed}  снос~${row.driftMed}  v@удар~${row.vContactMed}`);
      for (const x of res.filter((x) => !x.ok)) console.log('     ', JSON.stringify(x));
    }
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(rows, null, 2));
  await browser.close();
  process.exit(0);
}

// ---------- Матч ----------
// Бот за Лёву играет как живой игрок средней руки: реагирует с задержкой, бежит клавишами и отпускает их с опозданием,
// жмёт K/J/L с разным упреждением, иногда кручёный/резаный, иногда целит A/D/W уже в замахе (как Лёва).
// --bot exploit — стратегия, которой Лёва обыгрывал соперника 17.11: укороченный туда, где соперника нет, следующий —
// сильно в другую сторону; после глубокого удара в угол выход к сетке и воллей в открытый корт.
const BOTFN = ([seed, mode]) => {
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const g = __lev.game, L = g.lev, io = __io, X = mode === 'exploit';
  let ball = null, react = 0, plan = null, nextPlan = 0, pressAt = null, jitter = [0, 0], serveAt = null, choice = null, late = 0.1, aimAt = null, aimKey = null;
  let rush = false, lastKind = null, holdKey = null, aim2 = null;
  window.__bot = (now) => {
    const b = g.b;
    if (g.state === 'serve' && g.server === L && !g.autoLev) { io.releaseAll(); serveAt ??= now + 0.8; if (now >= serveAt) { serveAt = null; io.tap('Space'); } return; }
    const incoming = b.live && g.state === 'rally' && g.lastHitter === g.opp;
    if (g.state !== 'rally') { rush = false; lastKind = null; }
    if (!incoming) {
      if (aimKey) io.release(aimKey); if (aim2) io.release(aim2); aimKey = aim2 = null; ball = null; plan = null; pressAt = null;
      if (!L.stroke || L.stroke.contacted) io.goTo(L, rush ? new L.pos.constructor(L.pos.x * 0.5, 0, 6.3) : L.home, 0.1, true); // к сетке — как Лёва, воллеи с 6–7 м
      return;
    }
    if (ball !== g.rally) { ball = g.rally; react = now + 0.18 + rnd() * 0.15; jitter = X ? [(rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.4] : [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.0]; pressAt = null; choice = rnd(); late = 0.05 + rnd() * 0.15; aimAt = null; }
    if (now < react) return;
    if (!plan || now >= nextPlan) { const v = rush && Math.abs(L.pos.z) < 8; plan = L.plan(b, now, 0, 0.5, v) ?? L.plan(b, now, 0, 0.25, v) ?? L.plan(b, now, 0, 0.25); nextPlan = now + 0.1; } // человек бьёт на удобной высоте, не с полулёта
    if (!plan || plan.out) return;
    const tgt = plan.stand.clone(); tgt.x += jitter[0]; tgt.z += jitter[1];
    const free = !L.stroke || L.stroke.contacted; // прошлый удар (и подача) уже сыгран — можно бежать и жать новый
    if (!aimKey) io.goTo(L, tgt, late, free || L.stroke.tContact - now > 0.7);
    if (free && pressAt == null) pressAt = plan.t - (X ? 0.6 + rnd() * 0.2 : 0.3 + rnd() * 0.6);
    if (X && free && pressAt != null && now >= pressAt) { // эксплойтер: выбор удара по месту соперника
      const O = g.opp.pos, away = O.x > 0 ? 'KeyA' : 'KeyD', net = Math.abs(L.pos.z) < 7.5, side = plan.type === 'bh' ? 'KeyJ' : 'KeyK';
      if (net) { io.hold(side); holdKey = side; lastKind = 'volley'; aimKey = away; aim2 = rnd() < 0.5 ? 'KeyW' : null; }
      else if (lastKind !== 'drop' && Math.abs(O.z) > 10.3 && rnd() < 0.55) { io.tap('KeyL'); lastKind = 'drop'; aimKey = away; aim2 = null; }
      else { io.hold(side); holdKey = side; lastKind = 'deep'; aimKey = away; aim2 = 'KeyW'; rush = rnd() < 0.45; }
      pressAt = Infinity; aimAt = L.stroke ? L.stroke.tContact - 0.25 : now;
    }
    if (aimAt != null && X && now >= aimAt) { io.hold(aimKey); if (aim2) io.hold(aim2); aimAt = null; }
    if (!X && free && pressAt != null && now >= pressAt) {
      if (choice < 0.15) io.hold('ShiftLeft'); else if (choice < 0.27) io.hold('AltLeft');
      if (choice > 0.92) io.tap('KeyL');
      else io.tap(plan.type === 'fh' ? 'KeyK' : 'KeyJ');
      pressAt = Infinity;
      const a = rnd(); aimKey = a < 0.3 ? 'KeyA' : a < 0.6 ? 'KeyD' : a < 0.7 ? 'KeyW' : null;
      aimAt = aimKey ? L.stroke.tContact - 0.1 - rnd() * 0.3 : null;
    }
    if (!X && aimKey && aimAt != null && now >= aimAt) { // целит в замахе: противоположную клавишу бега отпускает, как человек
      const opp = { KeyA: 'KeyD', KeyD: 'KeyA', KeyW: 'KeyS' }[aimKey]; io.release(opp); io.hold(aimKey); aimAt = null;
    }
    if (L.stroke && now > L.stroke.tContact + 0.15) { io.releaseAll(); aimKey = aim2 = holdKey = null; }
  };
};
// --aim corners|center: куда бьёт Лёва, мимо клавиш — сравнить тактику «гонять из угла в угол» с игрой в центр.
const AIM = ([mode]) => {
  const g = __lev.game, V = g.lev.pos.constructor;
  if (mode === 'corners') g.aimLev = () => new V(-Math.sign(g.opp.pos.x || 1) * 3.3, 0, -10.6); // в угол подальше от соперника
  if (mode === 'center') g.aimLev = () => new V(0, 0, -10.2);
};
const aimMode = opt('aim', '');
await page.evaluate(BOTFN, [SEED, BOT]); if (aimMode) await page.evaluate(AIM, [aimMode]);

// Шагаем до N очков; останавливаемся на кадрах: первые SHOTS касаний Лёвы, все мячи в тело, рывки.
const audits = [], events = [];
let shots = 0, lastRun = 0;
const nPts = () => events.filter((e) => e.type === 'point').length;
for (let guard = 0; guard < 2000 && nPts() < POINTS; guard++) {
  let r;
  try {
    r = await page.evaluate(({ need, human, lastRun, skill }) => {
      const g = __lev.game, L = g.lev, ev = window.__events;
      const pts = () => ev.filter((e) => e.type === 'point').length;
      const out = (o) => ({ ...o, ev: ev.splice(0) }); // журнал забираем по кускам: при перезагрузке страницы теряется только кусок
      for (let i = 0; i < 20 / window.__dt; i++) {
        if (human) window.__bot(g.now);
        __lev.step(window.__dt);
        if (skill) g.ai.skill = skill; // --skill: сила соперника закреплена (без подстройки)
        const hit = ev.find((e) => e.type === 'contact' || e.type === 'body');
        if (hit) return out({ stop: hit, audit: { t: g.now, who: hit.who, lev: L.rig.audit(), opp: g.opp.rig.audit() } });
        if (L.vel.length() > 4.5 && g.now - lastRun > 15) return out({ stop: { type: 'run', speed: +L.vel.length().toFixed(2) } });
        if (pts() >= need) return out({});
      }
      return out({});
    }, { need: POINTS - nPts(), human: BOT === 'human' || BOT === 'exploit', lastRun, skill: +opt('skill', 0) });
  } catch (e) {
    if (!/destroyed|navigat|closed/.test(e.message)) throw e;
    console.log('страница перезагрузилась, продолжаем матч'); await boot(true); await page.evaluate(BOTFN, [SEED + guard, BOT]); if (aimMode) await page.evaluate(AIM, [aimMode]); continue;
  }
  events.push(...r.ev);
  if (r.audit) audits.push(r.audit);
  if (r.stop?.type === 'run') lastRun = await page.evaluate(() => __lev.game.now);
  if (r.stop && shots < SHOTS * 3) {
    const s = r.stop;
    const who = s.who ?? 'lev';
    if (s.type !== 'contact' || who === 'lev' || shots % 3 === 0) {
      const name = `${String(shots).padStart(2, '0')}-${s.type}-${s.who ?? 'lev'}-${s.stroke ?? ''}${s.hit === false ? '-MISS' : ''}`;
      try { await page.evaluate(() => __lev.render()); await shot(name + '-wide'); await closeups(name, who); } catch (e) {
        if (!/destroyed|navigat|closed|__lev/.test(e.message)) throw e;
        console.log('страница перезагрузилась на кадре, продолжаем'); await boot(true); await page.evaluate(BOTFN, [SEED + guard, BOT]);
      }
      shots++;
    }
  }
}
writeFileSync(join(OUT, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'));
writeFileSync(join(OUT, 'audit.jsonl'), audits.map((a) => JSON.stringify(a)).join('\n'));

// Сводка: попадания, промахи с разбивкой, очки по причинам, мячи в тело, скорость в момент удара, снос во время удара.
const contacts = events.filter((e) => e.type === 'contact');
const side = (who) => {
  const c = contacts.filter((e) => e.who === who), miss = c.filter((e) => !e.hit);
  return { contacts: c.length, hitRate: c.length ? +(1 - miss.length / c.length).toFixed(2) : null, dMedian: med(c.map((e) => e.d)),
    missBy: by(miss, (e) => (Math.abs(e.deep) > Math.max(Math.abs(e.side), Math.abs(e.high)) ? (e.deep > 0 ? 'рано (мяч впереди)' : 'поздно (мяч позади)') : Math.abs(e.side) > Math.abs(e.high) ? 'вбок' : 'по высоте')),
    turnMaxed: c.filter((e) => e.turn >= 1.07).length, speedAtContact: med(c.map((e) => e.speed)), strokes: by(c, (e) => e.stroke) };
};
// Снос Лёвы между нажатием удара и касанием: сколько он прошёл, уже замахнувшись.
const drift = []; let lastPress = null;
for (const e of events) {
  if (e.type === 'press' && e.ok && e.rally) lastPress = e;
  if (e.type === 'contact' && e.who === 'lev' && lastPress) { drift.push(Math.hypot(e.pos[0] - lastPress.pos[0], e.pos[1] - lastPress.pos[1])); lastPress = null; }
}
const pts = events.filter((e) => e.type === 'point');
const bad = audits.flatMap((a) => ['lev', 'opp'].flatMap((w) => { const x = a[w], f = []; for (const s of ['Left', 'Right']) { if (x[s].elbowBack) f.push(`${w} ${s} локоть назад`); if (x[s].kneeBack) f.push(`${w} ${s} колено назад`); } if ((x.Right.wrist ?? 0) > 50) f.push(`${w} запястье ${x.Right.wrist}°`); if ((x.gripGap ?? 0) > 0.05) f.push(`${w} ручка не в ладони ${x.gripGap}`); return f.map((m) => `${a.t.toFixed(2)} ${m}`); }));
// Очки по тому, чем Лёва сыграл последним в розыгрыше: укороченный, с лёта у сетки, обычный; и доля очков Лёвы.
const byLast = {}; let lastLev = null;
for (const e of events) {
  if (e.type === 'serve') lastLev = null;
  if (e.type === 'shot' && e.who !== 'opp') lastLev = e.drop ? 'укороченный' : e.lob ? 'свеча' : /^(v|oh)/.test(e.stroke) ? 'сетка' : (e.power ?? 0) > 0.5 ? 'сильный' : 'обычный';
  if (e.type === 'point') { const k = lastLev ?? 'без удара'; byLast[k] ??= { lev: 0, opp: 0 }; byLast[k][e.winner]++; }
}
// Выносливость в конце розыгрыша (минимум за очко: между очками только восстанавливается), сила соперника, кураж.
const sta = (i) => { const a = pts.map((e) => e.sta?.[i]).filter((v) => v != null); return { min: a.length ? Math.min(...a) : null, med: med(a), under05: a.filter((v) => v < 0.5).length }; };
const skills = pts.map((e) => e.skill);
const fitness = { sta: { lev: sta(0), opp: sta(1) }, skill: { min: skills.length ? Math.min(...skills) : null, max: skills.length ? Math.max(...skills) : null, last: skills.at(-1) }, hot: events.filter((e) => e.type === 'hot').length, games: pts.at(-1)?.games };
const summary = { bot: BOT, aim: aimMode || undefined, fitness, levShare: pts.length ? +(pts.filter((e) => e.winner === 'lev').length / pts.length).toFixed(2) : null, byLast, points: pts.length, gameTime: +(events.at(-1)?.t ?? 0).toFixed(1), lev: side('lev'), opp: side('opp'),
  levDrift: { median: r2(med(drift)), over05: drift.filter((d) => d > 0.5).length, n: drift.length },
  pointWhy: by(pts, (e) => `${e.winner}: ${e.why}`), body: events.filter((e) => e.type === 'body'),
  rallyAvg: pts.length ? +(pts.reduce((s, e) => s + e.rally, 0) / pts.length).toFixed(1) : 0, anatomy: bad.slice(0, 40), anatomyCount: bad.length };
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, anatomy: undefined }, null, 2));
await browser.close();
