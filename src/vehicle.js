// Велосипед и машина (решено с Лёвой 18.11): подойти и E — сесть, E — слезть. W — газ, S — тормоз и назад, A/D — руль;
// на телефоне — кнопки. Велосипед стоит у забора корта (вместо модели из env.js), машина — на стоянке у дороги.
// Лёва сидит позой через Rig (swing.js): таз на седле или в кресле, ступни на педалях, кисти на руле,
// ракетка в корзине велосипеда или на пассажирском сиденье. Езда аркадная: по дороге, улице и рельефу (town.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { READY, mix } from './swing.js';
import { pushOut } from './club.js';
import { SHOULDER } from './town.js';

const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(-x, y, z).normalize(); // как в swing.js: x вправо, у Mixamo правая рука в −X
const SIT_H = 0.1; // кость таза над сиденьем, м (как SIT_HIP в player.js)

// Позы (ключи Rig, оси игрока). Ноги и кисти потом ставятся в точки: ступни на педали, ладони на руль.
// Велосипед городской: спина почти прямая, наклон вперёд ~25°, голова поднята, локти чуть согнуты.
const BIKE_KEY = { ...READY, hips: 0, torso: 0, lean: 14, look: 0, tilt: 0, nod: -12, lh: -1, fist: 0,
  rUp: V(0.12, -0.55, 0.82), rFo: V(-0.05, -0.15, 1), lUp: V(-0.12, -0.55, 0.82), lFo: V(0.05, -0.15, 1) };
// В машине: спина на спинке (откинута), руки к рулю.
const CAR_KEY = { ...READY, hips: 0, torso: 0, lean: -14, look: 0, tilt: 0, nod: 6, lh: -1, fist: 0,
  rUp: V(0.1, -0.6, 0.8), rFo: V(-0.15, 0.25, 1), lUp: V(-0.1, -0.6, 0.8), lFo: V(0.15, 0.25, 1) };

const L4 = (o) => new THREE.MeshLambertMaterial(o), S4 = (o) => new THREE.MeshStandardMaterial(o);
const noUv = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
const merge = (list) => mergeGeometries(list.map(noUv));
// Трубка от a до b (рама велосипеда).
function tube(a, b, r) {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); return g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
}
const P = (x, y, z) => new THREE.Vector3(x, y, z);
// Плетёная корзина: ряды прутьев вразбежку.
function wickerTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#6b4a2a'; g.fillRect(0, 0, 128, 64);
  for (let r = 0; r < 8; r++) for (let k = 0; k < 16; k++) { const v = 0.85 + ((r * 7 + k * 13) % 5) * 0.05; g.fillStyle = `rgb(${190 * v | 0},${146 * v | 0},${92 * v | 0})`; g.beginPath(); g.ellipse(k * 8 + (r % 2) * 4 + 4, r * 8 + 4, 3.6, 3, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return t;
}

// ---------- Общее: положение, ход по земле, столкновения ----------
// Местные оси: z — вперёд, y — вверх, x — влево (смотрим по +z: правая сторона в −x). yaw: вперёд = (sin yaw, cos yaw).
class Vehicle {
  constructor(scene) { this.root = new THREE.Group(); scene.add(this.root); this.pos = new THREE.Vector3(); this.yaw = 0; this.v = 0; this.steer = 0; this.pitch = 0; this.roll = 0; this.vel = new THREE.Vector2(); this.spin = 0; this.drift = 0; this.slip = 0; }
  get fwd() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get left() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  park(x, z, yaw, world) { this.pos.set(x, world?.ground(x, z) ?? 0, z); this.yaw = yaw; this.v = 0; this.vel.set(0, 0); this.pitch = this.roll = 0; this.ground(world, 1); this.place(); }
  local(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.root.matrixWorld); }
  place() {
    this.root.position.copy(this.pos);
    this.root.quaternion.setFromEuler(new THREE.Euler(-this.pitch, this.yaw, this.roll, 'YXZ'));
    this.root.updateMatrixWorld(true);
  }
  // Высота и наклоны по четырём точкам опоры (колёса): плавно, но не ниже земли — не проваливается и не взлетает.
  ground(world, k) {
    const f = this.fwd, l = this.left, h = (dz, dx) => world.ground(this.pos.x + f.x * dz + l.x * dx, this.pos.z + f.z * dz + l.z * dx);
    const [a, b] = this.axles, t = this.track / 2;
    const yf = (h(a, t) + h(a, -t)) / 2, yr = (h(b, t) + h(b, -t)) / 2, yl = (h(a, t) + h(b, t)) / 2, yrt = (h(a, -t) + h(b, -t)) / 2;
    const y = (yf + yr) / 2;
    this.pos.y += (y - this.pos.y) * k; if (this.pos.y < y - 0.02) this.pos.y = y - 0.02;
    this.pitch += (Math.atan2(yf - yr, a - b) - this.pitch) * k;
    this.slope = t > 0 ? Math.atan2(yl - yrt, 2 * t) : 0;
  }
  // Кузов — несколько кругов вдоль оси; что вытолкнуло, сдвигает всю машину и гасит скорость.
  collide(world) {
    const f = this.fwd, d = new THREE.Vector3(); let hits = 0;
    for (const z of this.circles) {
      const p = this.pos.clone().addScaledVector(f, z), q = p.clone();
      if (world.bounds(q, this.r, this.half)) { d.add(q.sub(p)); hits++; }
    }
    if (!hits) return false;
    d.divideScalar(hits); this.pos.add(d);
    const into = -d.clone().normalize().dot(f) * Math.sign(this.v); // лоб в стену — отскок, вскользь — трётся
    this.v = into > 0.6 ? -this.v * 0.25 : this.v * (1 - 0.6 * Math.max(0, into));
    this.vel.set(f.x * this.v, f.z * this.v);
    return true;
  }
  // Аркадная езда: газ до vmax, тормоз, назад, руль сильнее на малой скорости, занос — боковая скорость гаснет не сразу.
  drive(dt, inp, world) {
    const C = this.cfg, gas = clamp(inp.y, -1, 1), hb = !!inp.hb && !!C.drift;
    let a = 0;
    if (gas > 0.1) a = this.v < -0.2 ? C.brake : C.accel * gas * (1 - Math.max(0, this.v) / C.vmax);
    else if (gas < -0.1) a = this.v > 0.2 ? -C.brake : -C.accel * 0.6 * (1 - Math.max(0, -this.v) / C.vback);
    else a = -Math.sign(this.v) * Math.min(Math.abs(this.v) / dt, C.roll + 0.015 * this.v * this.v);
    a -= 9.8 * Math.sin(this.pitch) * C.hill; // в горку тяжелее, под горку катится
    if (hb) a -= Math.sign(this.v) * C.drift.hb; // ручник: задние колёса встали
    this.v += a * dt;
    if (Math.abs(this.v) < 0.03 && Math.abs(gas) < 0.1) this.v = 0;
    const want = clamp(inp.x, -1, 1) * C.steer / (1 + (this.v * this.v) / C.steerFall);
    this.steer += clamp(want - this.steer, -C.steerRate * dt, C.steerRate * dt);
    this.yawRate = -(this.v / C.wb) * Math.tan(this.steer); // руль вправо (+) — поворот вправо (yaw убывает)
    // Дрифт (Лёва 19.11): ручник на скорости срывает зад, дальше занос держат газ и руль, контрруль его выравнивает.
    if (C.drift) {
      const sp = Math.abs(this.v), l = this.left; this.slip = Math.abs(this.vel.x * l.x + this.vel.y * l.z); // боковая скорость
      const keep = gas > 0.3 && this.slip > 1.5 && sp > 4;
      this.drift = clamp(this.drift + dt * (hb && sp > 4 ? 4 : keep ? 0 : -1.6), 0, 1);
      this.yawRate -= clamp(inp.x, -1, 1) * this.drift * C.drift.yaw * Math.min(1, sp / 10) * Math.sign(this.v);
      this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), this.slip * C.drift.scrub * dt); // боком машина тормозит
    }
    this.yaw = wrap(this.yaw + this.yawRate * dt);
    const f = this.fwd, grip = C.grip / (1 + Math.abs(this.yawRate * this.v) * C.slide) * (1 - 0.85 * this.drift); // резкий поворот на скорости — мягкий занос, в дрифте зад скользит
    this.vel.lerp(new THREE.Vector2(f.x * this.v, f.z * this.v), 1 - Math.exp(-dt * grip));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    this.collide(world);
    this.ground(world, 1 - Math.exp(-dt * 14));
    this.spin += (this.vel.length() * Math.sign(this.v) / this.wheelR) * dt;
  }
}

