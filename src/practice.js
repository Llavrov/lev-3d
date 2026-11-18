// Тренировка без соперника. Соперника прячем, его место занимает:
// - «Уроки»: мячемёт за дальней линией подаёт мячи под каждый удар, одна строка подсказки на шаг, шаг засчитан после
//   нескольких удачных ударов. Так игра сама объясняет удары, клавиши, прицел и силу;
// - «Стенка»: стена на месте сетки с линией на высоте сетки, мяч отлетает обратно, считается серия без ошибок.
// Правила розыгрыша (Game.bounce, point, lose) в тренировке передают решение сюда: practice.bounce и practice.miss.
import * as THREE from 'three';
import { solveShot, solveLob, inSingles } from './physics.js';

const MOUTH = new THREE.Vector3(0, 0.62, -11.1); // откуда вылетает мяч у мячемёта
const WALL_W = 4.6, WALL_H = 4.2; // полширины и высота стенки, м
const rnd = (a, b) => a + Math.random() * (b - a);

// Шаги урока. text(b) — строка подсказки, b(клавиша) — клавиша на ноутбуке или кнопка на телефоне.
// feed — куда кидать: fh справа, bh слева, alt по очереди; z — где стоит Лёва; ok — засчитан ли удар; bad — что сказать.
const STEPS = [
  { id: 'fh', feed: 'fh', need: 3, text: (b) => `Мяч справа&nbsp;— форхенд ${b('KeyK')}. Жми, как только мяч перелетел сетку`, ok: (s) => /^v?fh/.test(s.stroke), bad: 'Справа&nbsp;— форхенд' },
  { id: 'bh', feed: 'bh', need: 3, text: (b) => `Мяч слева&nbsp;— бэкхенд ${b('KeyJ')}`, ok: (s) => /^v?bh/.test(s.stroke), bad: 'Слева&nbsp;— бэкхенд' },
  { id: 'aimL', feed: 'alt', need: 2, text: (b) => `Держи ${b('KeyA')} в&nbsp;замахе&nbsp;— мяч уйдёт влево`, ok: (s, p) => p.x < -0.8, bad: 'Левее: держи направление до удара' },
  { id: 'aimR', feed: 'alt', need: 2, text: (b) => `Держи ${b('KeyD')} в&nbsp;замахе&nbsp;— мяч уйдёт вправо`, ok: (s, p) => p.x > 0.8, bad: 'Правее: держи направление до удара' },
  { id: 'top', feed: 'alt', need: 3, text: (b, t) => `${t ? 'Включи «Кручёный» и&nbsp;бей' : `Кручёный&nbsp;— ${b('KeyI')}`}: мяч ныряет за&nbsp;сеткой и&nbsp;высоко прыгает`, ok: (s) => s.stroke.endsWith('top'), bad: 'Нужен кручёный' },
  { id: 'slice', feed: 'alt', need: 3, text: (b, t) => `${t ? 'Включи «Резаный» и&nbsp;бей' : `Резаный&nbsp;— ${b('KeyU')}`}: мяч низкий и&nbsp;стелется`, ok: (s) => s.stroke.endsWith('slice'), bad: 'Нужен резаный' },
  { id: 'drop', feed: 'alt', need: 2, text: (b) => `Укороченный&nbsp;— ${b('KeyL')}: мяч падает у&nbsp;сетки`, ok: (s, p) => s.drop && Math.abs(p.z) < 6.4, bad: 'Короче, у&nbsp;самой сетки' },
  { id: 'power', feed: 'alt', need: 3, text: (b) => `Держи ${b('KeyK')} или ${b('KeyJ')}, пока не&nbsp;загорятся три стрелки&nbsp;— сильнее`, ok: (s) => s.power >= 0.9, bad: 'Держи дольше, до&nbsp;трёх стрелок' },
  { id: 'volley', feed: 'alt', kind: 'volley', z: 3.4, need: 3, text: (b) => `У&nbsp;сетки бей с&nbsp;лёта, до&nbsp;отскока: ${b('KeyK')} или ${b('KeyJ')}`, ok: (s) => s.stroke.startsWith('v'), bad: 'С&nbsp;лёта, до&nbsp;отскока' },
  { id: 'smash', feed: 'fh', kind: 'lob', z: 5.2, need: 2, text: (b) => `Высокий мяч&nbsp;— смэш, жми ${b('KeyK')}`, ok: (s) => s.stroke === 'oh', bad: 'Встань под мяч' },
];
const FREE = { id: 'free', feed: 'alt', need: Infinity, text: () => 'Все удары пройдены. Дальше вперемешку', ok: () => true };
const WHY = { 'Сетка': 'Ниже линии', 'Не перелетел': 'Не&nbsp;перелетел', 'Не достал': 'Не&nbsp;достал' };

