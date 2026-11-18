// node --test test/: состав соперников цел — модели на месте, рост и стиль в пределах, у каждого свой конёк.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ROSTER } from '../src/rivals.js';

const KEYS = ['serve', 'net', 'defense', 'power', 'backhand'];
const by = Object.fromEntries(ROSTER.map((r) => [r.id, r]));
const best = (r) => KEYS.reduce((a, k) => (r.style[k] > r.style[a] ? k : a));

test('модели, рост, ракетки и стиль в пределах', () => {
  assert.equal(new Set(ROSTER.map((r) => r.id)).size, ROSTER.length);
  for (const r of ROSTER) {
    assert.ok(existsSync(new URL(`../public${r.model}`, import.meta.url)), r.model);
    assert.ok(r.height >= 1.74 && r.height <= 1.94, `${r.id} рост ${r.height}`);
    assert.ok(['red', 'white', 'neon'].includes(r.racket), r.racket);
    for (const k of KEYS) assert.ok(r.style[k] >= 0 && r.style[k] <= 1, `${r.id}.${k}`);
  }
  assert.ok(by.jp.height < by.ch.height && by.gh.height === Math.max(...ROSTER.map((r) => r.height)), 'японец ниже, темнокожий выше всех');
});

test('у каждого свой конёк', () => {
  assert.equal(best(by.gh), 'serve');
  assert.equal(best(by.jp), 'defense');
  assert.equal(best(by.ru), 'backhand');
  const s = KEYS.map((k) => by.ch.style[k]);
  assert.ok(Math.max(...s) - Math.min(...s) < 0.12, 'швейцарец ровный');
});
