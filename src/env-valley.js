// Долина живая: деревни из шале с церковью, сараи по лугам, хижины на альпийских лугах, пара шале у клуба.
// Дом — коробка с фасадом с холста (внизу белая штукатурка, сверху тёмное дерево, окна со ставнями, балкон)
// и двускатная крыша с выносом. Всё инстансами: сотни домов — четыре вызова отрисовки.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, padDist, roadX, riverX } from './env-mountains.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);


function facade() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(5);
  g.fillStyle = '#e9e3d6'; g.fillRect(0, 128, 256, 128); // штукатурка
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,110,95,${r() * 0.08})`; g.fillRect(r() * 256, 128 + r() * 128, 3 + r() * 10, 2 + r() * 6); }
  g.fillStyle = '#9a9488'; g.fillRect(0, 238, 256, 18); // цоколь
  for (let i = 0; i < 16; i++) { const v = 0.8 + r() * 0.3; g.fillStyle = `rgb(${92 * v | 0},${58 * v | 0},${34 * v | 0})`; g.fillRect(i * 16, 0, 16, 128); g.fillStyle = 'rgba(25,15,8,0.6)'; g.fillRect(i * 16, 0, 1.5, 128); } // доски
  const win = (x, y, w, h, shutters) => {
    if (shutters) { g.fillStyle = '#2f5a3a'; g.fillRect(x - w * 0.55, y, w * 0.5, h); g.fillRect(x + w * 1.05, y, w * 0.5, h); }
    g.fillStyle = '#f2efe8'; g.fillRect(x - 3, y - 3, w + 6, h + 6); g.fillStyle = '#26303a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f2efe8'; g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h * 0.45, w, 3);
  };
  for (const x of [40, 112, 184]) { win(x, 160, 30, 40, true); win(x, 40, 30, 36, false); }
  g.fillStyle = '#5a361d'; g.fillRect(0, 96, 256, 22); g.fillStyle = 'rgba(30,18,10,0.7)'; for (let x = 4; x < 256; x += 9) g.fillRect(x, 96, 3, 22); // балкон
  g.fillStyle = '#c0392b'; for (let x = 10; x < 256; x += 22) { g.beginPath(); g.arc(x, 94, 5, 0, 7); g.fill(); } // герань на балконе
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function planks() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = rng(8);
  for (let i = 0; i < 8; i++) { const v = 0.75 + r() * 0.4; g.fillStyle = `rgb(${70 * v | 0},${46 * v | 0},${30 * v | 0})`; g.fillRect(i * 8, 0, 8, 64); g.fillStyle = 'rgba(20,12,6,0.7)'; g.fillRect(i * 8, 0, 1, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Единичный дом: стены 1×1×1 (низ в нуле), крыша с выносом 15 %, конёк на 0.45 над стенами.
function roofGeometry() {
  const o = 0.65, h = 0.45, P = [-o, 1, -o, o, 1, -o, 0, 1 + h, -o, -o, 1, o, o, 1, o, 0, 1 + h, o];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}
function churchGeometry() { // башня с шатром, неф с крышей; низ в нуле, высота ~1 условная = 30 м
  const nave = new THREE.BoxGeometry(0.45, 0.32, 0.75).translate(0, 0.16, 0.2);
  const roof = new THREE.ConeGeometry(0.42, 0.22, 4, 1).rotateY(Math.PI / 4).scale(0.76, 1, 1.25).translate(0, 0.43, 0.2);
  const tower = new THREE.BoxGeometry(0.2, 0.75, 0.2).translate(0, 0.375, -0.28);
  const spire = new THREE.ConeGeometry(0.15, 0.4, 4, 1).rotateY(Math.PI / 4).translate(0, 0.95, -0.28);
  return [mergeGeometries([nave, tower].map((g) => g.deleteAttribute('uv') && g)), mergeGeometries([roof, spire].map((g) => g.deleteAttribute('uv') && g))];
}

export function buildValley(trees) {
  const g = new THREE.Group(); g.name = 'valley';
  const r = rng(61), homes = [], barns = [], churches = [];
  const clear = (x, z, gap, list) => list.every((h) => (h[0] - x) ** 2 + (h[1] - z) ** 2 > gap * gap);
  const slope = (x, z) => { const e = 6; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); };
  // Деревни: [x, z, радиус, домов]. Перед игровой камерой (−z) и за спиной Лёвы (+z, видно из меню).
  for (const [cx, cz, R, n] of [[-60, -950, 150, 40], [230, -1900, 120, 26], [-250, -3300, 170, 32], [90, 1300, 150, 34], [-300, 2600, 120, 20]]) {
    churches.push([cx + 20, cz, 0.6 + r() * 0.2]);
    for (let k = 0; k < n * 20 && homes.length < 9999; k++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d * 0.7, z = cz + Math.sin(a) * d * 1.3; // деревня вытянута вдоль долины
      if (Math.abs(x - roadX(z)) < 9 || Math.abs(x - riverX(z)) < 25 || !clear(x, z, 17, homes) || !clear(x, z, 30, churches) || slope(x, z) > 0.25) continue;
      homes.push([x, z, 9 + r() * 5, 6 + r() * 3, 8 + r() * 4, Math.atan2(-(x - cx), 1) * 0.3 + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.3]);
      if (homes.filter((h) => Math.hypot(h[0] - cx, h[1] - cz) < R * 1.4).length >= n) break;
    }
  }
  // Пара шале у клуба на склонах холма: их видно из меню и с корта сбоку.
  for (const [x, z, rot] of [[-78, 66, 0.4], [92, 58, -0.3], [-96, -64, 1.2], [118, -40, 1.5], [70, 118, 0.1]]) {
    if (trees.every((t) => (t[1] - x) ** 2 + (t[2] - z) ** 2 > 81)) homes.push([x, z, 11, 7, 9, rot]);
  }
  // Сараи по лугам дна долины и хижины на альпийских лугах (выше леса, на пологом).
  // Перед кортом ближе 900 м сараев нет: игровая камера видит над забором полосу долины, россыпь домиков там рябит.
  for (let k = 0; k < 6000 && barns.length < 120; k++) {
    const a = r() * 6.283, d = 300 + Math.pow(r(), 1.3) * 6500, x = Math.sin(a) * d * 1.2, z = -Math.cos(a) * d, y = heightAt(x, z) + 18;
    const alp = y > 1300 && y < 2100, flat = y < 60;
    if (z < 0 && d < 900 && Math.abs(x) < 500) continue;
    if (!(alp || flat) || slope(x, z) > (alp ? 0.45 : 0.12) || Math.abs(x - riverX(z)) < 20 || Math.abs(x - roadX(z)) < 8 || !clear(x, z, 60, barns) || padDist(x, z) < 50) continue;
    barns.push([x, z, 5 + r() * 3, 3.5 + r() * 1.5, 4 + r() * 3, r() * 6.283]);
  }
  const fac = facade(), walls = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roof = roofGeometry();
  const wallMat = new THREE.MeshLambertMaterial({ map: fac }), roofMat = new THREE.MeshLambertMaterial({ color: '#4a4440' });
  const barnMat = new THREE.MeshLambertMaterial({ map: planks() }); // сарай: только почерневшие доски, без окон
  const put = (list, tint, roofTint, mat = wallMat) => {
    const a = new THREE.InstancedMesh(walls, mat, list.length), b = new THREE.InstancedMesh(roof, roofMat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach(([x, z, w, h, d, rot], i) => {
      const y = Math.min(heightAt(x - w / 2, z), heightAt(x + w / 2, z), heightAt(x, z - d / 2), heightAt(x, z + d / 2)) - 0.3;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(w, h, d)); a.setMatrixAt(i, m4); b.setMatrixAt(i, m4);
      a.setColorAt(i, tint(r)); b.setColorAt(i, roofTint(r));
    });
    g.add(a, b); // тени не нужны: дома дальше карты теней клуба
  };
  put(homes, (rr) => new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rr() * 0.15), (rr) => new THREE.Color().setHSL(0.06, 0.12, 0.42 + rr() * 0.25));
  put(barns, (rr) => new THREE.Color(1, 1, 1).multiplyScalar(0.7 + rr() * 0.4), (rr) => new THREE.Color().setHSL(0.07, 0.1, 0.35 + rr() * 0.2), barnMat);
  const [cw, cr] = churchGeometry(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const ch = new THREE.InstancedMesh(cw, new THREE.MeshLambertMaterial({ color: '#efeae0' }), churches.length), chr = new THREE.InstancedMesh(cr, new THREE.MeshLambertMaterial({ color: '#5d3a2a' }), churches.length);
  churches.forEach(([x, z, s], i) => { m4.compose(new THREE.Vector3(x, heightAt(x, z) - 0.5, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2), new THREE.Vector3(30 * s, 30 * s, 30 * s)); ch.setMatrixAt(i, m4); chr.setMatrixAt(i, m4); });
  g.add(ch, chr);
  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}