// ---------- Велосипед ----------
// Городской с низкой рамой, как модель из Meshy у забора (тёмно-зелёная рама, коричневые седло и ручки, плетёная корзина).
// Седло и руль — по ногам Лёвы: на нижней педали нога почти прямая (93 % длины), как подгоняют велосипед в магазине.
export class Bike extends Vehicle {
  constructor(scene, rig) {
    super(scene);
    this.kind = 'bike'; this.name = 'велосипед';
    this.cfg = { vmax: 7, vback: 1.2, accel: 2.6, brake: 6, roll: 0.25, hill: 0.8, steer: 0.55, steerFall: 18, steerRate: 2.6, wb: 1.08, grip: 14, slide: 0.02 };
    this.axles = [0.54, -0.54]; this.track = 0; this.wheelR = 0.34; this.circles = [0.42, -0.42]; this.r = 0.3; this.half = SHOULDER - 0.3;
    this.crankA = 0; this.lean = 0;
    // Подгонка: таз над седлом, тазобедренный сустав, нижняя педаль.
    const BB = P(0, 0.29, -0.04), CR = 0.17;
    const hipJ = rig.b.LeftUpLeg.getWorldPosition(new THREE.Vector3()).sub(rig.b.Hips.getWorldPosition(new THREE.Vector3())).y; // сустав ниже кости таза
    const ankleUp = rig.footLen * Math.sin(rig.footA0) + 0.03, ankleBack = rig.footLen * Math.cos(rig.footA0) * 0.75;
    const leg = 0.93 * (rig.L1 + rig.L2), dz = -0.24 - (BB.z - ankleBack), lowAnkle = BB.y - CR + ankleUp;
    this.saddle = P(0, lowAnkle + Math.sqrt(Math.max(0.1, leg * leg - dz * dz)) - hipJ - SIT_H, -0.24); // верх седла
    this.BB = BB; this.crank = CR;
    const H = this.saddle.y;
    this.grips = { Right: P(-0.29, H + 0.1, 0.24), Left: P(0.29, H + 0.1, 0.24) };
    const frame = S4({ color: '#1f4a35', metalness: 0.5, roughness: 0.35 }), black = L4({ color: '#141414' }), steel = S4({ color: '#c9ced2', metalness: 0.9, roughness: 0.25 });
    const leather = L4({ color: '#6e4426' });
    // Рама: подседельная, низкая изогнутая нижняя, рулевая, перья.
    const seatTop = P(0, H - 0.08, -0.2), head = P(0, 0.72, 0.38), headTop = P(0, H - 0.02, 0.35), rear = P(0, 0.34, -0.54);
    const parts = [tube(BB, seatTop, 0.017), tube(BB, P(0, 0.4, 0.18), 0.02), tube(P(0, 0.4, 0.18), head, 0.02), tube(head, headTop, 0.022)];
    for (const s of [-1, 1]) parts.push(tube(BB, rear.clone().setX(s * 0.05), 0.011), tube(P(0, 0.72, -0.21), rear.clone().setX(s * 0.05), 0.01));
    parts.push(tube(seatTop, P(0, H - 0.02, -0.24), 0.013)); // подседельный штырь
    this.root.add(new THREE.Mesh(merge(parts), frame));
    const sad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8).scale(0.85, 0.32, 1.45), leather); sad.position.set(0, H - 0.005, -0.25); this.root.add(sad);
    // Колёса: покрышка, обод, спицы, втулка; крыло сверху.
    const wheel = () => {
      const g = new THREE.Group(), R = this.wheelR;
      g.add(new THREE.Mesh(new THREE.TorusGeometry(R - 0.018, 0.019, 8, 40).rotateY(Math.PI / 2), black));
      const sp = []; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; sp.push(tube(P(0, 0, 0), P(0, Math.cos(a) * (R - 0.04), Math.sin(a) * (R - 0.04)), 0.0025)); }
      sp.push(new THREE.TorusGeometry(R - 0.04, 0.008, 6, 40).rotateY(Math.PI / 2), new THREE.CylinderGeometry(0.02, 0.02, 0.1, 10).rotateZ(Math.PI / 2));
      g.add(new THREE.Mesh(merge(sp), steel));
      return g;
    };
    const fender = (z) => { const m = new THREE.Mesh(new THREE.TorusGeometry(this.wheelR + 0.035, 0.02, 4, 28, Math.PI * 0.9).rotateY(Math.PI / 2).rotateX(Math.PI * 0.05), black); m.scale.set(1.9, 1, 1); m.position.set(0, this.wheelR, z); return m; };
    this.rearWheel = wheel(); this.rearWheel.position.set(0, this.wheelR, -0.54); this.root.add(this.rearWheel, fender(-0.54));
    // Перед: вилка, руль, корзина и переднее колесо поворачиваются вместе вокруг рулевой.
    this.front = new THREE.Group(); this.front.position.set(0, 0, 0.42); this.root.add(this.front);
    const fp = [];
    for (const s of [-1, 1]) fp.push(tube(P(s * 0.05, 0.72, -0.04), P(s * 0.05, this.wheelR, 0.12), 0.011));
    fp.push(tube(P(0, H - 0.02, -0.07), P(0, H + 0.06, -0.07), 0.014), tube(P(0, H + 0.06, -0.07), P(0, H + 0.08, -0.02), 0.014));
    const hb = [P(-0.29, H + 0.1, -0.18), P(-0.2, H + 0.09, -0.08), P(0, H + 0.08, -0.02), P(0.2, H + 0.09, -0.08), P(0.29, H + 0.1, -0.18)];
    for (let k = 1; k < hb.length; k++) fp.push(tube(hb[k - 1], hb[k], 0.011));
    this.front.add(new THREE.Mesh(merge(fp), steel));
    for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 10).rotateZ(Math.PI / 2), leather); g.position.set(s * 0.26, H + 0.1, -0.17); this.front.add(g); }
    this.frontWheel = wheel(); this.frontWheel.position.set(0, this.wheelR, 0.12); this.front.add(this.frontWheel, fender(0.12));
    const basket = new THREE.Mesh(merge([new THREE.CylinderGeometry(0.2, 0.17, 0.24, 14, 1, true), new THREE.CylinderGeometry(0.17, 0.17, 0.01, 14).translate(0, -0.12, 0)]), new THREE.MeshLambertMaterial({ map: wickerTex(), side: THREE.DoubleSide }));
    basket.scale.set(1.15, 1, 0.85); basket.position.set(0, H - 0.05, 0.2); this.front.add(basket); this.basket = basket;
    for (const s of [-1, 1]) { const st = new THREE.Mesh(tube(P(s * 0.12, H - 0.17, 0.2), P(s * 0.05, 0.62, 0.0), 0.006), steel); this.front.add(st); }
    // Шатун с педалями: крутится с задним колесом (передача 2,2), педали держатся ровно.
    this.cranks = new THREE.Group(); this.cranks.position.copy(BB); this.root.add(this.cranks);
    this.cranks.add(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 28).rotateY(Math.PI / 2).translate(-0.06, 0, 0), steel));
    this.pedals = [];
    for (const s of [-1, 1]) { // −1 правая (−x), фаза 0; +1 левая, фаза π
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, CR, 0.025).translate(0, -CR / 2, 0), steel); arm.position.x = s * 0.075; if (s > 0) arm.rotation.x = Math.PI; this.cranks.add(arm);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.07), black); this.root.add(ped); this.pedals.push({ mesh: ped, side: s });
    }
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  // Где педаль (мир): правая на фазе crankA, левая на π позже; z — вперёд, низ — при фазе 0.
  pedal(s) {
    const a = this.crankA + (s > 0 ? Math.PI : 0);
    return this.local(s * 0.13, this.BB.y - this.crank * Math.cos(a), this.BB.z - this.crank * Math.sin(a));
  }
  update(dt, inp, world, riding) {
    if (riding) {
      this.drive(dt, inp, world);
      // Наклон в повороте — как у живого велосипедиста: по центробежной силе; на месте стоит ровно.
      const want = riding ? clamp(-Math.atan2(this.v * this.yawRate, 9.8), -0.45, 0.45) : 0;
      this.lean += (want - this.lean) * (1 - Math.exp(-dt * 5));
      this.crankA += (inp.y > 0.1 || Math.abs(this.v) > 3.5 ? this.v / this.wheelR / 2.2 : 0) * dt; // не крутит — накатом
    } else this.lean += (0.1 - this.lean) * (1 - Math.exp(-dt * 6)); // на подножке чуть завален
    this.roll = this.lean;
    this.place();
    this.front.rotation.y = -this.steer; // руль вправо — колесо вправо (−x)
    this.frontWheel.rotation.x = this.rearWheel.rotation.x = this.spin;
    this.cranks.rotation.x = this.crankA;
    for (const p of this.pedals) { p.mesh.position.copy(this.pedal(p.side)).applyMatrix4(new THREE.Matrix4().copy(this.root.matrixWorld).invert()); p.mesh.position.x = p.side * 0.13; }
  }
  // Посадка: таз над седлом, ступни на педалях (лодыжка над подушечкой стопы), ладони на ручках, ракетка в корзине.
  seat() { return this.local(0, this.saddle.y + SIT_H, this.saddle.z); }
  feet(rig) {
    const f = this.fwd.applyAxisAngle(UP, 0), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.root.quaternion);
    const back = rig.footLen * Math.cos(rig.footA0), upA = rig.footLen * Math.sin(rig.footA0);
    return { Right: this.pedal(-1).addScaledVector(up, 0.02 + upA).addScaledVector(f, -back * 0.8), Left: this.pedal(1).addScaledVector(up, 0.02 + upA).addScaledVector(f, -back * 0.8) };
  }
  hands() {
    const toC = (s) => new THREE.Vector3(s === 'Right' ? 1 : -1, 0, 0).applyQuaternion(this.front.getWorldQuaternion(new THREE.Quaternion()));
    return Object.fromEntries(['Right', 'Left'].map((s) => [s, { at: this.front.localToWorld(this.grips[s].clone().sub(this.front.position).setZ(-0.17)), Y: toC(s) }]));
  }
  stowRacket(r) { // в корзине головкой вверх, чуть назад к рулю
    const q = this.basket.getWorldQuaternion(new THREE.Quaternion());
    const Y = new THREE.Vector3(0, 1, -0.25).normalize().applyQuaternion(q), Z = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    r.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(Y, Z), Y, Z));
    r.position.copy(this.basket.localToWorld(new THREE.Vector3(0, -0.02, 0.03)));
  }
  mountAt() { return this.pos.clone().addScaledVector(this.left, 0.55); }
  get reach() { return 1.3; }
  bodyKey() { return BIKE_KEY; }
}

