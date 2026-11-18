// Проверка девушек на корте 2 (girls.js) в безголовом Chromium: розыгрыши идут (очки, подбор мяча, ходьба между
// очками), кадры корта 2 сверху и крупно, разговор у калитки (1440 и 390), матч с ней на корте 1 и возврат.
//   node tools/girls-check.mjs --url http://localhost:3965 [--out test-out/girls] [--only sim,talk,match]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/girls'), URL = opt('url', 'http://localhost:3952'), ONLY = opt('only', 'sim,talk,match,coffee').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

async function open(w, h) {
  const phone = w < 500;
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto(URL + '/?debug&nolog&noao', { timeout: 400000 });
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && window.__lev.girls?.sim && !document.getElementById('play').disabled, null, { timeout: 400000 });
  await page.evaluate(() => { localStorage.removeItem('lev3d-girls'); window.__pause = true; window.__noDraw = true; for (const id of ['loader', 'start']) document.getElementById(id).style.display = 'none'; });
  return page;
}
const shot = (page, name, eye, at) => page.evaluate(([eye, at]) => { __lev.shot(eye, at); }, [eye, at]).then(() => page.screenshot({ path: join(OUT, name + '.png'), timeout: 180000 }));

if (ONLY.includes('sim')) {
  const page = await open(1440, 900);
  const r = await page.evaluate(() => {
    const G = __lev.girls, s = G.sim, seen = [];
    let last = s.state, picked = 0, walks = 0, hits = 0;
    const hook = s.contact.bind(s); s.contact = (p, st) => { if (s.b.live) hits++; return hook(p, st); };
    for (let i = 0; i < 2400; i++) { // 2 минуты игры
      const pk = !!s.picker; __lev.step(0.05);
      if (pk && !s.picker && s.state === 'walk') picked++;
      if (s.state !== last) { if (s.state === 'walk') walks++; seen.push(s.state); last = s.state; }
    }
    const a = G.girls.map((g) => g.p.rig.audit());
    return { walks, picked, hits, pts: [...s.pts.values()], games: [...s.games.values()], states: [...new Set(seen)], audit: a.map((x) => ({ L: x.Left, R: x.Right, grip: x.gripGap })) };
  });
  check(r.walks >= 3, `корт 2: розыгрышей ${r.walks}, мяч подобран ${r.picked} раз, ударов ${r.hits}, очки ${r.pts}, геймы ${r.games}, состояния ${r.states}`);
  // Кадры в разгар розыгрыша: сверху и крупно сбоку на каждую.
  await page.evaluate(() => { const s = __lev.girls.sim; for (let i = 0; i < 400 && !(s.state === 'rally' && s.rally >= 2); i++) __lev.step(0.05); __lev.girls.update(0, __lev.game.now); });
  const X = -38;
  await shot(page, 'court2-top', [X + 0.01, 34, 12], [X, 0, 0]);
  await shot(page, 'court2-tv', [X, 9, 26], [X, 0.5, 0]);
  for (const [i, n] of [[0, 'alina'], [1, 'sonya']]) {
    const P = await page.evaluate((i) => { const g = __lev.girls.girls[i]; return __lev.girls.world(g).toArray(); }, i);
    const s = P[2] > 0 ? 1 : -1;
    await shot(page, `court2-${n}`, [P[0] + 3.2 * s, 1.5, P[2] - 1.0 * s], [P[0], 0.95, P[2]]);
    await shot(page, `court2-${n}-back`, [P[0] - 0.5, 1.6, P[2] + 4.5 * s], [P[0], 1.0, P[2]]);
  }
  // Ходьба между очками: дождаться 'walk' и снять.
  await page.evaluate(() => { const s = __lev.girls.sim; for (let i = 0; i < 600 && !(s.state === 'walk' && s.picker); i++) __lev.step(0.05); __lev.step(0.4); });
  const W = await page.evaluate(() => __lev.girls.world(__lev.girls.sim.picker ? __lev.girls.girls[__lev.girls.sim.picker === __lev.girls.girls[0].p ? 0 : 1] : __lev.girls.girls[0]).toArray());
  await shot(page, 'court2-walk', [W[0] + 3, 1.6, W[2] + 2.5], [W[0], 0.9, W[2]]);
  check(page.errs.length === 0, `корт 2: без ошибок страницы ${page.errs.slice(0, 2).join(' | ')}`);
  await page.close();
}

