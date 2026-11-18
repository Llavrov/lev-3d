// Карьера Лёвы (решено с ним 18.11): игровой день и форма дня, передышка между очками, итог «боролся», форма и рост
// соперников, турнир клуба. Идеи: Patrick Cohn «4 strategies to win when your game is off» (слабое начало — сигнал, а не
// прогноз; играть надёжно тем, что есть) и Liya Davidov «20-second routine» (отпустить, восстановиться дыханием,
// перенастроиться). Сверху — логика без DOM (test/career.test.mjs), ниже — игра, стенд и экраны.
// main.js зовёт: initCareer при загрузке, tick после шага игры, key на нажатие, end и again на экране итога.
import * as THREE from 'three';
import { stats, safeStore } from './stats.js';
import { wallet, fmtCHF } from './economy.js';
import { ROSTER, setOpponent } from './rivals.js';
import { mix, WALK } from './swing.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = THREE.MathUtils.smoothstep;
const NB = ' ';

// ---------- Форма дня ----------
// Шансы плохого и хорошего дня: база 15 %, плохой чаще при усталости больше 60, без сна и после двух проигрышей подряд.
export function formOdds({ fatigue = 0, slept = true, losses = 0 } = {}) {
  const bad = 0.15 + (fatigue > 60 ? 0.12 : 0) + (slept ? 0 : 0.12) + (losses >= 2 ? 0.1 : 0);
  return { bad, good: Math.max(0.05, 0.15 - 0.5 * (bad - 0.15)) };
}
export const rollForm = ({ bad, good }, r = Math.random()) => (r < bad ? -1 : r < bad + good ? 1 : 0);

// ---------- Соперники ----------
// Сила на старте (рейтинг = 1000 + (сила − 0,7)·1000) и стиль строкой для карточки; base — обычный соперник клуба.
export const RIVALS = {
  base: { skill: 0.64, style: 'Игрок клуба, ровная игра' },
  jp: { skill: 0.72, style: 'Быстрый защитник' },
  gh: { skill: 0.76, style: `Мощная подача и${NB}сетка` },
  ru: { skill: 0.8, style: `Двуручный бэкхенд и${NB}характер` },
  ch: { skill: 0.84, style: 'Ровный универсал' },
};
const rosterOf = (id) => ROSTER.find((r) => r.id === id) ?? null;
export const nameOf = (id, short = false) => (id === 'lev' ? 'Лёва' : id === 'base' ? 'Соперник' : (short ? rosterOf(id)?.short : rosterOf(id)?.name) ?? id);
// Чему научился, проиграв Лёве: ручки ИИ в game.js (p.adapt) и строка для карточки.
export const ADAPT = {
  drop: `Подтянул защиту против укороченных`,
  net: `Чаще бьёт свечу, когда ты у${NB}сетки`,
  angle: 'Шире прикрывает углы',
  power: `Подтянул защиту против сильных ударов`,
  pass: `Осторожнее выходит к${NB}сетке`,
};
const KINDS = Object.keys(ADAPT);
export const TRAIN_DAY = 0.004, TRAIN_CAP = 0.12; // тренируются по игровым дням: +0,004 силы за день, не больше +0,12

// ---------- Состояние ----------
const KEY = 'lev-career';
export function freshState() {
  return { day: 1, date: null, form: 0, slept: true, losses: 0, rating: 950,
    rivals: Object.fromEntries(Object.entries(RIVALS).map(([id, r]) => [id, { skill: r.skill, adapt: Object.fromEntries(KINDS.map((k) => [k, 0])), learned: null, form: 0 }])),
    tour: null };
}
// Из хранилища: пустое или битое — как старт, лишнее отбрасываем.
export function loadState(store) {
  const s = freshState(), o = store.get(KEY);
  if (!o || typeof o !== 'object') return s;
  for (const k of ['day', 'losses', 'rating']) if (Number.isFinite(o[k])) s[k] = Math.round(o[k]);
  if (typeof o.date === 'string') s.date = o.date;
  if ([-1, 0, 1].includes(o.form)) s.form = o.form;
  s.slept = o.slept !== false;
  for (const [id, d] of Object.entries(s.rivals)) {
    const r = o.rivals?.[id];
    if (!r) continue;
    if (Number.isFinite(r.skill)) d.skill = clamp(r.skill, RIVALS[id].skill, RIVALS[id].skill + TRAIN_CAP);
    for (const k of KINDS) if (Number.isFinite(r.adapt?.[k])) d.adapt[k] = clamp(r.adapt[k], 0, 1);
    if (KINDS.includes(r.learned)) d.learned = r.learned;
    if ([-1, 0, 1].includes(r.form)) d.form = r.form;
  }
  const t = o.tour, ids = ['lev', ...Object.keys(RIVALS)];
  if (t && Array.isArray(t.seeds) && t.seeds.length === 4 && t.seeds.every((x) => ids.includes(x)) && Array.isArray(t.sf) && t.sf.length === 2) s.tour = t;
  return s;
}

