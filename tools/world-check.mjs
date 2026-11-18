// Проверка мира клуба (env-house.js, рельеф и газон в env-mountains.js, кора в env.js): кадры дома снаружи, у входа,
// с открытой дверью, внутри зала; газон и стволы крупно; вид игры; план сверху. Прогулка: Лёва выходит с корта,
// идёт по буграм к террасе, открывает дверь, входит в зал — высота по газону и полу, стены держат.
//   node tools/world-check.mjs --url http://localhost:3962 --out test-out/world [--desk] [--gpu]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/world'), URL = opt('url', 'http://localhost:3952'), ONLY = opt('only', '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const GPU = argv.includes('--gpu');
const browser = await chromium.launch({ args: GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = []; let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

// Ракурсы [глаз, цель]. Дом: фасад с дверью на x = 14,6, z от −33,2 до −20,8, дверь на z = −27.
const VIEWS = {
  terrace: [[12.2, 2.5, -17.6], [13.4, 1.2, -27]], // как скрин Лёвы: с настила вдоль фасада
  house: [[4.5, 2.4, -12], [20, 3.6, -27]], // дом от корта
  facade: [[7.5, 3.2, -27], [15, 3.6, -27]], // фасад в лоб: балкон, фронтон, окна
  side: [[21, 2.2, -12.5], [20, 3.2, -24]], // северная стена и клумба
  entrance: [[12.9, 1.7, -24.9], [14.8, 1.35, -27]],
  dooropen: [[12.9, 1.7, -24.9], [14.8, 1.35, -27]],
  inside: [[15.4, 1.65, -26.4], [23, 1.15, -28.4]], // от двери на стойку
  inside2: [[24.6, 1.75, -22.4], [18, 0.9, -30]], // из-за стойки на столики и камин
  lawn: null, // газон и ствол крупно — по ближайшему дереву
  feet: [[15, 1.5, 6], [17.5, 0, 9]], // газон у ног
  bumps: [[30, 1.8, 12], [10, 0, 0]], // бугры по газону против света
  hills: [[14, 1.7, 17], [34, 0.9, 0]], // холм справа от корта с уровня глаз
  hillstop: [[8, 20, 32], [30, 0, -2]], // холмы сверху наискось
  flowers: [[11.4, 4.3, -25.2], [13.3, 4.05, -27.4]], // ящик с геранью на балконе крупно
  flowers2: [[19.2, 4.6, -18.4], [17.4, 4.0, -20.8]], // ящик под окном второго этажа
  shelves: [[23.7, 1.7, -24.2], [25.5, 1.55, -27.6]], // полки бара из-за стойки
  plan: [[8, 70, -6], [8, 0, -6.01]],
};
const want = (n) => !ONLY.length || ONLY.includes(n);

for (const [w, h] of [[1440, 900], ...(argv.includes('--desk') ? [] : [[390, 844]])]) {
  const phone = w < 500, tag = `${w}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'const h = () => ({ accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, data: {} }); export const createHotContext = h, injectQuery = (u) => u, updateStyle = () => {}, removeStyle = () => {}; export class ErrorOverlay {}' }));
  await page.goto(URL + '/?debug&nolog&noao', { timeout: 120000 });
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; });
  await page.addStyleTag({ content: '#start, #loader, #hud, #hint { display: none !important; }' });
  await page.waitForTimeout(300);
  const shot = async (name, eye, at) => { await page.evaluate(([e, a]) => { __lev.shot(e, a); __lev.shot(e, a); }, [eye, at]); await page.screenshot({ path: join(OUT, `${name}-${tag}.png`), timeout: 180000 }); };
  if (want('game')) { await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `game-${tag}.png`), timeout: 180000 }); }
  for (const [name, v] of Object.entries(VIEWS)) {
    if (!want(name) || (phone && !['terrace', 'inside', 'lawn', 'facade', 'hills'].includes(name))) continue;
    if (name === 'dooropen') await page.evaluate(async () => { const door = __lev.scene.getObjectByName('door').userData.door; if (!door.open) door.toggle(performance.now() / 1000 - 2); });
    if (name === 'inside') await page.evaluate(async () => { const door = __lev.scene.getObjectByName('door').userData.door; if (!door.open) door.toggle(performance.now() / 1000 - 2); });
    if (name === 'lawn') { // ближайшая к корту липа: камера сзади-сбоку, как на скрине Лёвы
      const t = await page.evaluate(() => { const r = __lev.scene.getObjectByName('roots'), m = new r.matrixWorld.constructor(), p = new __lev.camera.position.constructor(); let best = null; for (let i = 0; i < r.count; i++) { r.getMatrixAt(i, m); p.setFromMatrixPosition(m); const d = Math.hypot(p.x - 13, p.z - 8); if (p.x > 12 && (!best || d < best.d)) best = { d, x: p.x, y: p.y, z: p.z }; } return best; });
      await shot(name, [t.x - 2.6, t.y + 1.7, t.z + 3.2], [t.x - 0.3, t.y + 0.7, t.z]);
      continue;
    }
    await shot(name, ...v);
  }
  if (!phone && want('walk')) {
    // Прогулка: с корта через калитку к террасе, у двери открыть, войти, пройти к стойке.
    const walk = await page.evaluate(async () => {
      const door = __lev.scene.getObjectByName('door').userData.door, groundAt = __lev.scene.getObjectByName('ground').userData.groundAt; // модули из сцены: у Vite после правок свой ?t= в адресе
      if (door.open) door.toggle();
      const c = __lev.club, g = __lev.game, sub = g.opp; // замена не нужна: ведём только Лёву
      c.exit(sub, g.now); for (let i = 0; i < 300 && c.mode === 'exit'; i++) __lev.step(0.1);
      const L = c.lev, log = [];
      const to = (pts) => { for (const [tx, tz] of pts) for (let t = 0; t < 25; t += 1 / 30) { const dx = tx - L.pos.x, dz = tz - L.pos.z, d = Math.hypot(dx, dz); if (d < 0.25) break; const ux = dx / d, uz = dz / d, a = c.camYaw; __lev.step(1 / 30, { x: ux * -Math.cos(a) + uz * Math.sin(a), y: ux * Math.sin(a) + uz * Math.cos(a) }); } return [L.pos.x, L.pos.y, L.pos.z]; };
      // По газону с буграми: высота тела должна идти по groundAt.
      let worst = 0; const path = [[14, 6], [18, 9], [22, 4], [18, -4], [12.4, -16]];
      for (const p of path) { to([p]); worst = Math.max(worst, Math.abs(L.pos.y - groundAt(L.pos.x, L.pos.z))); }
      const lawnY = [L.pos.x, L.pos.y, L.pos.z];
      const shut = to([[12.4, -27], [14.0, -27], [15.5, -27]]); // закрытая дверь: упрётся
      door.toggle(g.now);
      const inside = to([[13.6, -27], [15.6, -27], [18.5, -27], [21.5, -26.5]]);
      return { worst, lawnY, shut, inside, mode: c.mode };
    });
    check(walk.worst < 0.03, `по газону тело на высоте земли (отклонение ${walk.worst.toFixed(3)} м)`);
    check(walk.shut[0] < 14.6, `закрытая дверь не пускает в зал (x ${walk.shut[0].toFixed(2)})`);
    check(walk.inside[0] > 20.5 && Math.abs(walk.inside[1] - 0.15) < 0.01, `в открытую дверь вошёл, идёт по полу зала (${walk.inside.map((v) => v.toFixed(2))})`);
    await page.evaluate(() => { const L = __lev.club.lev; __lev.shot([L.pos.x - 3.2, 1.9, L.pos.z + 1.6], [L.pos.x + 1, 1.0, L.pos.z - 0.4]); });
    await page.screenshot({ path: join(OUT, `walk-inside-${tag}.png`), timeout: 180000 });
  }
  check(errs.length === 0, `${tag}: без ошибок страницы ${errs.slice(0, 3).join(' | ')}`);
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
console.log('кадры в', OUT);
process.exit(failed ? 1 : 0);