// ---------- Машина ----------
// Старый кабриолет без крыши кодом (по картинке GPT gpt/env/car.png): кузов — лофт из скруглённых сечений вдоль длины
// (капот с выпуклостью, борта заваливаются внутрь, нос и корма скругляются в точку), салон — ванна до пола внутри бортов,
// колёсные арки — ниши по краям. Руль слева. Краска с лаком (clearcoat), хром, стекло, фары, решётка, зеркала.
const AX = [1.12, -1.13], AR = 0.37, AY = 0.3, FLOOR_Y = 0.36;
function carSection(z) {
  const az = Math.abs(z), e = clamp((az - 1.62) / 0.35, 0, 1), sh = Math.sqrt(1 - e * e); // последние 35 см — скругление в точку
  const hw = 0.8 * (1 - 0.07 * smooth(z, 0.9, 1.9) - 0.05 * smooth(-z, 1.1, 1.9)) * Math.pow(sh, 0.3);
  const yt = z > 0.42 ? THREE.MathUtils.lerp(0.79, 0.7, smooth(z, 0.42, 1.7)) : z < -0.95 ? THREE.MathUtils.lerp(0.84, 0.77, smooth(-z, 0.95, 1.7)) : 0.84 - 0.05 * smooth(z, 0.2, 0.42);
  const yb = 0.25 + 0.07 * smooth(az, 1.45, 1.9), yc = (yt + yb) / 2 + (z > 0 ? -0.05 : 0.03) * e, hh = ((yt - yb) / 2) * Math.pow(sh, 0.55);
  const tub = smooth(z, -0.97, -0.9) * (1 - smooth(z, 0.36, 0.43)); // вырез салона
  return { hw, yc, hh, tub };
}
function carBody(paintC, trimC) {
  const NS = 110, M = 72, n = 3, pos = [], col = [], idx = [], cp = new THREE.Color(paintC), ct = new THREE.Color(trimC);
  for (let i = 0; i <= NS; i++) {
    const z = -1.97 + (3.94 * i) / NS, { hw, yc, hh, tub } = carSection(z);
    for (let m = 0; m < M; m++) {
      const t = (m / M) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (1 - 0.07 * Math.max(0, s));
      let y = yc + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), inside = 0;
      if (s > 0 && tub > 0) { inside = (1 - smooth(Math.abs(x), hw - 0.11, hw - 0.07)) * tub; y += (FLOOR_Y - y) * inside; }
      for (const az of AX) { // ниша колеса: край днища поднят по дуге над осью
        const dz = z - az; if (Math.abs(dz) >= AR) continue;
        const ay = AY + Math.sqrt(AR * AR - dz * dz), k = smooth(Math.abs(x), hw - 0.31, hw - 0.25);
        if (y < ay) y += (ay - y) * k;
      }
      pos.push(x, y, z); const cc = inside > 0.3 ? ct : cp; col.push(cc.r, cc.g, cc.b);
      if (i) { const A = (i - 1) * M + m, B = (i - 1) * M + (m + 1) % M, C = i * M + m, D = i * M + (m + 1) % M; idx.push(A, B, C, B, D, C); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export class Car extends Vehicle {
  constructor(scene) {
    super(scene);
    this.kind = 'car'; this.name = 'машина';
    this.cfg = { vmax: 17, vback: 5, accel: 5.5, brake: 11, roll: 0.6, hill: 0.6, steer: 0.6, steerFall: 70, steerRate: 2.2, wb: 2.25, grip: 7, slide: 0.012, drift: { hb: 4, yaw: 1.5, scrub: 0.3 } };
    this.axles = AX; this.track = 1.3; this.wheelR = 0.3; this.circles = [1.25, 0, -1.25]; this.r = 0.8; this.half = SHOULDER - 0.4;
    const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
    const chrome = S4({ color: '#eef1f4', metalness: 1, roughness: 0.12 }), cream = new THREE.MeshPhysicalMaterial({ color: '#e9dec6', roughness: 0.55, sheen: 0.4 });
    const dark = L4({ color: '#2a2a2a' }), black = S4({ color: '#141414', roughness: 0.85 });
    this.body = new THREE.Group(); this.root.add(this.body);
    const hull = new THREE.Mesh(carBody('#86b2d4', '#d9ccb1'), paint); this.body.add(hull);
    // Детали ставим на поверхность кузова лучом: фары, решётка, фонари, молдинг, ручки дверей.
    const ray = new THREE.Raycaster();
    const onSkin = (x, y, z, dir) => { ray.set(new THREE.Vector3(x, y, z).addScaledVector(dir, -4), dir); const h = ray.intersectObject(hull)[0]; return h ? { p: h.point, n: h.face.normal.clone() } : { p: new THREE.Vector3(x, y, z), n: dir.clone().negate() }; };
    const stick = (mesh, hit, out = 0) => { mesh.position.copy(hit.p).addScaledVector(hit.n, out); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.n); this.body.add(mesh); return mesh; };
    const F = new THREE.Vector3(0, 0, -1), Bk = new THREE.Vector3(0, 0, 1);
    for (const sx of [-0.5, 0.5]) {
      const h = onSkin(sx, 0.6, 0, F);
      stick(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 10, 24), chrome), h, 0.01);
      stick(new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.35), S4({ color: '#fffaf0', emissive: '#fff1cc', emissiveIntensity: 0.3, roughness: 0.05, metalness: 0.2 })), h, 0.0);
      stick(new THREE.Mesh(new THREE.CircleGeometry(0.035, 14), L4({ color: '#e8a33a', emissive: '#6a3a08' })), onSkin(sx * 1.05, 0.44, 0, F), 0.006);
      stick(new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.07, 4, 10).rotateZ(Math.PI / 2), L4({ color: '#b3261e', emissive: '#4a0a06' })), onSkin(sx * 1.15, 0.62, 0, Bk), 0.005);
    }
    // Решётка: тёмный овал с горизонтальными планками и хромовым щитком посередине.
    const grille = new THREE.Group();
    grille.add(new THREE.Mesh(new THREE.CircleGeometry(0.2, 28).scale(1.7, 0.55, 1), black));
    for (let k = -2; k <= 2; k++) grille.add(new THREE.Mesh(new THREE.BoxGeometry(0.58 - Math.abs(k) * 0.07, 0.012, 0.012).translate(0, k * 0.035, 0.008), chrome));
    grille.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 32).scale(1.7, 0.55, 1), chrome));
    grille.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.2, 3).rotateZ(Math.PI).scale(1, 1, 0.3).translate(0, 0.02, 0.02), chrome));
    stick(grille, onSkin(0, 0.45, 0, F), 0.005);
    // Бамперы с клыками, хромовый молдинг по борту, ручки дверей, зеркала.
    for (const [z, y] of [[1.93, 0.34], [-1.92, 0.37]]) {
      this.body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 1.12, 4, 12).rotateZ(Math.PI / 2).translate(0, y, z), chrome));
      for (const sx of [-0.3, 0.3]) this.body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8).translate(sx, y + 0.05, z), chrome));
    }
    for (const sx of [-1, 1]) {
      const side = new THREE.Vector3(-sx, 0, 0), line = [];
      for (let z = -1.5; z <= 1.5; z += 0.06) { const h = onSkin(0, 0.47, z, side); if (Math.abs(h.p.x) > 0.5) line.push(h.p.addScaledVector(h.n, 0.008)); else line.push(null); }
      const strip = []; for (let k = 1; k < line.length; k++) if (line[k] && line[k - 1] && line[k].distanceTo(line[k - 1]) < 0.12) strip.push(tube(line[k - 1], line[k], 0.007));
      if (strip.length) this.body.add(new THREE.Mesh(merge(strip), chrome)); // молдинг одним мешем
      const dh = onSkin(0, 0.74, -0.75, side), hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.09, 4, 8).rotateX(Math.PI / 2), chrome);
      hd.position.copy(dh.p).addScaledVector(dh.n, 0.02); this.body.add(hd);
      const mir = new THREE.Group(); mir.position.set(sx * 0.72, 0.84, 0.4);
      mir.add(new THREE.Mesh(tube(P(0, -0.04, 0), P(sx * 0.06, 0.05, 0), 0.008), chrome));
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), chrome); cup.position.set(sx * 0.07, 0.07, 0.0); mir.add(cup);
      const mg = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16).rotateY(Math.PI), S4({ color: '#9fb4c2', metalness: 1, roughness: 0.02 })); mg.position.set(sx * 0.07, 0.07, -0.001); mir.add(mg);
      this.body.add(mir);
    }
    // Салон: торпедо с приборами, кресла, руль слева; лобовое стекло в хромовой рамке.
    this.body.add(new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.15, 0.14, 2, 0.03).translate(0, 0.68, 0.33), cream)); // торпедо ниже капота
    for (const x of [0.25, 0.41]) { const g = new THREE.Mesh(new THREE.CircleGeometry(0.045, 18).rotateY(Math.PI), dark); g.position.set(x, 0.69, 0.259); this.body.add(g); }
    this.body.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 1.25).translate(0, FLOOR_Y + 0.01, -0.28), dark)); // коврик
    const seatG = merge([new RoundedBoxGeometry(0.48, 0.11, 0.5, 3, 0.045).translate(0, 0.43, -0.42), new RoundedBoxGeometry(0.46, 0.46, 0.1, 3, 0.045).rotateX(-0.22).translate(0, 0.68, -0.7)]);
    for (const sx of [0.33, -0.33]) this.body.add(new THREE.Mesh(seatG.clone().translate(sx, 0, 0), cream));
    this.wheelPivot = new THREE.Group(); this.wheelPivot.position.set(0.33, 0.83, 0.1); this.wheelPivot.rotation.x = -0.45; this.body.add(this.wheelPivot);
    this.wheelSpin = new THREE.Group(); this.wheelPivot.add(this.wheelSpin);
    this.wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.014, 8, 40), L4({ color: '#8a5a32' })));
    this.wheelSpin.add(new THREE.Mesh(merge([0, 2.2, 4.1].map((a) => tube(P(0, 0, 0), P(Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0), 0.008))), chrome));
    this.wheelSpin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14).rotateX(Math.PI / 2), chrome));
    this.body.add(new THREE.Mesh(tube(P(0.33, 0.82, 0.12), P(0.33, 0.68, 0.38), 0.02), dark));
    const glass = S4({ color: '#cfe3ea', transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const ws = new THREE.Group(); ws.position.set(0, 0.78, 0.5); ws.rotation.x = -0.55; this.body.add(ws);
    ws.add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.34).translate(0, 0.17, 0), glass));
    ws.add(new THREE.Mesh(merge([tube(P(-0.66, 0, 0), P(-0.66, 0.36, 0), 0.016), tube(P(0.66, 0, 0), P(0.66, 0.36, 0), 0.016), tube(P(-0.66, 0.36, 0), P(0.66, 0.36, 0), 0.012), tube(P(-0.66, 0, 0), P(0.66, 0, 0), 0.012)]), chrome));
    ws.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02).translate(0, 0.3, -0.03), chrome)); // зеркало заднего вида
    // Колёса: покрышка, колпак с кольцом и болтами; передние поворачивают.
    this.wheels = [];
    const hub = S4({ color: '#cfd4d8', metalness: 0.9, roughness: 0.25 });
    for (const [x, z, front] of [[0.66, AX[0], 1], [-0.66, AX[0], 1], [0.66, AX[1], 0], [-0.66, AX[1], 0]]) {
      const steerG = new THREE.Group(), spinG = new THREE.Group(), sx = Math.sign(x); steerG.position.set(x, this.wheelR, z); steerG.add(spinG); this.root.add(steerG);
      spinG.add(new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.085, 14, 36).rotateY(Math.PI / 2), black));
      spinG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.14, 28).rotateZ(Math.PI / 2), hub));
      spinG.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-sx * Math.PI / 2).scale(0.45, 1, 1).translate(sx * 0.07, 0, 0), chrome));
      spinG.add(new THREE.Mesh(merge([0, 1, 2, 3, 4, 5].map((k) => new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8).rotateZ(Math.PI / 2).translate(sx * 0.075, Math.cos(k * 1.047) * 0.12, Math.sin(k * 1.047) * 0.12))), dark)); // болты
      this.wheels.push({ steerG, spinG, front });
    }
    this.root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  }
  update(dt, inp, world, riding) {
    if (riding || this.v !== 0 || this.vel.lengthSq() > 1e-4) this.drive(dt, inp, world); // без водителя катится, пока не встанет
    this.roll += ((this.slope ?? 0) + clamp(this.v * (this.yawRate ?? 0) * 0.012, -0.05, 0.05) - this.roll) * (1 - Math.exp(-dt * 8)); // кузов кренится наружу поворота
    this.place();
    for (const w of this.wheels) { w.spinG.rotation.x = this.spin; if (w.front) w.steerG.rotation.y = -this.steer; }
    this.wheelSpin.rotation.z = this.steer * 3.2; // руль крутится втрое больше колёс
  }
  seat() { return this.local(0.33, 0.42 + SIT_H, -0.42); }
  feet() { return { Right: this.local(0.24, 0.47, 0.34), Left: this.local(0.45, 0.47, 0.3) }; } // лодыжки над полом салона, педали под торпедо
  hands() { // на ободе на «10 и 2», ось хвата — по касательной к ободу вверх
    const q = this.wheelSpin.getWorldQuaternion(new THREE.Quaternion());
    return Object.fromEntries([['Right', -1], ['Left', 1]].map(([s, sx]) => {
      const a = sx * 1.05, p = new THREE.Vector3(Math.sin(a) * 0.18, Math.cos(a) * 0.18, 0);
      return [s, { at: this.wheelSpin.localToWorld(p.clone()), Y: new THREE.Vector3(-Math.cos(a) * sx, Math.sin(a) * sx, 0).multiplyScalar(-1).applyQuaternion(q).normalize() }];
    }));
  }
  stowRacket(r) { // на пассажирском сиденье наискосок
    const q = this.root.quaternion, Y = new THREE.Vector3(0.35, 0.25, 1).normalize().applyQuaternion(q), Z = new THREE.Vector3(0, 1, -0.25).normalize().applyQuaternion(q);
    Z.addScaledVector(Y, -Z.dot(Y)).normalize();
    r.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(Y, Z), Y, Z));
    r.position.copy(this.local(-0.36, 0.5, -0.62));
  }
  mountAt() { return this.local(1.25, 0, -0.3).setY(this.pos.y); }
  get reach() { return 1.4; }
  bodyKey() { return CAR_KEY; }
}