// Новый игровой день: после сна в кровати (slept) или по календарю без сна. Форма Лёвы и соперников — заново,
// соперники понемногу тренируются, сыгранный турнир уходит со стенда.
export function newDay(s, { slept = true, fatigue = 0, today = null, rnd = Math.random } = {}) {
  s.day++; s.slept = slept;
  if (today) s.date = today;
  s.form = rollForm(formOdds({ fatigue, slept, losses: s.losses }), rnd());
  for (const [id, r] of Object.entries(s.rivals)) { r.skill = Math.min(RIVALS[id].skill + TRAIN_CAP, r.skill + TRAIN_DAY); r.form = rollForm(formOdds(), rnd()); }
  if (s.tour?.place) s.tour = null;
  return s;
}

// ---------- Журнал матча ----------
// Каким ударом Лёва выиграл очко: последний его удар в розыгрыше, который он закончил сам (виннер, соперник не достал).
// net в событии удара — соперник был у сетки: значит, обводка.
const kindOf = (e) => (e.net ? 'pass' : e.drop ? 'drop' : /^(v|oh)/.test(e.stroke) ? 'net' : e.kind === 'angle' ? 'angle' : e.power > 0.5 ? 'power' : null);
export function winsBy(events) {
  const n = Object.fromEntries(KINDS.map((k) => [k, 0]));
  let last = null;
  for (const e of events) {
    if (e.type === 'serve') last = null;
    else if (e.type === 'shot' && e.who === 'lev' && !e.serve) last = e;
    else if (e.type === 'point') {
      const k = last && e.winner === 'lev' && (e.why === 'Виннер' || e.why === 'Не достал') ? kindOf(last) : null;
      if (k) n[k]++;
      last = null;
    }
  }
  return n;
}
// Проиграл Лёве — закрывает слабое место, на котором тот его ловил чаще всего (от двух очков). Возвращает что.
export function learn(r, events) {
  const n = winsBy(events), k = KINDS.reduce((a, b) => (n[b] > n[a] ? b : a));
  if (n[k] < 2) return null;
  r.adapt[k] = Math.min(1, r.adapt[k] + 0.35); r.learned = k;
  return k;
}
// «Боролся»: выигранные очки, самый длинный розыгрыш (ударов), передышки, брейк-поинты на подаче Лёвы (bp в очке).
export function fought(events) {
  const o = { won: 0, longest: 0, rests: 0, bp: 0, saved: 0 };
  for (const e of events) {
    if (e.type === 'rest') o.rests++;
    if (e.type !== 'point') continue;
    if (e.winner === 'lev') o.won++;
    o.longest = Math.max(o.longest, e.rally ?? 0);
    if (e.bp) { o.bp++; if (e.winner === 'lev') o.saved++; }
  }
  return o;
}

// ---------- Рейтинг и турнир ----------
export const ratingOf = (skill) => Math.round(1000 + (skill - 0.7) * 1000);
export const winProb = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));
export const elo = (r, ro, won, K = 32) => Math.round(r + K * ((won ? 1 : 0) - winProb(r, ro)));
const FORM_R = { '-1': -90, 0: 0, 1: 50 }; // форма дня в симуляции чужих пар
export const FEE = 20, PRIZES = [150, 60, 25, 0];
const rate = (s, id) => (id === 'lev' ? s.rating : ratingOf(s.rivals[id].skill));
const formOf = (s, id) => (id === 'lev' ? s.form : s.rivals[id].form);

