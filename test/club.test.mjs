// node --test test/: прогулка по клубу — забор держит, в калитку проходишь, скамейку обходишь, с площадки не уйти.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pushOut } from '../src/club.js';
import { GATE } from '../src/court.js';

const X = GATE.x, GZ = (GATE.z0 + GATE.z1) / 2, R = 0.28;
const fence = { segs: [[X, -19.9, X, GATE.z0], [X, GATE.z1, X, 19.9]], boxes: [[7.47, 0.81, 8.03, 2.39]], circles: [[9.95, 2.5, 0.5]], area: [-20, -40, 30, 30] };
// Идём шагами по 3 см из a в сторону b и смотрим, где оказались.
function walk(a, b, n = 400) {
  const p = { x: a[0], z: a[1] }, d = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...d);
  for (let i = 0; i < n; i++) { p.x += (d[0] / len) * 0.03; p.z += (d[1] / len) * 0.03; pushOut(p, R, fence); }
  return p;
}

test('забор не пускает, калитка пропускает', () => {
  const wall = walk([7, -5], [12, -5]);
  assert.ok(wall.x < X - R + 1e-6, `упёрся в забор: x ${wall.x}`);
  const gate = walk([7, GZ], [12, GZ], 150);
  assert.ok(gate.x > X + 1, `прошёл в калитку: x ${gate.x}`);
});

test('скамейку и кадку обходит, с площадки не уходит', () => {
  const p = { x: 7.7, z: 1.6 }; // внутри скамейки — выталкивает к ближнему краю
  assert.equal(pushOut(p, R, fence), true);
  assert.ok(p.x < 7.47 - R + 1e-6 || p.x > 8.03 + R - 1e-6);
  const q = { x: 9.95, z: 2.6 };
  pushOut(q, R, fence);
  assert.ok(Math.hypot(q.x - 9.95, q.z - 2.5) >= 0.5 + R - 1e-6);
  const far = walk([25, 0], [60, 0]);
  assert.ok(far.x <= 30);
});
