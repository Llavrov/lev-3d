// node --test test/: дрифт машины на ручнике и машина без водителя (src/vehicle.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Car } from '../src/vehicle.js';

const world = { ground: () => 0, bounds: () => false };
const run = (car, sec, inp, riding = true) => { for (let t = 0; t < sec; t += 1 / 60) car.update(1 / 60, inp, world, riding); };

test('ручник в повороте срывает зад, газ с рулём держат занос, без газа он гаснет', () => {
  const car = new Car(new THREE.Scene()); car.park(0, 0, 0, world);
  run(car, 6, { x: 0, y: 1 });
  assert.ok(car.v > 12, `разогналась до ${car.v.toFixed(1)}`);
  run(car, 0.5, { x: 1, y: 0, hb: true });
  assert.ok(car.drift > 0.9 && car.slip > 2, `сорвало: дрифт ${car.drift.toFixed(2)}, боком ${car.slip.toFixed(1)} м/с`);
  run(car, 0.4, { x: -0.3, y: 1 }); // отпустил ручник, газ и контрруль
  assert.ok(car.drift > 0.5, `занос держится: ${car.drift.toFixed(2)}`);
  run(car, 2, { x: 0, y: 0 });
  assert.ok(car.drift < 0.05, `без газа выровнялась: ${car.drift.toFixed(2)}`);
});

test('без ручника обычный поворот не срывается в дрифт', () => {
  const car = new Car(new THREE.Scene()); car.park(0, 0, 0, world);
  run(car, 6, { x: 0, y: 1 }); run(car, 2, { x: 1, y: 1 });
  assert.equal(car.drift, 0);
});

test('выпрыгнул на ходу — машина без водителя катится дальше и встаёт сама', () => {
  const car = new Car(new THREE.Scene()); car.park(0, 0, 0, world);
  run(car, 5, { x: 0, y: 1 });
  const z0 = car.pos.z;
  run(car, 1, { x: 0, y: 0 }, false);
  assert.ok(car.pos.z - z0 > 5, `прокатилась ${(car.pos.z - z0).toFixed(1)} м`);
  run(car, 20, { x: 0, y: 0 }, false);
  assert.equal(car.v, 0);
});