// Сетка на четверых: трое соперников ближе всех к Лёве по рейтингу, посев по рейтингу (1–4, 2–3).
export function makeTour(s) {
  const pool = Object.keys(RIVALS).sort((a, b) => Math.abs(rate(s, a) - s.rating) - Math.abs(rate(s, b) - s.rating)).slice(0, 3);
  const seeds = ['lev', ...pool].sort((a, b) => rate(s, b) - rate(s, a));
  return { day: s.day, seeds, sf: [{ a: seeds[0], b: seeds[3] }, { a: seeds[1], b: seeds[2] }], fin: null, third: null, place: null, prize: 0, r0: s.rating };
}
// Матч Лёвы, который играть сейчас: { round: 'sf' | 'fin' | 'third', m, opp }.
export function levMatch(t) {
  for (const round of ['sf', 'fin', 'third']) for (const m of [].concat(t?.[round] ?? [])) if (m && !m.w && (m.a === 'lev' || m.b === 'lev')) return { round, m, opp: m.a === 'lev' ? m.b : m.a };
  return null;
}
const simScore = (rnd) => [[4, 0], [4, 1], [4, 1], [4, 2], [4, 2], [5, 3], [5, 4]][Math.floor(rnd() * 7)]; // сет до 4, при 4:4 тай-брейк
export function simulate(s, m, rnd = Math.random) {
  const aw = rnd() < winProb(rate(s, m.a) + FORM_R[formOf(s, m.a)], rate(s, m.b) + FORM_R[formOf(s, m.b)]), [x, y] = simScore(rnd);
  m.w = aw ? m.a : m.b; m.score = aw ? [x, y] : [y, x];
}
// Итог матча Лёвы (score — [его геймы, соперника]): доигрывает остальные пары круга симуляцией, после полуфиналов
// ставит финал и матч за третье место, в конце — место и приз (начисляет вызывающий). Рейтинг Лёвы — по Эло.
export function record(s, t, levWon, score, rnd = Math.random) {
  const cur = levMatch(t);
  if (!cur) return null;
  const { m, opp } = cur;
  m.w = levWon ? 'lev' : opp; m.score = m.a === 'lev' ? score : [score[1], score[0]];
  s.rating = elo(s.rating, rate(s, opp), levWon);
  for (const x of cur.round === 'sf' ? t.sf : [t.fin, t.third]) if (x && !x.w) simulate(s, x, rnd);
  if (cur.round === 'sf') {
    const lose = (x) => (x.w === x.a ? x.b : x.a);
    t.fin = { a: t.sf[0].w, b: t.sf[1].w }; t.third = { a: lose(t.sf[0]), b: lose(t.sf[1]) };
  } else {
    t.place = t.fin.w === 'lev' ? 1 : [t.fin.a, t.fin.b].includes('lev') ? 2 : t.third.w === 'lev' ? 3 : 4;
    t.prize = PRIZES[t.place - 1];
  }
  return cur;
}

// ---------- Передышка (ритуал между очками) ----------
// B между очками: отвернулся к заднему забору, поправил струны левой, вдох-выдох плечами, развернулся к корту — 2,7 с.
// Каждая снимает 20 % штрафа плохого дня (до 60 % за матч) и поднимает настрой; после неё Лёва стоит прямее.
export const REST = { T: 2.7, relief: 0.2, max: 0.6 };
const V = (x, y, z) => new THREE.Vector3(-x, y, z).normalize(); // оси скелета, x вправо (как в swing.js)
// Струны: ракетка перед правым плечом головкой вверх, струнами к левой руке; взгляд на струны.
const STRINGS = { lh: -1, lean: 8, nod: 20, look: -16, rUp: V(0.22, -0.9, 0.3), rFo: V(-0.12, 0.6, 0.79), rk: V(-0.08, 0.97, 0.22), face: V(-1, 0, 0.12),
  lUp: V(-0.2, -0.88, 0.42), lFo: V(0.6, 0.3, 0.75) };
const LOOSE = { lh: -1, rUp: WALK.rUp, rFo: WALK.rFo, rk: WALK.rk, face: WALK.face, lUp: WALK.lUp, lFo: WALK.lFo }; // руки вдоль тела
const SAG = { lh: -1, rUp: V(0.1, -1, 0.08), rFo: V(-0.1, -0.85, 0.5), lUp: V(-0.1, -1, 0.08), lFo: V(0.05, -0.95, 0.3), rk: V(-0.1, -0.55, 0.85) }; // руки висят (как DOWN в player.js)

