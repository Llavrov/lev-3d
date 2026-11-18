// Розыгрыш: подача, удары, отскоки, аут, сетка, двойной отскок, теннисный счёт и соперник с ИИ.
import * as THREE from 'three';
import { makeBall, copyBall, step, solveShot, solveLob, inSingles, distToSegment, BALL_R } from './physics.js';
import { PREP } from './swing.js';
import { MOVE, HIT_R, powerOf } from './player.js';

const CALL = ['0', '15', '30', '40'];
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = (v) => +v.toFixed(2);
const clamp = THREE.MathUtils.clamp;
// Сила соперника 0,35–1,35. До 1 — обычный соперник; выше — «босс»: раньше реагирует, быстрее, без ошибок, агрессивнее.
const MAX_SKILL = 1.35;

export class Game {
  constructor({ lev, opp, ballMesh, hud, sound, aimLev, log = () => {}, marks = null, dust = null }) {
    Object.assign(this, { lev, opp, ballMesh, hud, sound, aimLev, log, marks, dust });
    this.b = makeBall();
    this.prev = new THREE.Vector3();
    this.pts = new Map([[lev, 0], [opp, 0]]);
    this.games = new Map([[lev, 0], [opp, 0]]);
    this.server = lev;
    this.hook(lev); this.hook(opp);
    this.ai = new AI(opp, this);
    this.autoLev = null; // ?auto: Лёвой тоже играет ИИ (для проверки)
    this.rally = 0;
  }
  // Удар, шаги, упор и скольжение игрока — в розыгрыш, звук, пыль и следы.
  hook(p) {
    p.onContact = (p, st) => this.contact(p, st);
    p.onStep = (f) => {
      this.sound.step({ vol: (p === this.lev ? 1 : 0.25) * Math.min(1, 0.4 + p.vel.length() / 4), pan: this.pan(f.pos.x) });
      if (p.vel.length() > 3) this.dust?.puff(f.pos, p.vel, 1, 0.2); // крошка из-под ног на рывке
    };
    p.onPlant = (p, k) => { // встал к удару с бега: упор ногами, грунт из-под обеих ступней
      this.log('plant', { who: this.who(p), k: r2(k) });
      this.sound.plant?.({ vol: (p === this.lev ? 1 : 0.3) * (0.4 + 0.6 * k), pan: this.pan(p.pos.x) });
      for (const f of Object.values(p.feet)) this.dust?.puff(f.pos, p.vel, 2 + Math.round(3 * k), 0.2 + 0.4 * k);
    };
    let last = 0;
    p.onSlide = (a, b) => { this.marks?.slide(a, b); if (this.now - last > 0.05) { last = this.now; this.dust?.puff(b, p.vel, 2, 0.5); } };
  }
  // Замена на месте Лёвы (club.js): p получает его счёт, подачу и колбэки; auto — за него играет ИИ.
  // Обратно — swapLev(лёва). Старый игрок отцеплен от розыгрыша и дальше живёт сам (гуляет по клубу).
  swapLev(p, auto = !p.human) {
    const old = this.lev;
    if (p !== old) {
      for (const m of [this.pts, this.games]) { m.set(p, m.get(old)); m.delete(old); }
      if (this.server === old) this.server = p;
      old.onContact = old.onStep = old.onPlant = old.onSlide = null;
      this.lev = p; this.hook(p);
    }
    this.autoLev = auto ? new AI(p, this) : null;
  }
  other(p) { return p === this.lev ? this.opp : this.lev; }
  who(p) { return p === this.lev ? 'lev' : 'opp'; }

  // second — вторая подача после ошибки на первой: тот же подающий, счёт не меняется.
  resetPoint(now, second = false) {
    if (!second) { this.serveNo = 1; this.ai.newPoint(); }
    for (const p of [this.lev, this.opp]) p.place(p.home.clone().add(new THREE.Vector3(p === this.server ? 0.5 * p.side : -0.3 * p.side, 0, 0)));
    this.b.live = false;
    this.ballMesh.visible = false;
    this.state = 'serve';
    this.lastHitter = null;
    this.serving = null;
    this.rally = 0;
    this.serveAt = this.server === this.opp || this.autoLev ? now + (second ? 0.9 : 1.3) : null;
    this.hud.score(this);
    this.hud.hint(this.server === this.lev && !this.autoLev ? this.hud.serveHint : '');
  }

