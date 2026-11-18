// node --test test/: подача (стороны, квадрат по диагонали, ошибка, двойная, переподача), сет, тай-брейк, порядок подачи.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game, serveBox, inBox, servePos } from '../src/game.js';

// Игрок без модели: сторона, оси, место. Лёва на z > 0 (правая рука — +x), соперник на z < 0.
const stub = (side) => ({ side, right: new THREE.Vector3(side, 0, 0), fwd: new THREE.Vector3(0, 0, -side), home: new THREE.Vector3(0, 0, side * 12.685), pos: new THREE.Vector3(),
  mood: 0, stamina: 1, stroke: null, place(p) { this.pos.copy(p); } });
const noop = new Proxy({}, { get: () => () => {} });
function game(bestOf = 1) {
  const lev = stub(1), opp = stub(-1), log = [];
  const g = new Game({ lev, opp, ballMesh: {}, hud: noop, sound: noop, aimLev: () => null, log: (type, d) => log.push({ type, ...d }) });
  g.bestOf = bestOf; g.now = 0;
  return { g, lev, opp, log };
}
const win = (g, p) => { g.state = 'rally'; g.point(p, 'Виннер'); };
const take = (g, p, n) => { for (let i = 0; i < n; i++) win(g, p); };

test('сторона подачи по сумме очков, принимающий по диагонали, квадрат через сетку', () => {
  const { g, lev, opp } = game();
  g.resetPoint(0);
  assert.equal(g.court, 1);
  assert.ok(lev.pos.x > 0 && lev.pos.x < 1 && lev.pos.z > 11.885, 'Лёва справа от центральной отметки за линией');
  assert.ok(opp.pos.x < -1.5, 'соперник по диагонали — в своей правой половине');
  win(g, lev); g.resetPoint(0);
  assert.equal(g.court, -1, '15:0 — слева');
  assert.ok(lev.pos.x < 0 && opp.pos.x > 1.5);
  const B = serveBox(lev, 1); // Лёва справа подаёт в квадрат слева на половине соперника
  assert.ok(inBox(new THREE.Vector3(-2, 0, -5), B));
  assert.ok(inBox(new THREE.Vector3(-4.13, 0, -6.42), B), 'линии — в квадрате');
  assert.ok(!inBox(new THREE.Vector3(2, 0, -5), B), 'не тот квадрат');
  assert.ok(!inBox(new THREE.Vector3(-2, 0, -7), B), 'за линией подачи');
  assert.ok(!inBox(new THREE.Vector3(-2, 0, 5), B), 'своя половина');
  assert.deepEqual(serveBox(opp, -1), { sx: -1, sz: 1 }, 'соперник слева (у него это +x) — в квадрат Лёвы слева от Лёвы');
  assert.ok(servePos(opp, -1, true).x > 0);
});

test('мимо квадрата — вторая подача, ещё раз — двойная; задела сетку и попала — переподача', () => {
  const { g, lev, opp, log } = game();
  g.resetPoint(0);
  const serve = () => { Object.assign(g, { state: 'rally', lastHitter: lev, rally: 1, bounces: 0, box: serveBox(lev, g.court) }); };
  serve(); g.cord = false; g.bounce(new THREE.Vector3(-2, 0.03, -8)); // в корт, но за линией подачи
  assert.equal(g.state, 'fault'); assert.equal(g.serveNo, 2); assert.equal(g.pts.get(opp), 0);
  serve(); g.cord = true; g.bounce(new THREE.Vector3(-2, 0.03, -4)); // сетка и в квадрат
  assert.equal(g.state, 'fault'); assert.equal(g.serveNo, 2, 'переподача номер не меняет');
  assert.ok(log.some((e) => e.type === 'let'));
  serve(); g.cord = false; g.bounce(new THREE.Vector3(3, 0.03, -4)); // не тот квадрат
  assert.equal(g.pts.get(opp), 1); assert.equal(log.at(-1).why, 'Двойная');
  g.resetPoint(0); assert.equal(g.serveNo, 1);
  serve(); g.cord = false; g.bounce(new THREE.Vector3(2.5, 0.03, -3)); // 15:0 слева — квадрат справа
  assert.equal(g.state, 'rally', 'попала — розыгрыш идёт');
});

test('сет до 6 с перевесом в 2: 6:4 и 7:5, подача по очереди', () => {
  const { g, lev, opp, log } = game(3);
  for (let i = 0; i < 4; i++) { take(g, lev, 4); take(g, opp, 4); } // 4:4
  assert.equal(g.server, lev, 'после чётного числа геймов снова подаёт Лёва');
  take(g, lev, 8); // 6:4
  assert.deepEqual(g.sets, [[6, 4]]); assert.equal(g.games.get(lev), 0);
  assert.ok(log.some((e) => e.type === 'set'));
  for (let i = 0; i < 5; i++) { take(g, lev, 4); take(g, opp, 4); } // 5:5
  take(g, opp, 4); assert.equal(g.sets.length, 1, '5:6 — сет идёт');
  take(g, opp, 4); assert.deepEqual(g.sets.at(-1), [5, 7]);
  assert.equal(g.ended, null, '1:1 по сетам — матч идёт');
});

test('тай-брейк: 7:5 и 8:6, подача 1-2-2, сторона по сумме очков, следующий сет начинает принимавший первым', () => {
  for (const [a, b] of [[7, 5], [8, 6]]) {
    const { g, lev, opp, log } = game(3);
    for (let i = 0; i < 6; i++) { take(g, lev, 4); take(g, opp, 4); }
    assert.ok(g.tb, '6:6 — тай-брейк'); assert.ok(log.some((e) => e.type === 'tiebreak'));
    const first = g.server, servers = [], courts = [];
    // Очки по очереди до b:b, потом два подряд Лёве (a = b + 2): 5:5 → 7:5, 6:6 → 8:6.
    const seq = [...Array.from({ length: b }, () => [opp, lev]).flat(), lev, lev];
    let la = 0, lb = 0;
    for (const p of seq) {
      if (g.ended || !g.tb) break;
      servers.push(g.server); courts.push(g.courtSide());
      win(g, p); if (p === lev) la++; else lb++;
    }
    assert.deepEqual([la, lb], [a, b], `счёт тай-брейка ${a}:${b}`);
    assert.deepEqual(g.sets.at(-1), [7, 6]);
    const o = g.other(first);
    assert.deepEqual(servers.slice(0, 5), [first, o, o, first, first], 'первый — одно очко, дальше по два');
    assert.deepEqual(courts.slice(0, 4), [1, -1, 1, -1], 'сторона по сумме очков тай-брейка');
    assert.equal(g.server, o, 'новый сет начинает тот, кто в тай-брейке первым принимал');
    assert.equal(g.tb, null);
  }
});

test('матч: 1 сет — конец после сета; до двух сетов — после 2:0', () => {
  const one = game(1);
  take(one.g, one.lev, 24);
  assert.equal(one.g.ended, one.lev); assert.ok(one.log.some((e) => e.type === 'match'));
  one.g.resetPoint(0); assert.equal(one.g.ended, null, 'очко после конца матча (вернулся из клуба) — уже новый матч'); assert.deepEqual(one.g.sets, []);
  const three = game(3);
  take(three.g, three.opp, 24); assert.equal(three.g.ended, null);
  take(three.g, three.opp, 24); assert.equal(three.g.ended, three.opp);
  three.g.newMatch(0); assert.deepEqual(three.g.sets, []); assert.equal(three.g.server, three.lev);
});
