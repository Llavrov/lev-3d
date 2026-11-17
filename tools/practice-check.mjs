// Проверка тренировки: за Лёву играет ИИ (?auto), уроки и стенка по 60 с игрового времени; события drill и кадры.
// node tools/practice-check.mjs → test-out/practice/*.png и сводка в консоль.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-out/practice', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [mode, w, h] of [['lessons', 1440, 900], ['wall', 1440, 900], ['lessons', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:3952/?debug&nolog&noao');
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-out/practice/menu-${w}.png` });
  await page.evaluate((m) => { document.getElementById(m === 'wall' ? 'pWall' : 'pLessons').click(); window.__pause = true; window.__noDraw = true; const g = __lev.game; g.autoLev = new g.ai.constructor(g.lev, g); }, mode); // за Лёву играет ИИ
  const res = await page.evaluate(() => {
    const g = __lev.game, d = g.drill, seen = new Set(); let shots = 0;
    for (let i = 0; i < 120 * 60; i++) { __lev.step(1 / 120); seen.add(d.step?.id); if (i === 120 * 8) __lev.render(); }
    const ev = window.__events.filter((e) => e.type === 'drill');
    const miss = window.__events.filter((e) => e.type === 'drill' && !e.ok).map(() => 0); const xs = window.__events.filter((e) => e.type === 'shot').map((e) => e.speed);
    return { shotSpeed: xs.slice(0, 6), step: d.i, steps: [...seen], ok: ev.filter((e) => e.ok).length, miss: ev.filter((e) => !e.ok).length, why: ev.filter((e) => !e.ok).map((e) => e.why ?? e.step).slice(0, 12), series: d.series, best: d.best, text: document.getElementById('ltext').innerText };
  });
  await page.evaluate(() => __lev.render());
  await page.screenshot({ path: `test-out/practice/${mode}-${w}.png` });
  console.log(mode, w, JSON.stringify(res), 'ошибок', errs.length, errs.slice(0, 2).join(' | '));
  await page.close();
}
await browser.close();
