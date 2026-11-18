// Лёва вне розыгрыша: характеристики и вещи влияют на игру, усталость копится и снимается, HUD сил и кошелька,
// панель характеристик (C или кнопка), магазин и зал. main.js зовёт: initProfile при загрузке, tick после шага игры
// и прогулки, view после камеры, key на нажатие, input — ввод прогулки (в магазине и зале Лёва стоит).
import './profile.css';
import { stats, STATS, STAT_NAMES, Stats } from './stats.js';
import { wallet, fmtCHF, earn, spend } from './economy.js';
import { outfit, ITEM, dress, showBag } from './outfit.js';
import { initShop, openShop, shopOpen, closeShop } from './shop.js';
import { initGym, openGym, gymOpen, gymKey, gymTick, DEBUG_GYM } from './gym.js';

const $ = (id) => document.getElementById(id);
const pct = (k) => `${k >= 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 1000) / 10}%`.replace('.', ',');

let C = null; // контекст: game, lev, club, camera, onRacket
const P = { sta0: 1, games: 0, won: 0, rally: 0, saveAt: 0, panel: false };

export function initProfile(ctx) {
  C = ctx;
  const L = ctx.lev, Q = new URLSearchParams(location.search);
  // ?debug: ?stats=10 — все уровни, ?fatigue=80 — усталость (для тестировщика, не сохраняется).
  if (Q.has('debug')) {
    if (Q.has('stats')) for (const k of STATS) stats.lvl[k] = Math.min(10, Math.max(1, +Q.get('stats') || 1));
    if (Q.has('fatigue')) stats.fatigue = Math.min(100, Math.max(0, +Q.get('fatigue') || 0));
    if (Q.has('stats') || Q.has('fatigue')) stats.save = () => {};
    window.__eco = { stats, wallet, outfit, earn, spend, openShop, openGym, stations: DEBUG_GYM };
  }
  document.body.insertAdjacentHTML('beforeend', `
    <button id="me" type="button" aria-label="Характеристики Лёвы"><span class="cash" id="meCash"></span><kbd>C</kbd>
      <span class="row"><small>Силы</small><i id="meSta"><b></b></i></span><span class="row"><small>Усталость</small><i id="meFat"><b></b></i></span></button>
    <div id="panel" role="dialog" aria-modal="true" aria-labelledby="panelH" hidden><div class="sheet">
      <div class="head"><b id="panelH">Лёва</b><button class="x" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <dl id="panelStats"></dl><p class="worn" id="panelWorn"></p></div></div>`);
  $('me').addEventListener('click', (e) => { e.currentTarget.blur(); togglePanel(); });
  $('panel').addEventListener('click', (e) => { if (e.target.id === 'panel' || e.target.closest('.x')) togglePanel(false); });
  dress(L);
  P.sta0 = L.stamina;
  outfit.on(() => { dress(L); C.onRacket?.(); if (P.panel) fillPanel(); });
  wallet.on(() => { hud.cash = null; });
  initShop(ctx); initGym(ctx);
  addEventListener('pagehide', () => stats.save());
}

// Что надето — множители в игроке (их читают player.js и game.js), мячи — в мяче.
function applyMods() {
  const L = C.lev, m = stats.mods(outfit.gear());
  L.speedScale = m.speed; L.accelScale = m.accel; L.powerScale = m.power; L.errScale = m.err;
  C.game.b.lively = outfit.gear().lively;
  return m;
}

// Шаг: после game.update и club.update (и в __lev.step). Только расчёты, без DOM.
export function tick(dt, now) {
  if (!C) return;
  const g = C.game, L = C.lev, m = applyMods();
  if (g.lev === L && !L.free) { // Лёва на корте: матч или тренировка
    // Расход и восстановление выносливости — через множители уровня и усталости, потолок — уставшее тело.
    const d = L.stamina - P.sta0;
    L.stamina = Math.min(m.cap, P.sta0 + d * (d < 0 ? m.drain : m.recover));
    if (d < 0) { stats.tire(-d * m.drain * 3); stats.train('stamina', -d * m.drain * 3, true); } // сет ~10 минут — около 25 усталости
    if (g.state === 'rally') stats.tire(dt * 0.01);
    if (L.idle) L.mood += 0.12 * stats.mood * dt; // между очками настрой тянется к своему, а не к нулю
    if (g.rally !== P.rally) { if (g.lastHitter === L && g.rally > P.rally) stats.train('technique', 0.1, true); P.rally = g.rally; } // попал по мячу — техника
    // Геймы: настрой и живые мячи.
    const sum = g.games.get(L) + g.games.get(g.opp), won = g.games.get(L);
    if (sum > P.games) { stats.cheer(won > P.won ? 0.06 : -0.04); outfit.useBalls(); }
    P.games = sum; P.won = won;
  } else if (L.free) {
    // Прогулка: бегом устаёт, шагом отдыхает, сидя на скамейке снимает усталость.
    const v = L.vel.length(), sit = L.seat && L.seat.w > 0.9;
    L.stamina = Math.min(m.cap, Math.max(0, L.stamina + (v > 2.2 ? -0.03 * m.drain : sit ? 0.15 : 0.04 * m.recover) * dt));
    if (v > 2.2) stats.tire(dt * 0.06);
    if (sit) { stats.relieve(dt * 0.5, true); stats.mood += (Math.max(stats.mood, 0.1) - stats.mood) * dt * 0.02; }
  }
  P.sta0 = L.stamina;
  if (g.games && g.lev !== L) { P.games = g.games.get(g.lev) + g.games.get(g.opp); P.won = g.games.get(g.lev); } // замена играет — не наши геймы
  if (now > P.saveAt) { P.saveAt = now + 3; stats.save(); }
  gymTick(dt);
}

