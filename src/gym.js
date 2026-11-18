// Зал: жим лёжа, турник, присед со штангой, скакалка. На станции мини-игра в ритм: кольцо сходится к кругу —
// жми Пробел (на телефоне — кольцо) в такт. Чётко — повтор засчитан, мимо — Лёва сбился, повтор сорван.
// Подход — 10 тактов, растут сила, скорость, выносливость (stats.train), копится усталость.
// Позы кодом через Rig (swing.js): тело ключом по направлениям сегментов, кисти ставятся на гриф двухзвенной
// кинематикой (armTo), гриф кладётся по центрам ладоней — из рук не выпадает. Ноги в приседе и на скакалке — в точки
// на полу (legs), на скамье и турнике — ключом. openGym(station) зовёт город; станции — buildStation(kind).
import * as THREE from 'three';
import { READY } from './swing.js';
import { stats, STAT_NAMES, Stats } from './stats.js';

const V = (x, y, z) => new THREE.Vector3(-x, y, z).normalize(); // x вправо, как в swing.js (у Mixamo правая в −X)
const K = (o) => ({ ...READY, lh: -1, fist: 0, ...o });
const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const REPS = 10, BAR_Y = 2.5; // турник: в висе ступни над землёй
// T — такт, с; xp — опыт за чистый повтор; tire — усталость за повтор.
export const STATIONS = {
  bench: { name: 'Жим лёжа', T: 1.7, xp: { power: 1.2 }, tire: 0.55 },
  pullup: { name: 'Турник', T: 1.8, xp: { power: 0.8, stamina: 0.4 }, tire: 0.6 },
  squat: { name: 'Присед со штангой', T: 1.8, xp: { speed: 0.7, power: 0.5 }, tire: 0.65 },
  rope: { name: 'Скакалка', T: 0.62, xp: { stamina: 0.9, speed: 0.35 }, tire: 0.35 },
};
// Временная площадка в клубе под ?debug (за спиной Лёвы, за забором): в городе станции ставит town.js.
export const DEBUG_GYM = [['bench', -3, 25.5], ['pullup', 0, 25.5], ['squat', 3, 25.5], ['rope', 6, 25.5]].map(([kind, x, z]) => ({ kind, pos: new THREE.Vector3(x, 0, z), yaw: Math.PI }));

// ---------- Снаряды кодом ----------
const metal = () => new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.85, roughness: 0.35 });
const black = () => new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 });
const frame = () => new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.55 });
const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const post = (h, m, x, z, r = 0.03) => box(r * 2, h, r * 2, m, x, h / 2, z);
// Гриф 2 м вдоль x, по блину 20 кг (Ø45 см) с каждой стороны. grip — где на грифе ладони (±).
export function barbell() {
  const g = new THREE.Group(), m = metal(), k = black();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 1.3, 12), m); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const s of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), m); sleeve.rotation.z = Math.PI / 2; sleeve.position.x = s * 0.83; g.add(sleeve);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.055, 32), k); plate.rotation.z = Math.PI / 2; plate.position.x = s * 0.73; g.add(plate);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), m); collar.rotation.z = Math.PI / 2; collar.position.x = s * 0.68; g.add(collar);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// Станция в своих осях: x вправо от Лёвы, z — куда он смотрит, начало — где он стоит или лежит (таз над началом).
