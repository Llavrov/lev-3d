// Проверка работы за деньги (jobs.js) в безголовом Chromium: доска у двери клубного дома → урок (бот набрасывает
// клавишами) → итог и деньги → смена баристы (бот носит заказы) → спарринг (бот играет) → деньги на кошельке.
// 1440 — всё целиком, 390 — те же экраны кнопками, работа бросается кнопкой «Закончить». Кадры и сводка — test-out/jobs.
//   node tools/jobs-check.mjs --url http://localhost:3971 [--out test-out/jobs] [--only 1440,390] [--jobs coach,barista,spar]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/jobs'), URL = opt('url', 'http://localhost:3952'), ONLY = opt('only', '1440,390').split(','), JOBS = opt('jobs', 'coach,barista,spar').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

async function open(w, h) {
  const phone = w < 500;
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  page.setDefaultTimeout(240000);
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto(`${URL}/?debug&nolog&noao`, { timeout: 240000 });
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && window.__lev.jobs && !document.getElementById('play').disabled, null, { timeout: 240000 });
  await page.evaluate(() => { localStorage.clear(); document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; for (const id of ['loader', 'start']) document.getElementById(id).style.display = 'none'; });
  page.shot = async (name) => { await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 240000 }); };
  page.walkShot = async (name) => { await page.evaluate(() => { __lev.render(); for (const u of __lev.club.terrace.umbrellas) u.update(1); __lev.render(); }); await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 240000 }); }; // зонт между камерой и Лёвой гаснет не сразу: в кадре — сразу
  page.look = async (name, eye, at) => { await page.evaluate(([e, a]) => __lev.shot(e, a), [eye, at]); await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 240000 }); };
  return page;
}
const walk = (page) => page.evaluate(() => { const c = __lev.club; if (!c.active) document.getElementById('cexit').click(); return new Promise((r) => setTimeout(r, 200)); })
  .then(() => page.evaluate(() => { for (let i = 0; i < 400 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1, { x: 0, y: 0 }); return __lev.club.mode; }));
