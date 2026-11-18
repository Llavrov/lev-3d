// Прогулка по клубу (решено с Лёвой 18.11): «Выйти с корта» — Лёва идёт к калитке, дальше гуляет по клубу (WASD,
// Shift — бегом), садится на скамейку и смотрит, как вместо него играет замена: ИИ против ИИ, счёт идёт дальше.
// «На корт» — замена уходит, Лёва играет с того же счёта. Камеры: сзади-сверху на прогулке; сидя — со скамейки,
// ТВ сверху из-за задней линии, крупно за заменой (камера матча follow из main.js).
import * as THREE from 'three';
import { COURT, GATE, COURT2_X } from './court.js';
import { SEATS } from './env.js';
import { PAD } from './env-mountains.js';

const clamp = THREE.MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const X = COURT.wide / 2 + COURT.runSide, Z = COURT.len / 2 + COURT.runBack; // забор корта
const AREA = [PAD.x0 + 1, PAD.z0 + 1, PAD.x1 - 1, PAD.z1 - 1]; // ровная площадка клуба (x0, z0, x1, z1), дальше бугры и склон
const R = 0.28; // тело для столкновений, м
const GZ = (GATE.z0 + GATE.z1) / 2;
const V = (x, z) => new THREE.Vector3(x, 0, z);
// С корта через калитку на дорожку вдоль забора (x ≈ 10,85); замена идёт по ней же навстречу и через калитку на корт.
const OUT = [V(7, GZ), V(8.4, GZ), V(10.2, GZ), V(10.85, GZ - 1.3)];
const SUB_FROM = V(10.85, GZ + 5), SUB_IN = [V(10.6, GZ), V(8.4, GZ), V(6.8, GZ)];
const VIEWS = ['bench', 'tv', 'close'];
const SOLID = new Set(['chalet', 'bar', 'bench', 'bike']); // модели Meshy из env.js: по рамке
const ROUND = new Set(['planter', 'table', 'balls']); // круглые: рамку раздувают цветы и стулья, берём круг поуже

// Тело — круг радиуса r на плоскости: выталкиваем из отрезков (забор, сетка, створка), кругов (стволы, столбы, кусты)
// и прямоугольников (шале, бар, скамейки), потом держим внутри площадки. Возвращает true, если упёрлись.
export function pushOut(p, r, { segs = [], circles = [], boxes = [], area = null }) {
  let hit = false;
  const push = (cx, cz, rad) => {
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= rad) return;
    if (d < 1e-6) p.x += rad; else { p.x += (dx * (rad - d)) / d; p.z += (dz * (rad - d)) / d; }
    hit = true;
  };
  for (const [ax, az, bx, bz] of segs) {
    const ux = bx - ax, uz = bz - az, t = clamp(((p.x - ax) * ux + (p.z - az) * uz) / (ux * ux + uz * uz), 0, 1);
    push(ax + ux * t, az + uz * t, r);
  }
  for (const [cx, cz, cr] of circles) push(cx, cz, cr + r);
  for (const [x0, z0, x1, z1] of boxes) {
    const cx = clamp(p.x, x0, x1), cz = clamp(p.z, z0, z1);
    if (cx !== p.x || cz !== p.z) { push(cx, cz, r); continue; }
    const d = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = d.indexOf(Math.min(...d)); // центр внутри — к ближнему краю
    if (i === 0) p.x = x0 - r; else if (i === 1) p.x = x1 + r; else if (i === 2) p.z = z0 - r; else p.z = z1 + r;
    hit = true;
  }
  if (area) {
    const x = clamp(p.x, area[0], area[2]), z = clamp(p.z, area[1], area[3]);
    if (x !== p.x || z !== p.z) { p.x = x; p.z = z; hit = true; }
  }
  return hit;
}