export function buildStation(kind) {
  const g = new THREE.Group(), f = frame(), k = black();
  g.userData.kind = kind;
  if (kind === 'bench') {
    g.add(box(0.3, 0.08, 1.2, k, 0, 0.4, -0.15)); // подушка, верх на 0,44
    g.add(box(0.06, 0.36, 0.06, f, 0, 0.18, -0.6), box(0.06, 0.36, 0.06, f, 0, 0.18, 0.3), box(0.36, 0.04, 0.06, f, 0, 0.02, -0.6), box(0.36, 0.04, 0.06, f, 0, 0.02, 0.3));
    for (const s of [-1, 1]) g.add(post(1.18, f, s * 0.58, -0.47), box(0.05, 0.05, 0.1, f, s * 0.58, 1.1, -0.42)); // стойки с крюками над плечами
    g.userData.rack = new THREE.Vector3(0, 1.15, -0.42);
  } else if (kind === 'pullup') {
    for (const s of [-1, 1]) g.add(post(2.6, f, s * 0.7, 0.05, 0.035), box(0.08, 0.04, 0.5, f, s * 0.7, 0.02, 0.05));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.46, 12), metal()); bar.rotation.z = Math.PI / 2; bar.position.set(0, BAR_Y, 0.05); g.add(bar);
  } else if (kind === 'squat') {
    // Стойки за спиной: со штангой Лёва выходит на шаг вперёд, гриф между стойками не проходит.
    for (const s of [-1, 1]) g.add(post(2.1, f, s * 0.62, -0.55, 0.035), box(0.05, 0.05, 0.12, f, s * 0.62, 1.42, -0.5), box(0.08, 0.04, 0.6, f, s * 0.62, 0.02, -0.55));
    g.add(box(1.32, 0.05, 0.05, f, 0, 2.08, -0.55));
    g.userData.rack = new THREE.Vector3(0, 1.47, -0.5);
  } else if (kind === 'rope') {
    g.add(box(1.3, 0.012, 1.3, new THREE.MeshStandardMaterial({ color: '#33373c', roughness: 0.95 }), 0, 0.006, 0)); // резиновый коврик
  }
  if (g.userData.rack) { const b = barbell(); b.position.copy(g.userData.rack); g.add(b); g.userData.bar = b; }
  if (kind === 'rope') { // скакалка лежит на коврике: две ручки и петля
    const idle = new THREE.Group(), rope = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.005, 6, 48), k); rope.rotation.x = Math.PI / 2; rope.position.set(0, 0.016, 0.1); idle.add(rope);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10), k); h.rotation.x = Math.PI / 2; h.position.set(s * 0.32, 0.026, 0.4); idle.add(h); }
    g.add(idle); g.userData.idle = idle; // в руках у Лёвы своя, эту прячем
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- Мини-игра в ритм ----------
let C = null, S = null; // C — контекст профиля, S — открытая станция
const $ = (id) => document.getElementById(id);
export const gymOpen = () => !!S;

export function initGym(ctx) {
  C = ctx;
  document.body.insertAdjacentHTML('beforeend', `<div id="gym" hidden>
    <div class="top"><button type="button" id="gymExit">Закончить</button><b id="gymH"></b></div>
    <div class="bottom"><button type="button" class="beat" id="gymBeat" aria-label="В такт"><i></i><em></em></button>
      <p class="cnt" id="gymCnt"></p><p class="tip" id="gymTip"></p>
      <div class="done" id="gymDone" hidden><button type="button" class="go" id="gymMore">Ещё подход</button></div></div></div>`);
  $('gymExit').addEventListener('click', closeGym);
  $('gymBeat').addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  $('gymMore').addEventListener('click', () => startSet());
  ctx.gymView = view;
  // Станции для ?debug — во временном углу клуба.
  if (new URLSearchParams(location.search).has('debug')) { for (const s of DEBUG_GYM) place(s, ctx.scene); window.__gymS = () => S; window.__gymT = () => S?.t ?? 0; }
}
// Поставить станцию в сцену (город зовёт так же или ставит buildStation сам и передаёт { kind, pos, yaw, group }).
// pos — Vector3, {x, z} или [x, z]; yaw — куда смотрит Лёва на станции (как netYaw), по умолчанию к +z.
export function place(s, scene) {
  const p = s.pos; if (!p?.isVector3) s.pos = Array.isArray(p) ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p?.x ?? 0, 0, p?.z ?? 0);
  s.yaw ??= 0;
  s.group ??= buildStation(s.kind);
  s.group.position.copy(s.pos); s.group.rotation.y = s.yaw;
  if (!s.group.parent) scene.add(s.group);
  return s;
}