export class Rest {
  constructor(p) { this.p = p; this.t0 = -99; this.turn = null; this.tall = 0; }
  start(now) { this.t0 = now; }
  active(now) { const u = now - this.t0; return u >= 0 && u < REST.T; }
  // Разворот всего тела: к заднему забору за 0,6 с, обратно с 2,1 с (player.js берёт turn как цель корпуса).
  update(now, dt) {
    const u = now - this.t0;
    this.turn = this.active(now) ? Math.PI * (smooth(u, 0, 0.6) - smooth(u, 2.1, 2.7)) : null;
    if (!this.active(now) && this.tall > 0) this.tall = Math.max(0, this.tall - dt / 40); // прямее ещё ~40 с игры
  }
  w(now) { // доли фаз: руки свободны, струны, дыхание
    const u = now - this.t0;
    return { u, all: smooth(u, 0, 0.3) * (1 - smooth(u, 2.35, 2.7)), str: smooth(u, 0.45, 0.8) * (1 - smooth(u, 1.3, 1.6)), br: smooth(u, 1.3, 1.6) * (1 - smooth(u, 2.2, 2.55)) };
  }
  pose(K, now) {
    if (!this.active(now)) return this.tall > 0 && this.p.idle ? { ...K, lean: K.lean - 4 * this.tall, nod: (K.nod ?? 0) - 6 * this.tall } : K;
    const { u, all, str, br } = this.w(now);
    K = mix({ ...K, shrug: K.shrug ?? 0 }, { ...K, ...LOOSE }, all * (1 - str));
    if (str > 0) K = mix(K, { ...K, ...STRINGS }, str);
    if (br > 0) { // вдох — плечи вверх, грудь вперёд, подбородок выше; выдох — всё вниз
      const b = Math.sin(Math.PI * clamp((u - 1.45) / 0.85, 0, 1)) * br;
      K = { ...K, shrug: 11 * b, lean: K.lean - 5 * b, nod: (K.nod ?? 0) - 8 * b };
    }
    return K;
  }
  // Левая кисть на струнах (после ракетки): ладонью к струнам, пальцы перебирают их вверх-вниз.
  place(now) {
    if (!this.active(now)) return;
    const { str } = this.w(now), rig = this.p.rig, rk = this.p.racket;
    if (str < 0.01 || !rig.hand.Left) return;
    const e = rk.matrixWorld.elements, Y = new THREE.Vector3(e[4], e[5], e[6]).normalize(), Z = new THREE.Vector3(e[8], e[9], e[10]).normalize();
    const c = rig.sweet(), sh = rig.b.LeftArm.getWorldPosition(new THREE.Vector3());
    const n = Z.multiplyScalar(Math.sign(sh.sub(c).dot(Z)) || 1); // сторона струн к левому плечу
    const T = c.clone().addScaledVector(n, 0.03).addScaledVector(Y, -0.03 + 0.035 * Math.sin(now * 9));
    for (let it = 0; it < 2; it++) {
      const wrist = rig.b.LeftHand.getWorldPosition(new THREE.Vector3()), W = T.clone().sub(rig.palm('Left').sub(wrist));
      rig.armTo('Left', wrist.lerp(W, str));
      const A = rig.dirW('LeftForeArm', 'LeftHand'), N = n.clone().negate(), F = A.addScaledVector(N, -A.dot(N)).normalize();
      rig.orientHand('Left', new THREE.Vector3().crossVectors(N, F), str, false); // ладонь (F × R у левой) к струнам
    }
  }
}
// Соперник в плохой день: голова ниже между очками, после своей ошибки дольше стоит, опустив голову и руки.
class OppDay {
  constructor(p) { this.p = p; this.turn = null; }
  pose(K, now) {
    const p = this.p;
    if (!p.idle || !((p.form ?? 0) < 0)) return K;
    const u = now - (p.gest?.t0 ?? -99), down = p.gest?.k === 'down' ? smooth(u, 1.1, 1.5) * (1 - smooth(u, 3.8, 4.6)) : 0;
    K = mix(K, { ...K, ...SAG }, down);
    return { ...K, nod: (K.nod ?? 0) + 8 + 18 * down, lean: K.lean + 3 + 5 * down };
  }
}

// ---------- Игра ----------
const ERRORS = ['Аут', 'Сетка', 'Не перелетел', 'Двойная', 'Мимо мяча'];
const store = safeStore();
let C = null, S = null, rest = null, base = null;
const M = { ev: [], pts: 0, errs: 0, tipLeft: 0, tipShown: false, bp: false, over: null, last: null, tour: null, prev: null, formOverride: null, oppForm: null, checkAt: 0 };
const save = () => store.set(KEY, S);
const dayKey = () => new Date().toLocaleDateString('sv'); // ГГГГ-ММ-ДД по местному времени
const $ = (id) => document.getElementById(id);
const oppId = () => { const o = C.game.opp; return o === base ? 'base' : o.rival?.id ?? null; }; // девушки корта 2 — не соперники карьеры

