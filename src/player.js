// Теннисист на корте. Перемещение — как у настоящих игроков: всегда лицом к сетке, коротко — приставным шагом,
// далеко — рывок с разворотом таза (ноги сами переходят в бег), сплит-степ к удару соперника,
// на большой скорости торможение скольжением по грунту. Ступни ставятся в точки на корте и не проскальзывают.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Rig, STROKES, READY, PREP, AFTER, strokeAt, mix, turnArms, WALK, SIT } from './swing.js';
import { buildRacket } from './racket.js';
import { step, copyBall, inSingles } from './physics.js';
import { COURT } from './court.js';
import { useDQS } from './dqs.js';

// Скорости и ускорения (м/с, м/с²). Короткие рывки по 3–4 м — основа тенниса, до полной скорости разгоняются редко.
// plant — за сколько секунд до удара ноги встают: дальше WASD только целит, тело тормозит.
export const MOVE = { shuffle: 3.4, sprint: 6.0, accel: 17, boost: 26, brake: 32, slide: 12, slideFrom: 4.8, plant: 0.22 }; // boost — после сплит-степа и на развороте
// Сила удара — сколько держишь клавишу удара (или тач-кнопку): до 0,15 с — обычный, к 0,7 с — полный (+20% скорости).
// Пороги — три стрелки шкалы у ног: 0,15 / 0,4 / 0,7 с. Держишь до касания — считается до касания.
export const POWER = [0.15, 0.4, 0.7];
export const holdOf = (st, t) => (st && st.holdTo !== undefined ? Math.max(0, Math.min(st.holdTo ?? t, st.tContact) - st.tPress) : 0);
export const powerOf = (st, t) => (st?.drop ? 0 : Math.min(1, Math.max(0, (holdOf(st, t) - POWER[0]) / (POWER[2] - POWER[0]))));
export const HIT_R = 0.3; // ракетка достаёт мяч, если тот прошёл ближе 30 см от центра струн (голова ракетки 33 см)
const MAX_TURN = THREE.MathUtils.degToRad(62); // на сколько рука может довернуться в плече к мячу от своей позы удара
const SIT_HIP = 0.1; // таз (кость Hips) над сиденьем, м (club.js)
const STANCE = 0.24; // полширины стойки, м: на видео Лёва стоит широко, ступни в ~2,6 ширины таза (было 0,2 — ~2,1)
// Центр струн при ударе (м вбок, вперёд, высота): у каждого игрока свой — руки и рост разные; уточняет measure().
const REACH0 = { LATERAL: { fh: 0.92, bh: -0.56, oh: 0.38 }, AHEAD: 0.2, AHEAD_V: 0.9, Y: { fh: 1.1, bh: 1.0, oh: 2.5 } };
const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp, deg = THREE.MathUtils.degToRad;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);
// Язык тела между очками — поверх стойки (в осях скелета, x вправо). lh < 0 — левая отпускает ракетку.
const V = (x, y, z) => new THREE.Vector3(-x, y, z).normalize();
const FIST = { lh: -1, fist: 1, lean: 6, lUp: V(-0.35, -0.75, 0.55), lFo: V(0.1, 0.8, 0.6) }; // левый кулак к плечу: «давай!»
const DOWN = { lh: -1, lean: 12, nod: 30, rUp: V(0.1, -1, 0.08), rFo: V(-0.1, -0.85, 0.5), lUp: V(-0.1, -1, 0.08), lFo: V(0.05, -0.95, 0.3), rk: V(-0.1, -0.55, 0.85) };
// Без сил: наклон, руки к коленям, ракетка вперёд-вправо — мимо ног (вбок к левой ноге она шла сквозь колено).
const TIRED = { lh: -1, lean: 24, nod: 10, rUp: V(0.12, -0.9, 0.3), rFo: V(0.02, -0.85, 0.5), lUp: V(-0.12, -0.9, 0.3), lFo: V(-0.02, -0.85, 0.5), rk: V(0.45, -0.2, 0.87) };
// Бег (0..1) по скорости: до ~3,6 м/с — приставной шаг лицом к сетке, дальше разворот и беговой шаг. Раньше порог был
// 2,6–4,2 м/с, и короткий приставной (до 3,8 м/с) уже разворачивал корпус и махал ногой на 24 см вверх.
const runOf = (v) => THREE.MathUtils.smoothstep(v, 3.6, 5.0);
const distSeg = (p, a, c) => { const ac = c.clone().sub(a), t = clamp(p.clone().sub(a).dot(ac) / Math.max(ac.lengthSq(), 1e-9), 0, 1); return a.clone().addScaledVector(ac, t).distanceTo(p); };

