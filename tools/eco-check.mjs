// Проверка характеристик, магазина, формы и зала в безголовом Chromium: HUD сил и кошелька в матче и на прогулке,
// панель C, магазин (вкладки, покупка, надеть), Лёва в другой форме спереди и сзади крупно, станции зала в двух фазах
// с проверкой анатомии и игрой в ритм. Кадры и сводка — в test-out/eco.
//   node tools/eco-check.mjs [--url http://localhost:3952] [--out test-out/eco] [--only gym,look,ui]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/eco'), URL = opt('url', 'http://localhost:3952'), ONLY = opt('only', 'ui,look,gym').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

async function open(w, h, q = '') {
  const phone = w < 500;
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message));
  await page.goto(`${URL}/?debug&nolog&noao${q}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && window.__eco && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  page.shot = async (name) => { await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 180000 }); };
  return page;
}
const walkOut = (page) => page.evaluate(() => { document.getElementById('cexit').click(); return new Promise((r) => setTimeout(r, 300)); })
  .then(() => page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1); return __lev.club.mode; }));

// ---------- HUD, панель, магазин на 1440 и 390 ----------
if (ONLY.includes('ui')) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await open(w, h), tag = `${w}`;
  // Стартовый экран: выбор ракетки только из купленных — одна стартовая, выбора нет; купил вторую — стрелки есть.
  await page.waitForFunction(() => document.getElementById('rkName').textContent === 'Красная', null, { timeout: 60000 });
  const rk0 = await page.evaluate(() => document.getElementById('rk').hidden);
  const rk1 = await page.evaluate(() => { __eco.outfit.give('neon'); return document.getElementById('rk').hidden; });
  await page.keyboard.press('ArrowRight');
  const rkName = await page.evaluate(() => document.getElementById('rkName').textContent);
  await page.screenshot({ path: join(OUT, `menu-${tag}.png`) });
  check(rk0 && !rk1 && rkName === 'Неон', `${tag}: на старте ракетки только купленные (одна — без выбора, две — стрелки, выбрана ${rkName})`);
  await page.evaluate(() => { __eco.outfit.wear('red'); localStorage.clear(); });
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  await page.waitForTimeout(800); // стартовый экран гаснет за 0,4 с: иначе в кадре меню поверх игры
  // Розыгрыш: за Лёву ИИ (он же подаёт), дождаться ударов, чтобы силы ушли.
  await page.evaluate(() => { const g = __lev.game; g.autoLev = new g.ai.constructor(g.lev, g); if (g.server === g.lev) g.serve(g.lev, g.now); for (let i = 0; i < 300 && g.rally < 4; i++) __lev.step(0.05); g.autoLev = null; });
  await page.shot(`match-${tag}`);
  const hud = await page.evaluate(() => { const r = document.getElementById('me').getBoundingClientRect(), s = document.getElementById('hud').getBoundingClientRect(); return { me: [r.left, r.top, r.right, r.bottom], hud: [s.left, s.top, s.right, s.bottom], scroll: document.documentElement.scrollWidth }; });
  const over = !(hud.me[0] >= hud.hud[2] || hud.me[1] >= hud.hud[3]);
  check(!over && hud.me[2] <= w && hud.scroll <= w, `${tag}: HUD сил не налезает на счёт и не выходит за экран ${JSON.stringify(hud)}`);
  await page.evaluate(() => document.getElementById('me').click());
  await page.shot(`panel-${tag}`);
  check(await page.evaluate(() => !document.getElementById('panel').hidden && document.getElementById('panelStats').children.length >= 10), `${tag}: панель характеристик открылась`);
  await page.evaluate(() => document.querySelector('#panel .x').click());
  const mode = await walkOut(page);
  check(mode === 'walk', `${tag}: прогулка`);
  await page.evaluate(() => __lev.step(1.5, { x: 0, y: 1 }));
  await page.shot(`walk-${tag}`);
  // Магазин: вкладка «Форма», покупка футболки, «Ракетки».
  await page.evaluate(() => __eco.openShop());
  await page.shot(`shop-${tag}`);
  const buy = await page.evaluate(() => { const b = document.querySelector('#shopList button[data-id="shirt-red"]'); b.click(); return { bal: __eco.wallet.balance, worn: __eco.outfit.worn.shirt }; });
  check(buy.bal === 125 && buy.worn === 'shirt-red', `${tag}: купил и надел красную футболку (${JSON.stringify(buy)})`);
  await page.shot(`shop-bought-${tag}`);
  await page.evaluate(() => document.querySelector('#shop nav [data-tab="rackets"]').click());
  await page.shot(`shop-rackets-${tag}`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= w, `${tag}: без горизонтальной прокрутки (${sw})`);
  const small = await page.evaluate(() => [...document.querySelectorAll('#shop button, #me, #panel button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => b.textContent.trim() || b.className));
  check(!small.length, `${tag}: кнопки не ниже 40 px ${small.join(', ')}`);
  await page.evaluate(() => document.querySelector('#shop .x').click());
  check(page.errs.length === 0, `${tag}: без ошибок страницы ${page.errs.slice(0, 2).join(' | ')}`);
  await page.close();
}

// ---------- Форма крупно: спереди и сзади ----------
if (ONLY.includes('look')) {
  const page = await open(1000, 1000);
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  await walkOut(page);
  for (const [name, items] of [['look-a', ['shirt-black', 'shorts-red', 'cap-white', 'wrist-lime', 'bag-red', 'shoes-clay']], ['look-b', ['shirt-sky', 'shorts-navy', 'band-red', 'wrist-black', 'bag-black', 'shoes-light', 'neon-pink']]]) {
    await page.evaluate((items) => { const o = __eco.outfit; for (const k of ['cap', 'band', 'wrist', 'bag']) o.takeOff(k); for (const id of items) { o.give(id); o.wear(id); } }, items);
    await page.evaluate(() => __lev.step(0.6, { x: 0, y: 0.6 })); // идёт: руки и ноги в движении
    for (const [view, eye] of [['front', [0.6, 1.25, 2.4]], ['back', [-0.5, 1.4, -2.4]], ['head', [0.35, 1.72, 0.75]], ['head-side', [0.85, 1.7, 0.08]], ['head-back', [-0.35, 1.78, -0.8]], ['side', [2.2, 1.3, 0.2]]]) {
      await page.evaluate(([eye, view]) => {
        const L = __lev.club.lev, y = L.netYaw + L.bodyTurn, f = [Math.sin(y), Math.cos(y)], r = [-Math.cos(y), Math.sin(y)];
        const at = view.startsWith('head') ? 1.64 : 1.0;
        __lev.shot([L.pos.x + f[0] * eye[2] + r[0] * eye[0], eye[1], L.pos.z + f[1] * eye[2] + r[1] * eye[0]], [L.pos.x, at, L.pos.z]);
      }, [eye, view]);
      await page.screenshot({ path: join(OUT, `${name}-${view}.png`) });
    }
  }
  check(page.errs.length === 0, `форма: без ошибок страницы ${page.errs.slice(0, 2).join(' | ')}`);
  await page.close();
}

// ---------- Зал: каждая станция в двух фазах, анатомия, ритм ----------
if (ONLY.includes('gym')) for (const [w, h] of [[1000, 1000], [390, 844]]) {
  const page = await open(w, h), tag = `${w}`;
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  await walkOut(page);
  for (const st of ['bench', 'pullup', 'squat', 'rope']) {
    const r = await page.evaluate((kind) => {
      const s = __eco.stations.find((x) => x.kind === kind);
      if (!__eco.openGym(s)) return { open: false };
      const L = __lev.club.lev, before = __eco.stats.lvl[{ bench: 'power', pullup: 'power', squat: 'speed', rope: 'stamina' }[kind]];
      // Чистый подход: жмём ровно в такт (клавиша Пробел через keydown).
      const T = { bench: 1.7, pullup: 1.8, squat: 1.8, rope: 0.62 }[kind], press = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      const audits = [];
      for (let k = 0; k < 10; k++) {
        const t = 1.4 + k * T;
        __lev.step(Math.max(0, t - window.__gymT()), { x: 0, y: 0 }); press();
        __lev.step(T * 0.3, { x: 0, y: 0 }); audits.push(L.rig.audit());
      }
      __lev.step(T + 0.5, { x: 0, y: 0 });
      return { open: true, done: document.getElementById('gymDone').hidden === false, cnt: document.getElementById('gymCnt').textContent, tip: document.getElementById('gymTip').textContent, gain: __eco.stats.lvl[{ bench: 'power', pullup: 'power', squat: 'speed', rope: 'stamina' }[kind]] - before, fat: __eco.stats.fatigue, audits };
    }, st);
    const bad = (r.audits ?? []).flatMap((a) => ['Left', 'Right'].filter((s) => a[s].elbowBack || a[s].kneeBack).map((s) => `${s}${a[s].elbowBack ? ' локоть' : ''}${a[s].kneeBack ? ' колено' : ''}`));
    check(r.open && r.done && r.gain > 0, `${tag} ${st}: подход в такт — ${r.cnt}; ${r.tip}; усталость ${r.fat?.toFixed(1)}`);
    check(!bad.length, `${tag} ${st}: анатомия без нарушений ${bad.slice(0, 4).join(', ')}`);
    // Кадры: подход заново, нижняя и верхняя точка, крупно.
    for (const [ph, at] of [['low', 0], ['high', 0.42]]) {
      await page.evaluate(([at]) => { // подход заново, жмём в такт: нижняя точка — такт, верхняя — 0,42 такта после
        document.getElementById('gymMore').click(); const T = window.__gymS().st.T, press = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
        __lev.step(1.4, { x: 0, y: 0 }); press(); __lev.step(T, { x: 0, y: 0 }); press(); if (at) __lev.step(at * T, { x: 0, y: 0 });
      }, [at]);
      await page.shot(`gym-${st}-${ph}-${tag}`);
      await page.evaluate(() => { window.__gymS().judged.length = 10; window.__gymS().done = true; }); // не ждать конца подхода
    }
    if (w > 500) for (const [view, eye] of [['side', [1.5, 1.0, 1.1]], ['front', [0.4, 1.3, 1.9]]]) {
      await page.evaluate(([eye, kind]) => {
        const s = __eco.stations.find((x) => x.kind === kind), y = s.yaw, f = [Math.sin(y), Math.cos(y)], r = [-Math.cos(y), Math.sin(y)], p = s.pos;
        const at = { bench: 0.75, pullup: 1.85, squat: 1.0, rope: 0.9 }[kind];
        __lev.shot([p.x + f[0] * eye[2] + r[0] * eye[0], eye[1] + (kind === 'pullup' ? 0.6 : 0), p.z + f[1] * eye[2] + r[1] * eye[0]], [p.x, at, p.z]);
      }, [eye, st]);
      await page.screenshot({ path: join(OUT, `gym-${st}-close-${view}.png`) });
    }
    await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })));
  }
  check(page.errs.length === 0, `${tag} зал: без ошибок страницы ${page.errs.slice(0, 2).join(' | ')}`);
  await page.close();
}

await browser.close();
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
process.exit(failed ? 1 : 0);
