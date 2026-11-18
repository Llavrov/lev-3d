#!/usr/bin/env node
// Ходьба и бег во времени: сценарии прогулки (стоит, шаг, трусца, спринт, поворот, остановка) и бега на корте шагают
// игру по 1/120 с, каждые 1/30 с — кадры сбоку, сзади (на корте — сверху) и кости. Числа по костям, а не по флагам игры:
// скольжение опорной стопы (подушечка у земли не должна ехать), скачки таза, колени назад, ступни внахлёст, ракетка у ноги.
//   node tools/gait.mjs --url http://localhost:3963 --out test-out/gait [--only walk,jog] [--who lev|opp|sub] [--no-png]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const STEP = +opt('png-step', 2), OUT = opt('out', 'test-out/gait'), ONLY = opt('only', null)?.split(','), PNG = !argv.includes('--no-png'), WHO = opt('who', 'lev');
const FPS = 30, SUB = 4;

// mode free — прогулка (player.free, без препятствий, на корте ровно); court — розыгрыш, ввод как WASD.
// script(t) → { x, y } (x — вправо по корту, y — к сетке; на прогулке длина 1 — шаг, 2,4 — Shift). cam: follow | fixed | top.
const SC = {
  idle: { mode: 'free', at: [0, 8], dur: 3, what: 'стоит', script: `() => ({ x: 0, y: 0 })` },
  walk: { mode: 'free', at: [0, 12], dur: 3.4, what: 'шаг с места, 2,6 с, стоп', script: `(t) => (t > 0.2 && t < 2.8 ? { x: 0, y: 1 } : { x: 0, y: 0 })` },
  jog: { mode: 'free', at: [0, 13], dur: 3.2, what: 'трусца (Shift, коротко)', script: `(t) => (t > 0.2 && t < 2.6 ? { x: 0, y: 1.6 } : { x: 0, y: 0 })` },
  sprint: { mode: 'free', at: [0, 15], dur: 3.6, what: 'спринт (Shift, держать)', script: `(t) => (t > 0.2 && t < 2.9 ? { x: 0, y: 2.4 } : { x: 0, y: 0 })` },
  turn: { mode: 'free', at: [0, 10], dur: 3.6, what: 'шаг вперёд, разворот назад', script: `(t) => (t > 0.2 && t < 1.4 ? { x: 0, y: 1 } : t >= 1.4 && t < 3.2 ? { x: 0, y: -1 } : { x: 0, y: 0 })` },
  turn90: { mode: 'free', at: [0, 10], dur: 2.6, what: 'стоя, поворот направо и шаг', script: `(t) => (t > 0.3 && t < 2.2 ? { x: 1, y: 0 } : { x: 0, y: 0 })` },
  stop: { mode: 'free', at: [0, 14], dur: 3, what: 'трусца и резкая остановка', script: `(t) => (t > 0.1 && t < 1.6 ? { x: 0, y: 1.6 } : { x: 0, y: 0 })` },
  'court-run': { mode: 'court', at: [-6, 12.5], dur: 2.6, what: 'корт: рывок вправо 1,3 с и торможение', cam: 'top', script: `(t) => (t > 0.2 && t < 1.5 ? { x: 1, y: 0 } : { x: 0, y: 0 })` },
  'court-back': { mode: 'court', at: [0, 8], dur: 2.4, what: 'корт: бег назад к задней линии и стоп', cam: 'top', script: `(t) => (t > 0.2 && t < 1.4 ? { x: 0.3, y: -1 } : { x: 0, y: 0 })` },
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 520 } });
page.setDefaultTimeout(90000); // зависла страница — исключение и пересъёмка, а не вечное ожидание
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error('ОШИБКА СТРАНИЦЫ:', e.message); });
async function load() {
  await page.goto(`${opt('url', 'http://localhost:3963')}/?debug&noao&nolog`);
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.addStyleTag({ content: 'body > :not(canvas) { display: none !important }' });
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  // Без окружения (горы, лес, клуб): кадр в программном рендере в разы быстрее, фигура на чистом корте видна лучше.
  await page.evaluate(() => {
    const S = __lev.scene, court = S.children.find((o) => o.getObjectByName?.('fence-near'));
    for (const o of S.children) if ((o.isMesh && o.name !== 'ball') || o.isPoints || (o.isGroup && o !== court && o.children.length !== 1)) o.visible = false;
    for (const n of ['court2', 'fence']) { const o = court?.getObjectByName(n); if (o) o.visible = false; }
  });
  if (WHO === 'sub') { // замена есть только после выхода с корта (Q)
    await page.keyboard.press('q');
    await page.waitForFunction(() => __lev.club.sub, null, { timeout: 60000 });
  }
}
await load();

