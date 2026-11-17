#!/usr/bin/env node
// Кадры окружения: меню, игровая камера и несколько ракурсов на корт, сетку, забор, дальний план. Нужен dev-сервер на 3952.
//   node tools/envshot.mjs --out test-out/env-before          кадры 1440×900 и 375×812
//   node tools/envshot.mjs --out test-out/env --only game     только часть кадров (через запятую)
//   node tools/envshot.mjs --perf --gpu                       ещё и время кадра игровой камеры на видеокарте
//   --dist <папка> — снимать собранную версию (vite build) вместо dev-сервера: так сравниваем с резервной копией
//   --eval '<js>' — выполнить в странице перед съёмкой (пробы без правки кода)
//   --gpu — через видеокарту Мака (metal), а не программный swiftshader: так время кадра похоже на настоящее.
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = opt('out', 'test-out/env'), ONLY = opt('only', '')?.split(',').filter(Boolean), Q = opt('q', '');
const PERF = argv.includes('--perf'), GPU = argv.includes('--gpu'), EVAL = opt('eval', ''), DIST = opt('dist', '');
mkdirSync(OUT, { recursive: true });

// Ракурсы [глаз, цель]: корт z от −11.885 до +11.885, Лёва у z ≈ +12.7.
const VIEWS = {
  aerial: [[4, 27, 37], [0, 0, -2]],
  valley: [[30, 60, 90], [0, 300, -3000]],
  side: [[-8.4, 1.7, 7], [2, 1.2, -6]],
  net: [[3.2, 1.3, 2.6], [6.2, 0.7, 0]],
  baseline: [[1.5, 1.3, 15.5], [0, 0, 10.5]],
  far: [[0, 1.7, 15], [0, 3, -30]],
  bench: [[4.5, 1.7, 4.2], [8, 0.6, -0.5]],
  chair: [[-4.2, 2.2, 4.5], [-7.8, 1.2, 0]],
  corner: [[4.5, 1.6, -11], [8.6, 0.6, -18.5]],
};

const browser = await chromium.launch({ headless: true, args: GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const want = (n) => !ONLY.length || ONLY.includes(n);

for (const [w, h, tag] of [[1440, 900, 'd'], [375, 812, 'm']]) {
  const mobile = tag === 'm';
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: mobile || PERF ? 2 : 1 }); // время кадра меряем на ретине: так упираемся в видеокарту, а не в шум
  page.on('pageerror', (e) => console.error('ОШИБКА СТРАНИЦЫ:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  // Без горячей перезагрузки: рядом правят код другие агенты, и Vite перезагружал страницу посреди съёмки.
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'const h = () => ({ accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, data: {} }); export const createHotContext = h, injectQuery = (u) => u, updateStyle = () => {}, removeStyle = () => {}; export class ErrorOverlay {}' }));
  if (DIST) await page.route('http://dist.test/**', (r) => { const f = join(DIST, new URL(r.request().url()).pathname.replace(/\/$/, '/index.html')); r.fulfill(existsSync(f) ? { path: f } : { status: 404 }); });
  await page.goto(`${DIST ? 'http://dist.test' : 'http://localhost:3952'}/?debug&nolog${argv.includes('--ao') ? '' : '&noao'}${Q ? '&' + Q : ''}`); // --ao: с затенением GTAO, как на компьютере
  await page.waitForFunction(() => window.__lev?.game && !document.getElementById('play').disabled, null, { timeout: 180000 });
  await page.waitForTimeout(2500); // текстуры и меню-камера успевают встать
  if (EVAL) await page.evaluate(EVAL);
  if (want('menu')) await page.screenshot({ path: join(OUT, `menu-${tag}.png`) });
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; });
  await page.addStyleTag({ content: '#start, #loader { display: none !important; }' });
  await page.waitForTimeout(300);
  if (want('game')) { await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `game-${tag}.png`) }); }
  if (PERF && !mobile) {
    // Время видеокарты на кадр — запросами таймера (EXT_disjoint_timer_query), медиана из 40. Секундомер JS тут врал
    // в разы: в него попадали чужие процессы и ожидание кадра.
    const perf = await page.evaluate(async (names) => {
      window.__noDraw = true; // свой цикл игры не рисует, пока меряем
      const gl = document.getElementById('c').getContext('webgl2'), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
      const run = async (n = 40) => {
        const qs = [], cpu = [];
        for (let i = 0; i < n; i++) { const q = gl.createQuery(), t0 = performance.now(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); __lev.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); cpu.push(performance.now() - t0); qs.push(q); await new Promise(requestAnimationFrame); }
        const g = [];
        for (const q of qs) { while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 5)); g.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
        return { gpu: +med(g).toFixed(2), cpu: +med(cpu).toFixed(2) };
      };
      await run(10);
      const all = await run(), parts = {};
      for (const n of names) { const o = __lev.scene.getObjectByName(n); if (!o) continue; o.visible = false; parts[n] = +(all.gpu - (await run()).gpu).toFixed(2); o.visible = true; }
      let tri = 0, meshes = 0; __lev.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tri += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.count ?? 1); } });
      window.__noDraw = false;
      return { ...all, parts, meshes, tris: Math.round(tri) };
    }, ['mountains', 'forest', 'clubhouse', 'sky', 'fence', 'props']);
    console.log(`игровая камера 2880×1800: видеокарта ${perf.gpu} мс, JS ${perf.cpu} мс, мешей ${perf.meshes}, треугольников ${perf.tris}`);
    console.log('доля частей (видеокарта, мс):', JSON.stringify(perf.parts));
  }
  if (!mobile) for (const [name, [eye, at]] of Object.entries(VIEWS)) {
    if (!want(name)) continue;
    await page.addStyleTag({ content: '#hud, #hint { display: none !important; }' });
    await page.evaluate(([eye, at]) => __lev.shot(eye, at), [eye, at]);
    await page.screenshot({ path: join(OUT, `${name}-${tag}.png`) });
  }
  await page.close();
}
await browser.close();
console.log('кадры в', OUT);
