// node --test test/: форма дня и шансы, штраф по видам ударов, передышка снимает штраф, соперник учится по журналу,
// сетка турнира и призы, короткий сет до 4 и сила соперника без подстройки.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game, AI, serveBox, inBox, shotRisk, formErr, formMiss } from '../src/game.js';
import { formOdds, rollForm, newDay, freshState, loadState, winsBy, learn, fought, makeTour, levMatch, record, ratingOf, ADAPT, FEE, PRIZES, RIVALS, TRAIN_DAY, TRAIN_CAP } from '../src/career.js';
import { Wallet } from '../src/economy.js';

const stub = (side) => ({ side, right: new THREE.Vector3(side, 0, 0), fwd: new THREE.Vector3(0, 0, -side), home: new THREE.Vector3(0, 0, side * 12.685), pos: new THREE.Vector3(),
  mood: 0, stamina: 1, stroke: null, place(p) { this.pos.copy(p); } });
const noop = new Proxy({}, { get: () => () => {} });
function game() {
  const lev = stub(1), opp = stub(-1);
  lev.human = true;
  const g = new Game({ lev, opp, ballMesh: {}, hud: noop, sound: noop, aimLev: () => null });
  g.now = 0;
  return { g, lev, opp };
}
const mem = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('форма дня: база 15/15, плохой чаще от усталости, без сна и после двух проигрышей', () => {
  const b = formOdds();
  assert.equal(b.bad, 0.15); assert.equal(b.good, 0.15);
  for (const o of [{ fatigue: 70 }, { slept: false }, { losses: 2 }]) assert.ok(formOdds(o).bad > b.bad && formOdds(o).good < b.good, JSON.stringify(o));
  const all = formOdds({ fatigue: 90, slept: false, losses: 3 });
  assert.ok(all.bad <= 0.5 && all.good >= 0.05);
  const n = { '-1': 0, 0: 0, 1: 0 };
  for (let i = 0; i < 20000; i++) n[rollForm(b, rnd())]++;
  assert.ok(Math.abs(n['-1'] / 20000 - 0.15) < 0.015 && Math.abs(n[1] / 20000 - 0.15) < 0.015, JSON.stringify(n));
});

test('новый день: форма заново, соперники тренируются медленно и не выше потолка, сыгранный турнир уходит', () => {
  const s = freshState();
  s.tour = { place: 2 };
  newDay(s, { slept: true, rnd });
  assert.equal(s.day, 2); assert.equal(s.tour, null);
  assert.ok(Math.abs(s.rivals.jp.skill - (RIVALS.jp.skill + TRAIN_DAY)) < 1e-9);
  for (let i = 0; i < 100; i++) newDay(s, { rnd });
  assert.ok(Math.abs(s.rivals.jp.skill - (RIVALS.jp.skill + TRAIN_CAP)) < 1e-9);
  const bad = mem(); bad.set('lev-career', { day: 'x', rivals: { jp: { skill: 9, adapt: { drop: 5 }, learned: 'хак' } }, tour: { seeds: [1] } });
  const l = loadState(bad);
  assert.equal(l.day, 1); assert.equal(l.rivals.jp.skill, RIVALS.jp.skill + TRAIN_CAP); assert.equal(l.rivals.jp.adapt.drop, 1); assert.equal(l.rivals.jp.learned, null); assert.equal(l.tour, null);
});

test('риск удара: сила, угол, укороченный, свеча — рискованно; средняя сила в центр с кручением — надёжно', () => {
  const safe = shotRisk({ kind: 'base', target: { x: 1.6 }, spin: 260 }, 0);
  assert.ok(safe <= 0.05, `надёжный ${safe}`);
  for (const [sh, pw] of [[{ kind: 'power', target: { x: 3 }, spin: 50 }, 1], [{ kind: 'angle', target: { x: 3.85 }, spin: 260 }, 0], [{ kind: 'drop', target: { x: 1 }, spin: -170 }, 0], [{ kind: 'lob', target: { x: 1 }, spin: 80 }, 0]])
    assert.ok(shotRisk(sh, pw) >= 0.6, `${sh.kind} ${shotRisk(sh, pw)}`);
  // Плохой день: надёжный почти не страдает, рискованный — сильно; хороший — точнее.
  assert.ok(formErr(0.3, safe, 1) < 0.3 * 1.2);
  assert.ok(formErr(0.3, 1, 1) > 0.3 * 3);
  assert.ok(formMiss(1, 1) >= 0.2 && formMiss(safe, 1) < 0.01);
  assert.ok(formErr(0.3, 1, 0, 1) < 0.3);
});

// Подача сверху с полной силой: в квадрат в обычный день, в плохой, в плохой после трёх передышек; снизу — почти без разницы.
function serveIn(form, relief, kind = 'over', n = 3000) {
  const { g, lev } = game();
  lev.form = form; lev.relief = relief;
  g.resetPoint(0); g.box = serveBox(lev, g.court); g.serveNo = 1; g.now = 1;
  const st = { serve: kind, tPress: 0, holdTo: 1, tContact: 1 };
  let ok = 0;
  for (let i = 0; i < n; i++) if (inBox(g.serveShot(lev, st).target, g.box)) ok++;
  return ok / n;
}
test('плохой день бьёт по сильной подаче, передышки снимают штраф, подача снизу почти не страдает', () => {
  const norm = serveIn(0, 0), bad = serveIn(-1, 0), rested = serveIn(-1, 0.6), good = serveIn(1, 0);
  assert.ok(bad < norm - 0.12, `плохой ${bad} против ${norm}`);
  assert.ok(rested > bad + 0.05 && rested < norm + 0.02, `после передышек ${rested}`);
  assert.ok(good >= norm - 0.02, `хороший ${good}`);
  const u0 = serveIn(0, 0, 'under'), u1 = serveIn(-1, 0, 'under');
  assert.ok(u1 > u0 - 0.05, `снизу ${u1} против ${u0}`);
});