  // Подача снизу: подброс к правой руке, удар форхендом, мяч в любую точку половины соперника.
  serve(p, now) {
    if (this.state !== 'serve' || p !== this.server) return;
    this.state = 'rally';
    this.hud.hint('');
    const T = 0.42;
    p.press('fh', now, null, now + T);
    const at = p.pos.clone().addScaledVector(p.right, p.reach.LATERAL.fh).addScaledVector(p.fwd, p.reach.AHEAD).setY(p.reach.Y.fh);
    this.b.pos.copy(at).y += 0.5 * 9.81 * T * T;
    this.b.vel.set(0, 0, 0); this.b.spin = 0; this.b.live = true; this.b.bounces = 0;
    this.serving = p;
    this.log('serve', { who: this.who(p), n: this.serveNo });
  }

  // Куда и как полетит удар без случайной ошибки: им пользуется и сам удар, и подсказка направления у Лёвы.
  // power — сила удержанием: до +20% скорости и вращения. Свеча — укороченный с W (L+W) у Лёвы или выбор соперника:
  // lob 0..1 — чем лучше, тем выше и глубже (плохая — низкая и короткая, под смэш).
  shotFor(p, st, q = 1, power = 0) {
    const top = st.type.endsWith('top'), oh = st.type === 'oh', cut = st.type.endsWith('slice'), v = st.type.startsWith('v');
    const target = p === this.lev && !this.autoLev ? this.aimLev(st) : this.ai.aim(p, st);
    const lob = st.aiLob ?? (st.drop && p === this.lev && target.z * p.side < -10 ? clamp((q - 0.55) / 0.4, 0, 1) : null);
    if (lob != null) { target.set(target.x * 0.6, 0, -p.side * (8.6 + 2.2 * lob)); return { target, speed: 0, spin: p.human ? -60 : 80, lob, kind: 'lob' }; }
    const angle = Math.abs(target.x) > 3.6 && Math.abs(target.z) < 7; // острый короткий угол к боковой
    if (st.drop) target.z = -p.side * 3;
    const k = (1 + 0.2 * power) * (p.powerScale ?? 1), second = this.serving && this.serveNo === 2; // powerScale — сила и ракетка (profile.js)
    let speed = (top ? 25.5 : oh ? 31 : cut ? 21 : 27.5) * (0.82 + 0.18 * q) * (this.serving ? (p.human ? 0.75 : second ? 0.62 : 0.85) : 1) * k;
    let spin = (second ? 220 : top ? 260 : oh ? 30 : cut ? -260 : 50) * k; // вторая подача — крученая, надёжная; резаный плывёт и стелется
    if (st.drop) { speed = 12 + 2 * q; spin = -170; } // укороченный: медленно, с подрезкой, мяч зависает и гаснет, но добежать можно
    if (v) { speed = 19 * (0.8 + 0.2 * q) * k; spin = -60; if (p.human) target.z *= 0.75; } // с лёта: короткий толчок с лёгкой подрезкой, у Лёвы — коротко в угол
    if (st.aiKind === 'feet') { speed *= 0.78; spin = 260; } // в ноги: медленнее и с кручением — ныряет за сеткой
    const kind = st.aiKind ?? (st.drop ? 'drop' : angle ? 'angle' : v ? 'volley' : oh ? 'smash' : power > 0.5 ? 'power' : 'base');
    return { target, speed, spin, lob: null, angle, kind };
  }