if (ONLY.some((k) => ['talk', 'match', 'coffee'].includes(k))) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const phone = w < 500, tag = `${w}`;
  const page = await open(w, h);
  await page.evaluate(() => document.getElementById('play').click());
  // Выйти с корта, дойти до калитки корта 2 по дорожке за спиной Лёвы.
  if (phone) await page.tap('#cexit'); else await page.keyboard.press('q');
  await page.waitForFunction(() => __lev.club.mode === 'exit', null, { timeout: 30000 });
  await page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode === 'exit'; i++) __lev.step(0.1); });
  const walkTo = (pts) => page.evaluate((pts) => {
    const c = __lev.club, L = c.lev;
    for (const [tx, tz] of pts) for (let t = 0; t < 60; t += 1 / 20) {
      const dx = tx - L.pos.x, dz = tz - L.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.3) break;
      const ux = dx / d, uz = dz / d, a = c.camYaw;
      __lev.step(1 / 20, { x: ux * -Math.cos(a) + uz * Math.sin(a), y: ux * Math.sin(a) + uz * Math.cos(a), run: true });
    }
    return [L.pos.x, L.pos.z].map((v) => +v.toFixed(2));
  }, pts);
  const at = await walkTo([[10.85, 10.2], [11.4, 15.8], [10.3, 21.6], [6, 24.7], [-2, 25.7], [-12, 25.3], [-23, 23.6], [-25.6, 14], [-26.8, 3.99], [-28.0, 3.99]]);
  check(Math.hypot(at[0] + 28, at[1] - 3.99) < 0.6, `${tag}: Лёва у калитки корта 2 (${at})`);
  // Ждём паузу между очками — появится «Поговорить».
  const talk = () => document.getElementById('actE').lastChild.textContent.toLowerCase() === 'поговорить' && !document.getElementById('actE').hidden; // строка действия interact.js
  const btn = await page.evaluate((f) => { const ok = eval(f); for (let i = 0; i < 400 && !ok(); i++) __lev.step(0.05, { x: 0, y: 0 }); return ok(); }, talk.toString());
  check(btn, `${tag}: у калитки есть «Поговорить»`);
  if (phone) await page.tap('#actE'); else await page.keyboard.press('e');
  await page.evaluate(() => { __lev.step(2.5, { x: 0, y: 0 }); });
  const d1 = await page.evaluate(() => ({ open: !document.getElementById('gtalk').hidden, who: document.querySelector('#gtalk .who').textContent, say: document.querySelector('#gtalk .say').textContent, opts: [...document.querySelectorAll('#gtalk .opts button')].map((b) => b.textContent) }));
  check(d1.open && d1.opts.length >= 2, `${tag}: диалог: ${d1.who}: «${d1.say}» → ${d1.opts.join(' | ')}`);
  await page.evaluate(() => __lev.render());
  await page.screenshot({ path: join(OUT, `talk-hello-${tag}.png`) });
  // Знакомство: вариант 1.
  if (phone) await page.tap('#gtalk .opts button >> nth=0'); else await page.keyboard.press('1');
  const d2 = await page.evaluate(() => ({ who: document.querySelector('#gtalk .who').textContent, say: document.querySelector('#gtalk .say').textContent, opts: [...document.querySelectorAll('#gtalk .opts button')].map((b) => b.textContent), mem: JSON.parse(localStorage.getItem('lev3d-girls') ?? '{}') }));
  check(Object.values(d2.mem).some((m) => m.met), `${tag}: познакомились: ${d2.who}: «${d2.say}» → ${d2.opts.join(' | ')}`);
  await page.evaluate(() => __lev.render());
  await page.screenshot({ path: join(OUT, `talk-meet-${tag}.png`) });
  // Крупно: она у калитки, Лёва снаружи.
  const G = await page.evaluate(() => __lev.girls.world(__lev.girls.dlg.g).toArray());
  await shot(page, `talk-pair-${tag}`, [G[0] + 1.2, 1.7, G[2] + 4.2], [G[0] + 0.6, 1.0, G[2]]);
  if (ONLY.includes('match') && !phone) {
    // «Сыграем?» — пока не согласится (бывает отказ), потом матч на корте 1.
    const m = await page.evaluate(() => {
      const G = __lev.girls; let tries = 0;
      while (!G.match && tries++ < 12) {
        if (!G.dlg) G.talk(G.girls[0]);
        G.dlg.asked = {}; G.show('play');
        const o = G.dlg.node.opts; if (o[0][0].startsWith('Пошли')) G.choose(0); else G.close();
      }
      const g = __lev.game;
      return { match: !!G.match, opp: g.opp === G.girls[0].p, name: document.getElementById('st-o').parentElement.querySelector('small').textContent, club: __lev.club.active, tries };
    });
    check(m.match && m.opp && !m.club, `${tag}: матч с ней на корте 1 (${JSON.stringify(m)})`);
    await page.evaluate(() => { const g = __lev.game; g.autoLev = new (g.ai.constructor)(g.lev, g); g.resetPoint(g.now); }); // за Лёву ИИ, подачу тоже
    // Кадр матча с ней: камера матча за Лёвой, она на той стороне.
    await page.evaluate(() => { const g = __lev.game; for (let i = 0; i < 400 && !(g.state === 'rally' && g.rally >= 2); i++) __lev.step(0.05); });
    await page.evaluate(() => __lev.render());
    await page.screenshot({ path: join(OUT, `match-${tag}.png`) });
    const P = await page.evaluate(() => __lev.game.opp.pos.toArray());
    await shot(page, `match-her-${tag}`, [P[0] + 2.6, 1.5, P[2] + 2.2], [P[0], 0.95, P[2]]);
    const res = await page.evaluate(() => { const G = __lev.girls, g = __lev.game, shots = () => window.__events.filter((e) => e.type === 'shot' && e.who === 'opp').length, hits = () => window.__events.filter((e) => e.type === 'contact' && e.who === 'opp'), n0 = shots(), h0 = hits().length;
      let last = null; for (let i = 0; i < 16000 && G.match; i++) { __lev.step(0.05); if (G.match) last = [g.games.get(g.lev), g.games.get(g.opp), g.pts.get(g.lev), g.pts.get(g.opp)]; }
      const c = hits().slice(h0); return { done: !G.match, last, herShots: shots() - n0, herHit: c.length ? +(c.filter((e) => e.hit).length / c.length).toFixed(2) : null, oppBack: g.opp !== G.girls[0].p && g.opp.wrap.visible, where: G.girls[0].where, say: document.querySelector('#gtalk .say').textContent, mem: G.girls[0].mem }; });
    check(res.done && res.oppBack && res.where === 'court', `${tag}: матч доигран, соперник вернулся (${JSON.stringify(res)})`);
  }
  if (ONLY.includes('coffee') && !phone) {
    // Кофе: Соня идёт с корта 2 на террасу и садится у столика; Лёва подходит — разговор за столиком.
    // Лёва снова на прогулке (после матча мог остаться на корте).
    await page.evaluate(() => { const G = __lev.girls; if (G.match) G.endMatch('left', __lev.game.now); G.close(); });
    if (!(await page.evaluate(() => __lev.club.active))) { await page.keyboard.press('q'); await page.waitForFunction(() => __lev.club.mode === 'exit', null, { timeout: 30000 }); }
    await page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode !== 'walk'; i++) __lev.step(0.1); });
    const c = await page.evaluate(() => {
      const G = __lev.girls, g = G.girls[1]; G.close(); G.startCoffee(g);
      let t = 0; for (; t < 240 && !(g.p.seat?.w === 1); t += 0.25) __lev.step(0.25, { x: 0, y: 0 });
      return { t, seat: g.p.seat?.w, pos: g.p.pos.toArray().map((v) => +v.toFixed(2)), hips: +g.p.rig.b.Hips.getWorldPosition(new g.p.pos.constructor()).y.toFixed(2) };
    });
    check(c.seat === 1, `${tag}: Соня дошла до террасы и села за ${c.t.toFixed(0)} с (${JSON.stringify(c)})`);
    const [mx, my, mz] = await page.evaluate(() => __lev.girls.girls[1].p.pos.toArray());
    await shot(page, `coffee-${tag}`, [mx - 2.2, 1.5, mz + 2.4], [mx, 0.8, mz]);
    const talk = await page.evaluate(() => {
      const G = __lev.girls, L = __lev.club.lev, p = G.girls[1].p, V = p.pos.constructor;
      L.place(new V(p.pos.x - 1.5, 0, p.pos.z + 0.6)); __lev.step(0.3, { x: 0, y: 0 });
      const kind = G.target?.kind; G.act();
      return { kind, say: document.querySelector('#gtalk .say').textContent };
    });
    check(talk.kind === 'cafe' && talk.say.length > 5, `${tag}: разговор за столиком: «${talk.say}»`);
    await page.evaluate(() => __lev.render());
    await page.screenshot({ path: join(OUT, `coffee-talk-${tag}.png`) });
    const back = await page.evaluate(() => { const G = __lev.girls, g = G.girls[1]; G.choose(0); G.choose(1); for (let i = 0; i < 2000 && g.where !== 'court'; i++) __lev.step(0.25, { x: 0, y: 0 }); return { where: g.where, mem: g.mem }; });
    check(back.where === 'court' && back.mem.coffee === 1, `${tag}: после кофе вернулась на корт 2 (${JSON.stringify(back)})`);
  }
  check(page.errs.length === 0, `${tag}: без ошибок страницы ${page.errs.slice(0, 2).join(' | ')}`);
  await page.close();
}
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
await browser.close();
process.exit(failed ? 1 : 0);
