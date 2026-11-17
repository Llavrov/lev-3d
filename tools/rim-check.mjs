// Обод ракетки при силе: держим K до удара, кадры при накоплении и в замахе. Кадры в test-out/rim.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-out/rim', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto('http://localhost:3952/?debug&nolog&noao');
await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; const g = __lev.game; g.server = g.opp; g.resetPoint(g.now); });
await page.evaluate(() => { const g = __lev.game; for (let i = 0; i < 1200 && !(g.state === 'rally' && g.lastHitter === g.opp && g.b.pos.z > 1); i++) __lev.step(1 / 120); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' })); });
const shots = [];
for (const at of [-0.35, -0.06, 0.02]) {
  const ok = await page.evaluate((at) => { const g = __lev.game, L = g.lev; for (let i = 0; i < 400; i++) { if (L.stroke && g.now >= L.stroke.tContact + at) break; __lev.step(1 / 120); } const h = __lev.bone('RightHand'), P = L.pos; __lev.render(); __lev.shot([P.x + 1.6, 1.5, P.z + 2.2], [h[0], h[1], h[2]]); return !!L.stroke; }, at);
  await page.screenshot({ path: `test-out/rim/rim${at}.png` }); shots.push(ok);
}
console.log(shots);
await browser.close();
