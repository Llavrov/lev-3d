// Кошелёк Лёвы в франках: earn — начислить (работа, призовые), spend — потратить (магазин), история последних операций.
// Работу (тренер, турниры, бариста, спарринг) подключат позже: ей достаточно earn(сумма, за что).
import { safeStore } from './stats.js';

const KEY = 'lev-wallet', START = 150, KEEP = 40; // стартовые 150 CHF: на пару вещей, не на весь магазин

export class Wallet {
  constructor(store = safeStore()) {
    this.store = store;
    const s = store.get(KEY);
    this.balance = Number.isFinite(s?.balance) && s.balance >= 0 ? Math.round(s.balance) : START;
    this.history = Array.isArray(s?.history) ? s.history.filter((h) => h && Number.isFinite(h.amount) && typeof h.why === 'string').slice(0, KEEP) : [];
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  log(amount, why) {
    this.history.unshift({ amount, why, at: Date.now() });
    this.history.length = Math.min(this.history.length, KEEP);
    this.store.set(KEY, { balance: this.balance, history: this.history });
    for (const fn of this.listeners) fn(amount, why);
  }
  // Начислить: только целые положительные франки. Возвращает новый баланс.
  earn(amount, why = '') {
    const n = Math.round(amount);
    if (!(n > 0)) return this.balance;
    this.balance += n; this.log(n, why);
    return this.balance;
  }
  // Потратить: хватает — списывает и возвращает true, нет — ничего не меняет.
  spend(amount, what = '') {
    const n = Math.round(amount);
    if (!(n >= 0) || n > this.balance) return false;
    this.balance -= n; this.log(-n, what);
    return true;
  }
  can(amount) { return Math.round(amount) <= this.balance; }
}

export const wallet = new Wallet();
export const earn = (amount, why) => wallet.earn(amount, why);
export const spend = (amount, what) => wallet.spend(amount, what);
export const fmtCHF = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} CHF`; // «1 250 CHF», неразрывные пробелы
