// Взаимодействие с предметами на прогулке (18.11): ближайший доступный предмет перед Лёвой — одна строка подсказки
// внизу («E взять кофе», на телефоне — кнопка), E делает. Второе действие, если есть, — F («F выпить», «F взять стул»).
// Что можно сделать, зависит от состояния: держишь чашку — «выпить», у стола — «поставить», с графином у стакана — «налить».
//
// Предмет регистрируется одной строкой: interact.register({ pos, r, label(state), act(state, now), y, alt, pri }) —
//   pos — Vector3 (или геттер), r — с какого расстояния доступен (1,3 м), label(state) — текст действия или null (недоступно),
//   act(state, now) — сделать, y — высота точки (куда тянуться), alt — второе действие { label(state), act(state, now) },
//   pri — насколько предмет главнее соседей (м): мелочь на столе важнее стула рядом.
//   state: { held — что в левой руке, chair — стул в руках, seated — сидит, busy — идёт действие }.
// Дверь дома (env-house.js: door = { pos, open, toggle() }) — interact.door(door).
//
// Руки (Hands): предмет в левой руке, ракетка остаётся в правой. Позы рук — направлениями сегментов (как в swing.js),
// кисть ставится двухзвенной кинематикой (rig.armTo) и поворачивается так, чтобы предмет стоял прямо или наклонялся
// к губам; предмет прикреплён к кисти (его место считается от ладони каждый кадр). Крючки в player.js:
// hands.pose(K) до позы и hands.place() после ракетки.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp, deg = THREE.MathUtils.degToRad;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = (x, y, z) => new THREE.Vector3(-x, y, z).normalize(); // направление в осях скелета, x вправо (как V в swing.js)
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const flat = (v) => v.clone().setY(0);
const NB = '\u00a0';
// Поворот предмета вокруг вертикали по его «лицу» (+z) в мире: rotation.y после attach() бывает другим (Эйлер π, π − y, π).
const yawOf = (o) => { o.updateWorldMatrix(true, false); const d = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld); return Math.atan2(d.x, d.z); };

// Позы рук. Ракетка на ходу — головкой вниз у правой ноги, струнами назад: при ракетке вперёд-вниз (WALK) камера
// прогулки сзади видела Лёву «с пустыми руками» — головку закрывали бедро и корпус (баг 18.11).
const RK_WALK = { rFo: S(0.08, -0.96, 0.25), rk: S(0.28, -0.96, -0.05), face: S(0.45, 0, 0.9) };
const CARRY = { lUp: S(-0.1, -0.97, 0.2), lFo: S(0.16, -0.05, 1) }; // левая несёт: локоть у бока, предплечье вперёд
const SIT_CARRY = { lUp: S(-0.12, -0.75, 0.62), lFo: S(0.2, 0.08, 1) }; // сидя: предплечье над бедром
// К губам: локоть вперёд-наружу на уровне груди, предплечье поперёк лица к губам (не вверх: ось чашки тогда шла бы
// вдоль предплечья, и кисть не могла бы её наклонить — чашка уходила под подбородок).
const DRINK = { lUp: S(-0.45, -0.68, 0.58), lFo: S(0.72, 0.62, 0.3) };
const CHAIR = { rUp: S(0.1, -0.88, 0.45), rFo: S(-0.05, -0.3, 1), lUp: S(-0.1, -0.88, 0.45), lFo: S(0.05, -0.3, 1), rk: S(0.18, -1, 0.05), face: S(0, 0, 1) };

export class Interact {
  // ui: { show(e, f) } — e и f: текст действия или null; lev — Лёва.
  constructor({ lev, ui }) {
    Object.assign(this, { lev, ui });
    this.items = []; this.cur = null; this.alt = null; this.hands = null; this.on = false; this.shown = '';
  }
  register(it) { this.items.push(it); return it; }
  unregister(it) { this.items = this.items.filter((x) => x !== it); if (this.cur?.it === it) this.cur = null; }
  door(door) { return this.register({ pos: door.pos, r: 1.6, y: 1.0, label: () => (door.open ? 'закрыть дверь' : 'открыть дверь'), act: () => door.toggle() }); }
  get state() { const h = this.hands; return { held: h?.held ?? null, chair: h?.chair ?? null, seated: !!this.lev.seat, busy: !!h?.job, lev: this.lev }; }