export function initCareer(ctx) {
  C = ctx; S = loadState(store);
  const g = ctx.game, today = dayKey();
  if (!S.date) { S.date = today; S.form = rollForm(formOdds()); for (const r of Object.values(S.rivals)) r.form = rollForm(formOdds()); }
  else if (S.date !== today) newDay(S, { slept: false, fatigue: stats.fatigue, today });
  save();
  stats.on((what) => { if (what === 'sleep') { newDay(S, { slept: true, today: dayKey() }); save(); } });
  base = g.opp; rest = new Rest(ctx.lev); ctx.lev.routine = rest;
  // Всё, что игра пишет в журнал, проходит и сюда: очки, удары, подачи, конец матча.
  const log0 = g.log;
  g.log = (type, d = {}) => {
    if (type === 'serve') M.bp = d.who === 'lev' && !g.tb && g.clutch(); // брейк-поинт на подаче Лёвы
    const e = type === 'point' ? { ...d, bp: M.bp } : d;
    onEvent(type, e);
    log0(type, e);
  };
  ui(ctx);
  noteTip();
  const Q = new URLSearchParams(location.search);
  if (Q.has('debug')) { // ?form=-1|0|1 — форма Лёвы на эту игру (не сохраняется), ?oppform= — соперника
    if (Q.has('form')) M.formOverride = clamp(Math.round(+Q.get('form')), -1, 1);
    if (Q.has('oppform')) M.oppForm = clamp(Math.round(+Q.get('oppform')), -1, 1);
    window.__career = { get S() { return S; }, M, rest, startRest, openTour, closeTour, enter, startTourMatch, save, newDay: (o) => { newDay(S, o); save(); }, canRest };
  }
}

function onEvent(type, e) {
  const g = C.game;
  if (type === 'newmatch' || type === 'mode') {
    Object.assign(M, { ev: [], pts: 0, errs: 0, tipLeft: 0, tipShown: false, over: null });
    C.lev.relief = 0; g.tip = null;
    if (!M.tour) noteTip();
    return;
  }
  M.ev.push({ type, ...e });
  if (type === 'match') M.over = e.winner; // очко, которым кончился матч, придёт следом
  if (type !== 'point') return;
  M.pts++;
  if (e.winner === 'opp' && ERRORS.includes(e.why)) M.errs++;
  // Слабое начало — сигнал: после 2–3 очков с ошибками одна строка, как вытащить день. Заранее не объявляем.
  if (form() < 0 && !M.tipShown && M.pts >= 3 && M.errs >= 2 && g.lev === C.lev) {
    M.tipShown = true; M.tipLeft = 2;
    g.tip = C.touch ? `Сегодня не${NB}идёт. Играй надёжно и${NB}бери передышку` : `Сегодня не${NB}идёт. Играй надёжно, B${NB}— передышка`;
  } else if (M.tipLeft && !--M.tipLeft) g.tip = null;
  if (M.over) { afterMatch(M.over === 'lev'); M.over = null; }
}
const form = () => M.formOverride ?? S.form;
// Чему соперник научился — одной строкой перед первым очком матча (в турнире это видно в карточке).
function noteTip() {
  const id = oppId(), k = id && S.rivals[id].learned;
  if (k) { C.game.tip = `Соперник ${ADAPT[k][0].toLowerCase()}${ADAPT[k].slice(1)}`; M.tipLeft = 1; }
}

// Конец матча: итог «боролся», рост техники и настроя даже в проигрыше, соперник учится, турнир идёт дальше.
function afterMatch(levWon) {
  const g = C.game, id = oppId(), mine = g.lev === C.lev;
  M.last = { ...fought(M.ev), levWon, tour: !!M.tour, opp: id, learned: null };
  if (M.tour && S.tour) { // матч турнира в счёт, даже если доигрывала замена
    record(S, S.tour, levWon, g.sets.at(-1) ?? [0, 0]);
    if (S.tour.place && S.tour.prize) wallet.earn(S.tour.prize, `Турнир клуба: ${S.tour.place}-е место`);
    M.tour = null; M.restore = true;
  }
  if (mine) { // играла не замена
    S.losses = levWon ? 0 : S.losses + 1;
    if (!levWon) { stats.train('technique', clamp(2 + 0.15 * M.last.won, 2, 6)); stats.cheer(0.05); }
    if (id && levWon) M.last.learned = learn(S.rivals[id], M.ev);
  }
  save();
}

