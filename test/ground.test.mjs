// node --test test/: рельеф газона (groundAt) и дом (HOUSE, door) — ровно там, где ходят и стоят вещи, бугры без
// ступенек, дверь закрыта — не пройти, открыта — проходишь, стены держат.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groundAt, PAD, GRID } from '../src/env-mountains.js';
import '../src/env-club.js'; // ровные места у фонарей, скамеек, таблички (FLAT)
import { HOUSE, door } from '../src/env-house.js';
import { pushOut } from '../src/club.js';

test('ровно на кортах, дорожках, террасе, в доме и у скамеек', () => {
  for (const [x, z] of [[0, 0], [5, -15], [-38, 10], [10.85, -5], [10.85, 8], [-2, 25.7], [12.4, -27], [20, -27], [12.3, -6.5], [-4.5, 21.7], [13.7, -12.2]]) {
    assert.ok(Math.abs(groundAt(x, z)) < 0.005, `(${x}, ${z}): ${groundAt(x, z)}`);
  }
});

test('на газоне бугры до полуметра, к краям площадки газон сходит вниз', () => {
  let big = 0, max = 0;
  for (let x = 16; x < 50; x += 1.3) for (let z = -10; z < 20; z += 1.7) { const y = Math.abs(groundAt(x, z)); if (y > 0.1) big++; max = Math.max(max, y); }
  assert.ok(big > 40, `заметных бугров ${big}`); assert.ok(max < 0.6, `самый высокий ${max}`);
  assert.ok(groundAt(PAD.x1 - 0.5, 0) < -0.3, `у края площадки ${groundAt(PAD.x1 - 0.5, 0)}`);
});

test('без ступенек: шаг 10 см меняет высоту меньше чем на 3 см, и на краю сетки земли', () => {
  for (const [x0, z0, dx, dz] of [[14, -40, 0, 1], [GRID.x0 - 3, 5, 1, 0], [30, GRID.z1 - 6, 0, 1], [PAD.x1 - 10, -20, 1, 0], [-60, -48, 1, 0.4]]) {
    let prev = groundAt(x0, z0);
    for (let i = 1; i < 200; i++) {
      const y = groundAt(x0 + dx * i * 0.1, z0 + dz * i * 0.1);
      assert.ok(Math.abs(y - prev) < 0.03, `скачок ${(y - prev).toFixed(3)} у (${(x0 + dx * i * 0.1).toFixed(1)}, ${(z0 + dz * i * 0.1).toFixed(1)})`);
      prev = y;
    }
  }
});

// Идём шагами по 3 см из a к b сквозь стены дома.
function walk(a, b, n = 500) {
  const p = { x: a[0], z: a[1] }, d = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...d);
  for (let i = 0; i < n; i++) { p.x += (d[0] / len) * 0.03; p.z += (d[1] / len) * 0.03; pushOut(p, 0.28, HOUSE); }
  return p;
}
test('дверь: закрыта — не пройти, открыта — проходишь; стена держит', () => {
  if (door.open) door.toggle(0);
  const z = door.pos.z;
  assert.ok(walk([12, z], [20, z]).x < door.pos.x + 0.05, 'закрытая дверь пустила');
  door.toggle(0);
  assert.ok(walk([12, z], [20, z]).x > 19, 'в открытую дверь не прошёл');
  assert.ok(walk([12, z - 3], [20, z - 3]).x < 14.6, 'прошёл сквозь стену');
  door.toggle(0);
});