// ---------- Лёва в седле и за рулём ----------
// Каждый кадр: корпус (wrap) по транспорту, ключ позы, ступни в педали, ладони на руль. w — доля посадки (0..1):
// садится и встаёт за 0,45 с, позы и точки плавно перетекают из прогулки.
function seatLev(L, veh, w, dt, from) {
  const rig = L.rig, seat = veh.seat(), up = new THREE.Vector3(0, 1, 0).applyQuaternion(veh.root.quaternion);
  const target = seat.addScaledVector(up, -L.hipH);
  const e = w * w * (3 - 2 * w);
  L.wrap.position.lerpVectors(from.pos, target, e);
  L.wrap.quaternion.slerpQuaternions(from.q, veh.root.quaternion, e);
  L.wrap.updateMatrixWorld(true);
  const K = mix(from.key, veh.bodyKey(), e), F = veh.feet(rig), lift = 0.05;
  const foot = (s) => ({ pos: from.feet[s].clone().lerp(F[s], e).sub(new THREE.Vector3(0, rig.ankleH + lift, 0)), yaw: 0, lift });
  rig.pose(K, K, 0, { Left: foot('Left'), Right: foot('Right'), crouch: 0, dt });
  const H = veh.hands();
  for (const s of ['Right', 'Left']) for (let it = 0; it < 2; it++) {
    const wrist = rig.b[s + 'Hand'].getWorldPosition(new THREE.Vector3()), W = H[s].at.clone().sub(rig.palm(s).sub(wrist));
    rig.armTo(s, wrist.lerp(W, e));
    rig.orientHand(s, H[s].Y, e);
  }
  rig.grip('Right', 1); rig.grip('Left', 0.6 + 0.4 * e);
  veh.stowRacket(L.racket); L.racket.updateMatrixWorld(true);
}

