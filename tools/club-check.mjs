// Проверка прогулки по клубу (club.js) в безголовом Chromium: выйти с корта → дойти до скамейки → сесть →
// замена и соперник играют сами, счёт идёт → виды «со скамейки», «ТВ», «крупно» → вернуться: счёт тот же, Лёва играет.
// На компьютере — клавишами Q, E, V, R, на телефоне (390×844) — кнопками. Кадры и сводка — в test-out/club.
//   node tools/club-check.mjs [--out test-out/club]        (нужен npm run dev, порт 3952)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/club'), URL = opt('url', 'http://localhost:3952'); // --url — свой сервер, например сборка через vite preview
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const phone = w < 500, tag = `${w}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL + '/?debug&nolog&noao', { timeout: 120000 }).catch(() => page.goto(URL + '/?debug&nolog&noao', { timeout: 120000 })); // сеть иногда отвечает не с первого раза
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  const shot = async (name) => { await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `${name}-${tag}.png`), timeout: 180000 }); };
  // Действие: на компьютере клавиша, на телефоне кнопка.
  const act = async (key, id) => { if (phone) await page.tap('#' + id); else await page.keyboard.press(key); await page.waitForTimeout(50); };
  // Идти к точке, держа направление относительно камеры (как WASD или джойстик).
  const walkTo = (pts) => page.evaluate((pts) => {
    const c = __lev.club, L = c.lev;
    for (const [tx, tz] of pts) for (let t = 0; t < 20; t += 1 / 30) {
      const dx = tx - L.pos.x, dz = tz - L.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25) break;
      const ux = dx / d, uz = dz / d, a = c.camYaw;
      __lev.step(1 / 30, { x: ux * -Math.cos(a) + uz * Math.sin(a), y: ux * Math.sin(a) + uz * Math.cos(a) });
    }
    return [L.pos.x, L.pos.z].map((v) => +v.toFixed(2));
  }, pts);
  const state = () => page.evaluate(() => { const g = __lev.game; return { mode: __lev.club.mode, state: g.state, pts: [g.pts.get(g.lev), g.pts.get(g.opp)], games: [g.games.get(g.lev), g.games.get(g.opp)], human: g.lev.human, auto: !!g.autoLev }; });

  await page.evaluate(() => __lev.step(1));
  const before = await state();
  await act('q', 'cexit');
  await page.waitForFunction(() => __lev.club.mode === 'exit', null, { timeout: 30000 });
  check((await state()).human === false, `${tag}: на месте Лёвы замена`);
  const out = await page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode === 'exit'; i++) __lev.step(0.1); const L = __lev.club.lev; return { mode: __lev.club.mode, x: L.pos.x, z: L.pos.z }; });
  check(out.mode === 'walk' && out.x > 9.6, `${tag}: Лёва вышел через калитку (x ${out.x.toFixed(2)})`);
  // Прогулка: по дорожке к террасе и назад к калитке, кадр на ходу.
  await walkTo([[10.85, -4], [10.85, -10]]);
  await page.evaluate(() => __lev.step(0.4, { x: 0, y: 1 }));
  await shot('walk');
  const pos = await walkTo([[10.85, 2], [10.4, 3.99], [8.4, 3.99], [7.1, 2.0]]);
  check(Math.hypot(pos[0] - 7.1, pos[1] - 2) < 0.5, `${tag}: дошёл до скамейки игроков ${pos}`);
  check(await page.evaluate(() => !document.getElementById('csit').hidden), `${tag}: у скамейки есть «Сесть»`);
  await act('e', 'csit');
  const sat = await page.evaluate(() => { for (let i = 0; i < 40; i++) __lev.step(0.1); const L = __lev.club.lev; return { mode: __lev.club.mode, hips: L.rig.b.Hips.getWorldPosition(new L.pos.constructor()).y, w: L.seat?.w, audit: L.rig.audit() }; }); // game.lev сейчас замена: Лёву берём из club
  check(sat.mode === 'sit' && sat.w === 1, `${tag}: сидит (таз ${sat.hips.toFixed(2)} м)`);
  const bad = ['Left', 'Right'].some((s) => sat.audit[s].elbowBack || sat.audit[s].kneeBack) || (sat.audit.gripGap ?? 0) > 0.05;
  check(!bad, `${tag}: поза сидя без нарушений ${JSON.stringify({ L: sat.audit.Left, R: sat.audit.Right, grip: sat.audit.gripGap })}`);
  // Крупно сидящий Лёва: спереди-сбоку.
  await page.evaluate(() => { const L = __lev.club.lev, s = L.seat, f = [Math.sin(s.yaw), Math.cos(s.yaw)]; __lev.shot([s.at.x + f[0] * 2.3 - f[1] * 1.0, 1.1, s.at.z + f[1] * 2.3 + f[0] * 1.0], [s.at.x + f[0] * 0.25, 0.65, s.at.z + f[1] * 0.25]); });
  await page.screenshot({ path: join(OUT, `sit-${tag}.png`), timeout: 180000 }); // машина бывает занята другими прогонами
  // Матч ИИ против ИИ, пока Лёва сидит.
  const play = await page.evaluate(() => { const g = __lev.game, n0 = window.__events.filter((e) => e.type === 'shot').length; for (let i = 0; i < 600; i++) { __lev.step(0.1); if (i === 120) window.__mid = __lev.game.b.live; } return { shots: window.__events.filter((e) => e.type === 'shot').length - n0, points: window.__events.filter((e) => e.type === 'point').length }; });
  const mid = await state();
  check(play.shots > 6, `${tag}: ИИ против ИИ, ударов ${play.shots}, очков ${play.points}, счёт ${before.pts}/${before.games} → ${mid.pts}/${mid.games}`); // бывают розыгрыши по 20 ударов: очков за минуту может и не быть
  // Ведём к моменту розыгрыша, чтобы на кадрах был мяч.
  await page.evaluate(() => { for (let i = 0; i < 200 && !(__lev.game.state === 'rally' && __lev.game.rally >= 2); i++) __lev.step(0.05); });
  await shot('bench');
  await act('v', 'cview'); await shot('tv');
  await act('v', 'cview'); await shot('close');
  await act('v', 'cview');
  check(await page.evaluate(() => __lev.club.view === 'bench'), `${tag}: вид по кругу вернулся на скамейку`);
  const last = await state();
  await act('r', 'cback');
  const back = await state();
  check(back.human && !back.auto && back.mode === null && JSON.stringify(back.pts) === JSON.stringify(last.pts) && JSON.stringify(back.games) === JSON.stringify(last.games), `${tag}: вернулся, счёт тот же ${last.pts}/${last.games} → ${back.pts}/${back.games}`);
  const serve = await page.evaluate(() => { const g = __lev.game; if (g.server === g.lev) { g.serve(g.lev, g.now); } for (let i = 0; i < 20; i++) __lev.step(0.1); return { state: g.state, rally: g.rally, server: g.server === g.lev ? 'lev' : 'opp' }; });
  check(serve.state === 'rally' || serve.state === 'over' || serve.server === 'opp', `${tag}: Лёва снова в игре (${JSON.stringify(serve)})`);
  await shot('back');
  check(errs.length === 0, `${tag}: без ошибок страницы ${errs.slice(0, 2).join(' | ')}`);
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
process.exit(failed ? 1 : 0);