test('соперник учится по журналу: чем Лёва выигрывал очки, то и закрывает', () => {
  const pt = (w, why = 'Виннер') => ({ type: 'point', winner: w, why });
  const ev = [
    { type: 'serve', who: 'opp' }, { type: 'shot', who: 'lev', serve: 0, drop: true, kind: 'drop', stroke: 'fh' }, pt('lev'),
    { type: 'serve', who: 'lev' }, { type: 'shot', who: 'lev', serve: 0, drop: true, kind: 'drop', stroke: 'bh' }, pt('lev', 'Не достал'),
    { type: 'serve', who: 'lev' }, { type: 'shot', who: 'lev', serve: 0, kind: 'angle', stroke: 'fh-top' }, pt('lev'),
    { type: 'serve', who: 'lev' }, { type: 'shot', who: 'lev', serve: 0, kind: 'power', power: 0.9, stroke: 'fh' }, pt('opp', 'Аут'), // ошибка соперника не в счёт
    { type: 'serve', who: 'opp' }, { type: 'shot', who: 'lev', serve: 0, kind: 'base', stroke: 'fh', opp: [1, -5] }, pt('lev'), // обводка: соперник у сетки
  ];
  assert.deepEqual(winsBy(ev), { drop: 2, net: 0, angle: 1, power: 0, pass: 1 });
  const r = freshState().rivals.base;
  assert.equal(learn(r, ev), 'drop');
  assert.equal(r.adapt.drop, 0.35); assert.ok(ADAPT[r.learned].includes('укороченных'));
  assert.equal(learn(r, ev.slice(0, 3)), null, 'одно очко — не повод');
  // Ручка ИИ: против укороченных стоит ближе к сетке и чаще читает их.
  const { g, opp } = game();
  const z0 = Math.abs(g.ai.spot().z);
  opp.adapt = r.adapt;
  assert.ok(Math.abs(g.ai.spot().z) < z0 - 0.3, 'ближе к сетке');
});

test('итог «боролся»: очки, длинный розыгрыш, передышки, брейк-поинты', () => {
  const ev = [{ type: 'point', winner: 'lev', rally: 5 }, { type: 'rest' }, { type: 'point', winner: 'opp', rally: 14, bp: true }, { type: 'point', winner: 'lev', rally: 3, bp: true }];
  assert.deepEqual(fought(ev), { won: 2, longest: 14, rests: 1, bp: 2, saved: 1 });
});

test('турнир: сетка на четверых по рейтингу, финал и третье место, призы и рейтинг', () => {
  const s = freshState();
  const t = makeTour(s);
  assert.equal(new Set(t.seeds).size, 4); assert.ok(t.seeds.includes('lev'));
  const r = (id) => (id === 'lev' ? s.rating : ratingOf(s.rivals[id].skill));
  assert.ok(r(t.seeds[0]) >= r(t.seeds[3]) && t.sf[0].a === t.seeds[0] && t.sf[0].b === t.seeds[3]);
  assert.equal(levMatch(t).round, 'sf');
  const w = new Wallet(mem());
  assert.ok(w.spend(FEE, 'взнос'));
  const r0 = s.rating;
  record(s, t, true, [4, 2], rnd);
  assert.ok(s.rating > r0, 'рейтинг растёт от побед');
  assert.ok(t.sf.every((m) => m.w) && t.fin && t.third && [t.fin.a, t.fin.b].includes('lev'));
  assert.equal(levMatch(t).round, 'fin');
  record(s, t, true, [5, 4], rnd);
  assert.equal(t.place, 1); assert.equal(t.prize, PRIZES[0]); assert.ok(t.third.w);
  w.earn(t.prize, 'приз');
  assert.equal(w.balance, 150 - FEE + 150);
  // Проиграл полуфинал — играет за третье место.
  const t2 = makeTour(s);
  record(s, t2, false, [2, 4], rnd);
  assert.equal(levMatch(t2).round, 'third');
  record(s, t2, true, [4, 1], rnd);
  assert.equal(t2.place, 3); assert.equal(t2.prize, 25); assert.ok(t2.fin.w);
  const t3 = makeTour(s); record(s, t3, false, [0, 4], rnd); record(s, t3, false, [1, 4], rnd);
  assert.equal(t3.place, 4); assert.equal(t3.prize, 0);
});

test('сет до 4 геймов с тай-брейком при 4:4; в турнире сила соперника без подстройки', () => {
  const { g, lev, opp } = game();
  g.setTo = 4;
  const win = (p, n) => { for (let i = 0; i < n; i++) { g.state = 'rally'; g.point(p, 'Виннер'); } };
  win(lev, 16); assert.deepEqual(g.sets.at(-1), [4, 0]); assert.equal(g.ended, lev);
  g.newMatch(0, false);
  for (let k = 0; k < 4; k++) { win(lev, 4); win(opp, 4); }
  assert.ok(g.tb, 'тай-брейк при 4:4');
  win(lev, 7); assert.deepEqual(g.sets.at(-1), [5, 4]);
  const { g: g2, lev: l2 } = game();
  g2.ai.fixed = true; g2.ai.skill = 0.8;
  for (let i = 0; i < 5; i++) { g2.state = 'rally'; g2.point(l2, 'Виннер'); }
  assert.equal(g2.ai.skill, 0.8);
  assert.ok(new AI(stub(-1), g2).skill === 0.7, 'обычный ИИ как был');
});