  // Момент удара: ракетка дотянулась до мяча (мяч прошёл через голову ракетки) — удар, иначе промах.
  // Мяч летит от того места, где его встретила ракетка. Качество — центр струн, вовремя ли нажал и не на бегу ли.
  contact(p, st) {
    const b = this.b;
    if (!b.live || this.state !== 'rally' || this.lastHitter === p) return;
    if (this.serving && this.serving !== p) return;
    if (!this.serving && Math.sign(b.pos.z) !== p.side) return;
    const sweet = p.rig.sweet();
    // Двигаются и мяч, и ракетка: ищем самое близкое их сближение за кадр (начало кадра → конец), иначе на 30–60 кадрах
    // ракетка за кадр пролетает 20–40 см и попадание зависело бы от того, в какую долю кадра пришёлся удар.
    const d = this.serving ? 0 : distToSegment(new THREE.Vector3(), this.prev.clone().sub(p.sweetPrev ?? sweet), b.pos.clone().sub(sweet));
    const lead = st.tContact - st.tPress, run = p.vel.length();
    const off = b.pos.clone().sub(sweet);
    const power = p.human && !this.serving ? powerOf(st, this.now) : 0;
    // Выносливость: длинный выпад и защитный резаный, сильный удар (у соперника — атака с темпом) тратят силы, даже если мимо.
    if (!this.serving) p.stamina = Math.max(0, p.stamina - ((st.reach?.lunge ?? 0) > 0.3 || st.defend ? 0.025 : 0) - 0.03 * power - (st.aiPace ? 0.015 : 0));
    if (!this.serving) this.log('contact', { who: this.who(p), stroke: st.type, drop: !!st.drop, d: r2(d), hit: d <= HIT_R, lead: r2(lead), side: r2(off.dot(p.right)), high: r2(off.y), deep: r2(off.dot(p.fwd)), ballY: r2(b.pos.y), pos: [r2(p.pos.x), r2(p.pos.z)], speed: r2(run), turn: r2(st.reach?.ang ?? 0), radial: r2(st.reach?.radial ?? 0), lunge: r2(p.lunge.length()), power: r2(power) });
    // Не дотянулся: мяч пролетел мимо ракетки. Босс достаёт до +25% дальше.
    // shortcut: босс промахивался (попадания 0,83–0,9) из-за предела поворота руки — честнее чинить выход к мячу в plan().
    if (d > HIT_R * (p.human ? 1 : 1 + 0.25 * this.ai.boss)) return;
    const timing = p.human && !this.serving ? clamp(1 - Math.max(0, Math.abs(lead - 0.55) - 0.3) / 0.6, 0.4, 1) : 1;
    let q = 0.5 * Math.min(1, (1 - d / HIT_R) * 1.4) + 0.5 * timing;
    q *= 1 - clamp((run - 1.2) / 4, 0, 0.35); // на бегу удар слабее и кривее
    let err = (1 - q) * 3, pace = 1, miss = false;
    const up = Math.max(0, p.mood), down = Math.max(0, -p.mood);
    if (!p.human) { // соперник: ошибается чаще, когда растянут; сильный (skill) точнее. Невынужденные ошибки редкие
      const s = Math.min(this.ai.sk, 1), boss = this.ai.boss, ran = Math.max(0, this.ai.ran - 2.2), stretch = clamp(ran / 3, 0, 1) * (1 - 0.5 * boss);
      // Кураж (hot) — почти без ошибок; на брейк-поинте и геймболе собраннее; низкий настрой — ошибки под давлением.
      const focus = this.ai.hot ? 0.6 : this.clutch() ? 0.7 : 1;
      // Разброс 0,2 + 1,2·(1 − s): на 0,7 как раньше, по краям шире — сильный честно сильный, слабый слабый.
      // Выше 1 (boss 0..1) — почти без невынужденных: разброс до 8 см, грубых ошибок нет, растянутым ошибается вдвое реже.
      err += (this.serving ? (this.serveNo === 2 ? 0 : 1.0 + 0.6 * (1 - s) - 0.3 * boss) : 0.2 + 1.2 * (1 - s) - 0.12 * boss + 0.5 * stretch + (Math.random() < 0.05 * (1.3 - s) * (1 - boss) ? 2.2 : 0) + 0.8 * down * stretch) * focus;
      if (st.aiPace) err *= 1 - 0.3 * up;
      pace = Math.max(0.6, 0.97 + 0.1 * boss - ran * 0.06 - (1 - s) * 0.15); // босс бьёт до 7% быстрее
      q = Math.min(q, 0.9);
      miss = !this.serving && Math.random() < ((0.005 + 0.045 * (1 - s)) * (1 - 0.8 * boss) + 0.06 * stretch + 0.04 * down * stretch) * focus;
    } else if (!this.serving) err += 0.5 * down * Math.max(clamp((run - 1) / 3, 0, 1), power); // низкий настрой: под давлением чаще мимо
    // Сила (удержание): стоя, центром струн и вовремя — точно; на бегу, краем или поздно — разброс растёт с силой.
    // «На бегу» — и в момент удара, и пока копил силу (не успел встать): st.vmax — быстрее всего с нажатия.
    // Усталость — до +50% разброса, высокий настрой — точнее.
    if (power) err += power * (1.0 + 2.5 * (d / HIT_R) + 2 * (1 - timing) / 0.6 + 3 * clamp((Math.max(run, 0.6 * (st.vmax ?? 0)) - 1) / 3, 0, 1)) * (1 + 0.5 * p.tired) * (1 - 0.35 * up);
    const shot = this.shotFor(p, st, q, power), { target } = shot, aim = target.clone();
    if (st.drop && shot.lob == null) { target.z = -p.side * rnd(2.2, 3.8); err *= 0.5; }
    if (shot.angle) err = (err + 0.35) * (shot.spin > 150 ? 0.6 : shot.spin < -150 ? 1.4 : 1); // острый угол у самой боковой: кручёный ныряет в корт, плоский и резаный рискуют
    err *= p.errScale ?? 1; // техника, усталость и контроль ракетки (profile.js)
    target.x += rnd(-1, 1) * err; target.z += rnd(-1, 1) * err * 0.7;
    if (miss && shot.lob == null && !st.drop) { if (Math.random() < 0.5) target.x = Math.sign(target.x || 1) * rnd(4.4, 5.2); else target.z = -p.side * rnd(12.2, 13); }
    const speed = shot.speed * pace * (st.aiPace ?? 1), served = this.serving ? this.serveNo : 0;
    if (this.serving) b.pos.copy(sweet); // подброс встречаем в центр струн
    b.vel.copy(shot.lob != null ? solveLob(b.pos, target, 0.47 + 0.16 * shot.lob, shot.spin) : solveShot(b.pos, target, speed, shot.spin));
    b.spin = shot.spin;
    this.lastHitter = p; this.bounces = 0; this.b.bounces = 0; this.serving = null;
    if (p === this.lev) { this.ai.readDrop = !!st.drop && shot.lob == null; this.ai.levShort = false; } // укороченный видно по замаху: соперник срывается раньше
    else if (!served) this.ai.afterShot(st, shot, aim);
    this.log('shot', { who: this.who(p), stroke: st.type, kind: shot.kind, drop: !!st.drop && shot.lob == null, lob: shot.lob != null ? r2(shot.lob) : null, power: r2(power), serve: served, speed: r2(b.vel.length()), spin: r2(shot.spin), aim: [r2(aim.x), r2(aim.z)], target: [r2(target.x), r2(target.z)], opp: [r2(this.opp.pos.x), r2(this.opp.pos.z)], lev: [r2(this.lev.pos.x), r2(this.lev.pos.z)], net: this.ai.net });
    if (p === this.lev) this.lastShot = { stroke: st.type, drop: !!st.drop && shot.lob == null, power, kind: shot.kind };
    this.landing = null;
    if (p === this.opp) this.markLanding();
    this.rally++;
    this.ballMesh.visible = true;
    this.sound.hit({ q, vol: p === this.lev ? 1 : 0.4, pan: this.pan(sweet.x), spin: shot.spin, power });
    this.onShot?.(p, power, sweet);
  }