// Открыть станцию: Лёва встаёт на неё (только на прогулке — в матче он на корте), ракетку кладёт.
export function openGym(station) {
  if (!C || S || !C.lev.free || C.lev.seat) return false;
  place(station, C.scene); // позиция в Vector3, снаряд в сцене
  const L = C.lev, st = STATIONS[station.kind];
  S = { station, st, kind: station.kind, t: 0, judged: [], stand: L.pos.clone() };
  // Где Лёва стоит после подхода: у скамьи сбоку, у остальных — на месте упражнения.
  const loc = (x, z) => new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), station.yaw).add(station.pos);
  L.pos.copy(station.kind === 'bench' ? loc(-0.75, 0.1) : loc(0, station.kind === 'pullup' ? -0.6 : 0.35)); L.vel.set(0, 0, 0);
  L.bodyTurn = Math.atan2(Math.sin(station.yaw - L.netYaw), Math.cos(station.yaw - L.netYaw)); L.turnVel = 0;
  L.racket.visible = false;
  if (station.group.userData.idle) station.group.userData.idle.visible = false;
  $('gymH').textContent = st.name; $('gym').hidden = false; S.last = null;
  startSet();
  return true;
}
export function closeGym() {
  if (!S) return;
  const L = C.lev, bar = S.station.group.userData.bar;
  if (bar) { bar.position.copy(S.station.group.userData.rack); bar.quaternion.identity(); }
  S.rope?.removeFromParent(); S.handles?.forEach((h) => h.removeFromParent());
  if (S.station.group.userData.idle) S.station.group.userData.idle.visible = true;
  L.racket.visible = true; L.wrap.rotation.set(0, L.netYaw + L.bodyTurn, 0); L.wrap.position.copy(L.pos);
  S = null; $('gym').hidden = true;
}
function startSet() {
  if (stats.fatigue >= 92) { $('gymTip').textContent = 'Нет сил: отдохни сидя или выпей кофе'; return; }
  Object.assign(S, { t: 0, judged: [], lead: 1.4, done: false, combo: 0 });
  $('gymDone').hidden = true; $('gymBeat').hidden = false;
  $('gymTip').textContent = matchMedia('(pointer: coarse)').matches ? 'Жми на кольцо, когда оно сойдётся с кругом' : 'Пробел, когда кольцо сойдётся с кругом';
  counter();
}
const beatAt = (k) => S.lead + k * S.st.T;
function counter() { const n = S.judged.filter((j) => j !== 'miss').length; $('gymCnt').textContent = `${Math.min(S.judged.length, REPS)} из ${REPS}${S.judged.length ? ` · чисто ${n}` : ''}`; }
function flash(cls) { const b = $('gymBeat'); b.classList.remove('good', 'miss'); void b.offsetWidth; b.classList.add(cls); clearTimeout(S.ft); S.ft = setTimeout(() => b.classList.remove(cls), 220); }
// Нажатие: к ближайшему ещё не оценённому такту. Ближе 0,12 с — чётко, 0,24 — засчитан, дальше — сбился.
// Уставший попадает хуже: окно уже до трети.
function press() {
  if (!S || S.done) return;
  const k = S.judged.length;
  if (k >= REPS) return;
  const d = Math.abs(S.t - beatAt(k)), w = 1 - 0.3 * stats.tired;
  if (d > S.st.T * 0.5) return; // совсем мимо такта — не считаем
  const r = d <= 0.12 * w ? 'good' : d <= 0.24 * w ? 'ok' : 'miss';
  judge(r);
}
function judge(r) {
  S.judged.push(r); S.combo = r === 'miss' ? 0 : S.combo + 1;
  flash(r === 'miss' ? 'miss' : 'good'); counter();
}
export function gymKey(e) {
  if (e.code === 'Escape') { closeGym(); return true; }
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { if (S.done && e.code === 'Enter') startSet(); else press(); }
  return true; // остальные клавиши в зале не двигают Лёву
}
function finishSet() {
  S.done = true;
  const st = S.st, clean = S.judged.filter((j) => j === 'good').length, ok = S.judged.filter((j) => j === 'ok').length, miss = REPS - clean - ok;
  const gains = Object.entries(st.xp).map(([k, xp]) => [k, stats.train(k, xp * (clean + 0.6 * ok), true)]);
  stats.tire(st.tire * REPS + 0.3 * miss); stats.cheer(clean >= 8 ? 0.05 : 0.02); stats.emit('gym');
  const main = gains[0];
  $('gymCnt').textContent = `Чисто ${clean} из ${REPS} · ${STAT_NAMES[main[0]]} ${Stats.fmt(stats.lvl[main[0]])}`;
  $('gymTip').textContent = gains.filter(([, d]) => d > 0.004).map(([k, d]) => `${STAT_NAMES[k]} +${d.toFixed(2).replace('.', ',')}`).join(', ') || 'Без пользы: усталость съела подход';
  $('gymBeat').hidden = true; $('gymDone').hidden = false;
}

