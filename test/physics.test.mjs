// node --test test/: удар падает в цель, кручёный летит выше над сеткой и ныряет, сетка ловит низкий мяч.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveShot, step, netH } from '../src/physics.js';

function fly(from, vel, spin) {
  const b = { pos: from.clone(), vel: vel.clone(), spin, live: true };
  let netY = null, apex = 0;
  for (let i = 0; i < 2000; i++) {
    const z0 = b.pos.z, ev = step(b, 1 / 240);
    apex = Math.max(apex, b.pos.y);
    if (Math.sign(z0) !== Math.sign(b.pos.z) && netY === null) netY = b.pos.y;
    if (ev?.type === 'net') return { net: true };
    if (ev?.type === 'bounce') return { land: b.pos.clone(), netY, apex, t: i / 240 };
  }
}

test('плоский и кручёный падают в цель', () => {
  const from = new THREE.Vector3(0.9, 1.0, 12.4), target = new THREE.Vector3(-2.5, 0, -9.5);
  for (const [speed, spin] of [[28, 60], [24, 300]]) {
    const r = fly(from, solveShot(from, target, speed, spin), spin);
    assert.ok(!r.net, 'в сетку');
    assert.ok(r.land.distanceTo(new THREE.Vector3(target.x, r.land.y, target.z)) < 0.15, `промах ${r.land.toArray()}`);
    assert.ok(r.netY > netH(0) + 0.05, `над сеткой ${r.netY}`);
  }
});

test('кручёный выше над сеткой при той же цели', () => {
  const from = new THREE.Vector3(0, 1.0, 12), target = new THREE.Vector3(0, 0, -10);
  const flat = fly(from, solveShot(from, target, 26, 0), 0), top = fly(from, solveShot(from, target, 26, 320), 320);
  assert.ok(top.netY > flat.netY + 0.2, `кручёный ${top.netY.toFixed(2)} против ${flat.netY.toFixed(2)}`);
});

test('низкий мяч остаётся в сетке', () => {
  const r = fly(new THREE.Vector3(0, 0.8, 3), new THREE.Vector3(0, 0, -25), 0);
  assert.ok(r.net);
});

test('после отскока кручёный быстрее плоского, укороченный с подрезкой гаснет', () => {
  const after = (vh, vy, spin) => {
    const b = { pos: new THREE.Vector3(0, 0.05, 5), vel: new THREE.Vector3(0, vy, -vh), spin, live: true };
    for (let i = 0; i < 100; i++) if (step(b, 1 / 240)?.type === 'bounce') return Math.hypot(b.vel.x, b.vel.z);
  };
  const flat = after(20, -6, 50), top = after(20, -6, 320), drop = after(6, -4, -230);
  assert.ok(top > flat + 1.5, `кручёный ${top.toFixed(1)} против ${flat.toFixed(1)}`);
  assert.ok(flat / 20 > 0.55 && flat / 20 < 0.8, `грунт гасит до ${(flat / 20).toFixed(2)}`);
  assert.ok(drop < 2.5, `укороченный после отскока ${drop.toFixed(1)} м/с`);
});