  // Где мяч, летящий к Лёве, отскочит на его половине — для метки на корте.
  markLanding() {
    const c = copyBall(this.b);
    this.landing = null;
    for (let i = 0, t = 0; i < 500; i++) { const ev = step(c, 1 / 120); t += 1 / 120; if (ev?.type === 'net') break; if (ev?.type === 'bounce') { this.landing = { pos: ev.pos, t: this.now + t, t0: this.now }; break; } }
  }

  // Панорама звука: где на корте относительно камеры (она стоит за Лёвой и смещается на треть его хода).
  pan(x) { return (x - this.lev.pos.x * 0.35) / 5; }

  bounce(pos) {
    this.marks?.ball(pos, this.b.vel.clone().setY(0).normalize());
    this.dust?.puff(pos, this.b.vel, 3, 0.3);
    this.sound.bounce({ vol: pos.z > 0 ? 0.9 : 0.35, pan: this.pan(pos.x) });
    if (this.state !== 'rally') return;
    const h = this.lastHitter;
    if (!h) return this.point(this.other(this.server), 'Мимо мяча');
    const side = pos.z > 0 ? 1 : -1;
    this.bounces++;
    this.b.bounces = this.bounces;
    if (this.drill) return this.drill.bounce(pos, h, this.bounces); // тренировка: свои правила (practice.js)
    if (this.bounces === 1) {
      this.log('bounce', { by: this.who(h), at: [r2(pos.x), r2(pos.z)], in: side !== h.side && inSingles(pos) });
      if (h === this.lev) this.ai.levShort = Math.abs(pos.z) < 7.2 + 1.5 * this.ai.boss && side !== h.side; // короткий мяч Лёвы — соперник атакует; босс — и средний
      if (side === h.side) return this.lose(h, 'Не перелетел');
      if (!inSingles(pos)) return this.lose(h, 'Аут');
    } else return this.point(h, h === this.lev ? 'Виннер' : 'Не достал');
  }

  // h проиграл розыгрыш. Первая подача в аут или в сетку — ошибка и вторая подача; вторая — двойная.
  lose(h, why) {
    if (this.drill) return this.drill.miss(why);
    if (this.rally === 1 && h === this.server && this.serveNo === 1) {
      this.state = 'fault'; this.nextAt = this.now + 1.1; this.serveNo = 2;
      this.log('fault', { who: this.who(h), why }); this.hud.flash('Вторая подача', false);
      return;
    }
    this.point(this.other(h), this.rally === 1 && h === this.server ? 'Двойная' : why);
  }