// ---------- Занос: следы шин и дым ----------
// Тёмные полосы под задними колёсами (кольцо из 900 отрезков, старые затираются новыми) и клубы дыма.
class Skid {
  constructor(scene) {
    this.N = 900; this.i = 0; this.last = [null, null]; this.acc = 0; this.k = 0;
    const mat = new THREE.MeshBasicMaterial({ color: 0x141210, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, this.N);
    this.marks.count = 0; this.marks.frustumCulled = false; scene.add(this.marks);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(c);
    this.puffs = Array.from({ length: 48 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xf2f0ec, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); return { s, life: 0, v: new THREE.Vector3() }; });
  }
  // wheels — точки касания задних колёс, level 0..1 — сила скольжения.
  update(dt, wheels, level) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    wheels.forEach((p, w) => {
      const a = this.last[w];
      if (level < 0.2) { this.last[w] = null; return; }
      if (!a) { this.last[w] = p.clone(); return; }
      const d = p.distanceTo(a); if (d < 0.3) return;
      m.compose(p.clone().add(a).multiplyScalar(0.5).setY((p.y + a.y) / 2 + 0.03), q.setFromAxisAngle(UP, Math.atan2(p.x - a.x, p.z - a.z)), new THREE.Vector3(0.2, 1, d + 0.05));
      this.marks.setMatrixAt(this.i, m); this.i = (this.i + 1) % this.N; this.marks.count = Math.min(this.N, this.marks.count + 1);
      this.marks.instanceMatrix.needsUpdate = true; this.last[w] = p.clone();
    });
    for (this.acc += dt * level * 26; this.acc > 1; this.acc--) {
      const f = this.puffs[this.k = (this.k + 1) % this.puffs.length], p = wheels[this.k % 2];
      f.life = 1; f.s.visible = true; f.s.position.copy(p).add(new THREE.Vector3(Math.random() - 0.5, 0.25, Math.random() - 0.5).multiplyScalar(0.4));
      f.v.set(Math.random() - 0.5, 0.7 + Math.random() * 0.5, Math.random() - 0.5);
    }
    for (const f of this.puffs) {
      if (!f.s.visible) continue;
      f.life -= dt / 1.4; if (f.life <= 0) { f.s.visible = false; continue; }
      f.s.position.addScaledVector(f.v, dt); const t = 1 - f.life;
      f.s.scale.setScalar(0.8 + 3 * t); f.s.material.opacity = 0.6 * f.life * Math.min(1, t * 6);
    }
  }
}