  // Кого показать: ближайший предмет в ~1,3 м перед Лёвой (сидя — на расстоянии руки), у которого есть действие.
  // Вблизи (до 0,75 м) — в любую сторону. Без предмета: держишь стакан — «выпить», стул — «поставить стул», сидишь — «встать».
  update(on) {
    this.on = on;
    const L = this.lev, st = this.state, yaw = L.netYaw + L.bodyTurn, f = V(Math.sin(yaw), 0, Math.cos(yaw));
    let best = null, alt = null, next = null;
    if (on && !st.busy) {
      for (const it of this.items) {
        const p = it.pos, d = Math.hypot(p.x - L.pos.x, p.z - L.pos.z), r = st.seated ? Math.min(it.r ?? 1.3, 1.05) : it.r ?? 1.3;
        if (d > r) continue;
        const a = d < 1e-3 ? 0 : Math.acos(clamp((f.x * (p.x - L.pos.x) + f.z * (p.z - L.pos.z)) / d, -1, 1));
        if (d > 0.75 && a > deg(80)) continue;
        const lb = it.label(st); if (!lb) continue;
        const score = d + a - (it.pri ?? 0), c = { it, label: lb, act: it.act, score };
        if (!best || score < best.score) { if (best && best.label !== lb) next = best; best = c; } else if ((!next || score < next.score) && lb !== best.label) next = c;
      }
      const use = this.hands?.use(st); // своё действие предмета в руке
      if (best?.it.alt) { const lb = best.it.alt.label(st); if (lb) alt = { label: lb, act: best.it.alt.act }; }
      if (!alt && use && best) alt = use;
      if (!alt && next && best) alt = next; // второе по близости действие — на F
      if (!best) best = use ?? (st.seated ? { label: 'встать', act: () => this.stand?.() } : null);
    }
    this.cur = best; this.alt = alt;
    const key = `${best?.label ?? ''}|${alt?.label ?? ''}`;
    if (key !== this.shown) { this.shown = key; this.ui.show(best?.label ?? null, alt?.label ?? null); }
  }
  press(key, now) {
    const a = key === 'F' ? this.alt : this.cur;
    if (!this.on || !a || this.hands?.job) return false;
    a.act(this.state, now);
    return true;
  }
}

// ---------- Руки ----------
// Кисть в мире: R — к указательному (у кисти, держащей стакан, — вверх), F — к пальцам, N — ладонь, P — середина ладони.
function handFrame(rig, s = 'Left') {
  const H = rig.hand[s], q = rig.b[s + 'Hand'].getWorldQuaternion(new THREE.Quaternion());
  return { R: H.r.clone().applyQuaternion(q), F: H.f.clone().applyQuaternion(q), N: H.n.clone().applyQuaternion(q), P: rig.palm(s), len: H.len };
}
// Место предмета в кисти: ось предмета (y) — вдоль R, точка хвата g (в осях предмета) — в ладони на d от неё,
// сторона хвата (+x предмета, у чашки — ручка) — к ладони.
function itemFromHand(h, grip, out = new THREE.Matrix4()) {
  const X = h.N.clone().negate(), Y = h.R, Z = new THREE.Vector3().crossVectors(X, Y);
  const o = h.P.clone().addScaledVector(h.N, grip.d).addScaledVector(X, -grip.g.x).addScaledVector(Y, -grip.g.y).addScaledVector(Z, -grip.g.z);
  return out.makeBasis(X, Y, Z).setPosition(o);
}
// Обратно: куда поставить запястье, чтобы предмет встал в мире так (O — низ предмета, Y — его ось, X — сторона к ладони).
function wristFor(grip, O, Y, X, len) {
  const N = X.clone().negate(), Z = new THREE.Vector3().crossVectors(X, Y), F = new THREE.Vector3().crossVectors(Y, N); // у левой кисти f = r × n
  const P = O.clone().addScaledVector(X, grip.g.x + grip.d).addScaledVector(Y, grip.g.y).addScaledVector(Z, grip.g.z);
  return P.addScaledVector(F, -len * 0.62).addScaledVector(N, -0.028);
}