  point(w, why) {
    if (this.drill) return this.drill.miss(why);
    if (this.state === 'over') return;
    this.state = 'over';
    this.nextAt = this.now + 1.8;
    const l = this.other(w), ai = this.ai;
    this.pts.set(w, this.pts.get(w) + 1);
    // Сложность подстраивается симметрично (равновесие около 50% очков), плюс чуть сильнее, когда Лёва ведёт в геймах:
    // матч держится близким. Раньше −0,07 за очко соперника против +0,04 — он слабел, пока Лёва не брал ~64%.
    const lead = clamp(this.games.get(this.lev) - this.games.get(this.opp), -3, 3);
    ai.skill = clamp(ai.skill + (w === this.lev ? 0.04 : -0.04) + 0.006 * lead, 0.35, MAX_SKILL);
    // Кураж: три очка подряд — следующие 2–3 он играет сильнее и почти без ошибок.
    ai.streak = w === this.opp ? ai.streak + 1 : 0;
    if (ai.hot) { ai.hot--; ai.streak = 0; } // очки на кураже в новую серию не идут: кураж не тянется цепочкой
    // Уже ведёт на 2 гейма — кураж не нужен, иначе матч уходит в разгром.
    else if (ai.streak >= 3 && lead > -2) { ai.hot = Math.random() < 0.5 ? 2 : 3; ai.streak = 0; this.log('hot', { n: ai.hot }); }
    // Настрой: виннер и выигранное очко поднимают, своя ошибка роняет. Язык тела — кулак, голова вниз (player.gesture).
    const winner = why === 'Виннер' || why === 'Не достал', error = ['Аут', 'Сетка', 'Не перелетел', 'Двойная', 'Мимо мяча'].includes(why);
    w.mood = clamp(w.mood + (winner ? 0.35 : 0.15), -1, 1); l.mood = clamp(l.mood - (error ? 0.3 : 0.1), -1, 1);
    w.gest = { k: winner ? 'fist' : null, t0: this.now }; l.gest = { k: error ? 'down' : null, t0: this.now };
    let gameText = '';
    if (this.pts.get(w) >= 4 && this.pts.get(w) - this.pts.get(l) >= 2) {
      this.games.set(w, this.games.get(w) + 1);
      this.pts.set(w, 0); this.pts.set(l, 0);
      this.server = this.other(this.server);
      gameText = w === this.lev ? 'Гейм Лёвы' : 'Гейм соперника';
      if ((this.games.get(w) + this.games.get(l)) % 2) for (const p of [w, l]) p.stamina = Math.min(1, p.stamina + 0.35); // смена сторон: передышка
    }
    const P = [this.lev, this.opp];
    this.log('point', { winner: this.who(w), why, rally: this.rally, skill: r2(ai.skill), hot: ai.hot, sta: P.map((p) => r2(p.stamina)), mood: P.map((p) => r2(p.mood)), score: [this.pts.get(this.lev), this.pts.get(this.opp)], games: [this.games.get(this.lev), this.games.get(this.opp)] });
    this.hud.score(this);
    this.hud.flash(gameText || why, w === this.lev);
  }

  // Соперник в шаге от гейма: брейк-поинт на подаче Лёвы или геймбол на своей.
  clutch() { const o = this.pts.get(this.opp); return o >= 3 && o > this.pts.get(this.lev); }

  call() {
    const a = this.pts.get(this.lev), b = this.pts.get(this.opp);
    if (a >= 3 && b >= 3) return a === b ? ['Ровно', ''] : a > b ? ['Больше', ''] : ['', 'Больше'];
    return [CALL[a], CALL[b]];
  }