// ---------- Всё вместе: посадка, езда, камера, кнопки ----------
const BIKE_SPOT = [10.0, -10.5, 0], CAR_SPOT = [51.3, 27.5, 0]; // велосипед у забора (где стоял из Meshy) левым боком к дорожке, машина на стоянке носом к выезду
export class Rides {
  constructor({ scene, club, town }) {
    Object.assign(this, { scene, club, town, lev: club.lev });
    this.bike = new Bike(scene, this.lev.rig); this.car = new Car(scene);
    this.world = {
      ground: (x, z) => town.ground(x, z) ?? (club.obs ? club.ground(x, z) : 0), // настил террасы клуб знает после выхода с корта
      bounds: (p, r, half) => town.bounds(p, r, club.obs, half),
    };
    this.bike.park(...BIKE_SPOT, this.world); this.car.park(...CAR_SPOT, this.world);
    this.bike.update(0, { x: 0, y: 0 }, this.world, false); this.car.update(0, { x: 0, y: 0 }, this.world, false);
    // Велосипед из Meshy (env.js PLACES.bike) убираем: на его месте этот, с крутящимися колёсами.
    // Модель могла ещё не догрузиться — ищем ещё несколько секунд.
    const drop = (n) => {
      const old = scene.getObjectByName('bike'); if (!old) { if (n < 10) setTimeout(() => drop(n + 1), 1000); return; }
      old.removeFromParent();
      if (club.obs) club.obs.boxes = club.obs.boxes.filter(([a, b, c, d]) => !(a < BIKE_SPOT[0] && c > BIKE_SPOT[0] && b < BIKE_SPOT[1] && d > BIKE_SPOT[1]));
    };
    drop(0);
    // Стоящий транспорт — препятствие для прогулки (крючок town.bounds → extra).
    town.extra = (p, r) => pushOut(p, r, { circles: this.list.filter((v) => v !== this.active).flatMap((v) => v.circles.map((z) => { const c = v.pos.clone().addScaledVector(v.fwd, z); return [c.x, c.z, v.r * 0.9]; })) });
    this.active = null; this.w = 0; this.near = null; this.btn = { l: 0, r: 0, g: 0, b: 0, h: 0 }; this.skid = new Skid(scene);
    this.eye = new THREE.Vector3(); this.look = new THREE.Vector3(); this.camYaw = 0; this.fresh = true;
    this.ui();
  }
  get list() { return [this.bike, this.car]; }
  nearest() {
    if (this.active || this.club.mode !== 'walk' || this.lev.seat) return null;
    const p = this.lev.pos; let best = null, bd = Infinity;
    for (const v of this.list) { const d = Math.min(v.mountAt().setY(0).distanceTo(p.clone().setY(0)), v.pos.clone().setY(0).distanceTo(p.clone().setY(0)) - (v === this.car ? 1.1 : 0)); if (d < v.reach && d < bd) { bd = d; best = v; } }
    return best;
  }
  // E: сесть на ближний транспорт или слезть. true — нажатие наше (скамейку не трогаем).
  use() {
    if (this.active?.kind === 'car' && Math.abs(this.active.v) > 1.5) return this.jump(), true; // из машины на ходу — выпрыгнуть
    if (this.active) { this.wantOff = true; return true; } // велосипед и медленная машина: сперва тормозит, потом слезает (update)
    const v = this.nearest(); if (!v) return false;
    const L = this.lev;
    this.from = { pos: L.wrap.position.clone(), q: L.wrap.quaternion.clone(), key: L.lastPose ?? READY, feet: { Left: L.feet.Left.pos.clone().setY(L.feet.Left.pos.y + L.rig.ankleH), Right: L.feet.Right.pos.clone().setY(L.feet.Right.pos.y + L.rig.ankleH) } };
    L.vel.set(0, 0, 0);
    this.active = v; this.w = 0; this.fresh = true; this.camYaw = v.yaw;
    this.sync();
    return true;
  }
  // Куда встаёт Лёва, слезая: слева от велосипеда, у водительской двери машины, лицом по ходу. Посадка (seatLev) идёт
  // назад от седла к этой точке, поэтому Лёва не уезжает туда, где садился.
  exitPose(v) {
    const p = v.mountAt(); this.world.bounds(p, 0.28); p.y = this.world.ground(p.x, p.z);
    const l = v.left, a = this.lev.rig.ankleH, q = new THREE.Quaternion().setFromAxisAngle(UP, v.yaw);
    return { pos: p, q, key: this.from.key, feet: { Left: p.clone().addScaledVector(l, 0.13).setY(p.y + a), Right: p.clone().addScaledVector(l, -0.13).setY(p.y + a) } };
  }
  // Встать с транспорта: прогулка продолжается с той же точки.
  getOff() {
    const v = this.active, L = this.lev; if (!v) return;
    const p = this.leaving ? this.from.pos.clone() : this.exitPose(v).pos;
    L.place(p); L.bodyTurn = wrap(v.yaw - L.netYaw); L.wrap.rotation.set(0, v.yaw, 0); L.vel.set(0, 0, 0);
    this.club.camYaw = v.yaw; v.v = 0; v.vel.set(0, 0); v.steer = 0;
    this.active = null; this.leaving = this.wantOff = false; this.w = 0;
    this.sync();
  }
  // Выпрыгнуть на ходу (Лёва 19.11): сразу у водительской двери, Лёва выбегает по инерции, машина катится дальше сама.
  jump() {
    const v = this.active, L = this.lev, p = v.local(1.2, 0, -0.3); this.world.bounds(p, 0.28); p.y = this.world.ground(p.x, p.z);
    L.place(p); L.bodyTurn = wrap(v.yaw - L.netYaw); L.wrap.rotation.set(0, v.yaw, 0);
    L.vel.set(v.vel.x, 0, v.vel.y).multiplyScalar(0.45).addScaledVector(v.left, 2).clampLength(0, 5.5);
    this.club.camYaw = v.yaw; this.active = null; this.leaving = this.wantOff = false; this.w = 0;
    this.sync();
  }
  // «На корт» (club.back): с транспорта снимаем, тень солнца — назад к корту; издалека — через затемнение.
  leave() {
    const far = this.lev.pos.length() > 60;
    if (this.active) this.getOff();
    this.town.update(0, new THREE.Vector3());
    if (far) { const f = this.fader; f.style.transition = 'none'; f.style.opacity = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = '0'; })); }
  }
  input(inp) { const b = this.btn; return { x: clamp((inp?.x ?? 0) + b.r - b.l, -1, 1), y: clamp((inp?.y ?? 0) + b.g - b.b, -1, 1), hb: !!inp?.hb || !!b.h }; }
  // Кадр. true — Лёву ведёт транспорт (club.js не двигает его сам).
  update(dt, now, inp) {
    const L = this.lev, v = this.active;
    for (const o of this.list) if (o !== v) o.update(dt, { x: 0, y: 0 }, this.world, false);
    const c = this.car, lvl = clamp((c.slip - 1.2) / 3, 0, 1) * clamp(c.vel.length() / 3, 0, 1); // занос и ручник — следы, дым, визг
    this.skid.update(dt, [c.local(0.66, 0, AX[1]), c.local(-0.66, 0, AX[1])], lvl);
    this.club.sound?.screech(lvl);
    if (!v) { const n = this.nearest(); if (n !== this.near) { this.near = n; this.sync(); } this.town.update(dt, L.pos); return false; }
    const i = this.wantOff ? { x: 0, y: Math.abs(v.v) > 0.1 ? -Math.sign(v.v) : 0 } : this.input(inp);
    v.update(dt, i, this.world, true);
    if (this.wantOff && !this.leaving && this.w > 0.95 && Math.abs(v.v) < 0.8) { this.leaving = true; this.from = this.exitPose(v); }
    this.w = clamp(this.w + (this.leaving ? -dt : dt) / 0.45, 0, 1);
    if (this.leaving && this.w === 0) { this.getOff(); this.town.update(dt, L.pos); return true; }
    seatLev(L, v, this.w, dt, this.from);
    L.pos.copy(v.pos); // по Лёве камера, двери, тень, «На корт»
    this.town.update(dt, L.pos);
    return true;
  }
  // Камера сзади-сверху за транспортом, плавно; разворот следует за курсом с запаздыванием.
  camera(dt, camera) {
    const v = this.active, k = 1 - Math.exp(-dt * 4), car = v.kind === 'car';
    this.camYaw += wrap((v.v < -0.5 ? v.yaw : v.yaw) - this.camYaw) * (1 - Math.exp(-dt * 2.5));
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)), portrait = innerWidth / innerHeight < 0.8;
    const dist = (car ? 6.2 : 3.8) * (portrait ? 1.25 : 1), h = (car ? 2.5 : 1.9) * (portrait ? 1.2 : 1);
    const eye = v.pos.clone().addScaledVector(f, -dist).setY(v.pos.y + h);
    eye.y = Math.max(eye.y, this.world.ground(eye.x, eye.z) + 1.2);
    const look = v.pos.clone().addScaledVector(f, car ? 2.5 : 1.8).setY(v.pos.y + (car ? 0.9 : 1.1));
    if (this.fresh) { this.fresh = false; this.look.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6).add(camera.position)); }
    camera.position.lerp(eye, k); this.look.lerp(look, k); camera.lookAt(this.look);
  }

  // Кнопки езды на телефоне: руль слева, газ и тормоз справа (зона от 56 px). Сесть и слезть — E и кнопка действия.
  ui() {
    const css = document.createElement('style');
    css.textContent = `#vpad { display: none; position: fixed; inset: auto 0 0 0; padding: 0 calc(14px + env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) calc(14px + env(safe-area-inset-left)); justify-content: space-between; pointer-events: none; }
      body.ride #vpad { display: flex; } @media (pointer: fine) { body.ride #vpad { display: none; } }
      #vpad div { display: flex; gap: 12px; } #vpad button { pointer-events: auto; width: 68px; height: 68px; border-radius: 50%; border: 1px solid rgba(255,255,255,.2); background: rgba(16,24,20,.55); color: #fff; font: 700 14px/1 system-ui, sans-serif; touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
      #vpad .r { display: grid; grid-template-columns: 68px 68px; align-items: end; } #vpad .hb { grid-column: 1 / 3; width: auto; height: 44px; border-radius: 22px; }
      #vpad button.on { background: rgba(255,255,255,.3); } #vpad svg { width: 26px; height: 26px; }
      body.ride #joy { display: none !important; }
      #vfade { position: fixed; inset: 0; background: #0b100d; opacity: 0; pointer-events: none; z-index: 3; }`;
    document.head.append(css);
    const chev = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const pad = document.createElement('div'); pad.id = 'vpad';
    pad.innerHTML = `<div><button data-k="l" aria-label="Руль влево">${chev('M15 5l-7 7 7 7')}</button><button data-k="r" aria-label="Руль вправо">${chev('M9 5l7 7-7 7')}</button></div><div class="r"><button data-k="h" class="hb" hidden>Ручник</button><button data-k="b">Тормоз</button><button data-k="g">Газ</button></div>`;
    for (const b of pad.querySelectorAll('button')) {
      const set = (on) => (e) => { e.preventDefault(); this.btn[b.dataset.k] = on ? 1 : 0; b.classList.toggle('on', on); };
      b.addEventListener('pointerdown', set(true)); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(false));
    }
    this.fader = document.createElement('div'); this.fader.id = 'vfade';
    document.body.append(pad, this.fader);
  }
  sync() {
    const ride = !!this.active; // «Сесть на велосипед», «Слезть» — подсказка и кнопка действия из interact.js (main.js)
    document.body.classList.toggle('ride', ride);
    this.hbBtn ??= document.querySelector('#vpad .hb'); this.hbBtn.hidden = !(ride && this.active.kind === 'car');
    if (!ride) Object.assign(this.btn, { l: 0, r: 0, g: 0, b: 0, h: 0 });
  }
}