// ---------- Передышка ----------
// Можно, когда мяч не в игре и до подачи: Лёва на корте сам, не тренировка, не прогулка, экран турнира закрыт.
function canRest() {
  const g = C?.game;
  return !!g && g.lev === C.lev && !g.drill && !C.club.active && !g.autoLev && (g.state === 'serve' || g.state === 'over') && !g.ended && !rest.active(g.now) && $('tour')?.hidden !== false;
}
function startRest() {
  const g = C.game, L = C.lev, now = g.now;
  rest.start(now); rest.tall = 1;
  L.relief = Math.min(REST.max, (L.relief ?? 0) + REST.relief);
  L.mood = clamp(L.mood + 0.3, -1, 1); L.gest = null; stats.cheer(0.02);
  g.holdUntil = now + REST.T + 0.6; // соперник ждёт, подача не уходит
  g.hud.hint('');
  g.log('rest', { relief: +L.relief.toFixed(2) });
}

export function tick(dt, now) {
  if (!C) return;
  const g = C.game, L = C.lev, op = g.opp, id = oppId();
  L.form = form();
  if (op.routine?.p !== op) op.routine = new OppDay(op);
  op.form = id ? M.oppForm ?? S.rivals[id].form : 0;
  op.adapt = id ? S.rivals[id].adapt : null;
  rest.update(now, dt);
  if (M.restore && $('end').hidden && $('tour').hidden) { M.restore = false; endTourMatch(); }
  const between = canRest();
  if (between !== M.between) { M.between = between; $('brest').hidden = !between || !C.touch; }
  if (now > M.checkAt) { // не спал, а календарь перешёл на новый день
    M.checkAt = now + 60;
    if (dayKey() !== S.date) { newDay(S, { slept: false, fatigue: stats.fatigue, today: dayKey() }); save(); }
  }
}

export function key(e) {
  if (!C) return false;
  if (!$('tour').hidden) { if (e.code === 'Escape') closeTour(); return true; } // экран турнира: клавиши его
  if (e.code === 'KeyB' && canRest()) { startRest(); return true; }
  return false;
}

// ---------- Экран итога (main.js endUi) ----------
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
export function end(w) {
  const L = M.last, g = C?.game;
  $('again').textContent = L?.tour ? 'Сетка турнира' : 'Ещё матч';
  if (!L || !w) { if ($('endF')) $('endF').textContent = ''; return; }
  if (w !== g.lev && L.opp && L.opp !== 'base') $('endT').textContent = `${nameOf(L.opp, true)} выиграл`;
  const a = [`Очков выиграно ${L.won}`, `самый длинный розыгрыш ${L.longest}${NB}${plural(L.longest, 'удар', 'удара', 'ударов')}`];
  const b = [`Передышек ${L.rests}`];
  if (L.bp) b.push(`брейк-поинтов отыграно ${L.saved} из${NB}${L.bp}`);
  $('endF').innerHTML = `${a.join(', ')}<br>${b.join(', ')}`;
}
// «Сетка турнира» вместо «Ещё матч» после матча турнира. true — обработали сами.
export function again() { if (!M.last?.tour) return false; M.last.tour = false; openTour(); return true; }

// ---------- Турнир: матч ----------
async function startTourMatch() {
  const g = C.game, nm = levMatch(S.tour);
  if (!nm) return;
  hideTour(); M.restore = false;
  M.prev ??= { bestOf: g.bestOf, setTo: g.setTo, rival: g.opp.rival ?? null, skill: g.ai.skill };
  await setOpponent(g, rosterOf(nm.opp)); C.onRival?.();
  if (C.club.active) $('cback').click(); // на корт, как R
  M.tour = { opp: nm.opp };
  Object.assign(g, { bestOf: 1, setTo: 4 });
  g.ai.skill = S.rivals[nm.opp].skill; g.ai.fixed = true; // в турнире соперник играет своей силой, без подстройки
  g.newMatch(g.now);
}
// После матча турнира — обычный соперник и формат, когда экраны итога и турнира закрыты (tick).
async function endTourMatch() {
  const g = C.game, p = M.prev;
  M.prev = null;
  if (!p) return;
  Object.assign(g, { bestOf: p.bestOf, setTo: p.setTo });
  await setOpponent(g, p.rival); C.onRival?.();
  g.ai.skill = p.skill; g.ai.fixed = false;
}