export class Hands {
  // lev — Лёва, club — прогулка (пути и сиденья), root — куда класть предметы (группа террасы в мире).
  constructor({ lev, club, root }) {
    Object.assign(this, { lev, club, root });
    this.held = null; this.chair = null; this.job = null; this.dt = 1 / 60;
    this.goal = null; // { O, Y, X, w, item } — кисть тянется туда, где предмет встанет (O, Y, X), с весом w
    this.tilt = 0; this.nod = 0; this.chairW = 0; this.blend = null; // blend — предмет переезжает в кисть или из неё
    lev.hands = this;
  }
  get busy() { return !!this.job; }

  // Своё действие предмета в руке (без цели перед Лёвой): выпить или поставить стул.
  use(st) {
    if (st.chair) return { label: 'поставить стул', act: () => this.start(this.putChair()) };
    const h = st.held;
    if (h && h.kind !== 'carafe' && !h.empty) return { label: 'выпить', act: () => this.start(this.drink()) };
    return null;
  }
  start(gen) { if (!this.job) { this.job = gen; this.job.next(); } }
  update(dt) {
    this.dt = dt;
    if (this.job && this.job.next().done) this.job = null;
    if (this.held) this.held.tilt = this.tilt / deg(60); // наклонённая к губам чашка не парит
  }

  // ---------- Шаги действий (генераторы: yield — подождать кадр) ----------
  *tween(sec, fn) { for (let t = 0; t < sec; t += this.dt) { fn(ease(t / sec)); yield; } fn(1); }
  // Подойти к точке to (клуб ведёт по пути) и развернуться к точке at.
  *approach(to, at) {
    if (to && flat(to).distanceTo(flat(this.lev.pos)) > 0.15) {
      this.club.goTo(to);
      // Упёрся (стол, стул) и стоит ~0,4 с рядом с точкой — дальше не пробиться, делаем отсюда.
      for (let t = 0, still = 0; this.club.path && t < 6; t += this.dt) {
        still = this.lev.vel.length() < 0.08 ? still + this.dt : 0;
        if (still > 0.4 && flat(to).distanceTo(flat(this.lev.pos)) < 0.45) break;
        yield;
      }
      this.club.path = null;
    }
    if (at) yield* this.face(Math.atan2(at.x - this.lev.pos.x, at.z - this.lev.pos.z));
  }
  *face(yaw) { // корпус к yaw: тело само поворачивает ступни (footwork), мы ведём разворот плавно
    const L = this.lev;
    for (let t = 0; t < 1.2; t += this.dt) {
      const d = wrap(yaw - L.netYaw - L.bodyTurn);
      if (Math.abs(d) < 0.04) break;
      L.bodyTurn += clamp(d, -4.5 * this.dt, 4.5 * this.dt);
      yield;
    }
  }
  // Где встать, чтобы взять с места p левой рукой: на 0,52 м от него со стороны Лёвы, чуть правее — предмет слева впереди.
  standFor(p) {
    const L = this.lev, d = flat(L.pos).sub(flat(p)); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
    const left = V(d.z, 0, -d.x); // слева от взгляда на предмет
    return flat(p).addScaledVector(d, 0.5).addScaledVector(left, 0.16).setY(L.pos.y);
  }
  side(p) { const L = this.lev, d = flat(p).sub(flat(L.pos)).normalize(); return V(d.z, 0, -d.x); } // «влево» от взгляда на p

