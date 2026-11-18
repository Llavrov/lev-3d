// Проверка прогулки по клубу (club.js) в безголовом Chromium: выйти с корта → дойти до скамейки → сесть →
// замена и соперник играют сами, счёт идёт → виды «со скамейки», «ТВ», «крупно» → встать и на террасу (interact.js):
// взял кофе → выпил → поставил → сложил зонт → взял стул и переставил → сел на стул → на полукорт (halfcourt.js):
// серия у стенки → вышел → вернуться на корт: счёт тот же, Лёва играет.
// На компьютере — клавишами Q, E, F, V, R, на телефоне (390×844) — кнопками. Кадры (руки с предметами крупно сбоку
// и спереди) и сводка — в test-out/club.
//   node tools/club-check.mjs [--out test-out/club] [--url http://localhost:3952]
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
  const prompt = () => page.evaluate(() => ['actE', 'actF'].map((id) => { const b = document.getElementById(id); return b.hidden ? '' : b.lastChild.textContent.toLowerCase(); }));
  // Действие по подписи: E или F, на телефоне — кнопка с этой подписью; ждём, пока руки закончат.
  const doAct = async (label, wait = true) => {
    const [e, f] = await prompt(), key = e === label ? 'E' : f === label ? 'F' : null;
    check(!!key, `${tag}: подсказка «${label}» (есть: ${e}${f ? ' · ' + f : ''})`);
    if (!key) return false;
    if (phone) await page.tap('#act' + key); else await page.keyboard.press(key.toLowerCase());
    if (wait) await page.evaluate(() => { for (let i = 0; i < 900 && __lev.club.hands.busy; i++) __lev.step(1 / 60, { x: 0, y: 0 }); });
    return true;
  };
  const still = (sec = 0.4) => page.evaluate((sec) => { for (let t = 0; t < sec; t += 1 / 60) __lev.step(1 / 60, { x: 0, y: 0 }); }, sec);
  // Крупно руки: камера от Лёвы вперёд f, вправо r, вверх up, смотрит на кость.
  const close = async (name, f, r, up, bone = 'LeftHand') => {
    await page.evaluate(([f, r, up, bone]) => {
      const L = __lev.club.lev, yaw = L.netYaw + L.bodyTurn, h = L.rig.b[bone].getWorldPosition(new L.pos.constructor());
      __lev.shot([h.x + Math.sin(yaw) * f - Math.cos(yaw) * r, h.y + up, h.z + Math.cos(yaw) * f + Math.sin(yaw) * r], [h.x, h.y, h.z]);
    }, [f, r, up, bone]);
    await page.screenshot({ path: join(OUT, `${name}-${tag}.png`), timeout: 180000 });
  };
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
  check((await prompt())[0] === 'сесть', `${tag}: у скамейки есть «Сесть»`);
  await act('e', 'actE');
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

  // ---------- Терраса: предметы (interact.js) ----------
  await doAct('встать'); await still(1.2);
  check(await page.evaluate(() => __lev.club.mode === 'walk'), `${tag}: встал со скамейки`);
  await walkTo([[8.4, 3.99], [10.4, 3.99], [10.85, 2], [10.85, -10], [10.85, -19], [12.2, -24.4], [12.9, -27.6], [11.75, -27.6], [11.75, -26.95]]);
  await doAct('взять кофе');
  const cup = await page.evaluate(() => ({ kind: __lev.club.hands.held?.kind, fill: __lev.club.hands.held?.fill }));
  check(cup.kind === 'cup', `${tag}: кофе в левой руке`);
  await still(0.5);
  await close('cup-side', 0.15, -0.95, 0.12); await close('cup-front', 1.0, 0.15, 0.15);
  await walkTo([[11.75, -28.3]]);
  if (await doAct('выпить', false)) {
    await still(1.0);
    await close('drink-side', 0.1, -0.8, 0, 'Head'); await close('drink-front', 0.85, -0.25, 0, 'Head');
    await page.evaluate(() => { for (let i = 0; i < 900 && __lev.club.hands.busy; i++) __lev.step(1 / 60, { x: 0, y: 0 }); });
  }
  const drank = await page.evaluate(() => __lev.club.hands.held?.fill);
  check(drank < cup.fill - 0.1, `${tag}: отпил: кофе ${cup.fill.toFixed(2)} → ${drank?.toFixed(2)}`);
  await walkTo([[11.75, -27.6], [11.75, -26.95]]);
  await doAct('поставить кофе');
  check(await page.evaluate(() => !__lev.club.hands.held && __lev.club.terrace.vessels.filter((v) => v.kind === 'cup').every((v) => v.spot)), `${tag}: чашка на столе`);
  await walkTo([[11.75, -28.5], [11.75, -27.75]]);
  await doAct('сложить зонт'); await still(1.6);
  check(await page.evaluate(() => __lev.club.terrace.umbrellas[0].open < 0.01), `${tag}: зонт сложен`);
  await page.evaluate(() => __lev.shot([9.6, 2.0, -28.6], [11.75, 1.3, -26.2])); await page.screenshot({ path: join(OUT, `umbrella-${tag}.png`), timeout: 180000 }); // сложенный зонт сбоку
  await shot('walk-terrace'); // камера прогулки у раскрытого зонта: под тканью, а не в ней
  await walkTo([[13.2, -27.6], [13.2, -24.6], [11.75, -24.4], [11.75, -24.75]]);
  const chair0 = await page.evaluate(() => __lev.club.chairs.map((c) => c.obj.position.toArray()));
  await doAct('взять стул');
  check(await page.evaluate(() => !!__lev.club.hands.chair), `${tag}: стул в руках`);
  await still(0.3);
  await close('chair-front', 1.6, 0.6, 0.2, 'Spine'); await close('chair-hands', 0.7, -0.45, 0.25);
  await walkTo([[13.2, -25.0], [13.4, -27.6], [13.4, -28.2]]);
  await doAct('поставить стул');
  const moved = await page.evaluate((c0) => { const c = __lev.club.chairs.map((c) => c.obj.position.toArray()); const i = c.findIndex((p, k) => Math.hypot(p[0] - c0[k][0], p[2] - c0[k][2]) > 1); return i < 0 ? null : c[i]; }, chair0);
  check(!!moved, `${tag}: стул переставлен ${moved?.map((v) => v.toFixed(2))}`);
  if (moved) {
    await walkTo([[moved[0] - 1.6, moved[2] - 0.8], [moved[0] - 1.0, moved[2]]]);
    await doAct('сесть'); await page.evaluate(() => { for (let i = 0; i < 300 && !(__lev.club.mode === 'sit' && __lev.club.lev.seat?.w === 1); i++) __lev.step(1 / 30, { x: 0, y: 0 }); });
    const ch = await page.evaluate(() => { const L = __lev.club.lev, a = L.rig.audit(), s = L.seat; return { mode: __lev.club.mode, yaw: s ? Math.atan2(Math.sin(L.netYaw + L.bodyTurn - s.yaw), Math.cos(L.netYaw + L.bodyTurn - s.yaw)) : 9, bad: ['Left', 'Right'].some((k) => a[k].elbowBack || a[k].kneeBack) }; });
    check(ch.mode === 'sit' && Math.abs(ch.yaw) < 0.2 && !ch.bad, `${tag}: сидит на стуле лицом от спинки ${JSON.stringify(ch)}`);
    await shot('chair-sit');
    await page.evaluate(() => { for (let i = 0; i < 40; i++) __lev.step(1 / 30, { x: 0, y: 1 }); for (let i = 0; i < 30; i++) __lev.step(1 / 30, { x: 0, y: 0 }); }); // тронул ходьбу — встал
  }

  // ---------- Полукорт: серия у стенки (halfcourt.js) ----------
  const O = await page.evaluate(() => [__lev.half.O.x, __lev.half.O.z]);
  await walkTo([[12.6, -18], [24, 6], [O[0] + 5.35, O[1] + 17], [O[0] + 5.35, O[1] + 14.5], [O[0] + 2, O[1] + 12]]);
  await doAct('бить об\u00a0стенку', false);
  const wall = await page.evaluate(() => ({ mode: __lev.club.mode, human: __lev.game.lev.human, shift: __lev.half.group.parent.position.toArray() }));
  check(wall.mode === 'wall' && wall.human && wall.shift[0] < -40, `${tag}: режим стенки на полукорте ${JSON.stringify(wall)}`);
  const ser = await page.evaluate(() => { const g = __lev.game; g.autoLev = new g.ai.constructor(g.lev, g); let best = 0; for (let i = 0; i < 120 * 30; i++) { __lev.step(1 / 120); best = Math.max(best, g.drill.series); } g.autoLev = null; return { best, text: document.getElementById('ltext').innerText }; });
  check(ser.best >= 2, `${tag}: серия у стенки до ${ser.best} (${ser.text})`);
  await page.evaluate(() => { for (let i = 0; i < 300 && __lev.game.state !== 'rally'; i++) __lev.step(1 / 60); for (let i = 0; i < 25; i++) __lev.step(1 / 60); });
  await shot('wall');
  await act('q', 'pexit');
  const out2 = await page.evaluate(() => { for (let i = 0; i < 20; i++) __lev.step(1 / 30, { x: 0, y: 0 }); const L = __lev.club.lev; return { mode: __lev.club.mode, shift: __lev.half.group.parent.position.length(), inside: __lev.half.inside(L.pos), human: __lev.game.lev.human }; });
  check(out2.mode === 'walk' && out2.shift === 0 && out2.inside && !out2.human, `${tag}: вышел со стенки на прогулку там же ${JSON.stringify(out2)}`);
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