  update(dt, now, levMove) {
    this.now = now;
    // Лёва ушёл с корта, замена ещё идёт к задней линии (club.js ведёт её сам): розыгрыша нет, соперник ждёт на месте.
    if (this.state === 'away') { this.opp.idle = true; this.opp.update(dt, now, new THREE.Vector3(), this.b); return; }
    if (this.state === 'serve' && this.serveAt && now >= this.serveAt) { this.serveAt = null; this.serve(this.server, now); }
    if (this.state === 'over' && now >= this.nextAt) this.resetPoint(now);
    if (this.state === 'fault' && now >= this.nextAt) this.resetPoint(now, true);
    const b = this.b;
    this.prev.copy(b.pos);
    if (b.live) {
      for (let i = 0; i < 4; i++) {
        const ev = step(b, dt / 4);
        this.drill?.afterStep(b);
        if (ev?.type === 'bounce') this.bounce(ev.pos);
        if (ev?.type === 'cord') this.sound.net({ pan: this.pan(b.pos.x) }); // задел трос и перевалился — играем дальше
        if (ev?.type === 'net') { this.sound.net({ pan: this.pan(b.pos.x) }); if (this.state === 'rally') this.lose(this.lastHitter ?? this.server, 'Сетка'); }
      }
      // Остановился или улетел за ограждение — мяч больше не играет (иначе за полем он катался бы и стучал).
      if ((b.vel.lengthSq() < 0.05 && b.pos.y < 0.05) || Math.abs(b.pos.z) > 19.5 || Math.abs(b.pos.x) > 9) {
        b.live = false;
        // Улетел за ограждение по ходу розыгрыша: до отскока — аут бившего, после отскока — соперник не достал.
        if (this.state === 'rally' && this.lastHitter) this.bounces ? this.point(this.lastHitter, 'Не достал') : this.lose(this.lastHitter, 'Аут');
        else this.ballMesh.visible = false;
      }
    }
    // Сплит-степ: приземлиться к удару соперника.
    if (this.state === 'rally') for (const p of [this.lev, this.opp]) {
      const o = this.other(p), st = o.stroke;
      if (st && st.committed && !st.splitSent && now >= st.tContact - 0.24) { st.splitSent = true; p.splitStep(now); }
    }
    // Свист ракетки перед ударом, шорох скольжения.
    for (const p of [this.lev, this.opp]) {
      const st = p.stroke;
      if (st && !st.whoosh && st.committed && now >= st.tContact - 0.14) { st.whoosh = true; this.sound.whoosh({ vol: p === this.lev ? 1 : 0.3, pan: this.pan(p.pos.x) }); }
    }
    this.sound.slide(this.lev.sliding * Math.min(1, this.lev.vel.length() / 4));
    // Выносливость: рывок быстрее 4 м/с тратит пропорционально скорости, долгий розыгрыш (больше 6 ударов) — понемногу;
    // шагом и стоя восстанавливается медленно, между очками быстрее. Настрой между очками тянется к нулю.
    const live = this.state === 'rally';
    for (const p of [this.lev, this.opp]) {
      const v = p.vel.length();
      p.stamina = clamp(p.stamina + (v > 4 ? -0.0065 * v : live ? (v < 2 ? 0.02 : 0) : 0.1) * dt - (live && this.rally > 6 ? 0.006 * dt : 0), 0, 1);
      p.idle = !live;
      if (!live) p.mood *= 1 - 0.12 * dt;
    }
    this.hud.stamina?.(this);
    const levInput = this.autoLev ? this.autoLev.update(now) : levMove;
    this.lev.update(dt, now, levInput, b);
    if (this.drill) this.drill.update(now); // тренировка: соперника нет, мячи подаёт мячемёт или отдаёт стенка
    else this.opp.update(dt, now, this.ai.update(now), b);
    // Мяч задел тело, а не ракетку: очко тому, кто бил, как в теннисе. Мяч отскакивает от тела.
    if (b.live && this.state === 'rally' && this.lastHitter && !this.serving) {
      const p = this.other(this.lastHitter);
      // Очко отдаём, только если мяч шёл в самого игрока (в стойку у его места), а не задел вытянутую в выпаде ногу:
      // выпад и шаг в удар делает игра, а не он.
      // Очко — только за прямое попадание в торс или голову: мяч у ног Лёва (17.11) честным «в тебя» не считал.
      const part = Math.abs(b.pos.z - p.pos.z) < 1.2 && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 0.3 && p.bodyHit(b.pos, BALL_R);
      if (part === 'torso' || part === 'head') {
        // axis — мяч от оси стойки (без выпада): честно ли «в тебя»; lunge — насколько выпад сдвинул тело
        this.log('body', { who: this.who(p), part, at: b.pos.toArray().map(r2), stroke: p.stroke?.type ?? null, swung: !!p.stroke?.contacted, axis: r2(Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z)), lunge: r2(p.lunge.length()), speed: r2(p.vel.length()) });
        b.vel.set(b.vel.x * 0.2, Math.abs(b.vel.y) * 0.2 + 1, -b.vel.z * 0.25);
        this.point(this.lastHitter, p === this.lev ? 'Мяч в тебя' : 'Попал в соперника');
      }
    }
    this.ballMesh.position.copy(b.pos).y += BALL_R * 0.7; // мяч нарисован в 1,7 раза крупнее: не утапливаем его в грунт
    this.ballMesh.rotation.x -= b.spin * dt * 0.05;
    this.dust?.update(dt);
    this.marks?.update();
  }
}