function machine() {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: '#23453a', roughness: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: '#17191a', roughness: 0.8 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.5, 0.4, 0.62), body, 0, 0.34, 0);
  add(new THREE.CylinderGeometry(0.3, 0.2, 0.3, 24, 1, true), body, 0, 0.68, -0.04); // бункер с мячами
  add(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 16), dark, 0, 0.62, 0.36, Math.PI / 2);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 20), dark, s * 0.28, 0.11, -0.15, 0, Math.PI / 2);
  const ball = new THREE.SphereGeometry(0.034, 12, 8), yellow = new THREE.MeshStandardMaterial({ color: '#d6ef3c', roughness: 0.9 });
  for (let i = 0; i < 14; i++) add(ball, yellow, Math.cos(i * 2.4) * 0.17 * Math.sqrt((i + 1) / 14), 0.76 + (i % 3) * 0.03, -0.04 + Math.sin(i * 2.4) * 0.17 * Math.sqrt((i + 1) / 14));
  g.position.set(MOUTH.x, 0, MOUTH.z - 0.36);
  return g;
}

// Стенка на месте сетки: бетон с линией на высоте сетки. Линия идёт по той же кривой, что и верх сетки (физика считает
// «ниже линии» по сетке), чтобы глаз и правило совпадали.
function wall() {
  const g = new THREE.Group();
  const w = new THREE.Mesh(new THREE.BoxGeometry(WALL_W * 2, WALL_H, 0.3), new THREE.MeshStandardMaterial({ color: '#4a6b5c', roughness: 0.95 }));
  w.position.set(0, WALL_H / 2, -0.16); w.castShadow = w.receiveShadow = true; g.add(w);
  const POST = 4.115 + 0.914, top = (x) => 0.914 + 0.156 * Math.min(1, (x / POST) ** 2);
  const geo = new THREE.PlaneGeometry(WALL_W * 2, 0.05, 48, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, top(p.getX(i)) + p.getY(i));
  const line = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f2f1ea', roughness: 0.7 }));
  line.position.z = 0.002; g.add(line);
  return g;
}

export class Practice {
  // mode: 'lessons' | 'wall'; ui: { text(html), dots(n, need), flash(html, good) }; touch — подсказки про кнопки, а не клавиши.
  // here — стенка на полукорте (halfcourt.js): своя стенка уже стоит, сетку и место Лёвы не трогаем;
  // box [x, z, h] — невысокий забор: мяч ниже h отскакивает от |x| = x и z = z (сзади) и от крыльев у стенки.
  constructor(game, mode, { scene, court, ui, touch, store, here = null }) {
    Object.assign(this, { g: game, mode, ui, store, touch, box: here?.box ?? null });
    this.b = touch ? (k) => ({ KeyK: '«Форхенд»', KeyJ: '«Бэкхенд»', KeyL: '«Укороч.»', KeyI: '«Кручёный» и&nbsp;удар', KeyU: '«Резаный» и&nbsp;удар', KeyA: 'джойстик влево', KeyD: 'джойстик вправо', Space: 'кнопку удара' }[k])
      : (k) => `<kbd data-k="${k}">${{ KeyK: 'K', KeyJ: 'J', KeyL: 'L', KeyI: 'I', KeyU: 'U', KeyA: 'A', KeyD: 'D', Space: 'Пробел' }[k]}</kbd>`;
    const { opp, lev } = game;
    opp.place(new THREE.Vector3(0, 0, -60)); opp.wrap.visible = false; opp.racket.visible = false; // соперника нет
    game.server = lev; game.state = 'drill';
    if (mode === 'wall') {
      if (!here) { court.getObjectByName('net').visible = false; scene.add(wall()); lev.place(lev.home.clone()); }
      this.series = 0; this.best = +(store.get('wallBest') ?? 0);
      this.serveAt = game.now + 0.6;
    } else {
      scene.add(machine());
      this.i = 0; this.n = 0; this.toss = 0;
      this.begin(game.now);
    }
    this.show();
  }
  get step() { return STEPS[this.i] ?? FREE; }