// Препятствия по сцене (модели уже загружены): заборы кортов 1 и 2 с калитками (у обоих на стороне +x) и открытыми
// створками, сетки, вышка судьи, модели Meshy по рамкам, у зонта — стойка; инстансы (деревья, кусты, камни, фонари) —
// кругом по самой узкой части (ствол, столб), кроме травы; живая изгородь — клетками по 0,5 м. Невысокие широкие коробки
// (настил террасы, бордюр) — полы: по ним ходят выше земли.
function scan(court) {
  const segs = [0, COURT2_X].flatMap((o) => [[-X, -Z, X, -Z], [-X, Z, X, Z], [-X, -Z, -X, Z], [X, -Z, X, GATE.z0], [X, GATE.z1, X, Z],
    [X, GATE.z1, X + 1.15, GATE.z1 + 0.2], [-6.45, 0, 6.45, 0]].map(([a, b, c, d]) => [a + o, b, c + o, d]));
  const circles = [[-7.55, 0.6, 0.5], [7.8, 0, 0.3]], boxes = [], floors = []; // вышка судьи, коробка с полотенцами
  const box = new THREE.Box3(), m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), inst = new Map();
  court.updateMatrixWorld(true);
  court.traverse((o) => {
    if (o.isInstancedMesh) {
      for (let a = o; a; a = a.parent) if (a.name === 'tufts') return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, rxz = 0.8 * Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); m.premultiply(o.matrixWorld).decompose(p, q, s);
        if (p.x < AREA[0] - 2 || p.x > AREA[2] + 2 || p.z < AREA[1] - 2 || p.z > AREA[3] + 2) continue;
        const k = `${p.x.toFixed(1)},${p.z.toFixed(1)}`, r = rxz * Math.max(s.x, s.z);
        inst.set(k, [p.x, p.z, Math.min(r, inst.get(k)?.[2] ?? Infinity)]);
      }
      return;
    }
    if (o.name === 'hedges') { // изгородь: вершины по клеткам 0,5 м, клетка — круг
      const pa = o.geometry.attributes.position, cells = new Set();
      for (let i = 0; i < pa.count; i++) { p.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); cells.add(`${Math.floor(p.x / 0.5)},${Math.floor(p.z / 0.5)}`); }
      for (const c of cells) { const [i, j] = c.split(',').map(Number); circles.push([i * 0.5 + 0.25, j * 0.5 + 0.25, 0.3]); }
      return;
    }
    if (o.name === 'umbrella') { o.getWorldPosition(p); circles.push([p.x, p.z, 0.12]); return; }
    if (ROUND.has(o.name)) { box.setFromObject(o); o.getWorldPosition(p); circles.push([p.x, p.z, 0.35 * Math.min(box.max.x - box.min.x, box.max.z - box.min.z)]); return; }
    if (SOLID.has(o.name)) { box.setFromObject(o); boxes.push([box.min.x + 0.05, box.min.z + 0.05, box.max.x - 0.05, box.max.z - 0.05]); return; }
    const g = o.isMesh && o.geometry.type === 'BoxGeometry' ? o.geometry.parameters : null;
    if (g && g.height <= 0.2 && g.width * g.depth > 3) { box.setFromObject(o); if (box.max.y > 0.02) floors.push([box.min.x, box.min.z, box.max.x, box.max.z, box.max.y]); }
  });
  for (const c of inst.values()) if (c[2] > 0.05 && c[2] < 1.5) circles.push(c);
  return { segs, circles, boxes, floors, area: AREA };
}