// Без сил на прогулке не бежит, в магазине и зале стоит.
// Усталость видно и на прогулке: от 70 Лёва идёт медленнее (к 100 — на треть).
export function input(a) {
  if (busy()) return { x: 0, y: 0, run: false };
  const k = 1 - 0.35 * Math.min(1, Math.max(0, (stats.fatigue - 70) / 30));
  return { ...a, x: a.x * k, y: a.y * k, run: a.run && stats.fatigue <= 85 && C?.lev.stamina >= 0.15 };
}
export const busy = () => shopOpen() || gymOpen();

// Клавиши: C — панель; Esc — закрыть; в зале — такт; ?debug: B — магазин, G — следующая станция зала (на прогулке).
export function key(e) {
  if (!C) return false;
  if (gymOpen()) return gymKey(e);
  if (shopOpen()) { if (e.code === 'Escape') closeShop(); return true; }
  if (e.code === 'KeyC' && !e.metaKey && !e.ctrlKey) { togglePanel(); return true; }
  if (P.panel && e.code === 'Escape') { togglePanel(false); return true; }
  if (!window.__eco) return false;
  if (e.code === 'KeyB') { openShop(); return true; }
  if (e.code === 'KeyG' && C.club.mode === 'walk') { const i = (P.gi = ((P.gi ?? -1) + 1) % DEBUG_GYM.length); openGym(DEBUG_GYM[i]); return true; }
  return false;
}

// После камеры (каждый кадр и в __lev.render): камера магазина или зала, HUD, сумка на спине.
const hud = { cash: null, sta: -1, fat: -1 };
export function view(dt, camera) {
  if (!C) return;
  const L = C.lev;
  showBag(L, (L.free && !gymOpen()) || shopOpen());
  if (gymOpen()) C.gymView(dt, camera); else if (shopOpen()) C.shopView(dt, camera);
  if (hud.cash !== wallet.balance) { hud.cash = wallet.balance; $('meCash').textContent = fmtCHF(wallet.balance); }
  const s = Math.round(L.stamina * 50) / 50, f = Math.round(stats.fatigue);
  if (s !== hud.sta) { hud.sta = s; $('meSta').firstChild.style.transform = `scaleX(${s})`; $('meSta').classList.toggle('low', s < 0.4); }
  if (f !== hud.fat) { hud.fat = f; $('meFat').firstChild.style.transform = `scaleX(${f / 100})`; $('meFat').classList.toggle('high', f > 70); }
  document.body.classList.toggle('busy', busy());
}

function togglePanel(on = !P.panel) {
  P.panel = on; $('panel').hidden = !on;
  if (on) fillPanel();
}
function fillPanel() {
  const row = (name, w, val) => `<dt>${name}</dt><dd><i><b style="transform:scaleX(${w})"></b></i><span>${val}</span></dd>`;
  $('panelStats').innerHTML = STATS.map((k) => row(STAT_NAMES[k], (stats.lvl[k] - 1) / 9, Stats.fmt(stats.lvl[k]))).join('')
    + row('Усталость', stats.fatigue / 100, `${Math.round(stats.fatigue)} из&nbsp;100`)
    + `<dt>Настрой</dt><dd class="txt">${stats.moodWord()}</dd><dt>Кошелёк</dt><dd class="txt">${fmtCHF(wallet.balance)}</dd>`;
  const r = ITEM[outfit.worn.racket], sh = ITEM[outfit.worn.shoes];
  const fx = [r.power !== 1 && `сила ${pct(r.power)}`, r.control !== 1 && `контроль ${pct(r.control)}`].filter(Boolean).join(', ');
  const items = [`Ракетка «${r.name}»${fx ? ` (${fx})` : ''}`, sh.name + (sh.speed > 1 ? ` (скорость ${pct(sh.speed)})` : ''),
    ...['shirt', 'shorts', 'cap', 'band', 'wrist', 'bag'].map((k) => ITEM[outfit.worn[k]]?.name).filter(Boolean)];
  if (outfit.balls) items.push(`Новые мячи ещё ${outfit.balls}&nbsp;${plural(outfit.balls, 'гейм', 'гейма', 'геймов')}`);
  $('panelWorn').innerHTML = 'Надето: ' + items.join(' · ').replace(/ (в|и|с|на|к) /g, ' $1&nbsp;');
}
export const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
