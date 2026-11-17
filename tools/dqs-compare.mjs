// Сравнение скиннинга: одна и та же поза с линейным (?lbs) и двойными кватернионами. Кадры в test-out/dqs.
// Другие агенты правят код, страница может перезагрузиться посреди съёмки — тогда грузим заново и повторяем кадр.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const poses = [['fh', -0.3], ['fh', 0.5], ['bh', -0.3], ['bh', 0.5], ['oh', -0.17]];
async function ready(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.evaluate(() => { window.__pause = true; window.__noDraw = true; for (const id of ['loader', 'start']) document.getElementById(id).style.display = 'none'; });
}
for (const mode of ['lbs', 'dqs']) {
  const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
  const url = `http://localhost:3952/?debug&noao&nolog${mode === 'lbs' ? '&lbs' : ''}`;
  await ready(page, url);
  for (const [t, s] of poses) for (const [view, eye] of [['back', [0.2, 1.4, 2.4]], ['side', [2.3, 1.3, 0.6]]]) {
    for (let tries = 0; tries < 5; tries++) {
      try {
        await page.evaluate(([t, s, eye]) => { window.__pause = true; window.__noDraw = true; const L = __lev, P = L.game.lev.pos; L.pose(t, s); L.shot([P.x + eye[0], eye[1], P.z + eye[2]], [P.x, 1.05, P.z]); }, [t, s, eye]);
        await page.screenshot({ path: `test-out/dqs/${t}${s}-${view}-${mode}.png` });
        break;
      } catch { await ready(page, url).catch(() => {}); }
    }
  }
  await page.close();
}
await browser.close();