// ---------- Шаг: время, такты, поза ----------
// Зовётся после шага прогулки: club.update уже поставил позу ходьбы, здесь мы её заменяем позой упражнения.
export function gymTick(dt) {
  if (!S) return;
  S.t += dt;
  if (!S.done) {
    const k = S.judged.length;
    if (k < REPS && S.t > beatAt(k) + 0.26) judge('miss'); // не нажал — сбился
    if (S.t > beatAt(REPS) + 0.2) finishSet();
  }
  // Повтор k идёт от такта k до k+1: доля u и как он оценён (пока не оценён — как чистый).
  const k = Math.floor((S.t - S.lead) / S.st.T), u = (S.t - S.lead) / S.st.T - k;
  const r = S.t < S.lead || k >= REPS ? 'rest' : S.judged[k] ?? 'good';
  // h — высота движения 0..1: штанга вверх, подтянулся, встал, прыжок. Жим и присед: такт — нижняя точка (вниз в конце
  // прошлого повтора), турник и скакалка: такт — начало рывка вверх. Сбился — до трети и обратно.
  const T = S.st.T, top = S.kind === 'bench' || S.kind === 'squat', missLast = S.judged[REPS - 1] === 'miss';
  let h;
  if (S.kind === 'rope') h = r === 'good' || r === 'ok' ? Math.max(0, Math.sin(Math.PI * Math.min(1, u / 0.36))) : 0;
  else if (r === 'rest') h = !top ? 0 : S.t < S.lead ? 1 - smooth(S.t, S.lead - 0.45 * T, S.lead) : missLast ? smooth(S.t, beatAt(REPS), beatAt(REPS) + 0.6) : 1;
  else if (r === 'miss') h = 0.32 * Math.sin(Math.PI * u);
  else h = smooth(u, 0, 0.42) - (top && k === REPS - 1 ? 0 : smooth(u, 0.6, 1));
  S.h = h; S.u = u; S.r = r;
  POSE[S.kind](C.lev, S, dt);
}