// ---------- Стенд и экран турнира ----------
const STAND = { x: 12.75, z: -16.2 }; // у террасы клубного дома, лицом к дорожке (доска работы — у двери, это другое)
function buildStand() {
  const g = new THREE.Group(); g.name = 'tour-stand';
  const wood = new THREE.MeshStandardMaterial({ color: '#6e4b2e', roughness: 0.85 });
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 512;
  const x = cv.getContext('2d');
  x.fillStyle = '#24452f'; x.fillRect(0, 0, 768, 512);
  x.fillStyle = '#f4f1e8'; x.font = '700 64px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('ТУРНИР КЛУБА', 384, 96);
  x.strokeStyle = '#f4f1e8'; x.lineWidth = 6; // сетка на четверых
  for (const [y0, y1] of [[170, 270], [330, 430]]) { x.strokeRect(70, y0 - 22, 190, 44); x.strokeRect(70, y1 - 22, 190, 44); x.beginPath(); x.moveTo(260, y0); x.lineTo(330, y0); x.lineTo(330, y1); x.lineTo(260, y1); x.moveTo(330, (y0 + y1) / 2); x.lineTo(410, (y0 + y1) / 2); x.stroke(); }
  x.beginPath(); x.moveTo(410, 220); x.lineTo(480, 220); x.lineTo(480, 380); x.lineTo(410, 380); x.moveTo(480, 300); x.lineTo(540, 300); x.stroke();
  x.fillStyle = '#d6ef3c'; x.fillRect(548, 268, 160, 64);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  for (const z of [-0.72, 0.72]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.15, 0.09), wood); post.position.set(0, 1.075, z); g.add(post); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.96, 1.44), [wood, face, wood, wood, wood, wood]); // лицо — к −x, к дорожке
  board.position.set(0, 1.45, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 1.66), wood); roof.position.set(-0.04, 2.0, 0); roof.rotation.z = 0.32;
  g.add(board, roof);
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  g.position.set(STAND.x, 0, STAND.z);
  g.userData.boxes = [[STAND.x - 0.12, STAND.z - 0.8, STAND.x + 0.12, STAND.z + 0.8]]; // препятствие прогулки (club.js)
  return g;
}

const CSS = `
#tour { position: fixed; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(8, 12, 10, .35); }
#tour[hidden] { display: none; }
#tour .sheet { border-radius: 16px; }
#tour ol { list-style: none; margin: 0; padding: 0; }
#tour li { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: baseline; padding: 9px 0; border-top: 1px solid rgba(255, 255, 255, .08); }
#tour li:first-child { border-top: 0; }
#tour li small { grid-column: 1 / -1; font-size: 13px; opacity: .6; }
#tour .pair { font-size: 16px; color: rgba(255, 255, 255, .78); }
#tour .pair b { color: #fff; }
#tour .pair .me { color: var(--accent, #d6ef3c); }
#tour .sc { font-weight: 600; font-variant-numeric: tabular-nums; }
#tour .next { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, .12); font-size: 15px; line-height: 1.5; }
#tour .next em { font-style: normal; color: var(--accent, #d6ef3c); }
#tour .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
#tour .acts button { min-height: 48px; border: 1px solid rgba(255, 255, 255, .3); border-radius: 12px; background: transparent; color: #fff; font: 600 16px/1.2 system-ui, -apple-system, sans-serif; cursor: pointer; }
#tour .acts button.go { border-color: transparent; background: var(--accent, #d6ef3c); color: #18210c; }
#tour .acts button:only-child { grid-column: 1 / -1; }
#tour .acts button:disabled { opacity: .45; cursor: default; }
#end .fought { margin: -6px 0 0; font-size: 15px; line-height: 1.5; opacity: .92; text-shadow: var(--shade); font-variant-numeric: tabular-nums; }
#end .fought:empty { display: none; }
@media (max-width: 640px) { #tour { align-items: flex-end; } #tour .sheet { border-radius: 16px 16px 0 0; } }
body.tour #cbar, body.tour #act, body.tour #pad, body.tour #me, body.tour #hint { visibility: hidden; }
`;

