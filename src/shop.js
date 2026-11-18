// Магазин клуба: один экран — вкладки по разделам, в строке вещь, цена и «Купить», «Надеть» или «Снять».
// Купленное сразу надевается, Лёва стоит рядом в кадре — видно, как сидит. openShop() зовёт город (точка shop) или
// ?debug клавиша B. Деньги — economy.js, что куплено и надето — outfit.js.
import * as THREE from 'three';
import { CATALOG, ITEM, outfit } from './outfit.js';
import { wallet, fmtCHF } from './economy.js';
import { plural } from './profile.js';

const TABS = [['form', 'Форма', ['shirt', 'shorts']], ['shoes', 'Кроссовки', ['shoes']], ['rackets', 'Ракетки', ['racket', 'balls']], ['acc', 'Аксессуары', ['cap', 'band', 'wrist', 'bag']]];
const pct = (k) => `${k >= 1 ? '+' : '−'}${String(Math.round(Math.abs(k - 1) * 1000) / 10).replace('.', ',')}%`;
const nb = (s) => s.replace(/ (в|и|с|на|к|по) /g, ' $1 ');
let C = null, open = false, tab = 'form', last = null;
const $ = (id) => document.getElementById(id);

export function initShop(ctx) {
  C = ctx;
  document.body.insertAdjacentHTML('beforeend', `<div id="shop" role="dialog" aria-modal="true" aria-labelledby="shopH" hidden><div class="sheet">
    <div class="head"><b id="shopH">Магазин</b><span class="cash" id="shopCash"></span><button class="x" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <nav role="tablist">${TABS.map(([id, name]) => `<button type="button" role="tab" data-tab="${id}">${name}</button>`).join('')}</nav>
    <ul id="shopList"></ul></div></div>`);
  $('shop').querySelector('.x').addEventListener('click', closeShop);
  $('shop').querySelector('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  $('shopList').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) act(b.dataset.act, b.dataset.id); });
  wallet.on(() => open && render());
  ctx.shopView = view;
}
export const shopOpen = () => open;
export function openShop() {
  if (!C || open) return;
  open = true; $('shop').hidden = false; last = null; render();
}

function act(what, id) {
  const x = ITEM[id];
  if (what === 'buy') { if (!wallet.spend(x.price, x.name)) return; outfit.give(id); if (x.kind !== 'balls') outfit.wear(id); }
  if (what === 'wear') outfit.wear(id);
  if (what === 'off') outfit.takeOff(x.kind);
  render();
}

function swatch(x) {
  if (x.kind === 'shorts' && !x.color) return '<span class="sw stripe"></span>';
  return `<span class="sw" style="background:${x.color ?? (x.kind === 'balls' ? '#d9f04a' : '#f2f2ef')}"></span>`;
}
function render() {
  $('shopCash').textContent = fmtCHF(wallet.balance);
  for (const b of $('shop').querySelectorAll('nav button')) b.setAttribute('aria-selected', b.dataset.tab === tab);
  const kinds = TABS.find((t) => t[0] === tab)[2];
  $('shopList').innerHTML = CATALOG.filter((x) => kinds.includes(x.kind)).map((x) => {
    const own = outfit.has(x.id), worn = outfit.worn[x.kind] === x.id;
    const fx = x.kind === 'racket' ? [x.power !== 1 && `сила ${pct(x.power)}`, x.control !== 1 && `контроль ${pct(x.control)}`].filter(Boolean).join(', ')
      : x.kind === 'shoes' && x.speed > 1 ? `скорость ${pct(x.speed)}`
      : x.kind === 'balls' ? (outfit.balls ? `живые ещё ${outfit.balls} ${plural(outfit.balls, 'матч', 'матча', 'матчей')}` : `живой отскок ${x.matches} матча`) : '';
    const btn = (a, t, dis = false) => `<button type="button" data-act="${a}" data-id="${x.id}"${dis ? ' disabled' : ''}${a === 'buy' ? ' class="buy"' : ''}>${t}</button>`;
    const action = x.kind === 'balls' || !own ? `<span class="price">${fmtCHF(x.price)}</span>${btn('buy', 'Купить', !wallet.can(x.price))}`
      : worn ? (['cap', 'band', 'wrist', 'bag'].includes(x.kind) ? btn('off', 'Снять') : '<span class="on">Надето</span>') : btn('wear', 'Надеть');
    return `<li>${swatch(x)}<span class="nm">${nb(x.name)}${fx ? `<small>${fx[0].toUpperCase() + fx.slice(1)}</small>` : ''}</span><span class="act">${action}</span></li>`;
  }).join('');
}

// Камера примерки: спереди-сбоку от Лёвы на уровне груди, медленно качается. Кадр сдвинут смещением проекции, чтобы
// Лёва стоял в свободной части экрана: слева от листа на компьютере, над ним на телефоне.
const eye = new THREE.Vector3(), look = new THREE.Vector3();
let cam = null;
function view(dt, camera) {
  cam = camera;
  const L = C.lev, P = L.pos, yaw = L.netYaw + L.bodyTurn, t = performance.now() / 1000;
  const W = innerWidth, H = innerHeight, phone = W <= 640, d = phone ? 4.9 : 3.1, a = yaw + 0.35 + 0.15 * Math.sin(t * 0.3);
  eye.set(P.x + Math.sin(a) * d, P.y + 1.1, P.z + Math.cos(a) * d);
  const k = !last || !dt ? 1 : 1 - Math.exp(-dt * 4);
  if (!last) { last = true; camera.position.copy(eye); }
  camera.position.lerp(eye, k); look.set(P.x, P.y + 0.92, P.z); camera.lookAt(look);
  camera.setViewOffset(W, H, phone ? 0 : Math.min(420, W * 0.45) / 2, phone ? H * 0.29 : 0, W, H);
}
export function closeShop() { open = false; $('shop').hidden = true; cam?.clearViewOffset(); }
