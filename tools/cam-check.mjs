// Игровая камера и метка «куда встать»: Лёва слева у задней линии, соперник бьёт к нему. Кадры в test-out/cam.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h, tag] of [[1440, 900, 'd'], [390, 844, 'm']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error(e.message));
  for (let ok = false; !ok;) {
    await page.goto('http://localhost:3952/?debug&nolog&noao');
    await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    ok = await page.evaluate(() => !!window.__lev?.game).catch(() => false);
  }
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  const frames = await page.evaluate(() => {
    const g = __lev.game, L = g.lev, V = L.pos.constructor;
    g.server = g.opp; g.resetPoint(g.now);
    const out = [];
    for (let i = 0; i < 120 * 8 && out.length < 1; i++) {
      __lev.step(1 / 120, { x: 0, y: 0 });
      if (g.state === 'rally' && g.lastHitter === g.opp && g.b.pos.z > 3) out.push(g.now);
      if (L.pos.x > -2.4) { L.pos.x = -2.5; L.wrap.position.x = -2.5; }
    }
    return out;
  });
  await page.evaluate(() => __lev.render());
  await page.screenshot({ path: `test-out/cam/left-${tag}.png` });
  await page.close();
}
await browser.close();
