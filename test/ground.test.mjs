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

test('на газоне холмы до 1,5 м и ложбины', () => {
  let big = 0, max = 0, min = 0;
  for (let x = PAD.x0 + 8; x < PAD.x1 - 8; x += 1.3) for (let z = PAD.z0 + 8; z < PAD.z1 - 8; z += 1.7) { const y = groundAt(x, z); if (Math.abs(y) > 0.3) big++; max = Math.max(max, y); min = Math.min(min, y); }
  assert.ok(big > 300, `заметных бугров ${big}`); assert.ok(max > 0.8 && max < 1.8, `самый высокий ${max}`); assert.ok(min < -0.3, `самая низкая ${min}`);
});

test('край площадки, стоянка и дорога как были: рельеф только внутри', () => {
  for (let t = 0; t <= 1; t += 0.01) {
    const pts = [[PAD.x0 + t * (PAD.x1 - PAD.x0), PAD.z0], [PAD.x0 + t * (PAD.x1 - PAD.x0), PAD.z1], [PAD.x0, PAD.z0 + t * (PAD.z1 - PAD.z0)], [PAD.x1, PAD.z0 + t * (PAD.z1 - PAD.z0)]];
    for (const [x, z] of pts) assert.ok(Math.abs(groundAt(x, z)) < 1e-9, `край (${x.toFixed(1)}, ${z.toFixed(1)}): ${groundAt(x, z)}`);
  }
  for (const [x, z] of [[54, 27], [57, 33], [51.3, 22], [48, 30.6], [56, -30]]) assert.ok(Math.abs(groundAt(x, z)) < 1e-9, `у дороги (${x}, ${z}): ${groundAt(x, z)}`);
  // За краем (до 1 м) холм клуба ещё ровный — значит, никакого уступа от площадки к склону.
  for (const [x, z] of [[PAD.x1 + 0.6, 0], [PAD.x0 - 0.6, 10], [20, PAD.z0 - 0.6], [-5, PAD.z1 + 0.6]]) assert.ok(Math.abs(groundAt(x, z)) < 1e-9, `за краем (${x}, ${z})`);
});

test('без ступенек: шаг 10 см меняет высоту меньше чем на 4 см, и на краю сетки земли', () => {
  for (const [x0, z0, dx, dz] of [[14, -40, 0, 1], [GRID.x0 - 3, 5, 1, 0], [30, GRID.z1 - 6, 0, 1], [PAD.x1 - 10, -20, 1, 0], [-60, -48, 1, 0.4]]) {
    let prev = groundAt(x0, z0);
    for (let i = 1; i < 200; i++) {
      const y = groundAt(x0 + dx * i * 0.1, z0 + dz * i * 0.1);
      assert.ok(Math.abs(y - prev) < 0.04, `скачок ${(y - prev).toFixed(3)} у (${(x0 + dx * i * 0.1).toFixed(1)}, ${(z0 + dz * i * 0.1).toFixed(1)})`);
      prev = y;
    }
  }
});

test('камера прогулки (4,2 м сзади, 2,3 м над Лёвой) не уходит в склон', () => {
  let worst = 9;
  for (let x = PAD.x0 + 2; x < PAD.x1 - 2; x += 1.1) for (let z = PAD.z0 + 2; z < PAD.z1 - 2; z += 1.3) for (let a = 0; a < 6.28; a += 0.785) {
    const y = groundAt(x, z), ex = x - Math.sin(a) * 4.2, ez = z - Math.cos(a) * 4.2;
    worst = Math.min(worst, y + 2.3 - groundAt(ex, ez));
  }
  assert.ok(worst > 0.6, `камера над склоном всего ${worst.toFixed(2)} м`);
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