// ---------- Позы ----------
const UP = new THREE.Vector3(0, 1, 0);
const w = (L, n) => L.rig.b[n].getWorldPosition(new THREE.Vector3());
const local = (st, x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(UP, st.yaw).add(st.pos);
// Ладони на точки грифа: запястье туда, где ладонь ляжет на гриф, кисть по грифу (R — к другой руке), пальцы в кулак.
function grab(L, s, G, R) {
  const rig = L.rig;
  for (let i = 0; i < 2; i++) {
    const wr = w(L, s + 'Hand'), W = G.clone().sub(rig.palm(s).sub(wr));
    rig.armTo(s, W);
    rig.orientHand(s, R, 1, true);
  }
}
// Таз (или плечи) в нужную точку: поза от корня не зависит от его положения — двигаем корень на ошибку.
function shift(L, bone, want) {
  const err = want.clone().sub(bone);
  L.wrap.position.add(err); L.wrap.updateMatrixWorld(true);
}
const mid = (L, a, b) => w(L, a).add(w(L, b)).multiplyScalar(0.5);
function placeBar(L, bar, group) {
  const pr = L.rig.palm('Right'), pl = L.rig.palm('Left'), c = pr.clone().add(pl).multiplyScalar(0.5), ax = pl.sub(pr).normalize();
  group.updateMatrixWorld(true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ax); // гриф вдоль x
  bar.position.copy(group.worldToLocal(c)); bar.quaternion.copy(group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
}
const finish = (L) => { L.rig.grip('Right', 1); L.rig.grip('Left', 1); };

const POSE = {
  // Лёжа на спине, голова к стойкам: тело повёрнуто так, что «вверх» тела — вдоль скамьи, грудь — к небу.
  bench(L, S) {
    const st = S.station, g = st.group, yawQ = new THREE.Quaternion().setFromAxisAngle(UP, st.yaw);
    L.wrap.quaternion.copy(yawQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    L.wrap.updateMatrixWorld(true);
    const key = K({ lean: -6, look: 0, nod: 10, // голова на скамье, взгляд на гриф
      rUp: V(0.8, -0.35, -0.42), rFo: V(0.05, 0.1, 1), lUp: V(-0.8, -0.35, -0.42), lFo: V(-0.05, 0.1, 1), // локти под 60° к корпусу, не в стороны
      rTh: V(0.36, -0.93, -0.06), rSh: V(0.06, -0.12, -1), lTh: V(-0.36, -0.93, -0.06), lSh: V(-0.06, -0.12, -1) });
    L.rig.pose(key, key, 0, null);
    // Ступни на пол: подошва вниз (к −z тела), носки к ногам скамьи.
    for (const f of ['LeftFoot', 'RightFoot']) L.rig.rotate(f, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 * 0.85));
    shift(L, mid(L, 'LeftArm', 'RightArm'), local(st, 0, 0.555, -0.42));
    const h = S.h, y = lerp(0.7, 1.12, h), z = lerp(-0.3, -0.42, h);
    const c = local(st, 0, y, z), ax = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, st.yaw); // от правой руки к левой (+x станции)
    grab(L, 'Right', c.clone().addScaledVector(ax, -0.41), ax);
    grab(L, 'Left', c.clone().addScaledVector(ax, 0.41), ax.clone().negate());
    finish(L); placeBar(L, g.userData.bar, g);
  },
  // Вис на турнике: гриф шире плеч, плечи от 0,6 м под грифом (руки почти прямые) до 0,14 (подбородок над грифом).
  pullup(L, S) {
    const st = S.station, h = S.h;
    L.wrap.quaternion.setFromAxisAngle(UP, st.yaw); L.wrap.updateMatrixWorld(true);
    const key = K({ lean: -4 - 4 * h, nod: -10 + 12 * h, rUp: V(0.5, 0.85, 0.12), rFo: V(-0.25, 0.95, 0.1), lUp: V(-0.5, 0.85, 0.12), lFo: V(0.25, 0.95, 0.1),
      rTh: V(0.06, -1, 0.14 + 0.1 * h), rSh: V(0.02, -1, -0.28), lTh: V(-0.06, -1, 0.14 + 0.1 * h), lSh: V(-0.02, -1, -0.28) });
    L.rig.pose(key, key, 0, null);
    shift(L, mid(L, 'LeftArm', 'RightArm'), local(st, 0, BAR_Y - lerp(0.6, 0.15, h), -0.02 - 0.05 * h));
    const ax = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, st.yaw), c = local(st, 0, BAR_Y, 0.05);
    grab(L, 'Right', c.clone().addScaledVector(ax, -0.42), ax);
    grab(L, 'Left', c.clone().addScaledVector(ax, 0.42), ax.clone().negate());
    finish(L);
  },
  // Присед: ступни шире плеч носками врозь, таз вниз и назад, корпус наклоняется; гриф на трапециях за шеей.
  squat(L, S) {
    const st = S.station, d = 1 - S.h; // d — глубина 0..1
    L.wrap.quaternion.setFromAxisAngle(UP, st.yaw);
    L.wrap.position.copy(local(st, 0, 0, -0.13 * d)); L.wrap.updateMatrixWorld(true);
    const feet = { Left: { pos: local(st, 0.25, 0, 0.02), yaw: 0.35, lift: 0 }, Right: { pos: local(st, -0.25, 0, 0.02), yaw: -0.35, lift: 0 }, crouch: 0.07 + 0.4 * d };
    const key = K({ lean: 8 + 30 * d, nod: -6 - 14 * d, rUp: V(0.75, -0.4, -0.5), rFo: V(0.2, 0.85, -0.3), lUp: V(-0.75, -0.4, -0.5), lFo: V(-0.2, 0.85, -0.3) });
    L.rig.pose(key, key, 0, feet);
    const up = w(L, 'Neck').sub(w(L, 'Spine1')).normalize(), lat = w(L, 'LeftArm').sub(w(L, 'RightArm')).normalize();
    const back = new THREE.Vector3().crossVectors(up, lat).normalize();
    const c = mid(L, 'LeftArm', 'RightArm').addScaledVector(back, 0.085).addScaledVector(up, 0.045);
    grab(L, 'Right', c.clone().addScaledVector(lat, -0.42), lat);
    grab(L, 'Left', c.clone().addScaledVector(lat, 0.42), lat.clone().negate());
    finish(L); placeBar(L, st.group.userData.bar, st.group);
  },
  // Скакалка: ноги вместе, прыжок на 6 см, локти у корпуса, кисти крутят у бёдер; верёвка — петля вокруг тела.
  rope(L, S) {
    const st = S.station, j = 0.06 * S.h, land = S.r === 'rest' ? 0 : Math.max(0, Math.sin(Math.PI * clamp((S.u - 0.36) / 0.2, 0, 1)));
    L.wrap.quaternion.setFromAxisAngle(UP, st.yaw);
    L.wrap.position.copy(local(st, 0, j, 0)); L.wrap.updateMatrixWorld(true);
    const feet = { Left: { pos: local(st, 0.11, 0, 0), yaw: 0.1, lift: j }, Right: { pos: local(st, -0.11, 0, 0), yaw: -0.1, lift: j }, crouch: 0.08 + 0.04 * land };
    const key = K({ lean: 4, nod: 4, rUp: V(0.25, -0.95, 0.05), rFo: V(0.55, -0.35, 0.75), lUp: V(-0.25, -0.95, 0.05), lFo: V(-0.55, -0.35, 0.75) });
    L.rig.pose(key, key, 0, feet);
    // Угол верёвки: под ногами в середине прыжка; сбился — верёвка встала у ног.
    const th = S.r === 'miss' ? Math.PI : S.r === 'rest' ? Math.PI * 0.5 : Math.PI + 2 * Math.PI * (S.u - 0.18);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, st.yaw), ax = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, st.yaw);
    const circ = (s) => local(st, s * 0.3, 0.92 + j, 0.14).addScaledVector(UP, 0.03 * Math.cos(th)).addScaledVector(fwd, 0.03 * Math.sin(th));
    grab(L, 'Right', circ(-1), UP.clone().addScaledVector(ax, -0.3).normalize());
    grab(L, 'Left', circ(1), UP.clone().addScaledVector(ax, 0.3).normalize());
    finish(L);
    // Ручки в ладонях и верёвка от верхних концов ручек.
    if (!S.handles) {
      const m = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.7 });
      S.handles = [0, 1].map(() => { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10), m); o.castShadow = true; C.scene.add(o); return o; });
      S.rope = new THREE.Mesh(new THREE.BufferGeometry(), m); S.rope.castShadow = true; S.rope.frustumCulled = false; C.scene.add(S.rope);
    }
    const ends = ['Right', 'Left'].map((s, i) => {
      const p = L.rig.palm(s), dir = UP.clone().addScaledVector(ax, i ? 0.3 : -0.3).normalize();
      S.handles[i].position.copy(p); S.handles[i].quaternion.setFromUnitVectors(UP, dir);
      return p.addScaledVector(dir, 0.075);
    });
    const dirTh = UP.clone().multiplyScalar(Math.cos(th)).addScaledVector(fwd, Math.sin(th));
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const s = i / 40, p = ends[0].clone().lerp(ends[1], s).addScaledVector(dirTh, 1.02 * Math.pow(Math.sin(Math.PI * s), 0.6));
      p.y = Math.max(0.012, p.y); pts.push(p);
    }
    S.rope.geometry.dispose(); S.rope.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.005, 5);
  },
};

