// node --test test/: ходьба и бег по мокапу (public/anim/gait.json, src/mocap.js) — темп, опора, вынос ступни и нога в махе.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setGait, gaitParams, gaitPose, swingLeg } from '../src/mocap.js';

setGait(JSON.parse(readFileSync(new URL('../public/anim/gait.json', import.meta.url))));
const L = 0.77; // таз–щиколотка у Лёвы

test('темп и опора как у людей: шаг, трусца, спринт', () => {
  const w = gaitParams(1.4, L), j = gaitParams(3.3, L), s = gaitParams(5.6, L);
  assert.ok(w.T > 0.9 && w.T < 1.1 && j.T > 0.65 && j.T < 0.8 && s.T > 0.55 && s.T < 0.65, `периоды ${w.T} ${j.T} ${s.T}`);
  assert.ok(w.duty > 0.45 && j.duty > 0.25 && j.duty < 0.35 && s.duty < 0.2, `опора ${w.duty} ${j.duty} ${s.duty}`);
  for (const p of [w, j, s]) {
    const stance = p.v * p.T * p.duty, back = stance - p.ahead;
    assert.ok(p.ahead > 0 && p.ahead < 0.35 && back < 0.5, `ступня встаёт ${p.ahead.toFixed(2)} впереди, уходит ${back.toFixed(2)} сзади`);
    assert.ok(p.half >= 0.065, 'ступни не заходят друг в друга');
  }
});

test('нога в махе: на спринте пятка к ягодице, колено только вперёд', () => {
  const s = gaitParams(5.6, L);
  let fold = 0;
  for (let u = 0; u <= 1.001; u += 0.05) {
    const { th, sh } = swingLeg(u, s);
    assert.ok(Math.abs(th.length() - 1) < 1e-6 && Math.abs(sh.length() - 1) < 1e-6);
    fold = Math.max(fold, (Math.acos(th.dot(sh)) * 180) / Math.PI);
    assert.ok(th.y * sh.z - th.z * sh.y > -0.1, `колено назад на u=${u.toFixed(2)}`); // сгиб — голень назад от бедра
  }
  assert.ok(fold > 110, `сгиб колена в махе ${fold.toFixed(0)}°`);
});

test('поза на фазе: руки единичные, корпус качается вокруг нуля', () => {
  const p = gaitParams(1.4, L);
  let tor = 0;
  for (let k = 0; k < 32; k++) {
    const g = gaitPose(k / 32, p);
    for (const v of ['rUp', 'rFo', 'lUp', 'lFo']) assert.ok(Math.abs(g[v].length() - 1) < 1e-6);
    tor += g.torso;
  }
  assert.ok(Math.abs(tor / 32) < 2, `средний разворот плеч ${tor / 32}`);
});
