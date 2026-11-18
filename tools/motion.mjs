#!/usr/bin/env node
// Движение во времени, а не позы: сценарии (бег, приставной, сплит-степ, удары, выпад, воллей) шагают игру по 1/120 с,
// каждые 1/30 с — кадр сзади и сбоку (камера идёт за игроком по корту, высота постоянная: видно, как прыгает таз)
// и 3D-точки костей. Дальше: swift tools/pose-track.swift <кадры> и node tools/motion-report.mjs.
//   node tools/motion.mjs --out test-out/motion [--only run,fh] [--views back,side] [--no-png]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = opt('out', 'test-out/motion'), ONLY = opt('only', null)?.split(','), VIEWS = opt('views', 'back,side').split(','), PNG = !argv.includes('--no-png');
const FPS = 30, SUB = 4; // кадр раз в 4 шага игры по 1/120 с

// Сценарий: где стоит Лёва, мяч (как в playtest: from → to, скорость, вращение) и ввод script(t, x) → {x, y} джойстик.
// x.press(тип) — удар как с клавиатуры; x.eta() — сколько до мяча.
const SC = {
  run: { lev: [-6, 12.5], dur: 2.6, what: 'разгон вправо 1,3 с и торможение',
    script: `(t) => (t > 0.2 && t < 1.5 ? { x: 1, y: 0 } : { x: 0, y: 0 })` },
  shuffle: { lev: [0, 12.5], dur: 2.2, what: 'приставной: вправо 0,25 с, пауза, влево 0,25 с',
    script: `(t) => (t > 0.2 && t < 0.45 ? { x: 1, y: 0 } : t > 0.9 && t < 1.15 ? { x: -1, y: 0 } : { x: 0, y: 0 })` },
  split: { lev: [0, 12.5], dur: 1.2, what: 'сплит-степ на месте',
    script: `(t, x) => { if (t > 0.2) x.once('s', () => x.L.splitStep(x.now)); return { x: 0, y: 0 }; }` },
  fh: { lev: [0.33, 12.7], from: [0, 1, -12], to: [1.1, 9.6], speed: 22, spin: 60, dur: 2.6, what: 'форхенд с места',
    script: `(t, x) => { if (x.eta() < 0.8) x.once('p', () => x.press('fh')); return { x: 0, y: 0 }; }` },
  bh: { lev: [-0.33, 12.7], from: [0, 1, -12], to: [-1.1, 9.6], speed: 22, spin: 60, dur: 2.6, what: 'двуручный бэкхенд с места',
    script: `(t, x) => { if (x.eta() < 0.8) x.once('p', () => x.press('bh')); return { x: 0, y: 0 }; }` },
  'run-fh': { lev: [-1.2, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60, dur: 3.2, what: 'бег к широкому мячу, форхенд, бег назад',
    script: `(t, x) => { if (x.eta() < 0.9) x.once('p', () => x.press('fh')); if (x.L.stroke?.contacted && x.now - x.L.stroke.tContact > 0.15) return { x: -1, y: 0 }; return t > 0.15 && !x.L.stroke?.contacted ? { x: 1, y: 0 } : { x: 0, y: 0 }; }` },
  lunge: { lev: [3.1, 12.7], from: [-1, 1, -12], to: [3.9, 9.6], speed: 22, spin: 60, dur: 2.6, what: 'выпад к дальнему мячу, потом к центру',
    script: `(t, x) => { if (x.eta() < 0.6) x.once('p', () => x.press('fh')); return x.L.stroke?.contacted && x.now - x.L.stroke.tContact > 0.1 ? { x: -1, y: 0 } : { x: 0, y: 0 }; }` },
  volley: { lev: [0, 4.2], from: [-0.5, 1.0, -11.5], to: [1.3, 8.0], speed: 24, spin: 50, dur: 2.2, what: 'воллей с форхенда у сетки',
    script: `(t, x) => { if (x.eta() < 0.45) x.once('p', () => x.press('fh')); return { x: 0, y: 0 }; }` },
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 600 } });
page.on('pageerror', (e) => console.error('ОШИБКА СТРАНИЦЫ:', e.message));
async function load() {
  await page.goto(`${opt('url', 'http://localhost:3952')}/?debug&noao&nolog${opt('q', '')}`, { timeout: 180000 }); // --url — свой сервер-снимок, если другие правят код
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important }' });
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
}
await load();