export class Club {
  // lev — Лёва, game — розыгрыш, court — сцена корта (по ней препятствия), sound — шаги, onMode(mode, canSit, view) — кнопки.
  constructor({ game, lev, court, sound, onMode = () => {} }) {
    Object.assign(this, { game, lev, court, sound, onMode });
    this.mode = null; // null — матч; 'exit' — идёт к калитке; 'walk'; 'sit'
    this.view = 'bench'; this.camYaw = Math.PI; this.near = null; this.path = null; this.subPath = null;
    this.seats = SEATS.map(({ pos: [x, h, z], yaw }) => ({ at: V(x, z), h, yaw, f: V(Math.sin(yaw), Math.cos(yaw)), r: V(-Math.cos(yaw), Math.sin(yaw)) }));
    this.eye = new THREE.Vector3(); this.look = new THREE.Vector3(); this.lookAt = new THREE.Vector3(0, 0.8, 0);
  }
  get active() { return this.mode !== null; }
  ground(x, z) { let y = 0; for (const [x0, z0, x1, z1, top] of this.obs.floors) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) y = Math.max(y, top); return y; }
  free(p) {
    p.free = true; p.idle = false; p.gest = null; p.stroke = null; p.split = null; p.sliding = 0;
    p.bounds = (pos) => (this.world ? this.world.bounds(pos, R, this.obs) : pushOut(pos, R, this.obs)); // world — дорога и городок (town.js)
    p.ground = (x, z) => this.world?.ground(x, z) ?? this.ground(x, z);
  }

  // Уйти с корта: текущий розыгрыш не в счёт, на место Лёвы встаёт замена (ИИ) и идёт с дорожки на заднюю линию,
  // Лёва сам идёт к калитке. sub — игрок-замена (скрыт до выхода).
  exit(sub, now) {
    const g = this.game, L = this.lev;
    this.obs ??= scan(this.court);
    g.b.live = false; g.ballMesh.visible = false; g.landing = null; g.hud.hint('');
    this.free(L);
    this.free(sub); sub.place(SUB_FROM); sub.wrap.visible = sub.racket.visible = true;
    g.swapLev(sub); g.state = 'away'; g.hud.score(g); // в счёте «Замена»
    L.onStep = () => this.sound.step({ vol: 0.35, pan: 0 });
    this.sub = sub; this.subPath = null;
    this.path = [...OUT]; this.camYaw = L.netYaw + L.bodyTurn; this.fresh = true;
    this.set('exit');
  }
  // Вернуться на корт: замена уходит (прячем), Лёва на своей задней линии, следующее очко с того же счёта.
  back(now, auto = false) {
    const g = this.game, L = this.lev, sub = this.sub;
    this.ride?.leave(); // с велосипеда или из машины (vehicle.js), издалека — через затемнение
    if (sub) { sub.wrap.visible = sub.racket.visible = false; sub.free = false; sub.stroke = null; }
    L.free = false; L.seat = null; L.onStep = null; L.stamina = 1; L.mood = 0; // отдохнул на скамейке
    L.place(L.home);
    g.swapLev(L, auto);
    g.resetPoint(now);
    this.path = this.subPath = null;
    this.set(null);
  }
  // Сесть на ближнюю скамейку: подойти к месту перед ней, развернуться и сесть.
  sit() {
    if (this.mode === 'walk' && this.ride?.use()) return; // E у велосипеда или машины — сесть или слезть (vehicle.js)
    const s = this.near;
    if (this.mode !== 'walk' || !s || this.lev.seat) return;
    this.path = [s.at.clone().addScaledVector(s.f, 0.55)]; this.toSeat = s;
  }
  stand() { if (this.lev.seat && !this.lev.seat.up) { this.lev.seat.up = true; this.set('walk'); } }
  nextView() { if (this.mode === 'sit') { this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length]; this.set('sit'); } }
  set(mode) { this.mode = mode; this.onMode(mode, !!this.near, this.view); }

  // Куда идти по точкам пути: скорость k (1 — шаг), к последней точке тормозит. Дошёл до конца — null.
  steer(p, path, k = 1) {
    while (path.length && p.pos.distanceTo(path[0].clone().setY(p.pos.y)) < (path.length > 1 ? 0.35 : 0.12)) path.shift();
    if (!path.length) return null;
    const d = path[0].clone().sub(p.pos).setY(0), len = d.length();
    return d.divideScalar(len).multiplyScalar(path.length > 1 ? k : Math.min(k, len * 2.5 + 0.15));
  }

  // input: { x, y } — ось WASD или джойстика (y — вперёд), run — бегом. Мир шагает здесь только за Лёву и за
  // замену, пока она идёт на корт; дальше её ведёт game.update (ИИ).
  update(dt, now, input) {
    if (!this.active) return;
    const L = this.lev, g = this.game;
    if (this.ride?.update(dt, now, input)) input = { x: 0, y: 0 }; // Лёва на велосипеде или в машине: ведёт vehicle.js
    let move = new THREE.Vector3();
    if (this.path) {
      const m = this.steer(L, this.path, this.mode === 'exit' ? 1.25 : 1);
      if (m) move = m;
      else {
        this.path = null;
        if (this.mode === 'exit') { this.set('walk'); this.subPath = [...SUB_IN, L.home.clone()]; } // Лёва за калиткой — замена идёт на корт
        if (this.toSeat) { // встал перед скамейкой — садится
          const s = this.toSeat; this.toSeat = null;
          L.seat = { at: s.at.clone().setY(this.ground(s.at.x, s.at.z)), from: L.pos.clone(), yaw: s.yaw, h: s.h, w: 0,
            feet: [-1, 1].map((sg) => s.at.clone().addScaledVector(s.f, 0.5).addScaledVector(s.r, sg * 0.15)) };
          this.view = 'bench'; this.set('sit');
        }
      }
    } else if (this.mode === 'walk' && !L.seat) {
      const f = V(Math.sin(this.camYaw), Math.cos(this.camYaw)), r = V(-Math.cos(this.camYaw), Math.sin(this.camYaw));
      move.addScaledVector(f, input.y).addScaledVector(r, input.x);
      if (move.length() > 1) move.normalize();
      if (input.run) move.multiplyScalar(2.4); // ~3,4 м/с
    }
    // Камера на прогулке разворачивается за Лёвой, но не когда он идёт на неё (S): иначе крутилась бы на месте.
    const ml = move.length();
    if (ml > 0.1 && (this.path || move.dot(V(Math.sin(this.camYaw), Math.cos(this.camYaw))) > -0.25 * ml)) {
      this.camYaw += clamp(wrap(Math.atan2(move.x, move.z) - this.camYaw), -1.6 * dt, 1.6 * dt) * Math.min(1, ml);
    }
    if (!this.ride?.active) L.update(dt, now, move, L.seat ? g.b : null); // сидя голова следит за мячом
    // Замена: ждёт на дорожке, пока Лёва не выйдет, потом идёт на заднюю линию; там игра продолжается.
    const sub = this.sub;
    if (sub && g.state === 'away') {
      const m = this.subPath && this.steer(sub, this.subPath, 2); // трусцой ~2,8 м/с
      sub.update(dt, now, m ?? new THREE.Vector3(), null);
      if (this.subPath && !m) { sub.free = false; sub.place(sub.home); g.resetPoint(now); }
    }
    const near = this.mode === 'walk' && !L.seat && !this.path ? this.seats.reduce((b, s) => { const d = s.at.distanceTo(L.pos.clone().setY(0)); return d < 1.2 && (!b || d < b.d) ? { s, d } : b; }, null) : null;
    if ((near?.s ?? null) !== this.near) { this.near = near?.s ?? null; this.set(this.mode); }
  }

  // Камера. follow — камера матча (крупно за заменой). Возвращает, видно ли ближнюю стенку забора (в матче её прячут).
  camera(dt, camera, follow) {
    const L = this.lev, k = 1 - Math.exp(-dt * 4);
    let eye, look;
    if (this.mode === 'sit' && this.view === 'close') { follow(dt); return false; }
    if (this.ride?.active) { this.ride.camera(dt, camera); return true; }
    if (this.mode === 'sit' && this.view === 'tv') { // ТВ: высоко из-за задней линии замены, весь корт в кадре
      const portrait = innerWidth / innerHeight < 0.8;
      eye = portrait ? V(0, 33).setY(15) : V(0, 28).setY(9.5); look = V(0, portrait ? 0 : 0.5).setY(0);
    } else if (this.mode === 'sit' && L.seat) { // со скамейки: из-за плеча Лёвы, взгляд ходит за мячом
      const s = L.seat, b = this.game.b, { f, r } = this.seatOf(s), portrait = innerWidth / innerHeight < 0.8; // на телефоне кадр узкий: выше, дальше и точнее за мячом
      eye = s.at.clone().addScaledVector(f, portrait ? -0.9 : -0.5).addScaledVector(r, 0.3).setY(s.h + (portrait ? 1.5 : 1.05));
      const k = portrait ? 1 : 0.7;
      if (b.live) this.lookAt.lerp(V(b.pos.x * k, clamp(b.pos.z, -12, 12) * (portrait ? 1 : 0.85)).setY(0.6), 1 - Math.exp(-dt * (portrait ? 3 : 1.5))); // между очками взгляд стоит
      look = this.lookAt;
    } else { // прогулка: сзади-сверху, плавно за Лёвой
      const f = V(Math.sin(this.camYaw), Math.cos(this.camYaw));
      eye = L.pos.clone().addScaledVector(f, -4.2).setY(L.pos.y + 2.3);
      look = L.pos.clone().addScaledVector(f, 1.8).setY(L.pos.y + 0.95);
      this.world?.camClamp(eye, L.pos); // в доме — не дальше стен
    }
    if (this.fresh) { this.fresh = false; this.look.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(8).add(camera.position)); } // с камеры матча без рывка
    camera.position.lerp(eye, k); this.look.lerp(look, k);
    camera.lookAt(this.look);
    return this.mode !== 'sit' || this.view === 'bench';
  }
  seatOf(seat) { return { f: V(Math.sin(seat.yaw), Math.cos(seat.yaw)), r: V(-Math.cos(seat.yaw), Math.sin(seat.yaw)) }; }
  // Камеру сразу на место (после смены вида или для кадров тестировщика), а не плавно.
  snap(camera, follow) { this.look.copy(this.lookAt); for (let i = 0; i < 40; i++) this.camera(0.25, camera, follow); }
}
