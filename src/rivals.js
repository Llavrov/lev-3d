// Соперники для будущих турниров: вымышленные игроки, модели из Meshy (README, «Соперники»).
// style 0..1 — характер игры, 0,5 — как обычный соперник: serve — подача, net — выход к сетке, defense — бег и защита,
// power — сила удара, backhand — бэкхенд. Его читает ИИ в game.js (lean); общую силу по-прежнему задаёт ai.skill.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Player } from './player.js';
import { AI } from './game.js';

export const ROSTER = [
  { id: 'gh', name: 'Квеси Аманква', short: 'Аманква', country: 'Гана', model: '/models/rival-gh.glb', height: 1.93, racket: 'neon',
    style: { serve: 0.92, net: 0.85, defense: 0.45, power: 0.85, backhand: 0.5 } }, // мощная подача и игра у сетки
  { id: 'ch', name: 'Сильван Брюггер', short: 'Брюггер', country: 'Швейцария', model: '/models/rival-ch.glb', height: 1.86, racket: 'red',
    style: { serve: 0.7, net: 0.62, defense: 0.66, power: 0.62, backhand: 0.7 } }, // ровный универсал
  { id: 'jp', name: 'Рэн Курихара', short: 'Курихара', country: 'Япония', model: '/models/rival-jp.glb', height: 1.76, racket: 'white',
    style: { serve: 0.42, net: 0.3, defense: 0.95, power: 0.48, backhand: 0.66 } }, // быстрый защитник, всё отбирает
  { id: 'ru', name: 'Глеб Ветров', short: 'Ветров', country: 'Россия', model: '/models/rival-ru.glb', height: 1.89, racket: 'white',
    style: { serve: 0.62, net: 0.4, defense: 0.6, power: 0.75, backhand: 0.95 } }, // двуручный бэкхенд и характер
];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map(); // id → Player: переключение туда-обратно без повторной загрузки
let base = null; // обычный соперник (opp.glb), к нему возвращает setOpponent(game, null)

// Ставит соперника в матч вместо текущего: модель, рост, стиль; счёт, подача и сила ИИ остаются.
// rival = null — обратно обычный соперник. Ракетку (rival.racket) одевает main.js (dressAll).
export async function setOpponent(game, rival) {
  base ??= game.opp;
  const scene = game.opp.wrap.parent; // в сцене только текущий соперник, прежние из неё убраны
  let p = rival ? cache.get(rival.id) : base;
  if (!p) {
    const gltf = await loader.loadAsync(rival.model);
    p = new Player(scene, gltf, { side: -1, height: rival.height, racketColor: '#1d4f91' });
    p.rival = rival; p.style = rival.style;
    p.measure();
    cache.set(rival.id, p);
  }
  const old = game.opp;
  if (p === old) return p;
  for (const m of [game.pts, game.games]) { m.set(p, m.get(old)); m.delete(old); }
  if (game.server === old) game.server = p;
  if (game.lastHitter === old) game.lastHitter = p;
  old.onContact = old.onStep = old.onPlant = old.onSlide = null;
  scene.remove(old.wrap, old.racket); scene.add(p.wrap, p.racket);
  p.place(old.pos.clone());
  const skill = game.ai.skill;
  game.opp = p; game.hook(p);
  game.ai = new AI(p, game); game.ai.skill = skill;
  const nm = document.querySelector('#hud .side:last-child small'); // имя в счёте
  if (nm) nm.textContent = rival ? rival.short : 'Соперник';
  return p;
}

// Выбор соперника на стартовом экране (только ?debug, настоящий выбор будет в турнирах): строка как у ракетки.
export function rivalPicker(game, onChange) {
  const rk = document.getElementById('rk');
  const row = rk.cloneNode(true);
  row.id = 'rv'; row.hidden = false;
  const [prev, next] = row.querySelectorAll('button'), label = row.querySelector('span');
  prev.id = next.id = label.id = '';
  prev.setAttribute('aria-label', 'Предыдущий соперник'); next.setAttribute('aria-label', 'Следующий соперник');
  rk.after(row);
  let i = -1, busy = false;
  const show = () => { label.textContent = i < 0 ? 'Обычный соперник' : `${ROSTER[i].name}, ${ROSTER[i].country}`; };
  const go = async (d) => {
    if (busy || !document.body.classList.contains('menu')) return;
    busy = true; i = ((i + 1 + d + ROSTER.length + 1) % (ROSTER.length + 1)) - 1; show();
    try { await setOpponent(game, ROSTER[i] ?? null); onChange?.(); } finally { busy = false; }
  };
  prev.addEventListener('click', () => go(-1)); next.addEventListener('click', () => go(1));
  show();
}
