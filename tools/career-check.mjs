// Проверка карьеры (career.js) в безголовом Chromium: передышка (кадры крупно спереди и сбоку по фазам, анатомия),
// плохой день (бот бьёт рискованно и надёжно — ошибки), итог «боролся», рост соперника после проигрыша Лёве,
// турнир от стенда до финала (бот), деньги; кадры на 1440 и 390. Кадры и сводка — в test-out/career.
//   node tools/career-check.mjs [--url http://localhost:3952] [--out test-out/career] [--only rest,bad,end,grow,tour] [--points 24]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/career'), URL = opt('url', 'http://localhost:3952'), ONLY = opt('only', 'rest,bad,end,grow,tour').split(','), POINTS = +opt('points', 24);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [], data = {};
let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

async function open(w, h, q = '') {
  const phone = w < 500;
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) })).newPage(); // своё хранилище: кошелёк и карьера с нуля
  page.setDefaultTimeout(240000);
  page.errs = []; page.on('pageerror', (e) => { page.errs.push(e.message); console.log('ОШИБКА СТРАНИЦЫ:', e.message); });
  await page.goto(`${URL}/?debug&nolog&noao${q}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && window.__career && !document.getElementById('play').disabled, null, { timeout: 240000 });
  page.shot = async (name, render = true) => { if (render) await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 180000 }); };
  return page;
}
// Матч: старт, пауза, без отрисовки; стартовый экран гаснет без перехода (в безголовом Chromium переходы стоят).
const play = (page) => page.evaluate(() => {
  const s = document.getElementById('start'); s.style.transition = 'none';
  document.getElementById('play').click(); window.__pause = true; window.__noDraw = true;
});

// ---------- Клавиатура и бот за Лёву (как в playtest.mjs) ----------
// mode 'risky' — держит удар до максимума силы и бьёт в острые углы, укороченные; 'safe' — касание без силы, в центр;
// 'drops' — надёжно, а когда соперник сзади — укороченный от него (так Лёва обыгрывал соперника 17.11).
const BOT = (mode) => {
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const held = new Set(), mv = new Set();
  const io = window.__io = {
    hold(c, run = false) { if (run) mv.add(c); else mv.delete(c); if (!held.has(c)) { held.add(c); key(c, true); } },
    release(c) { mv.delete(c); if (held.has(c)) { held.delete(c); key(c, false); } },
    releaseAll() { for (const c of [...held]) this.release(c); },
    tap(c) { key(c, true); key(c, false); },
    goTo(L, tgt, late = 0.1, may = true) {
      const axis = (delta, v, pos, neg) => {
        const k = mv.has(pos) ? 1 : mv.has(neg) ? -1 : 0;
        if (k && delta * k < v * k * late + 0.08) this.release(k > 0 ? pos : neg);
        else if (!k && may && Math.abs(delta) > 0.3 && !held.has(delta > 0 ? neg : pos)) this.hold(delta > 0 ? pos : neg, true);
      };
      axis(tgt.x - L.pos.x, L.vel.x, 'KeyD', 'KeyA'); axis(L.pos.z - tgt.z, -L.vel.z, 'KeyW', 'KeyS');
    },
  };
  let r = 12345; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const g = __lev.game, L = () => g.lev;
  let ball = null, react = 0, plan = null, nextPlan = 0, pressAt = null, srv = null, serveAt = null, aim = [];
  const R = mode === 'risky';
  window.__bot = (now) => {
    const b = g.b, P = L();
    if (srv && now >= srv.at) { for (const k of srv.keys) io.release(k); srv = null; }
    if (g.state === 'serve' && g.server === P && !g.autoLev) { // подача: рискованно — сверху с полной силой, надёжно — сверху без силы
      if (!srv) io.releaseAll();
      serveAt ??= now + 0.8;
      if (now >= serveAt && !srv && now >= (g.holdUntil ?? 0)) { serveAt = null; io.hold('KeyK'); srv = { keys: ['KeyK'], at: now + (R ? 0.75 : 0.05) }; }
      return;
    }
    const incoming = b.live && g.state === 'rally' && g.lastHitter === g.opp;
    // Подача: K держим до srv.at — это сила, не отпускаем вместе со всем.
    if (!incoming) { if (!srv) io.releaseAll(); ball = null; plan = null; pressAt = null; if (!P.stroke || P.stroke.contacted) io.goTo(P, P.home, 0.1, true); return; }
    if (ball !== g.rally) { ball = g.rally; react = now + 0.18 + rnd() * 0.12; pressAt = null; aim = []; }
    if (now < react) return;
    if (!plan || now >= nextPlan) { plan = P.plan(b, now, 0, 0.5) ?? P.plan(b, now, 0, 0.25); nextPlan = now + 0.1; }
    if (!plan || plan.out) return;
    const free = !P.stroke || P.stroke.contacted;
    io.goTo(P, plan.stand, 0.08, free || P.stroke.tContact - now > 0.7);
    if (free && pressAt == null) pressAt = plan.t - (R ? 0.8 : 0.5);
    if (free && pressAt != null && now >= pressAt) {
      pressAt = Infinity;
      const side = plan.type === 'bh' ? 'KeyJ' : 'KeyK', away = g.opp.pos.x > 0 ? 'KeyA' : 'KeyD', c = rnd();
      if (mode === 'drops' && Math.abs(g.opp.pos.z) > 10) { io.tap('KeyL'); aim = [away]; } // соперник сзади — укороченный от него
      else if (R && c < 0.25) { io.tap('KeyL'); aim = [away]; } // укороченный в сторону от соперника
      else if (R) { io.hold(side); aim = c < 0.6 ? [away, 'KeyS'] : [away, 'KeyW']; } // сила и острый угол или глубоко в угол
      else io.tap(side); // касание без силы, без направления — по диагонали ближе к центру
    }
    if (aim.length && P.stroke && !P.stroke.contacted && now >= P.stroke.tContact - 0.25) { for (const k of aim) io.hold(k); aim = []; }
    if (P.stroke && now > P.stroke.tContact + 0.15) io.releaseAll();
  };
};
// Шагает игру до N очков (бот за Лёву), возвращает события.
async function rally(page, need, skill = 0.7) {
  const ev = [];
  for (let guard = 0; guard < 400; guard++) {
    const r = await page.evaluate(({ need, skill }) => {
      const g = __lev.game, E = window.__events;
      for (let i = 0; i < 20 * 120; i++) {
        window.__bot(g.now); __lev.step(1 / 120);
        if (skill) g.ai.skill = skill;
        if (E.filter((e) => e.type === 'point').length >= need || E.some((e) => e.type === 'match')) break;
      }
      return E.splice(0);
    }, { need: need - ev.filter((e) => e.type === 'point').length, skill });
    ev.push(...r);
    if (ev.filter((e) => e.type === 'point').length >= need || ev.some((e) => e.type === 'match')) break;
  }
  return ev;
}
const ERR = ['Аут', 'Сетка', 'Не перелетел', 'Двойная'];
// Ошибки Лёвы на его ударах: очко сопернику по ошибке Лёвы (не подача) на число его ударов с отскока и с лёта.
function errStats(ev) {
  const shots = ev.filter((e) => e.type === 'shot' && e.who === 'lev' && !e.serve).length, serves = ev.filter((e) => e.type === 'serve' && e.who === 'lev');
  let last = null, errs = 0;
  for (const e of ev) { if (e.type === 'shot') last = e; if (e.type === 'point' && e.winner === 'opp' && ERR.includes(e.why) && e.why !== 'Двойная' && last?.who === 'lev' && !last.serve) errs++; }
  const faults = ev.filter((e) => e.type === 'fault' && e.who === 'lev').length, doubles = ev.filter((e) => e.type === 'point' && e.why === 'Двойная' && e.winner === 'opp').length;
  const first = serves.filter((e) => e.n === 1).length;
  const pts = ev.filter((e) => e.type === 'point');
  return { shots, errs, errRate: shots ? +(errs / shots).toFixed(3) : null, firstIn: first ? +(1 - faults / first).toFixed(2) : null, doubles, points: pts.length, levShare: pts.length ? +(pts.filter((e) => e.winner === 'lev').length / pts.length).toFixed(2) : null };
}

// ---------- Передышка: позы по фазам, крупно спереди и сбоку ----------
if (ONLY.includes('rest')) {
  const page = await open(1440, 900, '&form=-1');
  await play(page);
  const shots = [];
  await page.evaluate(() => { const g = __lev.game; g.server = g.opp; g.resetPoint(g.now); __lev.step(0.2); __career.startRest(); });
  const before = await page.evaluate(() => ({ relief: __lev.game.lev.relief, hold: __lev.game.holdUntil - __lev.game.now, serveAt: __lev.game.serveAt }));
  for (const t of [0.35, 0.7, 1.0, 1.25, 1.6, 1.85, 2.25, 2.6, 3.3]) {
    const a = await page.evaluate((t) => {
      const g = __lev.game, L = g.lev, t0 = __career.rest.t0;
      __lev.step(Math.max(0, t0 + t - g.now));
      const y = L.netYaw + L.bodyTurn, f = [Math.sin(y), Math.cos(y)], P = L.pos;
      return { t, turn: +L.bodyTurn.toFixed(2), state: g.state, served: !!g.serving, audit: L.rig.audit(), eye: [P.x + f[0] * 2.4 + f[1] * 0.4, 1.45, P.z + f[1] * 2.4 - f[0] * 0.4], side: [P.x + f[1] * 2.6, 1.35, P.z - f[0] * 2.6], at: [P.x, 1.05, P.z] };
    }, t);
    shots.push(a);
    await page.evaluate((a) => __lev.shot(a.eye, a.at), a); await page.shot(`rest-${a.t}-front`, false);
    await page.evaluate((a) => __lev.shot(a.side, a.at), a); await page.shot(`rest-${a.t}-side`, false);
    if (a.t === 1.0 || a.t === 1.85) { // кисти крупно
      await page.evaluate(() => { const h = __lev.bone('LeftHand'), L = __lev.game.lev, y = L.netYaw + L.bodyTurn; __lev.shot([h[0] + Math.sin(y) * 0.7 - Math.cos(y) * 0.3, h[1] + 0.15, h[2] + Math.cos(y) * 0.7 + Math.sin(y) * 0.3], h); });
      await page.shot(`rest-${a.t}-hand`, false);
    }
  }
  await page.evaluate(() => __lev.render()); await page.shot('rest-game-cam');
  const bad = shots.filter((s) => s.audit.Left.elbowBack || s.audit.Right.elbowBack || s.audit.Left.kneeBack || s.audit.Right.kneeBack || (s.audit.Right.wrist ?? 0) > 50 || (s.audit.gripGap ?? 0) > 0.05);
  data.rest = { before, phases: shots.map((s) => ({ t: s.t, turn: s.turn, state: s.state, served: s.served, elbows: [s.audit.Left.elbow, s.audit.Right.elbow], wrist: s.audit.Right.wrist })) };
  check(before.relief === 0.2 && before.hold > 3, `передышка снимает 20 % штрафа и держит подачу ${JSON.stringify(before)}`);
  check(shots.some((s) => Math.abs(s.turn) > 2.6) && Math.abs(shots.at(-1).turn) < 0.3, `разворот к заднему забору и обратно ${shots.map((s) => s.turn).join(' ')}`);
  check(!shots.slice(0, -1).some((s) => s.served), 'соперник ждёт, подача не уходит до конца передышки');
  check(bad.length === 0, `анатомия передышки: нарушений ${bad.length} ${JSON.stringify(bad.map((b) => [b.t, b.audit.Left, b.audit.Right]))}`);
  await page.close();
}

// ---------- Плохой день: рискованно и надёжно, в плохой и обычный день ----------
if (ONLY.includes('bad')) {
  data.bad = {};
  for (const [form, mode] of [[0, 'risky'], [-1, 'risky'], [0, 'safe'], [-1, 'safe']]) {
    const page = await open(960, 700, `&form=${form}&oppform=0`);
    await play(page);
    await page.evaluate(BOT, mode);
    const ev = await rally(page, POINTS);
    data.bad[`${form < 0 ? 'плохой' : 'обычный'}, ${mode === 'risky' ? 'рискованно' : 'надёжно'}`] = errStats(ev);
    data.bad[`tip ${form},${mode}`] = await page.evaluate(() => (window.__career.M.tipShown ? 'была' : null));
    await page.close();
  }
  console.log(JSON.stringify(data.bad, null, 1));
  const b = data.bad, rk = (f) => b[`${f}, рискованно`], sf = (f) => b[`${f}, надёжно`];
  check(rk('плохой').errRate > rk('обычный').errRate + 0.06, `плохой день: рискованные удары ошибаются заметно чаще (${rk('плохой').errRate} против ${rk('обычный').errRate})`);
  check(sf('плохой').errRate < sf('обычный').errRate + 0.04, `плохой день: надёжные почти не страдают (${sf('плохой').errRate} против ${sf('обычный').errRate})`);
  check(rk('плохой').firstIn < rk('обычный').firstIn, `плохой день: сильная первая подача мимо чаще (${rk('плохой').firstIn} против ${rk('обычный').firstIn})`);
  check(b['tip -1,risky'] != null && b['tip 0,risky'] == null && b['tip 0,safe'] == null, 'строка «Сегодня не идёт» — только в плохой день и после ошибок');
}

// ---------- Итог «боролся» на 1440 и 390, рост соперника после проигрыша Лёве ----------
// Короткий сет (setTo 2, параметр game.js), слабый соперник: Лёва выигрывает, соперник учится по журналу.
if (ONLY.includes('end') || ONLY.includes('grow')) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await open(w, h, '&form=0&oppform=-1'), tag = `${w}`;
  await play(page);
  await page.evaluate(BOT, 'drops');
  const before = await page.evaluate(() => { const g = __lev.game; g.setTo = 2; g.ai.fixed = true; g.ai.skill = 0.4; return JSON.stringify(__career.S.rivals.base); });
  // Передышка в начале, потом матч ботом.
  await page.evaluate(() => { __lev.step(0.3); __career.startRest(); __lev.step(3.4); });
  if (w < 500) { // подаёт соперник, строка плохого дня и кнопка «Передышка» не налезают друг на друга
    await page.evaluate(() => { const g = __lev.game; g.tip = 'Сегодня не идёт. Играй надёжно и бери передышку'; g.server = g.opp; g.resetPoint(g.now); __lev.step(0.05); });
    await page.shot(`brest-${tag}`);
    const r = await page.evaluate(() => { const a = document.getElementById('hint').getBoundingClientRect(), b = document.getElementById('brest').getBoundingClientRect(); __lev.game.tip = null; return { hint: [a.top, a.bottom], btn: [b.top, b.bottom], shown: !document.getElementById('brest').hidden }; });
    check(r.shown && r.btn[1] > r.btn[0] && r.hint[1] <= r.btn[0], `390: «Передышка» между очками, строка подсказки над ней ${JSON.stringify(r)}`);
  }
  const ev = await rally(page, 60, 0.4);
  await page.evaluate(() => { for (let i = 0; i < 40 && document.getElementById('end').hidden; i++) __lev.step(0.1); document.getElementById('end').style.transition = 'none'; });
  const end = await page.evaluate(() => ({ shown: !document.getElementById('end').hidden, t: document.getElementById('endT').textContent, s: document.getElementById('endS').textContent, f: document.getElementById('endF').innerText, again: document.getElementById('again').textContent, scroll: document.documentElement.scrollWidth }));
  await page.shot(`end-${tag}`);
  const after = await page.evaluate(() => ({ base: __career.S.rivals.base, last: __career.M.last }));
  data[`end-${tag}`] = { end, before: JSON.parse(before), after, points: ev.filter((e) => e.type === 'point').length };
  check(end.shown && /Очков выиграно \d+, самый длинный розыгрыш \d+/.test(end.f) && /Передышек 1/.test(end.f) && end.scroll <= w, `${tag}: итог «боролся» ${JSON.stringify(end)}`);
  if (w === 1440) {
    const k = after.base.learned, wb = after.last.levWon;
    check(wb && k && after.base.adapt[k] > JSON.parse(before).adapt[k], `соперник проиграл и подтянул слабое место: ${k} ${JSON.stringify(after.base.adapt)}`);
    // Следующий матч: строка, чему он научился.
    await page.evaluate(() => { document.getElementById('again').click(); __lev.step(0.1); });
    const tip = await page.evaluate(() => document.getElementById('hint').textContent);
    await page.shot(`grow-tip-${tag}`);
    check(/^Соперник /.test(tip), `перед следующим матчем: «${tip}»`);
    // Соперник в плохой день: голова ниже после своей ошибки (кадр сбоку-спереди соперника).
    await page.evaluate(() => { const g = __lev.game, o = g.opp; o.idle = true; o.gest = { k: 'down', t0: g.now - 2.2 }; for (let i = 0; i < 30; i++) o.update(1 / 120, g.now, new o.pos.constructor(), g.b); const P = o.pos; __lev.shot([P.x + 1.6, 1.5, P.z + 2.6], [P.x, 1.0, P.z]); });
    await page.shot('opp-bad-day', false);
  }
  await page.close();
}

// ---------- Турнир: от стенда до финала ботом, деньги ----------
async function toStand(page) {
  await page.evaluate(() => { document.getElementById('cexit').click(); });
  await page.waitForFunction(() => __lev.club.mode, null, { timeout: 120000 }); // замена догружается: выход ждёт её
  await page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1); });
  await page.evaluate(() => { const L = __lev.club.lev; L.pos.set(12.75 - 0.95, 0, -16.2); L.vel.set(0, 0, 0); __lev.step(0.3, { x: 0, y: 0 }); });
}
if (ONLY.includes('tour')) {
  const page = await open(1440, 900, '&form=0');
  await play(page);
  await page.evaluate(BOT, 'drops');
  await toStand(page);
  const label = await page.evaluate(() => document.getElementById('actE').innerText);
  await page.evaluate(() => { const L = __lev.club.lev; __lev.shot([L.pos.x - 3.2, 2.0, L.pos.z + 1.6], [L.pos.x + 1, 1.2, L.pos.z]); });
  await page.shot('stand-1440', false);
  check(/записаться на\s*турнир/.test(label), `у стенда подсказка «${label}»`);
  const money0 = await page.evaluate(() => __eco.wallet.balance);
  await page.keyboard.press('KeyE');
  await page.shot('tour-open-1440');
  check(await page.evaluate(() => !document.getElementById('tour').hidden), 'E у стенда — экран турнира');
  await page.evaluate(() => document.querySelector('#tour [data-a="enter"]').click());
  const t0 = await page.evaluate(() => ({ seeds: __career.S.tour.seeds, money: __eco.wallet.balance }));
  await page.shot('tour-entered-1440');
  check(t0.money === money0 - 20 && t0.seeds.length === 4, `взнос 20 CHF, сетка ${t0.seeds.join(', ')}`);
  const played = [];
  for (let m = 0; m < 2; m++) {
    await page.evaluate(() => document.querySelector('#tour [data-a="play"]').click());
    await page.waitForFunction(() => __lev.game.setTo === 4 && !__lev.club.active, null, { timeout: 60000 });
    const info = await page.evaluate(() => ({ opp: __lev.game.opp.rival?.id ?? 'base', setTo: __lev.game.setTo, fixed: __lev.game.ai.fixed, skill: __lev.game.ai.skill, want: __career.M.tour?.opp }));
    const ev = await rally(page, 400, 0);
    await page.evaluate(() => { for (let i = 0; i < 40 && document.getElementById('end').hidden; i++) __lev.step(0.1); document.getElementById('end').style.transition = 'none'; });
    const end = await page.evaluate(() => ({ t: document.getElementById('endT').textContent, s: document.getElementById('endS').textContent, again: document.getElementById('again').textContent }));
    await page.shot(`tour-end-${m}-1440`);
    played.push({ ...info, end, points: ev.filter((e) => e.type === 'point').length, share: errStats(ev).levShare });
    await page.evaluate(() => document.getElementById('again').click());
    await page.shot(`tour-after-${m}-1440`);
  }
  const t1 = await page.evaluate(() => ({ tour: __career.S.tour, money: __eco.wallet.balance, rating: __career.S.rating }));
  data.tour = { played, t1 };
  console.log(JSON.stringify(data.tour, null, 1));
  check(played.every((p) => p.opp === p.want && p.setTo === 4 && p.fixed) && played.every((p) => /\d+:\d+/.test(p.end.s) && p.end.again === 'Сетка турнира'), `матчи турнира: соперник из сетки, сет до 4, сила без подстройки ${JSON.stringify(played.map((p) => [p.opp, p.end.s]))}`);
  check(t1.tour.place >= 1 && t1.money === t0.money + [150, 60, 25, 0][t1.tour.place - 1], `итог: ${t1.tour.place}-е место, кошелёк ${t0.money} → ${t1.money}, рейтинг ${t1.tour.r0} → ${t1.rating}`);
  await page.evaluate(() => document.querySelector('#tour .x').click());
  await page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1); });
  await page.waitForFunction(() => __lev.game.setTo === 6 && !__lev.game.opp.rival, null, { timeout: 60000 }).catch(() => {});
  const back = await page.evaluate(() => ({ setTo: __lev.game.setTo, fixed: __lev.game.ai.fixed, opp: __lev.game.opp.rival?.id ?? 'base', walk: __lev.club.mode }));
  check(back.setTo === 6 && !back.fixed && back.opp === 'base' && back.walk === 'walk', `после турнира — прогулка, обычный матч и соперник ${JSON.stringify(back)}`);
  await page.close();
  // Телефон: стенд, экран турнира до записи, после записи и с итогом.
  const ph = await open(390, 844, '&form=0');
  await play(ph);
  await toStand(ph);
  await ph.shot('stand-390');
  await ph.evaluate(() => document.getElementById('actE').click());
  await ph.shot('tour-open-390');
  await ph.evaluate(() => document.querySelector('#tour [data-a="enter"]').click());
  await ph.shot('tour-entered-390');
  const lay = await ph.evaluate(() => { const r = document.querySelector('#tour .sheet').getBoundingClientRect(), bs = [...document.querySelectorAll('#tour button')].map((b) => b.getBoundingClientRect().height); return { w: r.width, bottom: r.bottom, h: innerHeight, scroll: document.documentElement.scrollWidth, minBtn: Math.min(...bs) }; });
  check(lay.scroll <= 390 && lay.minBtn >= 44 && lay.bottom <= lay.h + 1, `390: экран турнира без прокрутки вбок, кнопки от 44 px ${JSON.stringify(lay)}`);
  await ph.evaluate(() => { const c = __career, s = c.S; c.record(s, s.tour, true, [4, 2]); c.record(s, s.tour, false, [3, 5]); c.save(); c.openTour(); });
  await ph.shot('tour-done-390');
  await ph.close();
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ report, data }, null, 2));
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
console.log(failed ? `НЕ ПРОШЛО: ${failed}` : 'всё прошло');
await browser.close();
process.exit(failed ? 1 : 0);
