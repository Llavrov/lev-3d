// Маска формы Лёвы для перекраса (outfit.js): модель — один меш Meshy с запечённой текстурой, поэтому футболку, шорты
// и кроссовки находим офлайн по цвету текселя и по тому, на какой высоте тела лежит треугольник с этим текселем.
// R — футболка (белая, торс и рукава), G — шорты (голубые в полоску), B — кроссовки (низ стопы). Мягкий край — 1–2 текселя.
//   node tools/outfit-mask.mjs [--url http://localhost:3967] [--dump test-out/eco/mask]   (нужен запущенный vite)
// Пишет public/models/lev-mask.png (1024²); --dump — ещё текстуру и карту высот для проверки глазами.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const URL = opt('url', 'http://localhost:3952'), DUMP = opt('dump', '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(URL + '/?debug&nolog&noao', { timeout: 120000 });
await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt, null, { timeout: 120000 });

const out = await page.evaluate(async (dump) => {
  window.__pause = true; window.__noDraw = true;
  let mesh = null;
  __lev.game.lev.wrap.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const g = mesh.geometry, P = g.attributes.position, U = g.attributes.uv, I = g.index;
  // Высота — по самой длинной оси рамки (модель в A-позе стоит), 0 — подошва, 1 — макушка.
  g.computeBoundingBox();
  const bb = g.boundingBox, size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const ax = size.indexOf(Math.max(...size)), lo = [bb.min.x, bb.min.y, bb.min.z][ax], len = size[ax];
  const other = [0, 1, 2].filter((a) => a !== ax);
  const mid = other.map((a) => ([bb.min.x, bb.min.y, bb.min.z][a] + [bb.max.x, bb.max.y, bb.max.z][a]) / 2);
  const W = 1024;
  // Карта по UV: высота (0..1) и расстояние от оси тела вбок (руки дальше), растеризуем треугольники.
  const H = new Float32Array(W * W).fill(-1), S = new Float32Array(W * W);
  const get = (i, a) => [P.getX(i), P.getY(i), P.getZ(i)][a];
  const n = I ? I.count : P.count;
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => (I ? I.getX(t + k) : t + k));
    const uv = v.map((i) => [U.getX(i) * W, U.getY(i) * W]); // glTF: v сверху вниз (flipY = false)
    const h = v.reduce((s, i) => s + (get(i, ax) - lo) / len, 0) / 3;
    const side = v.reduce((s, i) => s + Math.abs(get(i, other[0]) - mid[0]) / len, 0) / 3;
    const x0 = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...uv.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[1])))), y1 = Math.min(W - 1, Math.ceil(Math.max(...uv.map((p) => p[1]))));
    const [a, b, c] = uv, den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      if (l1 < -0.02 || l2 < -0.02 || 1 - l1 - l2 < -0.02) continue; // чуть шире: швы развёртки без щелей
      H[y * W + x] = h; S[y * W + x] = side;
    }
  }
  // Текстура в тот же размер.
  const img = mesh.material.map.image, cv = new OffscreenCanvas(W, W), cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0, W, W);
  const tex = cx.getImageData(0, 0, W, W).data;
  // Классы: ткань светлая и серая — футболка выше пояса, ниже стопы — кроссовки; голубая — шорты.
  const m = new Uint8ClampedArray(W * W * 4);
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < W * W; i++) {
    const h = H[i], r = tex[i * 4] / 255, gg = tex[i * 4 + 1] / 255, bl = tex[i * 4 + 2] / 255;
    m[i * 4 + 3] = 255;
    if (h < 0) continue;
    const lum = 0.299 * r + 0.587 * gg + 0.114 * bl, sat = Math.max(r, gg, bl) - Math.min(r, gg, bl);
    const white = ss(0.38, 0.55, lum) * (1 - ss(0.07, 0.14, sat));
    const blue = ss(0.02, 0.07, bl - r) * ss(0.25, 0.4, lum); // голубое: синего больше красного, кожа наоборот
    const shirt = white * (1 - blue) * ss(0.47, 0.5, h) * (1 - ss(0.86, 0.88, h)); // от подола до воротника
    const shorts = Math.max(blue, white * 0.9) * ss(0.36, 0.39, h) * (1 - ss(0.53, 0.56, h)) * (1 - shirt);
    const shoe = Math.max(white, ss(0.1, 0.3, 1 - sat * 3) * 0.6) * (1 - ss(0.055, 0.075, h));
    m[i * 4] = 255 * shirt; m[i * 4 + 1] = 255 * shorts; m[i * 4 + 2] = 255 * shoe;
  }
  // Швы развёртки: маску растягиваем в пустые поля между островами (там нет текстуры), иначе на дальних уровнях
  // мип-карты край острова смешивается с чёрным и перекрас рвётся белыми трещинами по швам.
  for (let pass = 0; pass < 2; pass++) { // два текселя: дальше поле может дойти до соседнего острова кожи
    const src = m.slice();
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (H[i] >= 0) continue;
      for (let ch = 0; ch < 3; ch++) m[i * 4 + ch] = Math.max(src[i * 4 + ch], src[(i - 1) * 4 + ch], src[(i + 1) * 4 + ch], src[(i - W) * 4 + ch], src[(i + W) * 4 + ch]);
    }
  }
  const toPng = async (data) => { const c = new OffscreenCanvas(W, W); c.getContext('2d').putImageData(new ImageData(data, W, W), 0, 0); const b = await c.convertToBlob({ type: 'image/png' }); return [...new Uint8Array(await b.arrayBuffer())]; };
  // Средняя линейная яркость ткани по каждому каналу маски — к ней outfit.js приводит перекрас (REF).
  const lin = (c) => ((c / 255 + 0.055) / 1.055) ** 2.4, ref = [0, 1, 2].map((ch) => {
    let s = 0, n = 0;
    for (let i = 0; i < W * W; i++) if (H[i] >= 0 && m[i * 4 + ch] > 128) { s += 0.2126 * lin(tex[i * 4]) + 0.7152 * lin(tex[i * 4 + 1]) + 0.0722 * lin(tex[i * 4 + 2]); n++; }
    return +(s / Math.max(n, 1)).toFixed(3);
  });
  const res = { mask: await toPng(m), axis: ax, size, ref };
  if (dump) {
    res.tex = await toPng(new Uint8ClampedArray(tex));
    const hm = new Uint8ClampedArray(W * W * 4);
    for (let i = 0; i < W * W; i++) { const h = H[i]; hm[i * 4] = h < 0 ? 0 : 255 * h; hm[i * 4 + 1] = h < 0 ? 0 : 255 * Math.min(1, S[i] * 4); hm[i * 4 + 2] = h < 0 ? 80 : 0; hm[i * 4 + 3] = 255; }
    res.hmap = await toPng(hm);
  }
  return res;
}, !!DUMP);
await browser.close();
writeFileSync('public/models/lev-mask.png', Buffer.from(out.mask));
if (DUMP) {
  mkdirSync(DUMP, { recursive: true });
  writeFileSync(join(DUMP, 'tex.png'), Buffer.from(out.tex)); writeFileSync(join(DUMP, 'hmap.png'), Buffer.from(out.hmap)); writeFileSync(join(DUMP, 'mask.png'), Buffer.from(out.mask));
}
console.log('маска: public/models/lev-mask.png', { axis: out.axis, size: out.size.map((v) => +v.toFixed(3)), ref: { shirt: out.ref[0], shorts: out.ref[1], shoes: out.ref[2] } });