// Соперник: читает полёт мяча и после реакции бежит под удар; бьёт с умом по тому, где Лёва: в открытый корт,
// обводка или свеча, когда Лёва у сетки, укороченный, когда тот далеко за линией, атака и выход к сетке на короткий мяч.
// Между ударами встаёт на биссектрису углов Лёвы. skill 0.3–1: скорость, реакция, точность, чтение укороченного.
export class AI {
  constructor(p, game) {
    this.p = p; this.game = game;
    this.target = p.home.clone();
    this.next = 0; this.planned = null; this.reactAt = 0;
    this.skill = 0.7;
    this.streak = 0; this.hot = 0; // очков подряд и сколько ещё очков на кураже
    this.ran = 0; this.slack = 0; // сколько пришлось бежать к последнему мячу, м, и запас времени, с
    this.newPoint();
  }
  get sk() { return Math.min(MAX_SKILL, this.skill + (this.hot ? 0.1 : 0)); } // сила с куражом
  get boss() { return clamp((this.sk - 1) / (MAX_SKILL - 1), 0, 1); } // сколько он выше 1: «босс» 0..1
  newPoint() { this.net = false; this.netTried = false; this.reads = false; this.readFor = null; this.levShort = false; this.ran = 0; } // ran — иначе «растянут» с прошлого розыгрыша сужал подачу

  // Куда встать между ударами: на биссектрису углов, куда Лёва может ударить (по линии — в угол, накрест — к боковой
  // у линии подачи), на 0,3–1 м внутри задней линии, ближе, когда Лёва бьёт из-за линии; у сетки — в 3 м от неё.
  // Сильный соперник читает укороченный по замаху Лёвы и заранее идёт вперёд.
  spot() {
    const L = this.game.other(this.p), P = L.pos, s = this.skill, z = this.p.side, st = L.stroke; // тот, кто бьёт ему (ИИ за Лёву или замену — соперник)
    if (st && st !== this.readFor) { this.readFor = st; this.reads = st.drop && Math.random() < clamp((s - 0.5) * 1.6, 0, 0.75); }
    const depth = this.net ? 3.2 : 11.6 - 0.25 * s - 0.6 * clamp((Math.abs(P.z) - 12.2) / 1.5, 0, 1);
    const ext = (sd) => new THREE.Vector3(sd * 4.1, 0, z * (sd * P.x >= 0 ? 11.9 : THREE.MathUtils.lerp(11.9, 6.4, clamp(Math.abs(P.x) / 3, 0, 1)))).sub(P).setY(0).normalize();
    const bis = ext(1).add(ext(-1)), x = P.x + (bis.x * (z * depth - P.z)) / bis.z;
    return new THREE.Vector3(clamp(x, -2.5, 2.5), 0, z * (this.reads && st && !st.contacted ? 7.5 : depth));
  }

  // Куда бить. Подача: первая к линиям, вторая надёжно в середину. С лёта и смэш — в угол от Лёвы. Лёва у сетки —
  // свеча, если есть время, иначе обводка. Лёва далеко за линией — иногда укороченный. Короткий мяч Лёвы — атака в угол.
  // Иначе в открытый корт, иногда за спину или глубоко в середину — смена направления.
  aim(p, st) {
    const g = this.game, L = g.other(p).pos, s = this.skill, boss = this.boss, side = -p.side, stretch = clamp((this.ran - 2.2) / 3, 0, 1);
    // Растянут — бьёт безопаснее, ближе к середине; босс целит ближе к линиям (ошибок у него почти нет).
    const away = -Math.sign(L.x || Math.random() - 0.5), wide = (1 - 0.4 * stretch) * (1 + 0.08 * boss);
    const pick = (x0, x1, z0, z1, sx = away) => new THREE.Vector3(sx * rnd(x0, x1) * wide, 0, side * rnd(z0, z1));
    const any = () => (Math.random() < 0.5 ? 1 : -1);
    st.aiKind = null;
    if (g.serving === p) return g.serveNo === 2 ? pick(0, 1.5, 6.5, 8.5, any()) : pick(2.6, 4.0, 10, 11.7, any()); // первая — к линиям, ~каждая четвёртая мимо
    if (st.type === 'oh') return pick(1.2, 3.0, 7, 10);
    if (st.type.startsWith('v')) return pick(2.2, 3.4, 5.5, 8.5);
    if (L.z * side < 6.5) { // Лёва у сетки
      // Свеча — когда есть время, босс чаще, если Лёва прилип к сетке.
      if (Math.random() < (0.12 + 0.33 * s + (L.z * side < 4 ? 0.15 * boss : 0)) * clamp(this.slack / 0.3, 0.3, 1)) { st.aiLob = clamp(0.2 + 0.8 * s - 0.9 * stretch + rnd(-0.15, 0.15), 0, 1); return pick(0, 2, 10, 11, any()); }
      // Босс — в ноги: кручёный ныряет в 1,2–1,8 м перед Лёвой, воллей снизу вверх.
      if (Math.random() < 0.5 * boss) { st.aiKind = 'feet'; return new THREE.Vector3(L.x + rnd(-0.25, 0.25), 0, side * clamp(L.z * side - rnd(1.2, 1.8), 1.2, 5)); }
      st.aiKind = 'pass';
      return Math.random() < 0.7 ? pick(2.8, 3.6, 7.5, 10.5) : pick(2.6, 3.4, 8, 10.5, -away);
    }
    if (L.z * side > 13.2 - 0.8 * boss && stretch < 0.2 && Math.abs(p.pos.z) < 11.6 && Math.random() < 0.06 + 0.16 * s) { st.drop = true; return pick(0.3, 2.5, 2.5, 4); }
    if (this.levShort && stretch < 0.3) { st.aiPace = 1.06 + 0.06 * s; st.aiKind = 'attack'; return pick(2.2, 3.3, 8.8, 10.4); }
    const r = Math.random();
    if (r < 0.55 + 0.2 * s) return pick(1.2, 3.0, 8 + s, 10.3);
    if (r < 0.85) return pick(1.0, 2.8, 8, 10.2, -away);
    return pick(0, 1.2, 9, 10.4, any());
  }