// Перекрашивает светлую ткань (футболка, носки, кроссовки) в цвет формы, кожу не трогает: у ткани низкая насыщенность.
function tintCloth(m, color) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tint = { value: new THREE.Color(color) };
    sh.fragmentShader = 'uniform vec3 tint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float cloth = smoothstep(0.42, 0.6, lum) * (1.0 - smoothstep(0.05, 0.12, sat));
      diffuseColor.rgb = mix(diffuseColor.rgb, tint * (0.35 + 0.9 * lum), cloth);`);
  };
  m.customProgramCacheKey = () => 'cloth' + color;
  return m;
}

export class Player {
  constructor(scene, gltf, { side, racketColor, cloth, human = false, height = 1.82, racket = null }) {
    this.reach = structuredClone(REACH0);
    this.side = side; // +1 — Лёва (z > 0), −1 — соперник
    this.human = human;
    this.netYaw = side > 0 ? Math.PI : 0;
    this.right = new THREE.Vector3(side, 0, 0);
    this.fwd = new THREE.Vector3(0, 0, -side);
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
      if (cloth) o.material = tintCloth(o.material.clone(), cloth);
    });
    // Смесь линейного скиннинга и двойных кватернионов (dqs.js): на стыке плеча и на сгибах DQS выключен — на смэше
    // он раздувал плечо пузырём (test-out/anat-oh-cmp.png), проверено test-out/rig-c3. ?lbs — только линейный, для сравнения.
    if (!/[?&]lbs\b/.test(location.search)) useDQS(model);
    const box = new THREE.Box3().setFromObject(model);
    model.scale.multiplyScalar(height / (box.max.y - box.min.y)); // рост: Лёва 182 см
    this.wrap = new THREE.Group();
    this.wrap.add(model);
    scene.add(this.wrap);
    this.racket = racket ?? buildRacket(racketColor);
    scene.add(this.racket);
    this.home = new THREE.Vector3(0, 0, side * (COURT.len / 2 + 0.8));
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.wrap.position.copy(this.pos); this.wrap.rotation.y = this.netYaw; // корпус всегда лицом к сетке, разворот — тазом
    this.wrap.updateMatrixWorld(true);
    this.rig = new Rig(model, this.racket);
    this.hipH = this.rig.b.Hips.getWorldPosition(new THREE.Vector3()).y - this.pos.y; // таз над землёй в покое — для позы сидя (club.js)
    this.feet = { Left: { sign: -1, pos: new THREE.Vector3(), lift: 0, yaw: 0, step: null }, Right: { sign: 1, pos: new THREE.Vector3(), lift: 0, yaw: 0, step: null } };
    this.bodyTurn = 0; this.hold = 0; this.dir = new THREE.Vector3(); // bodyTurn — разворот всего тела от лица к сетке, рад
    this.acc = new THREE.Vector3(); this.lastVel = new THREE.Vector3(); this.headYaw = 0; this.ballPos = null;
    this.boostUntil = 0; this.split = null; this.sliding = 0; this.now = 0; this.lunge = new THREE.Vector3();
    this.stroke = null;
    this.stamina = 1; this.mood = 0; this.gest = null; this.idle = false; // выносливость 0..1, настрой −1..1 (ведёт game.js)
    this.place(this.pos);
  }
  // Усталость 0..1: пока выносливость выше 0,6, ничего не меняется; к 0,2 — полная.
  get tired() { return 1 - smooth(this.stamina, 0.2, 0.6); }

  place(pos) {
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.stroke = null; this.split = null; this.bodyTurn = 0; this.sliding = 0;
    this.wrap.position.copy(pos); this.wrap.rotation.y = this.netYaw;
    for (const f of Object.values(this.feet)) { f.pos.copy(pos).addScaledVector(this.right, f.sign * STANCE); f.lift = 0; f.yaw = 0; f.step = null; }
  }

  // Сплит-степ: маленький прыжок, приземление к удару соперника; после него первый шаг резче.
  splitStep(now) {
    if (this.stroke || this.split || this.vel.length() > 2.5) return;
    this.split = { t0: now, dur: 0.26 };
    this.boostUntil = now + 0.26 + 0.4;
  }

  // Когда и где мяч пересечёт плоскость центра струн перед игроком (после отскока на его стороне или с лёта).
  predict(ball, now, ahead = this.reach.AHEAD) {
    if (!ball.live) return null;
    const planeZ = this.pos.z + this.fwd.z * ahead, b = copyBall(ball);
    let bounces = b.bounces, t = 0, prevZ = b.pos.z;
    const before = b.bounces; // отскоков к этому моменту: если до игрока мяч не отскочит — это удар с лёта
    for (let i = 0; i < 260; i++) {
      const ev = step(b, 1 / 120); t += 1 / 120;
      if (ev?.type === 'net') return null;
      if (ev?.type === 'bounce' && Math.sign(b.pos.z) === this.side && ++bounces >= 2) return null;
      if (b.vel.z * this.side > 0 && (prevZ - planeZ) * (b.pos.z - planeZ) <= 0 && b.pos.y < 3.3) {
        const back = (b.pos.z - planeZ) / (b.pos.z - prevZ || 1) / 120; // точное время пересечения внутри шага
        return { t: now + t - back, pos: b.pos.clone().addScaledVector(b.vel, -back), vz: Math.abs(b.vel.z), volley: bounces === 0 && before === 0 };
      }
      prevZ = b.pos.z;
    }
    return null;
  }

  // Для соперника: где встать под удар. Перебираем точки полёта после отскока на его стороне (до второго отскока)
  // и берём самую раннюю, куда он успевает добежать, — как живой игрок: укороченный ловит низко сразу после отскока,
  // глубокий мяч — у задней линии, не дожидаясь, пока тот упадёт. Удобная высота — от 25 см до 1,45 м.
  // Если первый отскок за линией — пропустить, это аут. delay — сколько ещё до старта (реакция).
  // volley — у сетки можно и с лёта (0,3–1,8 м) или смэшем (2,3–2,8 м), до отскока.
  plan(ball, now, delay = 0, lo = 0.25, volley = false) { // lo — ниже какой высоты мяч не брать
    const b = copyBall(ball), vmax = MOVE.sprint * (1 - 0.2 * this.tired) * Math.min(1, this.speedScale ?? 1) * 0.8; // быстрее 1 план не считает: при 1,04 опаздывал к точке
    let t = 0, bounced = b.bounces > 0, best = null;
    const need = (d) => delay + (d < 0.3 ? 0.1 : d / vmax + 0.35); // время добежать: разгон и торможение съедают ~0,35 с
    for (let i = 0; i < 480; i++) {
      const ev = step(b, 1 / 120); t += 1 / 120;
      if (ev?.type === 'net') return null;
      if (ev?.type === 'bounce') {
        if (Math.sign(b.pos.z) !== this.side) return null;
        if (bounced) break; // второй отскок — дальше играть нечего
        if (!inSingles(b.pos)) return { out: true };
        bounced = true; continue;
      }
      const y = b.pos.y, pre = !bounced && volley && Math.abs(b.pos.z) < 7 && b.vel.z * this.side > 0;
      if (i % 4 || !(pre ? (y > 0.3 && y < 1.8) || (y > 2.3 && y < 2.8) : bounced && y >= lo && y <= 1.45)) continue;
      const type = pre && y > 2.3 ? 'oh' : (b.pos.x - this.pos.x) * this.side >= -0.15 ? 'fh' : 'bh';
      const stand = b.pos.clone().setY(0);
      stand.x -= this.side * this.reach.LATERAL[type]; stand.z += this.side * this.reach.AHEAD;
      const slack = t - need(this.pos.distanceTo(stand));
      const cand = { t: now + t, pos: b.pos.clone(), type, stand, slack };
      if (slack >= 0) return cand;           // самая ранняя точка, до которой успевает
      if (!best || slack > best.slack) best = cand; // иначе — где опоздание меньше всего (бежит изо всех сил)
    }
    return best;
  }

  // Удар: type — fh | bh | fh-top | bh-top; extra.drop — укороченный. Если мяч летит к игроку, удар подстраивается
  // под его прилёт и высоту, а мяч выше двух метров бьётся смэшем (сам выбирается).
  press(type, now, ball, tFixed = null, extra = {}) {
    // Новый удар можно нажать сразу после касания мяча (не ждать конца проводки), а сторону — переключить,
    // пока до удара больше 0,15 с. Переход в новый удар идёт из текущей позы, без рывка.
    const old = this.stroke;
    if (old && now < old.tContact + 0.05) {
      if (old.base === type && !extra.drop) return false;
      if (old.tContact - now < 0.15) return false;
    }
    const pr = tFixed == null && ball ? this.meet(ball, now, extra.drop) : null;
    // Мяч летит к нам, но плоскость удара пока не пересечёт (короткий: отскочит дважды раньше) — удар ждёт, пока игрок
    // добежит, а не машет вхолостую сразу.
    const wait = !pr && tFixed == null && !!ball?.live && ball.vel.z * this.side > 0;
    if (!pr && !wait && tFixed == null && old && now < old.tContact + AFTER) return false; // мяч не летит к нам — не машем вхолостую поверх удара
    const far = pr && pr.t - now >= 1.8;
    let tC = tFixed ?? (pr && !far ? pr.t : now + PREP + (wait ? 0.1 : 0));
    tC = Math.max(tC, now + 0.15);
    this.stroke = { type, base: type, drop: !!extra.drop, h: pr && !far ? pr.pos.y : null, volley: !!pr?.volley, cross: pr && !far ? pr.pos : null, tPress: now, tContact: tC, from: this.lastPose ?? null, committed: false, contacted: false, stepIn: false, pred: (!!pr && !far) || wait, wait, jumpH: 0 };
    this.pickHigh(this.stroke);
    if (tFixed != null || !this.stroke.pred || tC - now <= PREP) this.commit(this.stroke);
    this.split = null;
    return true;
  }
  // Где встретить мяч: с отскока — у плоскости перед собой; с лёта у сетки — на вытянутой руке дальше впереди.
  meet(ball, now, drop) {
    const pr = this.predict(ball, now);
    if (pr?.volley && !drop && Math.abs(this.pos.z) < 7) return this.predict(ball, now, this.reach.AHEAD_V) ?? pr;
    return pr;
  }

  // Умная остановка: удар нажат, игрок бежит по направлению d — сколько ещё бежать до точки, где удобно бить.
  // Перебираем полёт мяча: куда встать, чтобы мяч прошёл на длине руки (вбок) и на удобной высоте; берём первую такую
  // точку на пути (в стороне от пути не дальше 35 см), до которой успеваешь. Сначала ищем удобную высоту 0,45–1,4 м,
  // нет — терпимую 0,25–1,9. Нет и такой — Infinity: бежит, куда держит клавиши, это его выбор.
  runLeft(st, ball, d) {
    const cp = this.contactPt?.[st.type], lat = cp ? -cp.s.x : this.reach.LATERAL[st.type === 'oh' ? 'oh' : /bh/.test(st.type) ? 'bh' : 'fh'];
    const ahead = cp ? cp.s.z : this.reach.AHEAD, v = Math.max(this.vel.dot(d), 3);
    const zones = st.type === 'oh' ? [[2.0, 2.8]] : [[0.45, 1.4], [0.25, 1.9]], best = zones.map(() => Infinity);
    const b = copyBall(ball), q = new THREE.Vector3();
    let bounces = b.bounces;
    for (let i = 0, t = 0; i < 300; i++) {
      const ev = step(b, 1 / 120); t += 1 / 120;
      if (ev?.type === 'net' || (ev?.type === 'bounce' && ++bounces >= 2)) break;
      if (i % 2 || b.vel.z * this.side <= 0) continue;
      q.copy(b.pos).addScaledVector(this.right, -lat).addScaledVector(this.fwd, -ahead).sub(this.pos).setY(0);
      const s = q.dot(d), perp = Math.sqrt(Math.max(0, q.lengthSq() - s * s));
      if (perp > 0.35 || s < -1.2 || s / v > t + 0.05) continue; // проскочил точку (до 1,2 м) — тормозим, а не бежим дальше
      zones.forEach(([lo, hi], k) => { if (b.pos.y >= lo && b.pos.y <= hi) best[k] = Math.min(best[k], Math.max(0, s)); });
    }
    return best.find((x) => x < Infinity) ?? Infinity;
  }

  // Высокий мяч — смэш; до отскока — удар с лёта (форхенд или бэкхенд по нажатой клавише); иначе как нажал.
  // Смэш — только высокая свеча у сетки или с лёта; мяч на уровне плеча берём высоким форхендом или бэкхендом.
  // Порог с запасом в обе стороны, чтобы удар не перескакивал туда-обратно, пока мяч летит.
  pickHigh(st) {
    const smash = st.h != null && !st.drop && (st.volley || Math.abs(this.pos.z) < 8);
    const net = !st.drop && Math.abs(this.pos.z) < 7, bh = st.base.startsWith('bh');
    if (smash && st.h > this.reach.Y.fh + (st.type === 'oh' ? 1.0 : 1.2)) st.type = 'oh';
    else if (st.volley && net) { // сзади мяч до отскока бьём обычным ударом
      // Мяч в корпус — блок бэкхендом перед грудью, как у живых игроков: локоть к себе, ракетка перед грудью.
      const lat = st.cross ? st.cross.clone().sub(this.pos).dot(this.right) : 1, h = st.h ?? 1;
      const body = st.cross && lat > -0.3 && lat < 0.35 && h > 0.75 && h < 1.6;
      // Высота: ниже ~0,75 м — низкий, выше ~1,5 м — высокий; порог с запасом, чтобы вариант не скакал, пока мяч летит.
      const was = st.type ?? '', hi = h > (was.endsWith('-hi') ? 1.4 : 1.5), lo = h < (was.endsWith('-lo') ? 0.82 : 0.75);
      st.type = (bh || body ? 'vbh' : 'vfh') + (hi ? '-hi' : lo ? '-lo' : '');
    } else if (net && !st.volley && st.h != null && st.h < 0.42) st.type = (bh ? 'vbh' : 'vfh') + '-half'; // полулёт: мяч у ног сразу после отскока
    else {
      st.type = st.base; st.defend = false;
      // Широкий или низкий мяч — защитный резаный снизу: одной рукой и с длинным выпадом достаёт дальше, чем двуручный
      // (по журналу 17.11 Лёва нажимал вовремя, но мяч был на 0,8–1 м дальше двуручного бэкхенда).
      if (st.cross && !st.drop && !st.base.endsWith('slice')) {
        // Где игрок будет к удару: бежит до момента «встать» и тормозит (v²/2a). Иначе мяч кажется далёким, пока он ещё в пути.
        const v = this.vel.length(), lead = Math.max(0, st.tContact - this.now - MOVE.plant) + v / (2 * MOVE.brake);
        const d = st.cross.clone().sub(this.pos.clone().addScaledVector(this.vel, lead)), lat = Math.abs(d.dot(this.right)), bh = st.base.startsWith('bh');
        if ((st.h ?? 1) < 0.2 || lat > (bh ? 1.0 : 1.35)) { st.type = bh ? 'bh-slice' : 'fh-slice'; st.defend = true; }
      }
    }
  }
  // Замах пошёл: точку удара больше не двигаем; на смэше считаем прыжок так, чтобы вершина пришлась на удар.
  commit(st) {
    st.committed = true;
    if (st.type === 'oh') st.jumpH = clamp((st.h ?? 0) - this.reach.Y.oh, 0, 0.55);
  }

  // Движение: move — куда тянет игрок (мир, длина 0..1). Разгон ограничен сцеплением, торможение сильнее разгона,
  // на большой скорости торможение — скольжение. Полная скорость — если держать направление дольше ~0,2 с.
  // left — сколько ещё можно бежать до точки удара (умная остановка, runLeft): скорость не больше той, с которой
  // успеваешь встать к этой точке, скользя по грунту.
  move(dt, now, move, left = Infinity) {
    if (this.free) return this.walkMove(dt, move); // прогулка по клубу (club.js)
    // Готовить удар можно на бегу, как в жизни; к самому удару ноги встают (MOVE.plant), а стрелки только целят.
    // На бегу встать сразу не выйдет: тело тормозит, и удар на ходу слабее.
    const st = this.stroke, planted = st && now > st.tContact - MOVE.plant && now < st.tContact + 0.12;
    const m = planted ? 0 : Math.min(1, move.length());
    if (m > 0.1) {
      const d = move.clone().divideScalar(move.length()), c = d.dot(this.dir);
      this.hold = c > 0.85 ? this.hold + dt : c > 0.3 ? this.hold * c : 0; // добавил диагональ — разгон не теряется
      if (c < -0.3 && this.vel.length() > 1.5) this.boostUntil = now + 0.35; // разворот: толчок от опорной ноги
      this.dir.copy(d);
    } else this.hold = 0;
    const tired = this.tired; // усталость: спринт до −20%, разгон до −15%
    const cap = MOVE.shuffle + (MOVE.sprint * (1 - 0.2 * tired) - MOVE.shuffle) * smooth(this.hold, 0.15, 0.45);
    const want = this.dir.clone().multiplyScalar(m > 0.1 ? Math.min(m * cap * (this.speedScale ?? 1), Math.sqrt(2 * MOVE.slide * left)) : 0);
    const speed = this.vel.length();
    const braking = want.lengthSq() < this.vel.lengthSq() * 0.95 || want.dot(this.vel) < 0;
    // После выпада тело уносит по инерции: скользит по грунту (carry), и первое время разгон к центру вялый (recover).
    const carry = now < (this.carryUntil ?? 0), slow = now < (this.recoverUntil ?? 0) ? 0.45 : 1;
    const rate = braking ? (speed > MOVE.slideFrom || carry ? MOVE.slide : MOVE.brake) : (now < this.boostUntil ? MOVE.boost : MOVE.accel) * slow * (1 - 0.15 * tired) * (this.accelScale ?? 1);
    this.sliding = braking && (speed > MOVE.slideFrom || (carry && speed > 0.8)) ? Math.min(1, this.sliding + dt * 6) : Math.max(0, this.sliding - dt * 4);
    const dv = want.sub(this.vel);
    if (dv.length() > rate * dt) dv.setLength(rate * dt);
    this.vel.add(dv);
    this.pos.addScaledVector(this.vel, dt);
    const zMin = this.side > 0 ? 0.6 : -18, zMax = this.side > 0 ? 18 : -0.6;
    if (Math.abs(this.pos.x) > 7.5) { this.pos.x = Math.sign(this.pos.x) * 7.5; this.vel.x = 0; }
    if (this.pos.z < zMin || this.pos.z > zMax) { this.pos.z = clamp(this.pos.z, zMin, zMax); this.vel.z = 0; }
    this.wrap.position.copy(this.pos);
  }

  // Шаги. Ступня стоит, пока не отстала от своего места у тела, потом шагает туда, где тело будет к её приземлению.
  // Места ступней — слева и справа от тела: вбок ноги не перекрещиваются, получается приставной шаг (крупный, ~4 в секунду).
  // На рывке тело развёрнуто по ходу, стойка узкая, ступня отрывается, отстав на 40 см, и летит 0,25–0,3 с:
  // длинный беговой шаг с фазой полёта, 4–5 шагов в секунду, как у теннисистов на матче, а не мелкая дробь.
  footwork(dt, now) {
    const speed = this.vel.length(), run = runOf(speed);
    const bodyRight = this.right.clone().applyAxisAngle(UP, this.bodyTurn);
    const half = STANCE * (1 - 0.5 * run) * (this.free ? 0.5 : 1) + (this.split ? (Math.abs(this.pos.z) < 7 ? 0.1 : 0.05) : 0) + this.sliding * 0.12; // у сетки сплит шире
    const ideal = (f, t) => this.pos.clone().addScaledVector(this.vel, t + 0.04).addScaledVector(bodyRight, f.sign * half);
    const F = Object.values(this.feet);

    if (this.split) { // прыжок: обе ступни вверх и приземление пошире
      const u = (now - this.split.t0) / this.split.dur;
      for (const f of F) { f.step = null; f.pos.lerp(ideal(f, 0), Math.min(1, dt * 12)); f.lift = 0.07 * Math.sin(Math.PI * Math.min(1, u)); }
      if (u >= 1) { this.split = null; this.settleAt = now; for (const f of F) f.lift = 0; } // приземление низко: короткий присед
      return;
    }
    if (this.sliding > 0.3) { // скольжение: ступни едут по грунту вместе с телом; нога в воздухе опускается за ~0,1 с, а не падает в кадр
      for (const f of F) { const a = f.pos.clone(); f.step = null; f.lift *= Math.exp(-dt / 0.04); f.pos.addScaledVector(this.vel, dt); if (f.lift < 0.01) this.onSlide?.(a, f.pos); }
      return;
    }
    // Ступни не перекрещиваются вбок (кроме скрестного шага с лёта): левая левее правой хотя бы на 12 см в осях тела.
    // Раньше на приставном отстающая нога отрывалась первой и шагала дальше ведущей — ноги проходили друг сквозь друга.
    const apart = (f, p) => {
      const o = f === this.feet.Left ? this.feet.Right : this.feet.Left, op = o.step ? o.step.to : o.pos;
      const gap = (op.clone().sub(p).dot(bodyRight)) * o.sign; // у правой ноги sign = +1: она должна быть правее
      if (gap < 0.12) p.addScaledVector(bodyRight, (gap - 0.12) * o.sign);
      return p;
    };
    for (const f of F) {
      if (!f.step) continue;
      const st = f.step, u = Math.min(1, (now - st.t0) / st.dur);
      // Место приземления уточняем только в начале маха: раньше цель ехала вместе с телом до самой постановки, ступня
      // садилась на скорости тела и вставала в кадр — голень дёргалась на 25° за кадр.
      if (!st.fixed && u < 0.7) apart(f, st.to.lerp(ideal(f, st.t0 + st.dur - now), 0.5 * (1 - smooth(u, 0.35, 0.7))));
      f.pos.lerpVectors(st.from, st.to, u * u * (3 - 2 * u));
      if (st.bow) f.pos.addScaledVector(st.bow, Math.sin(Math.PI * u)); // скрестный шаг идёт дугой перед опорной ногой, не сквозь неё
      f.lift = st.h * Math.sin(Math.PI * (1 - (1 - u) ** (1 / (st.k ?? 1)))); // на бегу пятка взлетает в начале маха (к ягодице), потом нога выносится вперёд; старт с конечной скоростью (u^k давал бесконечную — рывок голени)
      f.yaw += wrapAngle(st.yaw - f.yaw) * Math.min(1, dt * 14);
      if (u >= 1) { f.pos.copy(st.to); f.lift = 0; f.step = null; }
    }
    // Опора на бегу ~0,1 с, мах 0,32 с: ступня уходит, отстав на скорость × 0,1 (до 62 см), — длинный шаг с полётом,
    // ~5 шагов в секунду, а не дробь. Задняя нога при этом встаёт на носок (Rig.legs), таз не проседает.
    // Приставной шаг — от 20 до 45 см.
    // На старте (сильный разгон с места) первый шаг сразу, а не когда тело уехало на 30 см от стоящих ступней.
    // На бегу задняя нога отрывается, отстав на ~45–50 см (было до 62 и дольше): иначе в полёте ноги в шпагате.
    const vDir = speed > 0.05 ? this.vel.clone().divideScalar(speed) : null, start = vDir ? smooth(this.acc.dot(vDir), 6, 14) * (1 - smooth(speed, 1.5, 3)) : 0;
    const thr = THREE.MathUtils.lerp(speed > 0.4 ? clamp(0.15 + speed * 0.08, 0.2, 0.45) : 0.15, clamp(speed * 0.08, 0.42, 0.5), run) * (1 - 0.55 * start);
    // Приставной: первой шагает ведущая нога (со стороны движения), отстающая подтягивается за ней.
    const err = F.map((f) => (f.step ? -1 : f.pos.distanceTo(ideal(f, 0)) + Math.abs(wrapAngle(f.yaw - this.bodyTurn)) * 0.2 + (vDir ? 0.08 * (1 - run) * f.sign * vDir.dot(bodyRight) : 0)));
    const i = err[0] >= err[1] ? 0 : 1, other = F[1 - i];
    if (err[i] < thr) return;
    if (now < (this.plantUntil ?? 0) && speed < 1.5) return; // шаг в удар стоит до конца удара, потом ноги возвращаются в стойку
    // Приставной шаг — по очереди; бег — следующая нога отрывается во второй половине полёта первой.
    // Приставной на скорости: отстающая нога отрывается, когда ведущая прошла 45 % шага (шаг-приставка), шаг короче по времени —
    // иначе на 3,5 м/с ступни разъезжались на метр и таз проседал.
    if (other.step && ((now - other.step.t0) / other.step.dur < (run > 0.4 ? 0.72 : 0.6 - 0.15 * smooth(speed, 1.5, 3))) && err[i] < thr + 0.15) return; // полёт — последняя четверть шага другой ноги
    const dur = speed > 0.4 ? THREE.MathUtils.lerp(0.2 - 0.04 * smooth(speed, 1.5, 3.4), 0.32, run) : 0.2;
    F[i].step = { t0: now, dur, from: F[i].pos.clone(), to: apart(F[i], ideal(F[i], dur)), h: 0.04 + 0.2 * run, k: 1 - 0.4 * run, yaw: this.bodyTurn };
    this.onStep?.(F[i]);
    // Ступня не отстаёт от тела дальше шага: иначе на резком рывке её «телепортирует» под тело.
    for (const f of F) {
      const off = f.pos.clone().sub(this.pos).setY(0), max = 0.8;
      if (off.length() > max) f.pos.copy(this.pos).add(off.setLength(max));
    }
  }

  // Мяч задел тело (не ракетку): туловище, голова, ноги — капсулы по костям. В теннисе это проигранное очко.
  bodyHit(p, r) {
    const b = this.rig.b, w = (n) => b[n].getWorldPosition(new THREE.Vector3());
    const seg = (a, c, rad) => distSeg(p, a, c) < rad + r;
    const hips = w('Hips'), neck = w('Neck');
    if (seg(hips, neck, 0.16)) return 'torso';
    if (w('Head').distanceTo(p) < 0.12 + r) return 'head';
    for (const s of ['Left', 'Right']) { if (seg(w(s + 'UpLeg'), w(s + 'Leg'), 0.085)) return s + 'Thigh'; if (seg(w(s + 'Leg'), w(s + 'Foot'), 0.06)) return s + 'Shin'; }
    return false; // часть тела — для журнала
  }

  // Ракетка идёт к мячу: рука доворачивается в плече так, чтобы центр струн пришёл туда, где будет мяч.
  // contactPt — где центр струн и плечо в позе удара (замер measure), drop — насколько тело ниже, чем при замере.
  reachFor(st, k, w, drop) {
    const cp = this.contactPt?.[st.type];
    if (!cp || !st.cross) return k;
    const facing = this.netYaw + this.bodyTurn;
    const f = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)), rt = this.right.clone().applyAxisAngle(UP, this.bodyTurn);
    const d = st.cross.clone().sub(this.pos);
    const B = new THREE.Vector3(-d.dot(rt), d.y + drop, d.dot(f)); // мяч в осях скелета (правая сторона в −X), с поправкой на присед
    const a = cp.s.clone().sub(cp.sh), b = B.sub(cp.sh), radial = b.length() - a.length();
    // Выпад: если мяч дальше или ближе, чем достаёт рука, тело смещается к нему по горизонтали (ноги стоят),
    // чтобы плечо оказалось на длине руки от мяча. Не больше 45 см к мячу (с лёта — 1 м: скрестный шаг, досягаемость
    // у сетки ~1,7 м вбок, как у живых) и 45 см от него (мяч в корпус — шаг в сторону).
    const h = new THREE.Vector3(b.x, 0, b.z), hl = h.length();
    let x = 0;
    if (hl > 1e-3) {
      h.divideScalar(hl);
      const disc = a.lengthSq() - b.y * b.y;
      x = clamp(disc > 0 ? hl - Math.sqrt(disc) : hl, -0.45, (st.type.startsWith('v') ? 1.0 : 0.45 + (this.defend ?? 0) + (st.defend ? 0.25 : 0)) * (1 - 0.3 * this.tired)); // st.defend — защитный резаный: выпад длиннее; defend — запас выпада у сильного соперника; усталость — до −30%
      b.addScaledVector(h, -x);
    }
    const lw = rt.clone().multiplyScalar(-h.x * x).addScaledVector(f, h.z * x); // из осей скелета в мир
    this.lunge.copy(lw).multiplyScalar(w);
    // К мячу тянемся шириной шага и приседом, а не наклоном: таз ниже на четверть выпада (lungeStep ставит ногу широко).
    this.lungeDrop = 0.2 * Math.max(0, x) * w;
    b.y += this.lungeDrop;
    const q = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    if (ang > MAX_TURN) q.copy(new THREE.Quaternion().slerp(q, MAX_TURN / ang));
    st.reach = { ang, radial, lunge: x, lw };
    return turnArms(k, new THREE.Quaternion().slerp(q, w));
  }

  // Шаг в удар: на форхенде вперёд выходит левая нога, на бэкхенде правая.
  // С лёта — первый шаг по диагонали вперёд к мячу сразу после сплит-степа: форхенд — левая вперёд-вправо,
  // бэкхенд — правая вперёд-влево. Шагнувшая нога стоит до конца удара (plantUntil).
  stepIn(st, now) {
    const fh = /^v?fh/.test(st.type), v = st.type.startsWith('v'), f = fh ? this.feet.Left : this.feet.Right;
    const to = f.pos.clone().addScaledVector(this.fwd, v ? 0.36 : 0.32).addScaledVector(this.right, (fh ? 1 : -1) * (v ? 0.2 : 0.08));
    f.step = { t0: now, dur: v ? 0.2 : 0.22, from: f.pos.clone(), to, h: 0.05, yaw: deg(fh ? 30 : -30), fixed: true };
    this.plantUntil = st.tContact + 0.15;
  }
  // Открытая стойка, как на видео Лёвы: в развороте на замах задняя нога (правая на форхенде, левая на бэкхенде) шагает
  // в сторону и чуть назад, носок наружу — база шире, корпус загружается над ней. Раньше ступни стояли в стойке готовности.
  loadStep(st, now) {
    const s = st.type.startsWith('fh') ? 1 : -1, f = s > 0 ? this.feet.Right : this.feet.Left;
    const to = f.pos.clone().addScaledVector(this.right, s * 0.16).addScaledVector(this.fwd, -0.06);
    f.step = { t0: now, dur: 0.24, from: f.pos.clone(), to, h: 0.04, yaw: deg(-25 * s), fixed: true };
    this.plantUntil = Math.max(this.plantUntil ?? 0, st.tContact + 0.15);
    this.onStep?.(f);
  }
  // Широкий мяч — как у Алькараса и Синнера: внешняя нога шагает к мячу широко (открытая стойка), таз садится на неё,
  // корпус остаётся над базой. Короткий мяч — передняя нога выпадом вперёд. L — куда и насколько сместится тело (мир).
  lungeStep(st, now, L) {
    const len = L.length(), dir = L.clone().divideScalar(len), lat = dir.dot(this.right), wide = Math.abs(lat) > 0.6;
    const fh = /^v?fh/.test(st.type);
    this.plantUntil = st.tContact + 0.15;
    // Широкий мяч с лёта — скрестный шаг: опорная нога разворачивает носок к мячу, дальняя шагает по диагонали вперёд
    // дугой перед ней, таз поворачивается к мячу (st.crossover в update) — ноги не идут друг сквозь друга.
    // Так у сетки достают ~1,7 м вбок, как живые игроки.
    if (wide && st.reach.lunge > 0.3 && st.type.startsWith('v')) {
      const f = lat > 0 ? this.feet.Left : this.feet.Right, o = lat > 0 ? this.feet.Right : this.feet.Left;
      o.step = { t0: now, dur: 0.12, from: o.pos.clone(), to: o.pos.clone().addScaledVector(dir, 0.3).addScaledVector(this.fwd, -0.05), h: 0.03, yaw: Math.sign(lat) * -deg(50), fixed: true };
      const to = this.pos.clone().addScaledVector(L, 0.95).addScaledVector(this.fwd, 0.4);
      f.step = { t0: now, dur: 0.22, from: f.pos.clone(), to, h: 0.07, yaw: Math.sign(lat) * -deg(25), fixed: true, bow: this.fwd.clone().multiplyScalar(0.18) };
      st.crossover = Math.sign(lat);
      this.onStep?.(f);
      return;
    }
    if (st.type.startsWith('v') && st.reach.lunge > -0.2) return; // с лёта мяч рядом: хватает диагонального шага (stepIn)
    const f = wide ? (lat > 0 ? this.feet.Right : this.feet.Left) : fh ? this.feet.Left : this.feet.Right;
    const to = this.pos.clone().addScaledVector(L, 0.85).addScaledVector(dir, (wide ? 0.12 : 0.18) + 0.18 * len); // нога чуть дальше таза: таз над ней
    if (!wide) to.addScaledVector(this.right, fh ? -0.12 : 0.12); // передняя нога чуть в свою сторону, не на линию
    // Не дальше 0,75 м от центра: Лёва ловил шпагат, ноги ехали в разные стороны и заходили друг в друга.
    const off = to.clone().sub(this.pos).setY(0); if (off.length() > 0.75) to.copy(this.pos).add(off.setLength(0.75));
    f.step = { t0: now, dur: 0.2, from: f.pos.clone(), to, h: 0.06, yaw: wide ? Math.sign(lat) * -deg(35) : deg(fh ? 30 : -30), fixed: true };
    const o = f === this.feet.Left ? this.feet.Right : this.feet.Left;
    if (wide && o.step?.fixed) { o.step.from = o.pos.clone(); o.step.to = o.pos.clone(); } // открытая стойка: вторая нога не шагает вперёд, остаётся опорой
    this.onStep?.(f);
  }

  update(dt, now, move, ball) {
    this.now = now;
    const st = this.stroke;
    // Точку и время удара пересчитываем до самого удара: игрок ещё двигается, мяч крутится. Пока замах не начался —
    // сразу, в замахе — плавно (замах идёт быстрее или медленнее, но не дёргается), так ракетка приходит к мячу вовремя.
    if (st && st.pred && !st.contacted && ball?.live && now < st.tContact - 0.03) {
      const pr = this.meet(ball, now, st.drop);
      if (pr) {
        if (!st.committed) { st.tContact = Math.max(pr.t, now + 0.15); st.volley = pr.volley; }
        else { const lim = dt * 0.6; st.tContact += clamp(pr.t - st.tContact, -lim, lim); }
        st.h = pr.pos.y; st.cross = pr.pos; st.wait = false;
        if (!st.committed) this.pickHigh(st);
      } else if (st.wait && !st.committed && now - st.tPress < 1.5) st.tContact = Math.max(st.tContact, now + PREP + 0.02); // ещё не добежал — замах ждёт
    }
    if (st && !st.committed && now >= st.tContact - PREP) this.commit(st);
    if (st && !st.stepIn && st.type !== 'oh' && now >= st.tContact - (st.type.startsWith('v') ? 0.38 : 0.42) && this.vel.length() < 2) { st.stepIn = true; this.stepIn(st, now); } // шаг в удар встаёт до замаха вперёд (~−0,18 с), а не под самое касание
    if (st && !st.loadStep && !st.stepIn && /^(fh|bh)(-top)?$/.test(st.type) && st.tContact - st.tPress >= 0.55 && now - st.tPress > 0.04 && now < st.tContact - 0.5 && this.vel.length() < 1) { st.loadStep = true; this.loadStep(st, now); }
    if (st && !st.lungeStep && !st.contacted && st.type !== 'oh' && now >= st.tContact - 0.28 && st.reach?.lw && Math.abs(st.reach.lunge) > 0.12) { st.lungeStep = true; this.lungeStep(st, now, st.reach.lw); }
    const aim = st && !st.contacted && ball?.live && move.lengthSq() > 0.01; // у ИИ своя точка — умная остановка только у Лёвы
    this.move(dt, now, move, aim && this.human ? this.runLeft(st, ball, move.clone().normalize()) : Infinity);
    this.acc.lerp(this.vel.clone().sub(this.lastVel).divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 8)); this.lastVel.copy(this.vel);
    this.ballPos = ball?.live ? ball.pos : null;

    // На рывке разворачивается всё тело: бегут лицом по ходу, голова держит мяч. К удару корпус возвращается к сетке.
    const speed = this.vel.length(), run = runOf(speed);
    // Встал к удару после бега: ноги упираются в грунт — звук, пыль и короткий присед (onPlant), раз за удар.
    if (st && !st.contacted) {
      st.vmax = Math.max(st.vmax ?? 0, speed);
      if (!st.settled && st.vmax > 1.5 && (speed < 0.6 || now > st.tContact - MOVE.plant)) { st.settled = true; this.settleAt = now; this.onPlant?.(this, Math.min(1, st.vmax / MOVE.sprint)); }
    }
    const settle = now - (this.settleAt ?? -9) < 0.3 ? 0.05 * Math.sin(Math.PI * (now - this.settleAt) / 0.3) : 0;
    let turnTarget = 0;
    if ((!st || st.wout > 0.5) && speed > 0.5) turnTarget = clamp(wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.netYaw), -1.75, 1.75) * run; // после удара побежал — корпус по ходу, а не боком на 6 м/с
    // Прогулка (club.js): корпус разворачивается по ходу полностью, стоя держит разворот, на скамейке — по сиденью.
    if (this.free) turnTarget = this.seat ? wrapAngle(this.seat.yaw - this.netYaw) : speed > 0.3 ? wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.netYaw) : this.bodyTurn;
    // Разворот корпуса — пружина без перерегулирования (до 7 рад/с), а не ровная скорость 6 рад/с с места: та включалась
    // и выключалась мгновенно — рывок таза и плеч в начале и конце каждого разворота (до 10 000°/с²).
    this.turnVel = (this.turnVel ?? 0) + clamp(144 * wrapAngle(turnTarget - this.bodyTurn) - 24 * (this.turnVel ?? 0), -45, 45) * dt; // ускорение до 45 рад/с²
    this.turnVel = clamp(this.turnVel, -7, 7); this.bodyTurn += this.turnVel * dt;
    this.wrap.rotation.y = this.netYaw + this.bodyTurn;
    this.footwork(dt, now);

    // Поза: удар или стойка и бег. В удар входим и выходим плавно, руку с ракеткой подстраиваем под высоту мяча,
    // на смэше прыгаем с вершиной в момент удара.
    const loco = this.free ? this.stroll(now, speed) : this.loco(now, speed, run);
    let K = loco, extra = 0, jump = 0, k = null, w = 0;
    if (st) {
      const keys = STROKES[st.type], s = now - st.tContact, lead = st.tContact - st.tPress;
      const ss = lead < PREP && s < 0 ? -PREP + ((now - st.tPress) / lead) * PREP : s; // поздно нажал — сжимаем замах
      k = strokeAt(keys, ss);
      w = Math.exp(-((ss / 0.3) ** 2)); // сильнее всего у момента удара
      if (st.type === 'oh') {
        if (st.jumpH > 0) {
          const j = (now - st.tContact) / 0.3;
          if (Math.abs(j) < 1) jump = st.jumpH * (1 - j * j);
          else if (j > -1.6 && j <= -1) extra += 0.1; // присел перед толчком
        }
      } else if (st.h != null) {
        const base = /^v?fh/.test(st.type) ? 'fh' : 'bh';
        // Низкий мяч — ниже в коленях (до 18 см), остальное рукой; низкий воллей и полулёт — глубоко в коленях (до 32 см),
        // корпус прямой: так учат у сетки, а не наклоном.
        const deep = /-(lo|half)$/.test(st.type);
        // Приседаем заранее (пик за 0,12 с до удара), к удару ноги уже разгибаются.
        extra = clamp(this.reach.Y[base] - 0.3 - st.h, 0, deep ? 0.32 : 0.3) * (deep ? 0.85 : 0.6) * Math.exp(-(((ss + 0.12) / 0.3) ** 2)); // до 27 см: глубже — колено у земли
      }
      // Толчок ногами: удар с отскока — загрузка в колени перед ударом (−4,5 см на −0,28 с) и разгибание через касание
      // (+1,5 см после). Раньше таз был ниже всего ровно в момент удара — удар без ног.
      if (st.type !== 'oh' && !st.type.startsWith('v')) extra += 0.045 * Math.exp(-(((ss + 0.28) / 0.2) ** 2)) - 0.015 * Math.exp(-(((ss - 0.12) / 0.12) ** 2));
      // Разворот перед ударом плавный, 0,25–0,42 с по запасу времени (на видео Лёвы ~0,4 с), а не рывком за 0,1 с.
      st.win = smooth(now - st.tPress, 0, lead >= PREP ? clamp(lead - 0.3, 0.25, 0.42) : 0.14); st.wout = Math.max(smooth(s, AFTER - 0.3, AFTER), st.contacted ? smooth(speed, 1.5, 3.5) * smooth(s, 0.12, 0.35) : 0); // рванул после удара — проводку обрываем, как живые
      if (s > AFTER) this.stroke = null;
    }
    const hop = this.split ? Math.sin(Math.PI * Math.min(1, (now - this.split.t0) / this.split.dur)) : 0;
    // Таз на бегу качается плавно: выше в полёте, ниже в опоре (±2 см), а не скачком в кадр, когда обе ступни в воздухе.
    const air = this.feet.Left.step && this.feet.Right.step;
    this.bob = (this.bob ?? 0) + ((air ? -0.025 : 0.01) * run - (this.bob ?? 0)) * (1 - Math.exp(-dt / 0.06));
    const crouch = 0.07 - 0.02 * run + this.bob + 0.1 * this.sliding - 0.04 * hop + extra - jump + settle + 0.14 * (k ? 0 : this.slump); // на бегу выше, в стойке и скольжении ниже, без сил — присел
    this.lunge.set(0, 0, 0); this.lungeDrop = 0;
    if (k) {
      if (st.h != null) k = this.reachFor(st, k, w, crouch - 0.07);
      K = mix(mix(st.from && st.win < 1 ? st.from : loco, k, st.win), loco, st.wout); // вход из той позы, где был: из стойки, бега или прошлого удара
    }
    if (k && st.crossover) K = { ...K, hips: K.hips - 40 * st.crossover * w }; // скрестный шаг: таз к мячу, корпус как был
    // Перенос веса: после удара с отскока задняя нога встаёт на носок и доворачивается за тазом — вес ушёл на переднюю.
    // Раньше обе ступни стояли плоско до конца проводки (на видео Лёвы задняя нога отрывается и идёт вперёд).
    const back = st && !/^(v|oh)/.test(st.type) ? (/^fh/.test(st.type) ? this.feet.Right : this.feet.Left) : null;
    const toe = back ? smooth(now - st.tContact, -0.05, 0.12) * (1 - smooth(now - st.tContact, 0.55, 0.85)) : 0;
    const pivot = (f) => (f === back ? toe * deg(18) * f.sign : 0);
    const fl = (f) => ({ pos: f.pos, yaw: f.yaw - this.bodyTurn + pivot(f), lift: f.lift + jump, toe: f === back ? toe : 0 }); // поворот ступни на корте — от лица тела (в ±π: на прогулке корпус крутится кругом)
    this.wrap.position.copy(this.pos).add(this.lunge);
    this.lastPose = K;
    // Прогулка и скамейка (club.js): идёт — прямее в коленях; сидя ступни перед сиденьем, таз на высоте сиденья.
    const sw = this.free ? this.sitW() : 0;
    const foot = (f) => (sw ? { pos: f.pos.clone().lerp(this.seat.feet[f.sign > 0 ? 1 : 0], sw), yaw: fl(f).yaw * (1 - sw), lift: f.lift * (1 - sw) } : fl(f));
    const low = this.free ? THREE.MathUtils.lerp(crouch - 0.045, this.hipH - (this.seat?.h ?? 0) - SIT_HIP + this.pos.y, sw) : crouch + (k ? this.lungeDrop ?? 0 : 0);
    const { rk, face } = this.rig.pose(K, K, 0, { Left: foot(this.feet.Left), Right: foot(this.feet.Right), crouch: low, dt });
    this.rig.placeRacket(rk, face);
    this.sweetPrev = this.sweetNow ?? null; this.sweetNow = this.rig.sweet(); // центр струн в начале и в конце кадра — для касания

    if (st && !st.contacted && now >= st.tContact) { // кадр, внутри которого момент удара: касание ищем по всему кадру
      st.contacted = true; this.onContact?.(this, st);
      // Дальний выпад (до 45 см) после удара уносит тело в ту сторону: скорость 6×выпад, скольжение, восстановление 0,2–0,4 с.
      const L = this.lunge.length();
      if (L > 0.12 && st.reach?.lunge > 0) { this.vel.addScaledVector(this.lunge, 6 * Math.min(1, 0.45 / L)); this.carryUntil = now + 0.4; this.recoverUntil = now + 0.2 + 0.45 * Math.min(L, 0.45); }
    }
  }

  // Поза без удара: стойка; на рывке всё тело развёрнуто по ходу, руки работают в такт ногам.
  // Голова поворачивается вместе с телом и следит за мячом (не больше 55° от корпуса), корпус наклоняется по ускорению:
  // вперёд на разгоне, назад на торможении, внутрь на повороте.
  loco(now, speed, run) {
    // Руки в такт ногам: какая ступня впереди по ходу, та рука сзади (правая нога вперёд — левая рука вперёд).
    const lead = this.vel.lengthSq() > 0.01 ? this.feet.Right.pos.clone().sub(this.feet.Left.pos).dot(this.vel) / this.vel.length() : 0;
    // Руки ходят плавно, почти синусом: раньше мах упирался в предел и стоял 3–4 кадра, потом перекидывался за 2 кадра.
    const dt = Math.min(0.05, now - (this.locoAt ?? now)); this.locoAt = now;
    this.pumpS = (this.pumpS ?? 0) + (Math.sin(clamp(lead / 0.8, -1, 1) * Math.PI / 2) * run - (this.pumpS ?? 0)) * (1 - Math.exp(-dt / 0.05));
    const pump = this.pumpS;
    const dirRig = this.vel.clone().applyQuaternion(this.rig.toPlayer).setY(0);
    if (dirRig.lengthSq() > 1e-4) dirRig.normalize();
    const arm = (base, k) => base.clone().addScaledVector(dirRig, k).normalize();
    const facing = this.netYaw + this.bodyTurn;
    let want = 0;
    if (this.ballPos) want = clamp(wrapAngle(Math.atan2(this.ballPos.x - this.pos.x, this.ballPos.z - this.pos.z) - facing), -0.96, 0.96);
    this.headYaw += (want - this.headYaw) * Math.min(1, 0.12);
    const bodyFwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)), bodyRight = this.right.clone().applyAxisAngle(UP, this.bodyTurn);
    const aFwd = this.acc.dot(bodyFwd), aSide = this.acc.dot(bodyRight);
    // Наклоны по ускорению сглажены (~0,1 с): корпус тяжёлый, на смене разгона и торможения он не перекидывается за 2 кадра.
    const kl = 1 - Math.exp(-dt / 0.1);
    this.leanS = (this.leanS ?? 12) + (clamp(12 + 3 * run + 6 * this.sliding + aFwd * 0.9, -2, 24) - (this.leanS ?? 12)) * kl;
    this.tiltS = (this.tiltS ?? 0) + (clamp(aSide * 0.8, -9, 9) - (this.tiltS ?? 0)) * kl;
    // На бегу руки согнуты под прямым углом и ходят вперёд-назад в такт ногам, левая отпускает ракетку,
    // правая несёт её головкой вверх-вперёд. В осях скелета правая сторона в −X.
    const R3 = (x, y, z) => new THREE.Vector3(-x, y, z).normalize();
    const runUp = (sx, p) => R3(0.18 * sx, -0.95, 0.75 * p), runFo = (sx, p) => R3(-0.15 * sx, 0.25 + 0.45 * p, 0.95 - 0.25 * Math.max(0, -p));
    const blend = (a, b) => a.clone().lerp(b, run).normalize();
    return this.body(now, speed, { ...READY, hips: 0, torso: 0, look: THREE.MathUtils.radToDeg(this.headYaw), lh: 1 - 2 * smooth(speed, 1.5, 3), // меньше нуля — левая не берётся за ракетку, даже если рядом
      lean: this.leanS, tilt: this.tiltS,
      rUp: blend(arm(READY.rUp, -0.7 * pump), runUp(1, -0.6 * pump)), lUp: blend(arm(READY.lUp, 0.7 * pump), runUp(-1, pump)),
      rFo: blend(READY.rFo, runFo(1, -0.6 * pump)), lFo: blend(READY.lFo, runFo(-1, pump)),
      rk: READY.rk.clone().lerp(new THREE.Vector3(0, 0.5, 0).addScaledVector(dirRig, 0.85), run * 0.6).normalize() }); // ракетка на бегу головкой вперёд, не у лица
  }

  // Между очками: после виннера короткий кулак, после своей ошибки голова и плечи вниз, без сил (выносливость < 0,4) —
  // руки на коленях и тяжёлое дыхание. Идёт — поза гаснет. slump — насколько присел (crouch в update).
  body(now, speed, K) {
    this.slump = 0;
    if (!this.idle) return K;
    const calm = 1 - smooth(speed, 0.4, 1.4), u = now - (this.gest?.t0 ?? now - 9), k = this.gest?.k;
    const wg = k === 'fist' ? smooth(u, 0.1, 0.3) * (1 - smooth(u, 0.75, 1.05)) : k === 'down' ? smooth(u, 0.2, 0.55) * (1 - smooth(u, 1.4, 1.8)) : 0;
    const wt = (1 - smooth(this.stamina, 0.3, 0.4)) * smooth(u, 0.4, 1.0) * (1 - wg) * calm;
    if (wt > 0) { K = mix(K, { ...K, ...TIRED, lean: TIRED.lean + 3 * Math.sin(now * 5.5) }, wt); this.slump = wt; } // ~0,9 вдоха в секунду
    return wg > 0 ? mix(K, { ...K, ...(k === 'fist' ? FIST : DOWN) }, wg * calm) : K;
  }

  // Где центр струн в момент удара: замер по позе, чтобы ИИ вставал под мяч точно (у разных моделей разные руки).
  measure() {
    const out = {}, rig = (v) => new THREE.Vector3(-v.dot(this.right), v.y, v.dot(this.fwd)); // в осях скелета
    this.contactPt = {};
    for (const t of Object.keys(STROKES)) {
      const K = strokeAt(STROKES[t], 0); // та же поза, что в игре при касании (с кинетической цепью)
      const r = this.rig.pose(K, K, 0, { Left: this.feet.Left, Right: this.feet.Right, crouch: 0.07 });
      this.rig.placeRacket(r.rk, r.face);
      const s = this.rig.sweet().sub(this.pos), sh = this.rig.b.RightArm.getWorldPosition(new THREE.Vector3()).sub(this.pos);
      this.contactPt[t] = { s: rig(s), sh: rig(sh) };
      out[t] = { right: +s.dot(this.right).toFixed(3), ahead: +s.dot(this.fwd).toFixed(3), y: +s.y.toFixed(3) };
    }
    this.reach.LATERAL = { fh: out.fh.right, bh: out.bh.right, oh: out.oh.right };
    this.reach.AHEAD = (out.fh.ahead + out.bh.ahead) / 2;
    this.reach.AHEAD_V = (out.vfh.ahead + out.vbh.ahead) / 2;
    this.reach.Y = { fh: out.fh.y, bh: out.bh.y, oh: out.oh.y };
    return out;
  }

  // ---------- Прогулка по клубу и скамейка (club.js) ----------
  // Свободный ход вместо половины корта: шаг ~1,4 м/с, длина move больше 1 — быстрее (бег по Shift до ~3,4 м/с).
  // Забор, сетку и предметы держит this.bounds(pos) (выталкивает тело), высоту настила даёт this.ground(x, z).
  // На скамейке (seat) таз едет от места перед ней к сиденью по seat.w (0..1, up — встаёт), ступни не шагают.
  walkMove(dt, move) {
    const s = this.seat;
    if (s) {
      s.w = clamp(s.w + (s.up ? -dt : dt) / 0.9, 0, 1);
      this.pos.lerpVectors(s.from, s.at, smooth(s.w, 0, 1)); this.vel.set(0, 0, 0);
      const r = this.right.clone().applyAxisAngle(UP, this.bodyTurn);
      for (const f of Object.values(this.feet)) { f.step = null; f.lift = 0; f.pos.copy(this.pos).addScaledVector(r, f.sign * STANCE * 0.5); }
      if (s.up && s.w === 0) this.seat = null;
    } else {
      const want = move.clone().setY(0).multiplyScalar(1.4), prev = this.pos.clone();
      const rate = (want.lengthSq() < this.vel.lengthSq() ? 9 : 5) * dt, dv = want.sub(this.vel); // тормозит быстрее, чем разгоняется
      if (dv.length() > rate) dv.setLength(rate);
      this.vel.add(dv); this.pos.addScaledVector(this.vel, dt);
      if (this.bounds?.(this.pos)) this.vel.subVectors(this.pos, prev).divideScalar(dt).setY(0); // упёрся — скользит вдоль
      const gy = this.ground?.(this.pos.x, this.pos.z) ?? 0; this.pos.y = Math.abs(gy - this.pos.y) < 1e-3 ? gy : this.pos.y + (gy - this.pos.y) * Math.min(1, dt * 12); // на настил террасы
    }
    this.wrap.position.copy(this.pos);
  }
  sitW() { return this.seat ? smooth(this.seat.w, 0, 1) : 0; }
  // Поза на прогулке: шаг (WALK), руки ходят в такт ногам; от ~2,5 м/с руки согнуты, как на беге (loco).
  // Сидя — поза SIT, голова следит за мячом.
  stroll(now, speed) {
    this.slump = 0; // без сил не приседает (body() не зовётся): иначе crouch в update — NaN у замены, ещё не бегавшей
    const dirRig = this.vel.clone().applyQuaternion(this.rig.toPlayer).setY(0);
    if (dirRig.lengthSq() > 1e-4) dirRig.normalize();
    const lead = speed > 0.1 ? this.feet.Right.pos.clone().sub(this.feet.Left.pos).dot(this.vel) / speed : 0;
    const p = clamp(lead / 0.6, -1, 1) * smooth(speed, 0.2, 0.9), jog = smooth(speed, 2, 3.2);
    const swing = (b, k) => b.clone().addScaledVector(dirRig, k).normalize(); // правая нога впереди — левая рука вперёд
    let K = { ...WALK, rUp: swing(WALK.rUp, -0.35 * p), lUp: swing(WALK.lUp, 0.35 * p), rFo: swing(WALK.rFo, -0.2 * p), lFo: swing(WALK.lFo, 0.25 * p) };
    if (jog > 0) K = mix(K, this.loco(now, speed, 1), jog * 0.8);
    const w = this.sitW();
    if (w > 0) {
      let look = 0;
      if (this.ballPos) look = clamp(wrapAngle(Math.atan2(this.ballPos.x - this.pos.x, this.ballPos.z - this.pos.z) - this.netYaw - this.bodyTurn), -1.3, 1.3);
      this.headYaw += (look - this.headYaw) * 0.08;
      K = mix(K, { ...SIT, look: THREE.MathUtils.radToDeg(this.headYaw) }, w);
    }
    return K;
  }
}
