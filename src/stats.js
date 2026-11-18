// Характеристики Лёвы (решено с ним 18.11): сила — мощь удара, скорость — бег и разгон, выносливость — запас сил и
// восстановление, техника — точность. Уровень 1–10 дробный (на экране с одной десятой), растёт медленно: чем выше,
// тем меньше прибавка. Усталость 0–100 копится в матче, бегом на прогулке и в зале; снимают кофе, еда, отдых сидя и сон.
// Настрой −1..1 живёт дольше одного розыгрыша. Без DOM и three.js — проверяется в node (test/stats.test.mjs).

export const STATS = ['power', 'speed', 'stamina', 'technique'];
export const STAT_NAMES = { power: 'Сила', speed: 'Скорость', stamina: 'Выносливость', technique: 'Техника' };
const KEY = 'lev-stats', MAX = 10;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(v) ? v : d);

// Хранилище с защитой: в приватном окне localStorage бросает, в нём может лежать мусор.
export const safeStore = (ls = globalThis.localStorage) => ({
  get(k) { try { return JSON.parse(ls?.getItem(k) ?? 'null'); } catch { return null; } },
  set(k, v) { try { ls?.setItem(k, JSON.stringify(v)); } catch { /* без памяти — только на эту игру */ } },
});

export class Stats {
  constructor(store = safeStore()) {
    this.store = store;
    const s = store.get(KEY);
    this.lvl = Object.fromEntries(STATS.map((k) => [k, clamp(num(s?.lvl?.[k], 1), 1, MAX)]));
    this.fatigue = clamp(num(s?.fatigue, 0), 0, 100);
    this.mood = clamp(num(s?.mood, 0), -1, 1);
    this.listeners = new Set();
  }
  save() { this.store.set(KEY, { lvl: this.lvl, fatigue: this.fatigue, mood: this.mood }); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { this.save(); for (const fn of this.listeners) fn(what); }

  // Опыт в уровень: прибавка 0,01 за единицу опыта на первом уровне и меньше к десятому. Усталость режет пользу тренировки.
  // quiet — без сохранения (в матче опыт капает каждый кадр, сохраняет вызывающий раз в несколько секунд).
  train(stat, xp, quiet = false) {
    if (!STATS.includes(stat) || !(xp > 0)) return 0;
    const before = this.lvl[stat];
    this.lvl[stat] = Math.min(MAX, before + xp * 0.01 * ((MAX - before) / (MAX - 1)) * (1 - 0.6 * this.tired));
    if (!quiet) this.emit('train');
    return this.lvl[stat] - before;
  }
  tire(n) { this.fatigue = clamp(this.fatigue + n, 0, 100); }
  // Кофе, еда, отдых: снять усталость (без сохранения на каждый кадр — его делает вызывающий раз в несколько секунд).
  relieve(n, quiet = false) { this.fatigue = clamp(this.fatigue - n, 0, 100); if (!quiet) this.emit('relieve'); }
  eat(kind) { const k = { coffee: [12, 0.05], food: [25, 0.08] }[kind] ?? [0, 0]; this.mood = clamp(this.mood + k[1], -1, 1); this.relieve(k[0]); }
  sleep() { this.fatigue = 0; this.mood = clamp(this.mood * 0.5 + 0.15, -1, 1); this.emit('sleep'); }
  cheer(d) { this.mood = clamp(this.mood + d, -1, 1); }

  // 0..1: насколько усталость уже мешает. До 30 не мешает совсем, к 100 — полностью.
  get tired() { return clamp((this.fatigue - 30) / 70, 0, 1); }

  // Множители для игры. gear — что надето: racket { power, control }, shoes { speed }. Уровень 1 без экипировки — всё 1:
  // игра как до характеристик. На десятом уровне: бег +10%, удар +6%, разброс −24%, расход сил −31%.
  mods(gear = {}) {
    const L = (k) => this.lvl[k] - 1, t = this.tired;
    return {
      speed: (1 + 0.011 * L('speed')) * (1 - 0.1 * t) * (gear.shoes?.speed ?? 1),
      accel: (1 + 0.015 * L('speed')) * (1 - 0.12 * t),
      power: (1 + 0.007 * L('power')) * (gear.racket?.power ?? 1),
      err: ((1 - 0.027 * L('technique')) * (1 + 0.6 * t)) / (gear.racket?.control ?? 1),
      drain: (1 - 0.035 * L('stamina')) * (1 + 0.4 * t),
      recover: 1 + 0.06 * L('stamina'),
      cap: 1 - 0.67 * t, // потолок выносливости: уставшее тело не отдыхает до конца, к 100 (0,33) — руки на коленях между очками
    };
  }
  // Сколько уровня можно показать: «4,3».
  static fmt(v) { return v.toFixed(1).replace('.', ','); }
  moodWord() { return this.mood > 0.35 ? 'Боевой' : this.mood < -0.25 ? 'Подавлен' : 'Ровный'; }
}

export const stats = new Stats();