  // После своего удара: на короткий мяч Лёвы — чаще к сетке, после глубокого — иногда; раз за розыгрыш.
  afterShot(st, shot, aim) {
    const p = this.p, s = this.skill;
    if (this.net && Math.abs(p.pos.z) > 9) this.net = false; // откинули назад свечой — снова сзади
    if (this.net || this.netTried || shot.lob != null || st.drop) return;
    const deep = Math.abs(aim.z) > 9.6 && this.ran < 3;
    if (Math.random() < (this.levShort && this.ran < 2.5 ? 0.25 + 0.4 * s : deep ? 0.03 + 0.07 * s : 0)) { this.net = this.netTried = true; this.game.log('approach', { short: this.levShort }); }
  }

  update(now) {
    const g = this.game, p = this.p, b = g.b, s = this.sk;
    // Не быстрее 1 (как Лёва): при 1,04 он планировал точку удара раньше, чем добегал, и промахивался вбок (попадания 0,97 → 0,88).
    // «Босс» (выше 1): бежит до 6% быстрее и резче разгоняется — в пределах живого игрока (~6,4 м/с), — тянется дальше
    // и реагирует до 0,1 с. План точки удара он считает по скорости 1 (player.plan): запас времени, а не опоздание.
    const boss = this.boss, s1 = Math.min(s, 1);
    p.speedScale = 0.62 + 0.38 * s1 + 0.06 * boss; p.accelScale = 1 + 0.25 * boss;
    p.defend = 0.25 * Math.max(0, s1 - 0.6) + 0.15 * boss; // сильный дальше тянется в защите: до +10 см выпада, босс до +25
    const react = Math.max(0.1, 0.48 - 0.28 * s) + 0.08 * p.tired; // уставший реагирует позже
    const incoming = b.live && g.state === 'rally' && g.lastHitter && g.lastHitter !== p;
    if (incoming && now >= this.next) {
      this.next = now + 0.12;
      const delay = Math.max(0, (this.reactAt || now + react) - now), v = this.net && Math.abs(p.pos.z) < 8;
      // Берёт мяч на удобной высоте (от 45 см); низко с полулёта — только если иначе не успеть: там 20 см ошибки в месте = промах.
      let pl = p.plan(b, now, delay, 0.45, v);
      if (!pl || (!pl.out && pl.slack < 0)) { const low = p.plan(b, now, delay, 0.25, v); if (low && (!pl || low.out || low.slack > pl.slack)) pl = low; }
      const fresh = !this.planned;
      this.planned = pl && !pl.out ? pl : null;
      this.target.copy(this.planned ? this.planned.stand : pl?.out ? this.spot() : this.target);
      if (this.planned && fresh) { this.reactAt = now + (this.readDrop ? 0.1 : react); this.ran = p.pos.distanceTo(this.planned.stand); this.slack = this.planned.slack; }
    }
    if (!incoming) { this.planned = null; this.reactAt = 0; this.readDrop = false; this.target.copy(this.spot()); }
    const move = new THREE.Vector3();
    if (!incoming || now >= this.reactAt) {
      const d = this.target.clone().sub(p.pos).setY(0), dist = d.length();
      // Бежит так, чтобы успеть затормозить у точки.
      if (dist > 0.06) move.copy(d.divideScalar(dist).multiplyScalar(Math.min(1, Math.sqrt(2 * MOVE.brake * 0.6 * dist) / MOVE.shuffle)));
      if (!incoming && dist < 2) move.multiplyScalar(0.6); // рядом с местом — не в спринт (≤ ~3,8 м/с), бережёт силы; вынесли далеко — бежит
    }
    if (this.planned && !p.stroke && this.planned.t - now < PREP + 0.15) {
      const r = Math.random(), t = this.planned.type;
      p.press(t === 'oh' ? 'fh' : t + (r < 0.4 ? '-top' : r < 0.6 ? '-slice' : ''), now, b);
    }
    return move;
  }
}