// К доске: Лёва на террасе лицом к стене дома, камера за ним.
const toBoard = (page) => page.evaluate(() => {
  const c = __lev.club, L = c.lev, V = L.pos.constructor;
  L.place(new V(13.7, 0.15, -28.5)); L.bodyTurn = -Math.PI / 2; c.camYaw = Math.PI / 2; c.fresh = true;
  __lev.step(0.3, { x: 0, y: 0 });
  const e = document.getElementById('actE'); return e.hidden ? null : e.lastChild.textContent;
});
const press = async (page, phone, key, sel) => { if (phone) await page.tap(sel); else await page.keyboard.press(key); };
const cash = (page) => page.evaluate(() => window.__eco.wallet.balance);
const jobLine = (page) => page.evaluate(() => document.querySelector('#job p').textContent);

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = String(w), phone = w < 500;
  if (!ONLY.includes(tag)) continue;
  const page = await open(w, h);
  check(await walk(page) === 'walk', `${tag}: прогулка`);
  const money0 = await cash(page);

  // ---------- Доска ----------
  const lb = await toBoard(page);
  check(/посмотреть работу/i.test(lb ?? ''), `${tag}: у доски подсказка «${lb}»`);
  await page.look(`board-wall-${tag}`, [12.5, 1.7, -27.0], [14.58, 1.5, -28.5]);
  await press(page, phone, 'e', '#actE');
  const board = await page.evaluate(() => ({ open: !document.getElementById('jobs').hidden, rows: [...document.querySelectorAll('#jobs li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), scroll: document.documentElement.scrollWidth,
    btn: [...document.querySelectorAll('#jobs .go')].map((b) => Math.round(b.getBoundingClientRect().height)) }));
  check(board.open && board.rows.length === 3 && board.btn.every((x) => x >= 44) && board.scroll <= w, `${tag}: доска: ${board.rows.join(' | ')} (кнопки ${board.btn} px)`);
  await page.shot(`board-${tag}`);

  // Доска открыта (или открыть: Лёва на прогулке, к доске, E).
  const toJobs = async () => { if (await page.evaluate(() => !document.getElementById('jobs').hidden)) return;
    await page.evaluate(() => { for (let i = 0; i < 400 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1, { x: 0, y: 0 }); }); await toBoard(page); await press(page, phone, 'e', '#actE'); };

  // ---------- Урок ----------
  if (JOBS.includes('coach')) {
  await toJobs();
  await page.click('#jobs [data-job="coach"]');
  await page.waitForFunction(() => __lev.jobs.cur?.save, null, { timeout: 120000 });
  const feeds = phone ? 2 : 10;
  const fed = [];
  for (let i = 0; i < feeds; i++) {
    await page.evaluate(() => { const g = __lev.game, S = __lev.jobs.cur; for (let k = 0; k < 400 && !(g.state === 'drill' && g.now >= S.readyAt); k++) __lev.step(0.05); });
    const zx = await page.evaluate(() => __lev.jobs.cur.zx), dir = zx < 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(dir);
    if (phone) await page.evaluate(() => document.getElementById('jobFeed').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    else await page.keyboard.down('KeyK');
    await page.evaluate(() => __lev.step(0.5));
    if (i === 0) await page.shot(`lesson-aim-${tag}`); // кольцо идёт к зелёной зоне
    await page.evaluate(() => __lev.step(0.19));
    if (phone) await page.evaluate(() => document.getElementById('jobFeed').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    else await page.keyboard.up('KeyK');
    await page.keyboard.up(dir);
    if (i === 1) { // ученик бьёт: кадр сбоку у его половины
      await page.evaluate(() => { const g = __lev.game; for (let k = 0; k < 120 && g.lastHitter !== g.opp && !__lev.jobs.cur.feed?.done; k++) __lev.step(0.02); });
      const P = await page.evaluate(() => __lev.game.opp.pos.toArray());
      await page.look(`lesson-student-${tag}`, [P[0] + 3.4, 1.6, P[2] + 3.2], [P[0], 1.0, P[2]]);
      await page.shot(`lesson-${tag}`);
    }
    const r = await page.evaluate(() => { const S = __lev.jobs.cur; for (let k = 0; k < 300 && S.feed && !S.feed.done; k++) __lev.step(0.05); return { n: S.n, good: S.feed?.good, ret: S.ret }; });
    fed.push(r.good ? 1 : 0);
  }
  const lesson = await page.evaluate(() => { const S = __lev.jobs.cur; return { n: S.n, good: S.good, ret: S.ret, best: S.best, audit: __lev.game.lev.rig.audit() }; });
  check(lesson.n === feeds && lesson.good >= Math.ceil(feeds * 0.5), `${tag}: урок: набросов ${lesson.n}, удобных ${lesson.good}, ученик отбил ${lesson.ret}, серия ${lesson.best}`);
  if (!phone) {
    const end = await page.evaluate(() => { for (let k = 0; k < 100 && __lev.jobs.cur; k++) __lev.step(0.05); return { cur: !!__lev.jobs.cur, line: document.querySelector('#job p').textContent, club: __lev.club.mode, opp: __lev.game.opp === __lev.jobs.J.student ? 'ученик' : 'соперник', oppVis: __lev.game.opp.wrap.visible, drill: !!__lev.game.drill }; });
    const m1 = await cash(page);
    check(!end.cur && m1 > money0 && /Урок окончен/.test(end.line) && end.opp === 'соперник' && end.oppVis && !end.drill && end.club === 'exit', `${tag}: итог урока «${end.line}», +${m1 - money0} CHF, соперник на месте, Лёва уходит с корта`);
    await page.shot(`lesson-end-${tag}`);
    const again = await page.evaluate(() => { for (let i = 0; i < 400 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1, { x: 0, y: 0 }); return __lev.club.mode; });
    await toBoard(page); await press(page, phone, 'e', '#actE');
    const wait = await page.evaluate(() => document.querySelector('#jobs li').textContent);
    check(again === 'walk' && /через 4/.test(wait), `${tag}: урок взят — на доске «${wait.replace(/\s+/g, ' ').trim()}»`);
  } else {
    await page.tap('#jobExit');
    const ab = await page.evaluate(() => { for (let i = 0; i < 400 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1, { x: 0, y: 0 }); return { cur: !!__lev.jobs.cur, line: document.querySelector('#job p').textContent, mode: __lev.club.mode }; });
    check(!ab.cur && /брошена/.test(ab.line) && ab.mode === 'walk' && (await cash(page)) === money0, `${tag}: «Закончить» — работа брошена без оплаты, Лёва на прогулке`);
  }
  }

  // ---------- Смена баристы ----------
  if (JOBS.includes('barista')) {
  const m2 = await cash(page);
  await toJobs();
  await page.click('#jobs [data-job="barista"]');
  await page.waitForFunction(() => __lev.jobs.cur?.t0 != null, null, { timeout: 120000 });
  // Бот: ждёт заказ, берёт нужное у стойки (вода — налить из графина), ставит гостю на стол.
  const BOT = `(() => {
    const J = __lev.jobs.J, H = __lev.club.hands, T = __lev.club.terrace, bar = T.surfaces.find((s) => s.name === 'стойка');
    const run = (gen) => { H.start(gen); for (let k = 0; k < 600 && H.busy; k++) __lev.step(0.04, { x: 0, y: 0 }); };
    const onBar = (kind, f) => T.vessels.find((v) => v.kind === kind && v.spot && bar.spots.includes(v.spot) && f(v));
    return function serve(g) {
      let v = onBar(g.order, (v) => v.fill > 0.4);
      if (!v && g.order === 'water') { const cf = T.vessels.find((x) => x.kind === 'carafe'), gl = onBar('water', () => true); if (!cf || !gl) return false;
        run(H.take(cf)); run(H.pour(gl)); const sp = bar.spots.find((s) => !s.item); if (sp) run(H.put(sp)); v = gl; }
      if (!v) return false;
      run(H.take(v));
      const at = g.seat.at, sp = g.table.spots.filter((s) => !s.item).sort((a, b) => Math.hypot(a.pos.x - at.x, a.pos.z - at.z) - Math.hypot(b.pos.x - at.x, b.pos.z - at.z))[0];
      if (!sp) return false;
      H.start(H.put(sp)); return true;
    };
  })()`;
  await page.evaluate((src) => { window.__serve = eval(src); }, BOT);
  // Первый заказ: кадр гостя со значком, потом Лёва ставит заказ на стол.
  const first = await page.evaluate(() => { const J = __lev.jobs.J; let g = null; for (let k = 0; k < 900 && !(g = J.guests.find((x) => x.state === 'wait')); k++) __lev.step(0.05, { x: 0, y: 0 }); return g ? { order: g.order, at: g.p.pos.toArray(), yaw: g.seat.yaw } : null; });
  check(!!first, `${tag}: гость сел и заказал (${first?.order})`);
  const sit = await page.evaluate(() => { const g = __lev.jobs.J.guests.find((x) => x.state === 'wait'), a = g.p.rig.audit(), bad = (s) => Object.entries(s).filter(([, v]) => v === true).map(([k]) => k);
    return { bad: [...bad(a.Left), ...bad(a.Right)], hips: +(g.p.rig.b.Hips.getWorldPosition(g.p.pos.clone()).y - g.seat.h).toFixed(2) }; });
  check(sit.bad.length === 0 && sit.hips > 0 && sit.hips < 0.25, `${tag}: гость сидит без выворотов (таз над сиденьем ${sit.hips} м, ${sit.bad.join(', ') || 'нарушений нет'})`);
  if (first) {
    const [x, , z] = first.at, fx = Math.sin(first.yaw), fz = Math.cos(first.yaw);
    await page.look(`bar-guest-${tag}`, [x + fx * 2.4 - fz * 1.2, 1.7, z + fz * 2.4 + fx * 1.2], [x, 1.25, z]);
  }
  let shotPut = false, served = 0;
  const T_END = await page.evaluate(() => __lev.jobs.cur.end);
  for (let round = 0; round < 60; round++) {
    const st = await page.evaluate(() => { const J = __lev.jobs.J, S = __lev.jobs.cur; if (!S || S.kind !== 'barista') return { over: true };
      const g = J.guests.find((x) => x.state === 'wait'); if (!g) { __lev.step(1, { x: 0, y: 0 }); return { wait: true }; }
      return { ok: window.__serve(g), now: __lev.game.now }; });
    if (st.over) break;
    if (st.ok && !shotPut) { // Лёва ставит заказ на стол гостю: кадр, пока кисть у стола
      shotPut = true;
      await page.evaluate(() => { const H = __lev.club.hands; for (let k = 0; k < 400 && !(H.goal && H.goal.w > 0.6); k++) __lev.step(0.02, { x: 0, y: 0 }); });
      const P = await page.evaluate(() => { const L = __lev.club.lev, y = L.netYaw + L.bodyTurn; return [L.pos.x, L.pos.z, Math.sin(y), Math.cos(y)]; });
      await page.look(`bar-serve-${tag}`, [P[0] + P[2] * 1.9 + P[3] * 1.3, 1.65, P[1] + P[3] * 1.9 - P[2] * 1.3], [P[0] + P[2] * 0.35, 1.0, P[1] + P[3] * 0.35]);
      await page.walkShot(`bar-${tag}`);
    }
    if (st.ok) await page.evaluate(() => { const H = __lev.club.hands; for (let k = 0; k < 400 && H.busy; k++) __lev.step(0.04, { x: 0, y: 0 }); __lev.step(0.3, { x: 0, y: 0 }); });
    served = await page.evaluate(() => __lev.jobs.cur?.waits?.length ?? -1);
    if (phone && served >= 1) break;
  }
  if (phone) {
    check(served >= 1, `${tag}: бариста: заказ на столе, гость доволен (${served})`);
    await page.tap('#jobExit');
  } else {
    const bar = await page.evaluate((tEnd) => { for (let k = 0; k < 4000 && __lev.jobs.cur; k++) __lev.step(0.1, { x: 0, y: 0 }); return { cur: !!__lev.jobs.cur, line: document.querySelector('#job p').textContent, now: __lev.game.now, tEnd, racket: __lev.club.lev.racket.visible,
      orig: __lev.club.terrace.vessels.length, hidden: __lev.club.terrace.vessels.filter((v) => !v.obj.visible).length }; }, T_END);
    const m3 = await cash(page);
    check(!bar.cur && m3 - m2 >= 20 && m3 - m2 <= 40 && /Смена окончена/.test(bar.line) && bar.racket && bar.hidden === 0, `${tag}: смена: «${bar.line}», +${m3 - m2} CHF, ракетка снова в руке, посуда на местах (${bar.orig})`);
  }
  const guestsGone = await page.evaluate(() => { for (let k = 0; k < 600 && __lev.jobs.J.guests.some((g) => g.state !== 'off'); k++) __lev.step(0.1, { x: 0, y: 0 }); return __lev.jobs.J.guests.every((g) => g.state === 'off'); });
  check(guestsGone, `${tag}: после смены гости ушли с террасы`);
  }

  // ---------- Спарринг ----------
  if (JOBS.includes('spar')) {
  const m4 = await cash(page);
  await toJobs();
  await page.click('#jobs [data-job="spar"]');
  await page.waitForFunction(() => __lev.jobs.cur?.save, null, { timeout: 120000 });
  await page.evaluate(() => { const g = __lev.game; g.autoLev = new g.ai.constructor(g.lev, g); g.resetPoint(g.now); }); // за Лёву бот, подачу тоже
  await page.evaluate(() => { const g = __lev.game; for (let k = 0; k < 600 && !(g.state === 'rally' && g.rally >= 3); k++) __lev.step(0.05); });
  await page.shot(`spar-${tag}`);
  const P = await page.evaluate(() => __lev.game.opp.pos.toArray());
  await page.look(`spar-guest-${tag}`, [P[0] + 3, 1.6, P[2] + 3], [P[0], 1.0, P[2]]);
  if (phone) {
    await page.tap('#jobExit');
    const ab = await page.evaluate(() => { for (let k = 0; k < 20; k++) __lev.step(0.05); return { cur: !!__lev.jobs.cur, opp: __lev.game.opp !== __lev.jobs.J.sparer, mode: __lev.club.mode }; });
    check(!ab.cur && ab.opp && ab.mode === 'exit', `${tag}: спарринг брошен, соперник вернулся (${JSON.stringify(ab)})`);
  } else {
    const sp = await page.evaluate(() => { const g = __lev.game, ev = window.__events, n0 = ev.length; let S = __lev.jobs.cur, last = S;
      for (let k = 0; k < 20000 && __lev.jobs.cur; k++) { last = __lev.jobs.cur; __lev.step(0.05); }
      const e = ev.slice(n0), c = e.filter((x) => x.type === 'contact' && x.who === 'lev');
      return { cur: !!__lev.jobs.cur, n: last.n, long: last.long, win: last.win, line: document.querySelector('#job p').textContent, games: [...g.games.values()], opp: g.opp !== __lev.jobs.J.sparer, hit: c.length ? +(c.filter((x) => x.hit).length / c.length).toFixed(2) : null };
    });
    const m5 = await cash(page);
    check(!sp.cur && sp.n === 10 && m5 - m4 >= 25 && m5 - m4 <= 35 && sp.opp && /Спарринг окончен/.test(sp.line), `${tag}: спарринг: ${sp.n} розыгрышей, длинных ${sp.long}, виннеров ${sp.win}, +${m5 - m4} CHF, «${sp.line}», попадание бота ${sp.hit}`);
    const hist = await page.evaluate(() => window.__eco.wallet.history.slice(0, 3).map((x) => `${x.why} ${x.amount}`));
    check(hist.length === JOBS.length, `${tag}: кошелёк: ${money0} → ${m5} CHF (${hist.join(', ')})`);
  }
  }
  check(page.errs.length === 0, `${tag}: без ошибок страницы ${page.errs.slice(0, 3).join(' | ')}`);
  await page.close();
}
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
await browser.close();
process.exit(failed ? 1 : 0);