  // Новый шаг урока: Лёва встаёт куда нужно (у сетки — для воллея и смэша), первый мяч через секунду.
  begin(now) {
    const s = this.step;
    this.n = 0; this.g.lev.place(new THREE.Vector3(0, 0, s.z ?? this.g.lev.home.z));
    this.g.state = 'drill'; this.g.b.live = false; this.g.ballMesh.visible = false;
    this.next = now + 1.2;
    this.show();
  }
  skip() { if (this.mode === 'lessons' && this.i < STEPS.length) { this.i++; this.begin(this.g.now); } }

  show() {
    if (this.mode === 'wall') {
      const txt = this.g.state === 'serve' ? `${this.b('Space')}&nbsp;— подача в&nbsp;стенку` : `Серия ${this.series}`;
      this.ui.text(`${txt}${this.best ? ` · рекорд ${this.best}` : ''}`); this.ui.dots(0, 0);
    } else { this.ui.text(this.step.text(this.b, this.touch)); this.ui.dots(this.n, this.step.need); }
  }

  // Мячемёт: мяч к Лёве со стороны удара, с небольшим разбросом — чуть подвигаться надо, как на настоящей тренировке.
  feed(now) {
    const g = this.g, s = this.step, L = g.lev.pos, b = g.b;
    const side = s.feed === 'fh' ? 1 : s.feed === 'bh' ? -1 : this.toss++ % 2 ? -1 : 1;
    let vel, spin;
    if (s.kind === 'lob') { spin = 0; vel = solveLob(MOUTH, new THREE.Vector3(THREE.MathUtils.clamp(L.x + 0.5, -3, 3), 0, L.z + rnd(0.3, 1.1)), 1.08, spin); }
    else if (s.kind === 'volley') { spin = 0; vel = solveShot(MOUTH, new THREE.Vector3(THREE.MathUtils.clamp(L.x + side * rnd(0.7, 1.1), -3.6, 3.6), 0, L.z + 3.4), rnd(14, 16), spin); }
    else { spin = 80; vel = solveShot(MOUTH, new THREE.Vector3(THREE.MathUtils.clamp(L.x + side * rnd(0.9, 1.6), -3.7, 3.7), 0, rnd(7.4, 9)), rnd(16, 20), spin); }
    b.pos.copy(MOUTH); b.vel.copy(vel); b.spin = spin; b.live = true; b.bounces = 0;
    Object.assign(g, { lastHitter: g.opp, bounces: 0, serving: null, state: 'rally', rally: 1 });
    g.ballMesh.visible = true; g.markLanding();
    g.sound.hit({ q: 0.45, vol: 0.3, pan: g.pan(MOUTH.x), spin, power: 0 });
  }

  update(now) {
    const g = this.g;
    if (this.mode === 'wall') {
      if (this.serveAt && now >= this.serveAt) { this.serveAt = null; Object.assign(g, { state: 'serve', lastHitter: null }); this.show(); } // иначе подачу не засчитать: Лёва «уже бил»
      if (g.autoLev && g.state === 'serve') g.serve(g.lev, now); // ?auto: тестировщик подаёт сам
    } else if (this.beginAt && now >= this.beginAt) { this.beginAt = null; this.begin(now); }
    else if (!this.beginAt && g.state === 'drill' && now >= this.next) this.feed(now);
  }