function ui(ctx) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  document.body.insertAdjacentHTML('beforeend', `<div id="tour" role="dialog" aria-modal="true" aria-labelledby="tourH" hidden><div class="sheet">
    <div class="head"><b id="tourH">Турнир клуба</b><button class="x" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div id="tourBody"></div></div></div>`);
  $('tour').addEventListener('click', (e) => { if (e.target.id === 'tour' || e.target.closest('.x')) closeTour(); });
  if (!$('endF')) $('endS')?.insertAdjacentHTML('afterend', '<p class="fought" id="endF"></p>');
  const b = document.createElement('button'); b.id = 'brest'; b.type = 'button'; b.hidden = true; b.innerHTML = 'Передышка<kbd>B</kbd>';
  b.addEventListener('click', (e) => { e.currentTarget.blur(); if (canRest()) startRest(); });
  $('cbar')?.append(b);
  const stand = buildStand();
  (ctx.court ?? ctx.scene).add(stand);
  ctx.interact?.register({ pos: new THREE.Vector3(STAND.x - 0.95, 0, STAND.z), r: 1.3, y: 1.3,
    label: (s) => (s.held || s.chair || s.seated ? null : !S.tour ? `записаться на${NB}турнир` : S.tour.place ? 'итоги турнира' : 'сетка турнира'),
    act: () => openTour() });
}

function hideTour() { $('tour').hidden = true; document.body.classList.remove('tour'); }
function closeTour() { hideTour(); if (!C.club.active && C.game.state === 'match-over') $('cexit').click(); } // с корта после матча — гулять по клубу
function openTour() { renderTour(); $('tour').hidden = false; document.body.classList.add('tour'); }
function enter() {
  if (S.tour || !wallet.spend(FEE, 'Взнос: турнир клуба')) return false;
  S.tour = makeTour(S); save(); renderTour();
  return true;
}

const ROUND = { sf: 'Полуфинал', fin: 'Финал', third: `За${NB}третье место` };
function renderTour() {
  const t = S.tour ?? makeTour(S), live = !!S.tour, nm = levMatch(t);
  const who = (id, m) => { const n = nameOf(id), c = id === 'lev' ? ' class="me"' : ''; return m.w === id ? `<b${c}>${n}</b>` : c ? `<span${c}>${n}</span>` : n; }; // победитель жирным
  const row = (round, m) => `<li><small>${ROUND[round]}</small><span class="pair">${who(m.a, m)} — ${who(m.b, m)}</span><span class="sc">${m.score?.join(':') ?? ''}</span></li>`;
  const rows = [...t.sf.map((m) => row('sf', m)), t.fin && row('fin', t.fin), t.third && row('third', t.third)].filter(Boolean).join('');
  let next = '', acts = '';
  if (nm && !t.place) {
    const id = nm.opp, r = rosterOf(id), k = S.rivals[id].learned;
    next = `<p class="next"><b>${nameOf(id)}</b>${r ? `, ${r.country}` : ''}<br>${RIVALS[id].style}${k ? `<br><em>${ADAPT[k]}</em>` : ''}</p>`;
  }
  if (!live) {
    const can = wallet.can(FEE);
    next += `<p class="next">Взнос ${fmtCHF(FEE)}, призы ${PRIZES.slice(0, 3).join(', ').replace(/, (\d+)$/, ` и${NB}$1`)}${NB}CHF</p>`;
    acts = `<button class="go" data-a="enter"${can ? '' : ' disabled'}>${can ? `Записаться за${NB}${fmtCHF(FEE)}` : `Не${NB}хватает денег`}</button><button data-a="close">Закрыть</button>`;
  } else if (t.place) {
    next = `<p class="next">${t.place}-е место${t.prize ? `, приз ${fmtCHF(t.prize)}` : ''}. Рейтинг ${t.r0}${NB}→ ${S.rating}<br>Следующий турнир${NB}— завтра</p>`;
    acts = '<button data-a="close">Закрыть</button>';
  } else acts = `<button class="go" data-a="play">На${NB}матч</button><button data-a="later">Позже</button>`;
  $('tourBody').innerHTML = `<ol>${rows}</ol>${next}<div class="acts">${acts}</div>`;
  for (const b of $('tourBody').querySelectorAll('button')) b.addEventListener('click', () => ({ enter, close: closeTour, play: startTourMatch, later: closeTour })[b.dataset.a]?.());
}
