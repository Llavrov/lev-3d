// node --test test/: плата за работу (jobs.js) — урок, смена баристы, спарринг.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonPay, baristaPay, tipFor, sparPay } from '../src/jobs.js';

test('урок: 30 CHF × качество 0,5–1, чаевые за серию удобных', () => {
  assert.deepEqual(lessonPay(0, 10, 0), { base: 15, tip: 0, total: 15 });
  assert.deepEqual(lessonPay(10, 10, 10), { base: 30, tip: 6, total: 36 });
  assert.equal(lessonPay(6, 10, 3).total, 24 + 2);
  assert.equal(lessonPay(7, 10, 5).tip, 4);
});

test('бариста: 12 за смену, по 3 за заказ и чаевые за скорость, не больше 40', () => {
  assert.equal(tipFor(10), 2); assert.equal(tipFor(30), 1); assert.equal(tipFor(60), 0);
  assert.deepEqual(baristaPay([]), { tip: 0, total: 12 });
  assert.deepEqual(baristaPay([20, 40, 70]), { tip: 3, total: 12 + 9 + 3 });
  assert.equal(baristaPay(Array(9).fill(5)).total, 40);
});

test('спарринг: 25 + бонус за длинные розыгрыши, виннеры его уменьшают, бонус 0–10', () => {
  assert.deepEqual(sparPay(0, 0), { bonus: 0, total: 25 });
  assert.deepEqual(sparPay(4, 3), { bonus: 5, total: 30 });
  assert.equal(sparPay(9, 0).total, 35);
  assert.equal(sparPay(1, 6).total, 25);
});