  // Взять сосуд с места на поверхности.
  *take(v) {
    const L = this.lev, spot = v.spot;
    if (!L.seat) yield* this.approach(this.standFor(v.obj.position), v.obj.position);
    const O = v.obj.getWorldPosition(new THREE.Vector3()), X = this.side(O);
    this.goal = { O, Y: UP.clone(), X, w: 0, item: v };
    yield* this.tween(0.4, (u) => { this.goal.w = u; });
    if (spot) { spot.item = null; v.spot = null; }
    this.held = v; this.blendFrom(v);
    v.home ??= spot; this.lev.wrap.parent.attach(v.obj); // предмет в мире, место ему задаёт кисть
    yield* this.tween(0.45, (u) => { this.goal.w = 1 - u; });
    this.goal = null;
  }
  // Поставить на свободное место поверхности.
  *put(spot) {
    const L = this.lev, v = this.held, at = spot.pos.clone().setY(spot.pos.y + (spot.saucer ? 0.0095 : 0));
    if (!L.seat) yield* this.approach(this.standFor(at), at);
    const X = this.side(at);
    this.goal = { O: at, Y: UP.clone(), X, w: 0, item: v };
    yield* this.tween(0.45, (u) => { this.goal.w = u; });
    this.held = null; this.blend = null;
    v.obj.matrix.copy(new THREE.Matrix4().makeBasis(X, UP, new THREE.Vector3().crossVectors(X, UP)).setPosition(at)); v.obj.matrix.decompose(v.obj.position, v.obj.quaternion, v.obj.scale);
    this.root.attach(v.obj); spot.item = v; v.spot = spot; v.tilt = 0;
    yield* this.tween(0.4, (u) => { this.goal.w = 1 - u; });
    this.goal = null;
  }
  // Отпить: кисть к губам (0,5 с), глоток с наклоном головы (1,1 с), вниз (0,5 с).
  *drink() {
    const v = this.held, f0 = v.fill, sip = Math.min(v.k.sip, f0);
    this.goal = { drink: true, w: 0, item: v };
    yield* this.tween(0.55, (u) => { this.goal.w = u; this.tilt = deg(28) * u; });
    yield* this.tween(1.1, (u) => { this.tilt = deg(28 + 30 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.9); this.nod = -16 * Math.sin(Math.PI * u); v.setFill(f0 - sip * u); });
    yield* this.tween(0.5, (u) => { this.goal.w = 1 - u; this.tilt = deg(28) * (1 - u); });
    this.goal = null; this.tilt = 0; this.nod = 0;
  }
  // Налить из графина в стакан: графин над стаканом, наклон до 70°, струя, стакан наполняется.
  *pour(glass) {
    const c = this.held, L = this.lev, G = glass.obj.getWorldPosition(new THREE.Vector3());
    if (!L.seat) yield* this.approach(this.standFor(G), G);
    const X = this.side(G), stream = this.stream ??= new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0032, 1, 8).translate(0, -0.5, 0), new THREE.MeshPhysicalMaterial({ color: '#e8f6fb', roughness: 0.02, transparent: true, opacity: 0.75, envMapIntensity: 2.5 }));
    this.goal = { pour: G, X, w: 0, item: c };
    yield* this.tween(0.5, (u) => { this.goal.w = u; });
    this.lev.wrap.parent.add(stream);
    const c0 = c.fill, g0 = glass.fill, amount = Math.min(c0, (0.85 - g0) / 3.2);
    yield* this.tween(1.6, (u) => {
      this.tilt = deg(70) * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.7;
      const flow = smooth(this.tilt, deg(42), deg(52)) * (amount > 0 ? 1 : 0), k = clamp((u - 0.18) / 0.64, 0, 1);
      c.setFill(c0 - amount * k); glass.setFill(g0 + amount * 3.2 * k);
      stream.visible = flow > 0.5 && k > 0 && k < 1;
      if (stream.visible) { // струя от носика вниз до воды в стакане
        c.obj.updateMatrixWorld(); const top = c.obj.localToWorld(V(0, c.k.top, 0)), ax = V(0, 1, 0).transformDirection(c.obj.matrixWorld), down = V(0, -1, 0).addScaledVector(ax, ax.y).normalize(); // носик — самая низкая точка горлышка
        const spout = top.addScaledVector(down, 0.026), to = G.clone().setY(G.y + glass.k.lo + (glass.k.hi - glass.k.lo) * glass.fill);
        stream.position.copy(spout); stream.scale.set(1, Math.max(0.01, spout.y - to.y), 1); stream.rotation.set(0, 0, 0);
      }
    });
    stream.removeFromParent();
    yield* this.tween(0.45, (u) => { this.goal.w = 1 - u; });
    this.goal = null; this.tilt = 0;
  }
  // Стул: встать за спинку лицом как стул, взять двумя руками за верх задних ножек, приподнять на 12 см.
  *takeChair(ch) {
    const L = this.lev, o = ch.obj, yaw = yawOf(o), f = V(Math.sin(yaw), 0, Math.cos(yaw));
    yield* this.approach(o.position.clone().addScaledVector(f, -0.66), null);
    yield* this.face(yaw);
    this.chair = ch; this.chairFrom = o.matrixWorld.clone(); this.lev.wrap.parent.attach(o);
    ch.carried = true;
    yield* this.tween(0.45, (u) => { this.chairW = u; });
  }
  // Поставить стул: опустить перед собой; если там стойка, стол или забор — чуть в сторону, чтобы не встал в них.
  *putChair() {
    const ch = this.chair, o = ch.obj, L = this.lev, yaw = L.netYaw + L.bodyTurn;
    const at = o.position.clone(); this.club.clear?.(at, 0.24);
    this.chairAt = at;
    yield* this.tween(0.4, (u) => { this.chairW = 1 - u; this.chairDrop = u; });
    o.position.set(at.x, L.ground?.(at.x, at.z) ?? 0, at.z); o.rotation.set(0, yaw, 0);
    this.root.attach(o); o.rotation.set(0, yaw, 0); ch.carried = false; this.chair = null; this.chairW = 0; this.chairDrop = 0; this.chairAt = null;
  }

  // Сразу всё на место (Лёва уходит на корт): стакан — на своё место или свободное на той же поверхности, стул — на пол.
  reset() {
    this.job = null; this.goal = null; this.tilt = 0; this.nod = 0; this.blend = null; this.stream?.removeFromParent();
    const v = this.held;
    if (v) {
      const spot = v.home && !v.home.item ? v.home : v.home && this.surfaces?.find((s) => s.spots.includes(v.home))?.spots.find((sp) => !sp.item);
      if (spot) { v.obj.position.copy(spot.pos); if (spot.saucer) v.obj.position.y += 0.0095; v.obj.quaternion.identity(); this.root.attach(v.obj); spot.item = v; v.spot = spot; }
      v.tilt = 0; this.held = null;
    }
    if (this.chair) { const o = this.chair.obj, y = yawOf(o); o.position.y = this.lev.ground?.(o.position.x, o.position.z) ?? 0; this.root.attach(o); o.rotation.set(0, y, 0); this.chair.carried = false; this.chair = null; this.chairW = this.chairDrop = 0; }
  }

  // ---------- Поза (крючок до rig.pose) ----------
  pose(K) {
    const L = this.lev, seated = !!L.seat, jog = smooth(L.vel.length(), 2, 3.2);
    K = { ...K };
    if (L.free && !seated && !this.chair) { // ракетка на ходу — у правой ноги (см. RK_WALK)
      const k = 1 - jog;
      K.rFo = K.rFo.clone().lerp(RK_WALK.rFo, k).normalize(); K.rk = K.rk.clone().lerp(RK_WALK.rk, k).normalize(); K.face = K.face.clone().lerp(RK_WALK.face, k).normalize();
    }
    if (this.held || this.goal) {
      const c = seated ? SIT_CARRY : CARRY, w = this.held ? 1 : this.goal?.w ?? 0;
      K.lUp = K.lUp.clone().lerp(c.lUp, w).normalize(); K.lFo = K.lFo.clone().lerp(c.lFo, w).normalize();
      if (this.goal?.drink) { const u = this.goal.w; K.lUp = K.lUp.clone().lerp(DRINK.lUp, u).normalize(); K.lFo = K.lFo.clone().lerp(DRINK.lFo, u).normalize(); }
      K.fist = Math.max(K.fist ?? 0, (this.held ?? this.goal?.item)?.grip.fist ?? 0.6);
      K.lh = -1;
    }
    if (this.nod) { K.nod = (K.nod ?? 0) + this.nod; K.look = 0; }
    if (this.chair) { const u = this.chairW; for (const k of ['rUp', 'rFo', 'lUp', 'lFo', 'rk', 'face']) K[k] = K[k].clone().lerp(CHAIR[k], u).normalize(); K.lean = lerp(K.lean, 6, u); K.fist = Math.max(K.fist ?? 0, 0.85 * u); K.lh = -1; }
    return K;
  }

  // ---------- Кисть и предмет (крючок после rig.placeRacket) ----------
  place() {
    const L = this.lev, rig = L.rig, item = this.held ?? this.goal?.item;
    if (this.chair) return this.placeChair();
    if (!item || !rig.hand.Left) return;
    const g = this.goal, w = g?.w ?? 0, yaw = L.netYaw + L.bodyTurn, fwd = V(Math.sin(yaw), 0, Math.cos(yaw)), left = V(fwd.z, 0, -fwd.x);
    let R = UP.clone();
    if (w > 0) {
      // Куда предмет: на место (взять, поставить), к губам (выпить) или носиком над стаканом (налить).
      // Сторона предмета к ладони (X) — из того, как ляжет кисть: пальцы продолжают предплечье, большой палец — по оси
      // предмета, ладонь (n = f × r у левой) смотрит на предмет. Так кисть не выворачивается, а предмет встаёт куда надо.
      let O, Y, X = g.X ?? left;
      const A = rig.dirW('LeftForeArm', 'LeftHand'), sideOf = (Yv) => { const F = A.clone().addScaledVector(Yv, -A.dot(Yv)).normalize(); return new THREE.Vector3().crossVectors(F, Yv).negate(); };
      if (g.drink) {
        // Губы — в осях головы: от сустава головы (низ черепа) вверх на 7 см к макушке и вперёд на 10 см.
        const head = rig.b.Head.getWorldPosition(new THREE.Vector3()), hu = rig.b.HeadTop_End ? rig.b.HeadTop_End.getWorldPosition(new THREE.Vector3()).sub(head).normalize() : UP.clone();
        const hf = fwd.clone().addScaledVector(hu, -fwd.dot(hu)).normalize(), mouth = head.addScaledVector(hu, 0.07).addScaledVector(hf, 0.1);
        Y = UP.clone().multiplyScalar(Math.cos(this.tilt)).addScaledVector(fwd, -Math.sin(this.tilt)); // верх чашки к лицу
        const rim = item.k.outer.at(-1)[0]; X = left.clone().addScaledVector(Y, -left.dot(Y)).normalize(); // ручка к кисти слева от губ
        O = mouth.addScaledVector(fwd, rim * 0.85).addScaledVector(Y, -item.k.top);
      } else if (g.pour) {
        const toGlass = X.clone().negate(); // графин слева от стакана, наклон к нему
        Y = UP.clone().multiplyScalar(Math.cos(this.tilt)).addScaledVector(toGlass, Math.sin(this.tilt));
        X = sideOf(Y);
        const spout = g.pour.clone().setY(g.pour.y + 0.105 + 0.09).addScaledVector(toGlass, -0.035); // носик на 9 см над краем стакана: тело графина не ложится на стойку
        O = spout.addScaledVector(Y, -item.k.top).addScaledVector(toGlass, -0.026);
      } else { O = g.O; Y = g.Y; }
      R = Y.clone();
      const wrist0 = rig.b.LeftHand.getWorldPosition(new THREE.Vector3()), M = new THREE.Matrix4(), o = new THREE.Vector3();
      let W = wristFor(item.grip, O, Y, X, rig.hand.Left.len);
      // У губ кисть ставим целиком (большой палец по оси чашки, ладонь к ней): запястье отогнуто назад, как у живых
      // с кружкой. Иначе кисть продолжает предплечье, а оно у губ идёт поперёк лица — чашка висла под ладонью.
      const H = rig.hand.Left, N = X.clone().negate(), Qd = g.drink ? new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, new THREE.Vector3().crossVectors(R, N), N).multiply(H.basisT)) : null;
      for (let it = 0; it < 3; it++) { // кинематика руки, поворот кисти, поправка на то, где предмет вышел
        rig.armTo('Left', wrist0.clone().lerp(W, w));
        rig.orientHand('Left', UP.clone().lerp(R, w).normalize(), 1, false);
        if (Qd) rig.setWorld(rig.b.LeftHand, rig.b.LeftHand.getWorldQuaternion(new THREE.Quaternion()).slerp(Qd, 0.35 * w)); // запястье отогнуто на треть пути: дальше ломается
        itemFromHand(handFrame(rig), item.grip, M); o.setFromMatrixPosition(M);
        W.add(O.clone().sub(o).multiplyScalar(0.9));
      }
    } else rig.orientHand('Left', R, 1, false);
    if (!this.held) return;
    // Предмет — в кисти; в первые 0,15 с после хвата доезжает до неё со своего места (без скачка).
    const M = itemFromHand(handFrame(rig), item.grip), o = item.obj;
    if (this.blend) {
      const b = this.blend, u = ease((performance.now() / 1000 - b.t0) / 0.15);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); M.decompose(p, q, s);
      p.lerpVectors(b.p, p, u); q.slerpQuaternions(b.q, q, u); M.compose(p, q, s.set(1, 1, 1));
      if (u >= 1) this.blend = null;
    }
    M.decompose(o.position, o.quaternion, o.scale);
  }
  blendFrom(v) { this.blend = { p: v.obj.getWorldPosition(new THREE.Vector3()), q: v.obj.getWorldQuaternion(new THREE.Quaternion()), t0: performance.now() / 1000 }; }

  // Стул в руках: перед Лёвой на 0,64 м, приподнят на 12 см, обе кисти на верхе задних ножек. Ракетка в правой
  // головкой вниз вдоль ножки (CHAIR.rk). Пока берём/ставим (chairW < 1) — стул между полом и руками.
  placeChair() {
    const L = this.lev, rig = L.rig, ch = this.chair, o = ch.obj, u = this.chairW;
    const yaw = L.netYaw + L.bodyTurn, f = V(Math.sin(yaw), 0, Math.cos(yaw));
    const ground = L.ground?.(o.position.x, o.position.z) ?? 0;
    const carry = L.pos.clone().addScaledVector(f, 0.64).setY(L.pos.y + 0.12 * (1 - (this.chairDrop ?? 0)));
    if (this.chairFrom && u < 1 && !this.chairDrop) { // поднимаем с пола: из того места, где стоял
      const p0 = new THREE.Vector3().setFromMatrixPosition(this.chairFrom);
      o.position.lerpVectors(p0, carry, u); o.position.y = lerp(p0.y, carry.y, u);
    } else { o.position.copy(carry); if (this.chairDrop) { o.position.lerp(this.chairAt ?? carry, this.chairDrop); o.position.y = lerp(L.pos.y + 0.12, ground, this.chairDrop); } }
    o.rotation.set(0, yaw, 0); o.updateMatrixWorld(true);
    // Кисти на верх задних ножек: запястье туда, где ладонь обхватит стойку снаружи, большим пальцем вверх.
    for (const [s, gi] of [['Left', 0], ['Right', 1]]) {
      const post = o.localToWorld(ch.grips[gi].clone()), out = s === 'Left' ? V(f.z, 0, -f.x) : V(-f.z, 0, f.x);
      const W = post.clone().addScaledVector(out, 0.022 + 0.028).addScaledVector(f, -rig.hand[s].len * 0.5).addScaledVector(UP, -0.02);
      const wrist0 = rig.b[s + 'Hand'].getWorldPosition(new THREE.Vector3());
      rig.armTo(s, wrist0.lerp(W, Math.min(1, u * 1.4)));
      if (s === 'Left') rig.orientHand('Left', UP.clone(), 1, false);
    }
    // Ракетка снова в правую ладонь (рука сдвинулась кинематикой): головкой вниз вдоль задней ножки снаружи,
    // между предплечьем и отвесом — запястье не ломается. Струны вбок.
    const rk = rig.racket, A = rig.dirW('RightForeArm', 'RightHand'), right = V(-f.z, 0, f.x);
    const Y = A.clone().add(V(0, -1.3, 0)).addScaledVector(right, 0.25).normalize(), Z = right.clone().addScaledVector(Y, -right.dot(Y)).normalize();
    const C = rig.orientHand('Right', Y); Y.applyQuaternion(C); Z.applyQuaternion(C);
    rk.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(Y, Z), Y, Z));
    rk.position.copy(rig.palm('Right')).addScaledVector(Y, 0.08); rk.updateMatrixWorld(true);
  }
}