const BONES = ['Hips', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const summary = {};
for (const [name, c] of Object.entries(SC)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const dir = join(OUT, name); mkdirSync(dir, { recursive: true });
  for (let attempt = 0; ; attempt++) try { summary[name] = await capture(name, c, dir); break; } catch (e) {
    if (attempt > 5 || !/context was destroyed|navigation|Target closed|is not defined|reading|Timeout/.test(e.message)) throw e;
    console.log(name, 'страница перезагрузилась, снимаю заново'); await page.waitForTimeout(5000); await load().catch(() => {});
  }
}
async function capture(name, c, dir) {
  await page.evaluate(([c, BONES, WHO]) => {
    const g = __lev.game, b = g.b, P = WHO === 'sub' ? __lev.club.sub : g[WHO], V = P.pos.constructor;
    for (const p of [g.lev, g.opp]) p.stroke = null;
    g.state = 'test'; b.live = false; g.ballMesh.visible = false;
    const s = P.side; // соперник смотрит в другую сторону: сценарий в его осях
    if (c.mode === 'free') { P.free = true; P.seat = null; P.bounds = null; P.ground = null; P.idle = false; P.wrap.visible = P.racket.visible = true; }
    else { P.free = false; }
    P.place(new V(c.at[0] * s, 0, c.at[1] * s)); P.bodyTurn = 0; P.turnVel = 0;
    for (const p of [g.lev, g.opp, __lev.club.sub].filter((p) => p && p !== P)) { p.wrap.visible = p.racket.visible = false; }
    const script = eval(c.script), t0 = g.now, h = 1 / 120;
    const tip = new V(), Y = new V();
    window.__mo = {
      tick() {
        const m = script(g.now - t0), mv = new V(m.x * s, 0, -m.y * s);
        if (c.mode === 'court' && P === g.lev) return __lev.step(h, { x: m.x, y: m.y }, h); // сам двигает время и игру
        g.now += h; P.update(h, g.now, mv, null);
      },
      frame() {
        const B = {}; for (const n of BONES) B[n] = P.rig.b[n].getWorldPosition(new V()).toArray();
        Y.set(0, 1, 0).applyQuaternion(P.racket.quaternion);
        const rk = [0.0, 0.2, 0.36, 0.53].map((k) => P.racket.position.clone().addScaledVector(Y, k).toArray()); // от хвата к ободу
        const a = P.rig.audit();
        return { t: +(g.now - t0).toFixed(4), pos: P.pos.toArray(), vel: P.vel.toArray(), turn: P.bodyTurn, bones: B, rk,
          right: new V(1, 0, 0).applyQuaternion(P.wrap.quaternion).toArray(),
          feet: Object.fromEntries(Object.entries(P.feet).map(([k, f]) => [k, { pos: f.pos.toArray(), lift: f.lift, step: !!f.step }])),
          kneeBack: a.Left.kneeBack || a.Right.kneeBack, elbowBack: a.Left.elbowBack || a.Right.elbowBack, grip: a.gripGap };
      },
      cam(view, i) {
        const p = P.pos, f = Math.sin(P.netYaw) < 0 ? -1 : 1;
        if (c.cam === 'top') return __lev.shot([p.x, 9, p.z + 2.5 * s], [p.x, 0.5, p.z]);
        const C = c.cam === 'fixed' ? new V(c.at[0] * s, 0, c.at[1] * s) : p;
        if (view === 'back') __lev.shot([C.x, 1.5, C.z + 4.4 * s], [C.x, 0.85, C.z - 0.5 * s]);
        else __lev.shot([C.x + 4.6 * s, 1.1, C.z], [C.x, 0.85, C.z]);
      },
    };
  }, [c, BONES, WHO]);
  const frames = [], views = c.cam === 'top' ? ['top'] : ['side', 'back'];
  for (let i = 0; i < c.dur * FPS; i++) {
    frames.push(await page.evaluate((SUB) => { for (let k = 0; k < SUB; k++) __mo.tick(); return __mo.frame(); }, SUB));
    if (!PNG || i % STEP) continue;
    for (const v of views) { await page.evaluate(([v, i]) => __mo.cam(v, i), [v, i]); await page.screenshot({ path: join(dir, `${v}-${String(i).padStart(3, '0')}.png`) }); }
  }
  writeFileSync(join(dir, 'frames.json'), JSON.stringify({ name, what: c.what, fps: FPS, frames }));
  const m = metrics(frames);
  writeFileSync(join(dir, 'metrics.json'), JSON.stringify(m));
  console.log(name.padEnd(11), JSON.stringify(m));
  return m;
}

// Числа по костям. Опора — подушечка (ToeBase) у земли (до 1,2 см над своим минимумом в сценарии): за время опоры
// она не должна ехать по корту. Таз — скачок за кадр и вторая разность. Ступни внахлёст — левая щиколотка правее правой
// в осях тела. Ракетка у ноги — ближе всего точки ракетки к бедру и голени (радиусы ноги 8,5 и 6 см вычтены).
function metrics(F) {
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const out = {};
  const slips = [];
  for (const s of ['Left', 'Right']) {
    const y = F.map((f) => f.bones[s + 'ToeBase'][1]), lo = Math.min(...y);
    let start = null;
    for (let i = 0; i <= F.length; i++) {
      const on = i < F.length && y[i] < lo + 0.012;
      if (on && start == null) start = i;
      if (!on && start != null) {
        if (i - start >= 3) { let mx = 0; for (let j = start; j < i; j++) mx = Math.max(mx, d2(F[j].bones[s + 'ToeBase'], F[start].bones[s + 'ToeBase'])); slips.push(mx * 100); }
        start = null;
      }
    }
  }
  const sorted = [...slips].sort((a, b) => a - b);
  out.steps = slips.length; out.slipMaxCm = +(sorted.at(-1) ?? 0).toFixed(1); out.slipMedCm = +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(1);
  const hy = F.map((f) => f.bones.Hips[1]);
  out.hipJumpMaxCm = +Math.max(...hy.slice(1).map((h, i) => Math.abs(h - hy[i]) * 100)).toFixed(1);
  out.hipD2MaxCm = +Math.max(...hy.slice(2).map((h, i) => Math.abs(h - 2 * hy[i + 1] + hy[i]) * 100)).toFixed(2);
  const knee = (f, s) => { const a = f.bones[s + 'UpLeg'], k = f.bones[s + 'Leg'], n = f.bones[s + 'Foot'], u = a.map((v, i) => v - k[i]), w = n.map((v, i) => v - k[i]);
    return 180 - (Math.acos(Math.max(-1, Math.min(1, u.reduce((x, v, i) => x + v * w[i], 0) / Math.hypot(...u) / Math.hypot(...w)))) * 180) / Math.PI; };
  const kn = F.flatMap((f) => [knee(f, 'Left'), knee(f, 'Right')]);
  out.kneeMin = Math.round(Math.min(...kn)); out.kneeMax = Math.round(Math.max(...kn));
  out.kneeBack = F.filter((f) => f.kneeBack).length; out.elbowBack = F.filter((f) => f.elbowBack).length;
  out.feetGapMinCm = Math.round(Math.min(...F.map((f) => { const l = f.bones.LeftFoot, r = f.bones.RightFoot; return ((r[0] - l[0]) * f.right[0] + (r[2] - l[2]) * f.right[2]) * -100; }))); // у Mixamo правая в −X модели
  const seg = (p, a, b) => { const ab = b.map((v, i) => v - a[i]), t = Math.max(0, Math.min(1, p.reduce((x, v, i) => x + (v - a[i]) * ab[i], 0) / ab.reduce((x, v) => x + v * v, 0))); return Math.hypot(...p.map((v, i) => v - a[i] - ab[i] * t)); };
  out.racketLegMinCm = Math.round(Math.min(...F.map((f) => Math.min(...f.rk.slice(1).flatMap((p) => ['Left', 'Right'].flatMap((s) => [seg(p, f.bones[s + 'UpLeg'], f.bones[s + 'Leg']) - 0.085, seg(p, f.bones[s + 'Leg'], f.bones[s + 'Foot']) - 0.06]))))) * 100);
  out.vMax = +Math.max(...F.map((f) => Math.hypot(f.vel[0], f.vel[2]))).toFixed(2);
  out.gripMax = +Math.max(...F.map((f) => f.grip ?? 0)).toFixed(3);
  return out;
}
writeFileSync(join(OUT, `summary-${WHO}.json`), JSON.stringify(summary, null, 1));
if (errors.length) console.log('ошибки страницы:', errors.length, errors.slice(0, 3));
await browser.close();