  // После каждого шага физики: мяч Лёвы долетел до стенки — отражаем (стенка гасит его примерно на треть).
  afterStep(b) {
    const g = this.g;
    if (this.box) this.fence(b, this.box);
    if (this.mode !== 'wall' || g.state !== 'rally' || g.lastHitter !== g.lev || b.pos.z >= 0 || b.vel.z >= 0) return;
    if (Math.abs(b.pos.x) > WALL_W) return this.miss('Мимо стенки');
    if (b.pos.y > WALL_H) return this.miss('Выше стенки');
    // Стенка гасит мяч и прижимает его к прямой: так он возвращается за ~1,3 с и не улетает в угол — успеваешь встать.
    b.pos.z = -b.pos.z; b.vel.z *= -0.6; b.vel.x *= 0.55; b.vel.y *= 0.8; b.spin *= -0.4;
    Object.assign(g, { lastHitter: g.opp, bounces: 0, rally: g.rally + 1 }); b.bounces = 0;
    g.sound.bounce({ vol: 0.7, pan: g.pan(b.pos.x) }); g.markLanding();
    this.series++; this.show();
  }

  // Забор полукорта: ниже его верха мяч отскакивает от сетки, теряя ход. Крылья у стенки — после промаха мимо неё.
  fence(b, [X, Z, H]) {
    if (b.pos.y > H && !(b.pos.z < 0 && b.pos.y < 3)) return;
    if (b.pos.y < H && Math.abs(b.pos.x) > X && b.pos.x * b.vel.x > 0) { b.pos.x = Math.sign(b.pos.x) * X; b.vel.x *= -0.3; b.vel.z *= 0.5; b.spin = 0; }
    if (b.pos.y < H && b.pos.z > Z && b.vel.z > 0) { b.pos.z = Z; b.vel.z *= -0.3; b.vel.x *= 0.5; b.spin = 0; }
    if (b.pos.z < -0.05 && b.vel.z < 0 && Math.abs(b.pos.x) > WALL_W && this.g.state !== 'rally') { b.pos.z = -0.05; b.vel.z *= -0.3; b.vel.x *= 0.5; b.spin = 0; }
  }

  // Отскок: h — кто последним бил (мячемёт и стенка — это g.opp), n — какой отскок с удара.
  bounce(pos, h, n) {
    const g = this.g;
    if (g.state !== 'rally') return;
    if (h === g.opp) { if (n >= 2) this.miss('Не достал'); return; }
    if (this.mode === 'wall') return this.miss('Не долетел');
    if (pos.z > 0) return this.miss('Не перелетел');
    if (!inSingles(pos)) return this.miss('Аут');
    this.landed(pos);
  }

  landed(pos) {
    const g = this.g, s = this.step, shot = g.lastShot ?? { stroke: '', power: 0 };
    g.state = 'drill'; this.next = g.now + 1.1;
    const ok = s.ok(shot, pos);
    g.log('drill', { mode: this.mode, step: s.id, ok, stroke: shot.stroke, power: shot.power, at: [+pos.x.toFixed(2), +pos.z.toFixed(2)] });
    if (!ok) return this.ui.flash(s.bad, false);
    this.n++;
    if (this.n < s.need) { this.ui.flash('Есть', true); return this.show(); }
    this.ui.flash(this.i < STEPS.length ? 'Готово' : 'Есть', true);
    if (this.i < STEPS.length) { this.i++; this.beginAt = g.now + 0.9; } else this.show();
  }

  miss(why) {
    const g = this.g;
    if (g.state !== 'rally') return;
    g.state = 'drill';
    g.log('drill', { mode: this.mode, step: this.mode === 'wall' ? 'wall' : this.step.id, ok: false, why, series: this.series });
    this.ui.flash(WHY[why] ?? why, false);
    if (this.mode === 'wall') {
      if (this.series > this.best) { this.best = this.series; this.store.set('wallBest', this.best); }
      this.series = 0; this.serveAt = g.now + 1.2; this.show();
    } else this.next = g.now + 1.2;
  }
}
