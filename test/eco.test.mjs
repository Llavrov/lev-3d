// node --test test/: характеристики и кошелёк — хранение с защитой от мусора, медленный рост, множители, деньги.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Stats, STATS } from '../src/stats.js';
import { Wallet, fmtCHF } from '../src/economy.js';

const mem = (init = {}) => { const m = { ...init }; return { get: (k) => m[k] ?? null, set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); }, m }; };

test('пусто или мусор в памяти — стартовые значения', () => {
  for (const bad of [null, 'x', { lvl: { power: 'много', speed: -5, stamina: 99 }, fatigue: NaN, mood: 7 }]) {
    const s = new Stats(mem({ 'lev-stats': bad }));
    assert.equal(s.lvl.power, 1); assert.equal(s.lvl.speed, 1);
    assert.ok(s.lvl.stamina <= 10, 'уровень не выше 10');
    assert.equal(s.fatigue, 0); assert.ok(s.mood <= 1 && s.mood >= -1);
  }
  const w = new Wallet(mem({ 'lev-wallet': { balance: -40, history: [null, { amount: 'a' }] } }));
  assert.equal(w.balance, 150); assert.equal(w.history.length, 0);
});

test('уровень 1 без экипировки — игра как раньше', () => {
  const m = new Stats(mem()).mods();
  for (const k of ['speed', 'accel', 'power', 'err', 'drain', 'recover', 'cap']) assert.equal(m[k], 1, k);
});

test('прокачка растёт медленно и упирается в 10', () => {
  const s = new Stats(mem());
  const first = s.train('power', 12);
  assert.ok(first > 0.1 && first < 0.15, `подход на первом уровне +${first}`);
  let sets = 1;
  while (s.lvl.power < 5) { s.train('power', 12); sets++; }
  assert.ok(sets > 30 && sets < 60, `до пятого уровня ${sets} подходов`);
  for (let i = 0; i < 3000; i++) s.train('power', 12);
  assert.ok(s.lvl.power <= 10);
  assert.equal(s.train('luck', 5), 0, 'неизвестная характеристика не растёт');
});

test('максимум заметен, но не ломает игру; усталость мешает', () => {
  const s = new Stats(mem());
  for (const k of STATS) s.lvl[k] = 10;
  const m = s.mods();
  assert.ok(m.speed > 1.08 && m.speed < 1.12, `бег ${m.speed}`);
  assert.ok(m.power > 1.06 && m.power < 1.1, `удар ${m.power}`);
  assert.ok(m.err > 0.65 && m.err < 0.8, `разброс ${m.err}`);
  s.tire(100);
  const t = s.mods();
  assert.ok(t.speed < m.speed && t.err > m.err && t.cap < 0.6, 'без сил медленнее, кривее и не отдыхает до конца');
  s.eat('coffee'); assert.equal(s.fatigue, 88);
  s.sleep(); assert.equal(s.fatigue, 0);
});

test('сохраняется и читается обратно', () => {
  const st = mem(), s = new Stats(st);
  s.train('speed', 50); s.tire(40);
  s.save();
  const back = new Stats(st);
  assert.equal(back.lvl.speed, s.lvl.speed); assert.equal(back.fatigue, 40);
});

test('кошелёк: earn, spend, история, не в минус', () => {
  const st = mem(), w = new Wallet(st);
  assert.equal(w.earn(25, 'Тренировка с детьми'), 175);
  assert.equal(w.earn(-5, 'хак'), 175, 'отрицательное не начисляется');
  assert.equal(w.spend(200, 'Ракетка'), false); assert.equal(w.balance, 175);
  assert.equal(w.spend(60, 'Кроссовки'), true); assert.equal(w.balance, 115);
  assert.deepEqual(w.history.map((h) => h.amount), [-60, 25]);
  assert.equal(new Wallet(st).balance, 115, 'баланс сохранился');
  assert.equal(fmtCHF(1250), '1 250 CHF');
});