// ---------- Камера и кольцо такта ----------
const eye = new THREE.Vector3(), look = new THREE.Vector3(), at = new THREE.Vector3();
// Вид на станцию сбоку-спереди: скамья — сбоку, турник и присед — спереди-сбоку, скакалка — спереди.
const CAM = { bench: [2.3, 1.35, 0.6, 0.75], pullup: [2.6, 1.8, 2.6, 1.7], squat: [2.4, 1.3, 2.4, 0.95], rope: [1.2, 1.3, 3.2, 0.95] };
function view(dt, camera) {
  const s = S.station, [x, y, z, ly] = CAM[s.kind], phone = innerWidth / innerHeight < 0.8, k = phone ? 1.35 : 1;
  eye.copy(local(s, x * k, y, z * k)); at.copy(local(s, 0, ly, s.kind === 'bench' ? -0.1 : 0));
  const a = !S.last || !dt ? 1 : 1 - Math.exp(-dt * 4);
  if (!S.last) { S.last = true; camera.position.copy(eye); look.copy(at); }
  camera.position.lerp(eye, a); look.lerp(at, a); camera.lookAt(look);
  // Кольцо сходится к кругу к такту.
  const n = S.judged.length, left = n < REPS && !S.done ? beatAt(n) - S.t : 0;
  $('gymBeat').querySelector('em').style.transform = `scale(${1 + clamp(left / S.st.T, 0, 1) * 1.1})`;
  $('gymBeat').querySelector('em').style.opacity = left > 0 && left < S.st.T * 1.05 ? 1 : 0.15;
}
