// Проверка транспорта и городка (vehicle.js, town.js) в безголовом Chromium: выйти с корта → сесть на велосипед →
// проехать по дорожке → слезть → сесть в машину → доехать по серпантину до улицы → выйти → зайти в магазин → выйти →
// «На корт». На компьютере — клавиши (E, R) и ось WASD, на телефоне (390×844) — кнопки. Кадры и сводка — в test-out/ride.
//   node tools/ride-check.mjs --url http://localhost:3966 [--out test-out/ride] [--only 1440]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const OUT = opt('out', 'test-out/ride'), URL = opt('url', 'http://localhost:3952'), ONLY = opt('only', '');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
const check = (ok, what) => { report.push(`${ok ? 'ок ' : 'НЕТ'} ${what}`); console.log(report.at(-1)); if (!ok) failed++; };

for (const [w, h] of [[1440, 900], [390, 844]].filter(([w]) => !ONLY || String(w) === ONLY)) {
  const phone = w < 500, tag = `${w}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // Без горячей перезагрузки: рядом правят код другие агенты.
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'const h = () => ({ accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, data: {} }); export const createHotContext = h, injectQuery = (u) => u, updateStyle = () => {}, removeStyle = () => {}; export class ErrorOverlay {}' }));
  await page.goto(URL + '/?debug&nolog&noao', { timeout: 120000 }).catch(() => page.goto(URL + '/?debug&nolog&noao', { timeout: 120000 }));
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('play').click(); window.__pause = true; window.__noDraw = true; });
  const shot = async (name) => { await page.evaluate(() => __lev.render()); await page.screenshot({ path: join(OUT, `${name}-${tag}.png`), timeout: 180000 }); };
  const look = async (name, eye, at) => { await page.evaluate(([e, a]) => __lev.shot(e, a), [eye, at]); await page.screenshot({ path: join(OUT, `${name}-${tag}.png`), timeout: 180000 }); };
  const act = async (key, id) => { if (phone) await page.tap('#' + id); else await page.keyboard.press(key); await page.waitForTimeout(50); };
  const st = () => page.evaluate(() => { const c = __lev.club, r = c.ride, L = c.lev; return { mode: c.mode, ride: r?.active?.kind ?? null, w: r?.w, x: +L.pos.x.toFixed(2), y: +L.pos.y.toFixed(2), z: +L.pos.z.toFixed(2), btn: (() => { const b = document.getElementById('actE'); if (b.hidden) return null; const t = b.lastChild.textContent; return t[0].toUpperCase() + t.slice(1); })() }; }); // строка действия interact.js (E / кнопка #actE)
  // Идти к точкам, держа направление относительно камеры (как WASD или джойстик).
  const walkTo = (pts, run = false) => page.evaluate(([pts, run]) => {
    const c = __lev.club, L = c.lev;
    for (const [tx, tz] of pts) for (let t = 0; t < 60; t += 1 / 30) {
      const dx = tx - L.pos.x, dz = tz - L.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.3) break;
      const ux = dx / d, uz = dz / d, a = c.camYaw;
      __lev.step(1 / 30, { x: ux * -Math.cos(a) + uz * Math.sin(a), y: ux * Math.sin(a) + uz * Math.cos(a), run }, 1 / 60);
    }
    return [L.pos.x, L.pos.z].map((v) => +v.toFixed(2));
  }, [pts, run]);
  // Вести транспорт к точкам: руль на точку впереди, газ по углу (в повороте медленнее).
  const driveTo = (pts, vmax, tmax = 120) => page.evaluate(([pts, vmax, tmax]) => {
    const r = __lev.club.ride, v = r.active; let t = 0, hits = 0, minDy = 9, maxDy = -9;
    for (const [tx, tz] of pts) for (; t < tmax; t += 1 / 30) {
      const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.5) break;
      const ang = Math.atan2(Math.sin(Math.atan2(dx, dz) - v.yaw), Math.cos(Math.atan2(dx, dz) - v.yaw)); // + — цель слева
      const want = Math.min(vmax, 2 + d * 0.8) * (1 - Math.min(0.7, Math.abs(ang)));
      const y0 = v.pos.y;
      __lev.step(1 / 30, { x: Math.max(-1, Math.min(1, -ang * 2.5)), y: v.v < want ? 1 : v.v > want + 1.5 ? -1 : 0 }, 1 / 60);
      const g = r.world.ground(v.pos.x, v.pos.z); minDy = Math.min(minDy, v.pos.y - g); maxDy = Math.max(maxDy, v.pos.y - g);
      if (Math.abs(v.pos.y - y0) > 0.5) hits++;
    }
    return { t: +t.toFixed(1), x: +v.pos.x.toFixed(1), z: +v.pos.z.toFixed(1), v: +v.v.toFixed(1), jumps: hits, minDy: +minDy.toFixed(2), maxDy: +maxDy.toFixed(2) };
  }, [pts, vmax, tmax]);
  const audit = () => page.evaluate(() => { const a = __lev.club.lev.rig.audit(); return { bad: ['Left', 'Right'].some((s) => a[s].elbowBack || a[s].kneeBack), a }; });

  await page.evaluate(async () => { __lev.step(1); await __lev.loadTown(); });
  await act('q', 'cexit');
  await page.evaluate(() => { for (let i = 0; i < 300 && __lev.club.mode === 'exit'; i++) __lev.step(0.1); });
  check((await st()).mode === 'walk', `${tag}: вышел с корта`);
  // К велосипеду у забора (дорожка x ≈ 10,85).
  await walkTo([[10.85, -4], [10.6, -10.3]]);
  const nb = await st();
  check(nb.btn?.startsWith('Сесть на'), `${tag}: у велосипеда кнопка «${nb.btn}»`);
  await act('e', 'actE');
  await page.evaluate(() => __lev.step(0.8, { x: 0, y: 0 }, 1 / 60));
  const onBike = await st(), ab = await audit();
  check(onBike.ride === 'bike' && onBike.w === 1, `${tag}: сел на велосипед`);
  check(!ab.bad, `${tag}: поза на велосипеде без нарушений ${JSON.stringify(ab.a)}`);
  // Крупно: сбоку и сзади, в движении — педали и колёса крутятся.
  const bikeView = async (name, side, back, hgt = 1.2) => page.evaluate(([side, back, hgt]) => { const v = __lev.club.ride.active, l = v.left, f = v.fwd; const at = v.pos.clone().setY(v.pos.y + 0.75); __lev.shot([at.x + l.x * side - f.x * back, at.y + hgt - 0.75, at.z + l.z * side - f.z * back], [at.x, at.y, at.z]); }, [side, back, hgt]);
  const r1 = await driveTo([[10.85, -2], [10.85, 8]], 4, 20);
  for (const [n, s, b, hh] of [['bike-side', 2.6, 0, 1.0], ['bike-back', 0.4, 3.2, 1.6], ['bike-front', 1.0, -2.6, 1.2]]) { await bikeView(n, s, b, hh); await page.screenshot({ path: join(OUT, `${n}-${tag}.png`) }); }
  const crank = await page.evaluate(() => { const v = __lev.club.ride.active, a0 = v.crankA; __lev.step(0.5, { x: 0, y: 1 }, 1 / 60); return +(v.crankA - a0).toFixed(2); });
  check(crank > 1, `${tag}: проехал по дорожке ${JSON.stringify(r1)}, шатун крутится (${crank} рад за 0,5 с)`);
  // Педали: колено и стопа по кругу без выворотов — проверка по всему обороту.
  const pedal = await page.evaluate(() => { const v = __lev.club.ride.active, L = __lev.club.lev; let bad = 0, worst = 0; for (let i = 0; i < 24; i++) { __lev.step(1 / 30, { x: 0, y: 1 }, 1 / 60); const a = L.rig.audit(); if (['Left', 'Right'].some((s) => a[s].kneeBack || a[s].elbowBack)) bad++; for (const s of ['Left', 'Right']) { const ank = L.rig.b[s + 'Foot'].getWorldPosition(new L.pos.constructor()), F = v.feet(L.rig)[s === 'Left' ? 'Left' : 'Right']; worst = Math.max(worst, ank.distanceTo(F)); } } return { bad, worst: +worst.toFixed(3) }; });
  check(pedal.bad === 0 && pedal.worst < 0.06, `${tag}: ноги на педалях весь оборот (нарушений ${pedal.bad}, лодыжка от точки до ${pedal.worst} м)`);
  await shot('bike-ride');
  // К стоянке: по дорожке ко входу (PATHS в env-club.js).
  const r2 = await driveTo([[11.4, 15.8], [15.5, 25.6], [26, 28.8], [38, 30.2], [48, 30.4]], 5, 60);
  check(Math.hypot(r2.x - 48, r2.z - 30.4) < 3, `${tag}: доехал на велосипеде до стоянки ${JSON.stringify(r2)}`);
  await page.evaluate(() => { for (let i = 0; i < 40 && Math.abs(__lev.club.ride.active.v) > 0.3; i++) __lev.step(0.1, { x: 0, y: -Math.sign(__lev.club.ride.active.v) }, 1 / 60); });
  await act('e', 'actE');
  const midOff = await page.evaluate(() => { __lev.step(0.22, { x: 0, y: 0 }, 1 / 60); const r = __lev.club.ride, L = __lev.club.lev; return +L.wrap.position.distanceTo(r.bike.pos).toFixed(2); }); // посередине слезания тело между седлом и землёй рядом
  await page.evaluate(() => __lev.step(1, { x: 0, y: 0 }, 1 / 60));
  const offBike = await page.evaluate(() => { const r = __lev.club.ride, L = __lev.club.lev; return { ride: r.active, d: +L.pos.distanceTo(r.bike.pos).toFixed(2) }; });
  check(offBike.ride === null && offBike.d < 1.2 && midOff < 1.3, `${tag}: слез с велосипеда рядом с ним (${offBike.d} м, посередине ${midOff} м)`);
  // К машине: к водительской двери.
  const door = await page.evaluate(() => __lev.club.ride.car.mountAt().toArray());
  await walkTo([[door[0], door[2]]]);
  const nc = await st();
  check(nc.btn?.startsWith('Сесть в'), `${tag}: у машины кнопка «${nc.btn}»`);
  await act('e', 'actE');
  await page.evaluate(() => __lev.step(0.8, { x: 0, y: 0 }, 1 / 60));
  const inCar = await st(), ac = await audit();
  check(inCar.ride === 'car', `${tag}: сел в машину`);
  check(!ac.bad, `${tag}: поза за рулём без нарушений ${JSON.stringify(ac.a)}`);
  const carView = async (name, side, back, hgt) => { await page.evaluate(([side, back, hgt]) => { const v = __lev.club.ride.active, l = v.left, f = v.fwd; const at = v.pos.clone().addScaledVector(l, 0.33).addScaledVector(f, -0.3).setY(v.pos.y + 0.9); __lev.shot([at.x + l.x * side - f.x * back, at.y + hgt, at.z + l.z * side - f.z * back], [at.x, at.y, at.z]); }, [side, back, hgt]); await page.screenshot({ path: join(OUT, `${name}-${tag}.png`) }); };
  await carView('car-window', 2.6, 0.3, 0.25); await carView('car-front', -0.6, -4.2, 0.6); await carView('car-back34', 3.2, 4.2, 1.2);
  if (phone) { // кнопки руля, газа и ручника: видны, зона от 44 px, «Газ» везёт, «Тормоз» останавливает
    const pad = await page.evaluate(() => [...document.querySelectorAll('#vpad button')].map((b) => { const r = b.getBoundingClientRect(); return [b.dataset.k, Math.round(r.width), Math.round(r.height), r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight]; }));
    const hold = (k, sec) => page.evaluate(([k, sec]) => { const b = document.querySelector(`#vpad [data-k="${k}"]`); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); __lev.step(sec, null, 1 / 60); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return +__lev.club.ride.active.v.toFixed(2); }, [k, sec]);
    const vg = await hold('g', 1), vb = await hold('b', 1.5);
    check(pad.length === 5 && pad.every(([, w, h, ok]) => w >= 44 && h >= 44 && ok) && vg > 1 && vb < 0.3, `${tag}: кнопки езды ${JSON.stringify(pad)}, газ → ${vg} м/с, тормоз → ${vb} м/с`);
    await shot('car-buttons');
  }
  // По серпантину до улицы: точки оси дороги через 8 м.
  const road = await page.evaluate(() => __lev.club.world.road.filter((_, i) => i % 8 === 0).map((s) => [s.x, s.z]));
  const leg1 = await driveTo(road.slice(0, Math.floor(road.length * 0.45)), 13, 90);
  await shot('car-serpentine');
  await page.evaluate(() => { const v = __lev.club.ride.active, l = v.left, f = v.fwd; __lev.shot([v.pos.x + l.x * 14 - f.x * 10, v.pos.y + 9, v.pos.z + l.z * 14 - f.z * 10], [v.pos.x, v.pos.y + 0.5, v.pos.z]); });
  await page.screenshot({ path: join(OUT, `car-serpentine-side-${tag}.png`) });
  const leg2 = await driveTo([...road.slice(Math.floor(road.length * 0.45)), [200, 60], [212, 58.5]], 13, 120);
  check(leg2.x > 205 && leg1.jumps + leg2.jumps === 0 && Math.min(leg1.minDy, leg2.minDy) > -0.1 && Math.max(leg1.maxDy, leg2.maxDy) < 0.15, `${tag}: доехал до улицы без провалов и прыжков ${JSON.stringify({ leg1, leg2 })}`);
  await page.evaluate(() => { for (let i = 0; i < 60 && Math.abs(__lev.club.ride.active.v) > 0.3; i++) __lev.step(0.1, { x: 0, y: -Math.sign(__lev.club.ride.active.v) }, 1 / 60); });
  await shot('car-town');
  await act('e', 'actE');
  await page.evaluate(() => __lev.step(1, { x: 0, y: 0 }, 1 / 60));
  const outCar = await st();
  const dCar = await page.evaluate(() => +__lev.club.lev.pos.distanceTo(__lev.club.ride.car.pos).toFixed(2));
  check(outCar.ride === null && outCar.y > -18 && outCar.y < -17.4 && dCar < 2, `${tag}: вышел из машины на улице у двери (${outCar.x}, ${outCar.y}, ${outCar.z}; до машины ${dCar} м)`);
  await shot('town-walk');
  // В магазин: к двери, внутрь к прилавку; дверь открылась.
  const shop = await page.evaluate(() => { const m = __lev.club.world.points; return { shop: m.shop.pos, door: [m.shop.pos[0] - 3, m.shop.pos[2] + 5.2] }; });
  await walkTo([[shop.door[0], shop.door[1] + 2.2], [shop.door[0], shop.door[1] + 1.2]]);
  await page.evaluate(() => __lev.step(0.6, { x: 0, y: 0 }, 1 / 60)); // дверь успевает открыться
  await shot('shop-door');
  await walkTo([[shop.door[0], shop.door[1] - 1.0], [shop.shop[0], shop.shop[2]]]);
  const inShop = await page.evaluate(([x, z]) => { const L = __lev.club.lev, d = __lev.club.world.doors.reduce((b, d) => (Math.hypot(d.x - x, d.z - z) < Math.hypot(b.x - x, b.z - z) ? d : b)); return { d: Math.hypot(L.pos.x - x, L.pos.z - z), y: L.pos.y, room: __lev.club.world.room(L.pos.x, L.pos.z)?.kind, door: d.a }; }, [shop.shop[0], shop.shop[2]]);
  check(inShop.room === 'shop' && inShop.d < 0.6, `${tag}: зашёл в магазин к прилавку ${JSON.stringify(inShop)}`);
  await shot('shop-inside');
  await walkTo([[shop.door[0], shop.door[1] - 1.0], [shop.door[0], shop.door[1] + 2.5]]);
  const outShop = await st();
  check(outShop.z > 55, `${tag}: вышел из магазина на улицу (${outShop.x}, ${outShop.z})`);
  // Двери остальных домов — кадр у входа и внутри.
  for (const kind of ['cafe', 'gym', 'home']) {
    const p = await page.evaluate((kind) => { const m = __lev.club.world.points; const t = kind === 'gym' ? m.gymStations[1] : m[kind === 'home' ? 'bed' : kind]; const r = __lev.club.world.rooms.find((r) => r.kind === kind).rect; return { pos: kind === 'home' ? m.bed.stand : t.pos, rect: r }; }, kind);
    const [a, b, c, d] = p.rect, cx = (a + c) / 2, front = b < 60 ? d + 0.6 : b - 0.6, inside = b < 60 ? d - 1.5 : b + 1.5;
    await walkTo([[cx, front + (b < 60 ? 1.5 : -1.5)], [cx, front + (b < 60 ? 0.6 : -0.6)]]);
    await page.evaluate(() => __lev.step(0.6, { x: 0, y: 0 }, 1 / 60));
    await shot(`${kind}-door`);
    await walkTo([[cx, inside], [p.pos[0], p.pos[2]]]);
    const room = await page.evaluate(() => __lev.club.world.room(__lev.club.lev.pos.x, __lev.club.lev.pos.z)?.kind);
    check(room === kind, `${tag}: зашёл в ${kind}`);
    await shot(`${kind}-inside`);
    await walkTo([[cx, inside], [cx, front + (b < 60 ? 1.5 : -1.5)]]);
  }
  await look('street-day', [200, -15.6, 60], [240, -16.5, 60]);
  await look('street-back', [258, -15.8, 60], [215, -16.7, 59]);
  // Назад на корт: R издалека.
  await act('r', 'cback');
  await page.evaluate(() => __lev.step(0.5));
  const back = await page.evaluate(() => { const g = __lev.game; return { mode: __lev.club.mode, human: g.lev.human, z: g.lev.pos.z, sunAt: __lev.club.world.sun?.target.position.length() ?? 0 }; });
  check(back.mode === null && back.human && back.sunAt < 1, `${tag}: «На корт» вернул в игру ${JSON.stringify(back)}`);
  check(errs.length === 0, `${tag}: без ошибок страницы ${errs.slice(0, 3).join(' | ')}`);
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'summary.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
process.exit(failed ? 1 : 0);