// ---------- Терраса и скамейки ----------
// Сосуды берутся с поверхности и ставятся на свободное место, стулья — сесть (E) или взять (F), зонт — сложить/раскрыть.
export function registerTerrace(I, hands, club, T) {
  const word = { cup: 'кофе', wine: 'бокал', water: 'стакан', carafe: 'графин' };
  for (const v of T.vessels) {
    I.register({ get pos() { return v.obj.getWorldPosition(v._p ??= new THREE.Vector3()); }, r: 1.25, y: 0.9,
      get pri() { return hands.held?.kind === 'carafe' && v.kind === 'water' ? 1 : 0.35; }, // с графином стакан главнее места на стойке
      label: (st) => {
        if (!v.spot || st.chair) return null; // в руке или стул в руках
        if (st.held?.kind === 'carafe' && v.kind === 'water' && st.held.fill > 0.05 && v.fill < 0.8) return `налить в${NB}стакан`;
        return st.held ? null : `взять ${word[v.kind]}`;
      },
      act: (st) => hands.start(st.held ? hands.pour(v) : hands.take(v)) });
  }
  hands.surfaces = T.surfaces;
  for (const s of T.surfaces) registerSurface(I, hands, s);
  for (const ch of T.chairs) {
    const seat = () => { // сиденье стула в мире: как у скамейки (club.sit), подход сбоку — спереди стол
      const o = ch.obj, yaw = yawOf(o), f = V(Math.sin(yaw), 0, Math.cos(yaw)), r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      const at = o.localToWorld(ch.seat.clone()), side = flat(hands.lev.pos).sub(flat(at)).dot(r) >= 0 ? 1 : -1;
      return { at: at.clone().setY(0), h: at.y, yaw, f, r, approach: at.clone().addScaledVector(r, 0.6 * side).addScaledVector(f, 0.1).setY(0) };
    };
    I.register({ get pos() { return ch.obj.getWorldPosition(ch._p ??= new THREE.Vector3()); }, r: 1.2, y: 0.45,
      label: (st) => (ch.carried || st.chair || st.seated ? null : 'сесть'),
      act: () => club.sit(seat()),
      alt: { label: (st) => (ch.carried || st.chair || st.held || st.seated ? null : 'взять стул'), act: () => hands.start(hands.takeChair(ch)) } });
  }
  // Зонт — с шага от столика (ближе 1 м к стойке зонта главнее чашки и стулья): «сложить» или «раскрыть».
  for (const u of T.umbrellas) {
    const at = u.obj.getWorldPosition(new THREE.Vector3());
    I.register({ pos: at, r: 2.2, y: 1.6,
      label: (st) => (st.chair || st.seated || flat(at).distanceTo(flat(hands.lev.pos)) < 1 ? null : u.folded ? 'раскрыть зонт' : 'сложить зонт'), act: () => u.toggle() });
  }
}
// Поверхность { pos, spots: [{ pos, saucer, item }] }: «поставить» на ближайшее к Лёве свободное место.
export function registerSurface(I, hands, s) {
  const free = () => { let b = null, d = Infinity; for (const sp of s.spots) { if (sp.item) continue; const k = flat(sp.pos).distanceTo(flat(hands.lev.pos)); if (k < d) { d = k; b = sp; } } return b; };
  (hands.surfaces ??= []).includes(s) || hands.surfaces.push(s);
  return I.register({ get pos() { return free()?.pos ?? s.pos; }, r: 1.2, y: s.pos.y, pri: 0.35,
    label: (st) => (st.held && free() ? (st.held.kind === 'cup' ? 'поставить кофе' : 'поставить') : null),
    act: () => { const sp = free(); if (sp) hands.start(hands.put(sp)); } });
}
export function registerBenches(I, club) {
  for (const s of club.seats) I.register({ pos: s.at, r: 1.2, y: 0.44, label: (st) => (st.seated || st.chair ? null : 'сесть'), act: () => club.sit(s) });
}
