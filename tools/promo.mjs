// Промо-ролик игры: облёт Лёвы, розыгрыш игровой камерой, удар крупно в замедлении. Кадры снимаются пошагово
// (игра шагает ровно на 1/30 с между кадрами), поэтому ролик плавный, сколько бы ни рендерился кадр.
// node tools/promo.mjs [--out test-out/promo] → кадры PNG; склейка — tools/promo.sh.
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = opt('out', 'test-out/promo'), W = 1280, H = 720, FPS = 30;
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('http://localhost:3952/?debug&nolog&auto');
await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
await page.evaluate(() => {
  window.__pause = true; window.__noDraw = true;
  for (const id of ['loader', 'start', 'hint']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  document.body.classList.remove('menu');
});
let n = 0;
const frame = async () => page.screenshot({ path: `${OUT}/f${String(n++).padStart(4, '0')}.png` });

// 1. Облёт Лёвы спереди, 3 с: стойка и пара тестовых взмахов.
await page.evaluate(() => { const g = __lev.game; g.autoLev = g.autoLev; document.getElementById('play').click(); window.__pause = true; g.state = 'over'; g.nextAt = 1e9; g.b.live = false; g.ballMesh.visible = false; });
for (let i = 0; i < 3 * FPS; i++) {
  await page.evaluate(([i, FPS]) => {
    const g = __lev.game, L = g.lev, t = i / FPS;
    if (i === 15) L.press('fh-top', g.now, null); if (i === 60) L.press('bh', g.now, null);
    g.now += 1 / FPS; L.update(1 / FPS, g.now, L.pos.clone().set(0, 0, 0), g.b); g.opp.update(1 / FPS, g.now, L.pos.clone().set(0, 0, 0), g.b);
    const a = -0.9 + t * 0.45, r = 3.6, P = L.pos;
    __lev.shot([P.x + Math.sin(a) * r, 1.3, P.z - Math.cos(a) * r], [P.x, 1.05, P.z]);
  }, [i, FPS]);
  await frame();
}
// 2. Розыгрыш игровой камерой, 10 с: за Лёву играет ИИ.
await page.evaluate(() => { const g = __lev.game; g.server = g.lev; g.resetPoint(g.now); });
for (let i = 0; i < 10 * FPS; i++) { await page.evaluate((FPS) => { __lev.step(1 / FPS); __lev.render(); }, FPS); await frame(); }
// 3. Удар крупно сбоку в замедлении вдвое, 3 с: дожидаемся замаха Лёвы, кадры с него.
await page.evaluate(() => { const g = __lev.game, L = g.lev; for (let i = 0; i < 120 * 20; i++) { if (L.stroke && g.b.live && L.stroke.tContact - g.now < 0.7 && L.stroke.tContact - g.now > 0.4) break; __lev.step(1 / 120); } });
for (let i = 0; i < 3 * FPS; i++) {
  await page.evaluate((FPS) => {
    __lev.step(0.5 / FPS);
    const L = __lev.game.lev, P = L.pos, s = L.side;
    __lev.shot([P.x + 2.6 * s, 1.25, P.z - 1.4 * s], [P.x, 1.0, P.z]);
  }, FPS);
  await frame();
}
console.log('кадров', n);
await browser.close();
