// Полукорт со стенкой (18.11): половина грунтового корта на свободном газоне справа от клуба (x ≈ 40…53, у дороги),
// тренировочная стенка на линии сетки — зелёная, с белой полосой на высоте сетки, — и невысокий забор с калиткой сзади.
// Зашёл на площадку — «E бить об стенку» — режим «Стенка» (practice.js) здесь же, Q — обратно на прогулку.
//
// Без копии физики: розыгрыш, игроки, мяч и следы живут в координатах корта (сетка на z = 0, Лёва на +z). На время
// стенки весь мир (группа court: корт, клуб, горы, терраса) сдвигается на −O — полукорт встаёт ровно туда, где в
// координатах корта стоит сетка, и физика, камера матча, подсказки работают без единой правки. Ориентация та же, что
// у корта 1 (стенка на −z, взгляд на большую гору), поэтому солнце и запечённый свет гор не расходятся.
// Объекты мира вне группы court (например, свои модели в scene) на время стенки надо сдвигать так же: userData.world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT, clayMaterial, lineMaterial } from './court.js';
import { Practice } from './practice.js';
import { MAT, initMat } from './props.js';
import { FLAT } from './env-mountains.js';

// O — середина стенки в мире; w — полуширина площадки до забора, back — от стенки до заднего забора, h — высота забора.
export const HALF = { x: 46.5, z: -2.2, w: 6.7, back: 15.4, h: 1.0, gate: [4.7, 6.0], wall: 4.6, wallH: 4.2 };
const W_ALL = COURT.wide + COURT.runSide * 2, L_ALL = COURT.len + COURT.runBack * 2;
FLAT.rects.push([HALF.x - HALF.w - 0.6, HALF.z - 1.6, HALF.x + HALF.w + 0.6, HALF.z + HALF.back + 0.6]); // газон под полукортом без бугров (до постройки мира)
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Стенка: крашеный бетон, тёмная «сетка» ниже линии, белая полоса по той же кривой, что верх сетки в физике
// (мяч ниже — «Ниже линии»), бетонный козырёк, контрфорсы сзади.
function wallMesh() {
  const g = new THREE.Group(), W = HALF.wall, H = HALF.wallH, POST = 4.115 + 0.914, top = (x) => 0.914 + 0.156 * Math.min(1, (x / POST) ** 2);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d'), k = 1024 / (W * 2), Y = (y) => 512 - (y / H) * 512;
  x.fillStyle = '#3f6a52'; x.fillRect(0, 0, 1024, 512);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) { const v = r(); x.fillStyle = `rgba(${v < 0.5 ? '20,40,30' : '200,230,210'},${0.05 + r() * 0.06})`; x.beginPath(); x.arc(r() * 1024, r() * 512, 1 + r() * 9, 0, 7); x.fill(); }
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(214,239,60,${0.12 + r() * 0.2})`; x.beginPath(); x.arc(r() * 1024, Y(0.4 + r() * 2.2), 2 + r() * 3, 0, 7); x.fill(); } // следы мячей
  const curve = (dy, w) => { x.beginPath(); for (let i = 0; i <= 64; i++) { const xx = -W + (i / 64) * W * 2; x[i ? 'lineTo' : 'moveTo']((xx + W) * k, Y(top(xx) + dy)); } x.lineWidth = w; x.stroke(); };
  x.save(); x.beginPath(); for (let i = 0; i <= 64; i++) { const xx = -W + (i / 64) * W * 2; x.lineTo((xx + W) * k, Y(top(xx))); } x.lineTo(1024, 512); x.lineTo(0, 512); x.closePath(); x.fillStyle = 'rgba(10,25,18,0.28)'; x.fill(); x.restore(); // «сетка» ниже линии
  x.strokeStyle = '#f2f1ea'; curve(-0.025, 0.05 * 512 / H); // белая полоса 5 см
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }), conc = new THREE.MeshStandardMaterial({ color: '#8f8c84', roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W * 2, H, 0.28), [conc, conc, conc, conc, face, conc]); // лицо (+z) — к игроку
  body.position.set(0, H / 2, -0.14); body.castShadow = body.receiveShadow = true; g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.12, 0.08, 0.4), conc); cap.position.set(0, H + 0.04, -0.14); cap.castShadow = true; g.add(cap);
  for (const sx of [-W + 0.4, -1.5, 1.5, W - 0.4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, H * 0.85, 0.9).translate(0, H * 0.425, -0.73), conc); b.castShadow = true; g.add(b); b.position.x = sx; }
  return g;
}

// Рабица на трубах: стенка от a до b (x, z площадки) высотой h, со столбами через ~2,5 м.
const linkTex = (() => { let t; return () => t ??= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = '#2a3a33'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
  const x = new THREE.CanvasTexture(c); x.colorSpace = THREE.SRGBColorSpace; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; return x;
})(); })();
function fence(runs, h) {
  const steel = new THREE.MeshStandardMaterial({ color: '#26332d', roughness: 0.5, metalness: 0.5 });
  const link = new THREE.MeshStandardMaterial({ map: linkTex(), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  const parts = [], nets = [];
  for (const [ax, az, bx, bz, hh = h] of runs) {
    const a = V(ax, 0, az), b = V(bx, 0, bz), d = b.clone().sub(a), len = d.length(), n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) { const p = a.clone().addScaledVector(d, i / n); parts.push(new THREE.CylinderGeometry(0.03, 0.03, hh + 0.05, 8).translate(p.x, (hh + 0.05) / 2, p.z)); }
    const rail = new THREE.CylinderGeometry(0.022, 0.022, len, 8).rotateZ(Math.PI / 2).rotateY(-Math.atan2(d.z, d.x)).translate((ax + bx) / 2, hh, (az + bz) / 2);
    parts.push(rail);
    const pg = new THREE.PlaneGeometry(len, hh - 0.04), uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.07, (uv.getY(i) * (hh - 0.04)) / 0.07);
    pg.rotateY(-Math.atan2(d.z, d.x)).translate((ax + bx) / 2, hh / 2, (az + bz) / 2); nets.push(pg);
  }
  const g = new THREE.Group(), posts = new THREE.Mesh(mergeGeometries(parts), steel); posts.castShadow = true;
  g.add(posts, new THREE.Mesh(mergeGeometries(nets), link));
  return g;
}

// Линии половины корта: задняя, боковые одиночки и пары, линия подачи, центральная линия подачи, метка.
function lines() {
  const g = new THREE.Group(), mat = lineMaterial(), HL = COURT.len / 2, HW = COURT.wide / 2, S = COURT.single / 2;
  const strip = (x0, z0, x1, z1, w = 0.05) => {
    const along = Math.abs(z1 - z0) > Math.abs(x1 - x0), len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    const geo = new THREE.PlaneGeometry(w * 1.25, len), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / 6 + Math.random());
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; if (!along) m.rotation.z = Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2); m.receiveShadow = true; g.add(m);
  };
  strip(-HW, HL, HW, HL, 0.1);
  for (const x of [-HW, HW, -S, S]) strip(x, 0.05, x, HL);
  strip(-S, COURT.service, S, COURT.service); strip(0, 0.05, 0, COURT.service); strip(0, HL - 0.1, 0, HL);
  return g;
}

// Скамейка у калитки: положить вещи (поверхность для interact.js) и посидеть.
function bench() {
  initMat();
  const g = new THREE.Group(); g.name = 'hc-bench';
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.4).translate(0, 0.45, 0), MAT.teak); seat.castShadow = seat.receiveShadow = true;
  const legs = []; for (const sx of [-0.62, 0.62]) for (const sz of [-0.15, 0.15]) legs.push(new THREE.BoxGeometry(0.05, 0.43, 0.05).translate(sx, 0.215, sz));
  const l = new THREE.Mesh(mergeGeometries(legs), MAT.frame); l.castShadow = true;
  g.add(seat, l);
  return g;
}

export class HalfCourt {
  // ctx: { game, club, court, scene, marks, ui, store, touch, onMode } — всё, что нужно режиму стенки.
  constructor(ctx) {
    Object.assign(this, ctx);
    this.O = V(HALF.x, 0, HALF.z); this.on = false;
    const g = this.group = new THREE.Group(); g.name = 'halfcourt'; g.position.copy(this.O);
    const clay = clayMaterial(), plane = new THREE.PlaneGeometry(HALF.w * 2, HALF.back + 0.3); plane.rotateX(-Math.PI / 2); plane.translate(0, 0, (HALF.back - 0.3) / 2);
    const p = plane.attributes.position, uv = plane.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W_ALL / 2) / W_ALL, (-p.getZ(i) + L_ALL / 2) / L_ALL); // зерно грунта того же размера, что на корте
    const ground = new THREE.Mesh(plane, clay); ground.receiveShadow = true; ground.position.y = 0.004; g.add(ground);
    const { w, back, h, gate, wall } = HALF;
    const curb = new THREE.Mesh(mergeGeometries([[0, back, w * 2 + 0.15, 0.15], [-w, back / 2, 0.15, back], [w, back / 2, 0.15, back]].map(([cx, cz, sx, sz]) => new THREE.BoxGeometry(sx, 0.1, sz).translate(cx, 0, cz))),
      new THREE.MeshStandardMaterial({ color: '#a7a399', roughness: 0.9 }));
    curb.receiveShadow = true; g.add(curb); // бетонный бордюр по забору, на 5 см над газоном
    g.add(lines(), wallMesh());
    g.add(fence([[-w, 0, -w, back], [w, 0, w, back], [-w, back, gate[0], back], [gate[1], back, w, back], [-w, 0, -wall, 0, 3], [wall, 0, w, 0, 3]], h));
    const b = bench(); b.position.set(gate[0] - 1.2, 0, back - 0.45); g.add(b);
    this.bench = { name: 'скамейка', pos: this.O.clone().add(V(gate[0] - 1.2, 0.475, back - 0.45)), r: 1.2, spots: [-0.5, 0, 0.5].map((dx) => ({ pos: this.O.clone().add(V(gate[0] - 1.2 + dx, 0.475, back - 0.45)), item: null })) };
    // Препятствия для прогулки (club.js читает userData.segs и boxes в мире): забор с калиткой, стенка с крыльями, скамейка.
    const o = this.O, S = (ax, az, bx, bz) => [ax + o.x, az + o.z, bx + o.x, bz + o.z];
    g.userData.segs = [S(-w, 0, -w, back), S(w, 0, w, back), S(-w, back, gate[0], back), S(gate[1], back, w, back), S(-w, 0, w, 0)];
    g.userData.boxes = [[o.x - wall, o.z - 1.2, o.x + wall, o.z], [o.x + gate[0] - 1.95, o.z + back - 0.65, o.x + gate[0] - 0.45, o.z + back - 0.25]];
    this.court.add(g);
  }
  // Лёва внутри забора (по прогулке, в мире).
  inside(p) { const x = p.x - this.O.x, z = p.z - this.O.z; return Math.abs(x) < HALF.w - 0.2 && z > 0.5 && z < HALF.back - 0.2; }

  // Войти в стенку: матч на паузе (замена и соперник скрыты, счёт у Лёвы), мир сдвинут на −O, Лёва на том же месте
  // площадки в координатах корта; сериями и рекордом ведает Practice (рекорд общий со «Стенкой» из меню).
  enter(now) {
    const { game: g, club, court } = this, L = club.lev, sub = club.sub;
    if (sub) { sub.free = false; sub.stroke = null; sub.place(sub.home); sub.wrap.visible = sub.racket.visible = false; }
    club.subPath = null; club.path = null;
    this.server = g.server;
    g.swapLev(L, false);
    const at = L.pos.clone().sub(this.O).setY(0);
    at.x = THREE.MathUtils.clamp(at.x, -HALF.w + 0.4, HALF.w - 0.4); at.z = THREE.MathUtils.clamp(at.z, 1, HALF.back - 0.4);
    L.free = false; L.seat = null; L.place(at);
    this.shift(-1);
    this.marks.mesh.visible = false; g.marks = null;
    g.drill = new Practice(g, 'wall', { scene: this.scene, court, ui: this.ui, store: this.store, touch: this.touch, here: { box: [HALF.w - 0.05, HALF.back - 0.05, HALF.h] } });
    this.on = true;
    void now;
  }
  // Выйти: мир на место, Лёва на прогулке там же (в мире), замена и соперник возвращаются, матч с того же счёта.
  exit(now) {
    const { game: g, club } = this, L = club.lev, sub = club.sub, opp = g.opp;
    g.drill = null; g.b.live = false; g.ballMesh.visible = false; g.landing = null;
    this.shift(1);
    const at = L.pos.clone().add(this.O).setY(0);
    L.place(at); club.free(L); L.pos.y = club.ground(at.x, at.z);
    L.onStep = () => club.sound.step({ vol: 0.35, pan: 0 });
    opp.wrap.visible = opp.racket.visible = true; opp.place(opp.home);
    this.marks.mesh.visible = true; g.marks = this.marks;
    if (sub) { sub.wrap.visible = sub.racket.visible = true; g.swapLev(sub, true); }
    g.server = this.server === L ? g.lev : this.server;
    g.resetPoint(now);
    this.on = false;
  }
  shift(dir) {
    const d = this.O.clone().multiplyScalar(dir);
    this.court.position.add(d); this.court.updateMatrixWorld(true);
    for (const o of this.scene.children) if (o.userData.world) { o.position.add(d); o.updateMatrixWorld(true); }
  }
  // Держим Лёву внутри забора полукорта (в координатах корта): гасим скорость наружу заранее, до шага игры.
  keep(L) {
    const X = HALF.w - 0.35, Z = HALF.back - 0.35;
    if (Math.abs(L.pos.x) > X) { L.pos.x = Math.sign(L.pos.x) * X; if (L.vel.x * L.pos.x > 0) L.vel.x = 0; }
    if (L.pos.z > Z) { L.pos.z = Z; if (L.vel.z > 0) L.vel.z = 0; }
  }
}