const BONES = ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
for (const [name, c] of Object.entries(SC)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const dir = join(OUT, name); mkdirSync(dir, { recursive: true });
  // Другие агенты правят код — Vite перезагружает страницу посреди съёмки: тогда грузим заново и снимаем сценарий с начала.
  for (let attempt = 0; ; attempt++) try { await capture(name, c, dir); break; } catch (e) {
    if (attempt > 30 || !/context was destroyed|navigation|Target closed|is not defined|reading|Timeout/.test(e.message)) throw e;
    console.log(name, 'страница перезагрузилась, снимаю заново'); await page.waitForTimeout(8000); await load().catch(() => {});
  }
}
async function capture(name, c, dir) {
  await page.evaluate(async ([c, BONES]) => {
    const ph = await import('/src/physics.js');
    const g = __lev.game, L = g.lev, O = g.opp, b = g.b, V = L.pos.constructor;
    for (const p of [L, O]) p.stroke = null;
    L.place(new V(c.lev[0], 0, c.lev[1])); O.place(O.home.clone());
    g.ai.newPoint(); g.ai.skill = 0.7; g.landing = null;
    if (c.from) {
      const from = new V(...c.from);
      g.state = 'rally'; g.serving = null; g.lastHitter = O; g.rally = 1; g.bounces = 0;
      b.pos.copy(from); b.spin = c.spin; b.live = true; b.bounces = 0; g.ballMesh.visible = true;
      b.vel.copy(ph.solveShot(from, new V(c.to[0], 0, c.to[1]), c.speed, c.spin));
    } else { g.state = 'test'; b.live = false; g.ballMesh.visible = false; }
    const done = new Set();
    const x = { L, g, get now() { return g.now; }, once: (n, f) => { if (!done.has(n)) { done.add(n); f(); } },
      press: (type) => L.press(type, g.now, g.b), eta: () => { const p = b.live && g.lastHitter !== L ? L.predict(b, g.now) : null; return p ? p.t - g.now : Infinity; } };
    const script = eval(c.script), t0 = g.now;
    window.__mo = { tick() { const m = script(g.now - t0, x); __lev.step(1 / 120, m); }, t: () => g.now - t0,
      frame() {
        const P = {}; for (const n of BONES) P[n] = __lev.bone(n);
        const st = L.stroke;
        return { t: +(g.now - t0).toFixed(4), pos: L.pos.toArray(), vel: L.vel.toArray(), turn: L.bodyTurn, bones: P,
          feet: Object.fromEntries(Object.entries(L.feet).map(([k, f]) => [k, { pos: f.pos.toArray(), lift: f.lift, step: !!f.step }])),
          stroke: st ? { type: st.type, s: +(g.now - st.tContact).toFixed(4), contacted: st.contacted } : null, split: !!L.split, sliding: L.sliding,
          sweet: L.rig.sweet().toArray(), ball: b.live ? b.pos.toArray() : null };
      } };
  }, [c, BONES]);
  const frames = [];
  for (let i = 0; i < c.dur * FPS; i++) {
    const f = await page.evaluate((SUB) => { for (let k = 0; k < SUB; k++) __mo.tick(); return __mo.frame(); }, SUB);
    frames.push(f);
    if (!PNG) continue;
    for (const view of VIEWS) {
      // Сзади (как на видео Лёвы) и сбоку справа; камера идёт за игроком по корту, высота постоянная.
      await page.evaluate((view) => {
        const P = __lev.game.lev.pos;
        if (view === 'back') __lev.shot([P.x, 1.55, P.z + 4.6], [P.x, 0.85, P.z]);
        else __lev.shot([P.x + 4.6, 1.1, P.z], [P.x, 0.85, P.z]);
      }, view);
      await page.screenshot({ path: join(dir, `${view}-${String(i).padStart(3, '0')}.png`) });
    }
  }
  writeFileSync(join(dir, 'frames.json'), JSON.stringify({ name, what: c.what, fps: FPS, frames }));
  console.log(name, frames.length, 'кадров', frames.filter((f) => f.stroke?.contacted).length ? 'удар был' : '');
}

await browser.close();
