#!/usr/bin/env node
// Снимает позы ударов из игры для корректирующих морфов (tools/rig-correctives.py): матрицы костей в осях модели
// и направление плеча в осях груди (src/correctives.js). Нужен dev-сервер на 3952.
//   node tools/rig-poses.mjs --who lev --out ref/rig/lev-poses.json [--q "&rig=2"] [--poses "fh:0.25,bh:0.25"]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const WHO = opt('who', 'lev'), OUT = opt('out', `ref/rig/${WHO}-poses.json`);
// Где линейный скиннинг мнёт плечо: замах назад, рука поперёк груди, вперёд-вверх на финише, над головой.
const POSES = opt('poses', 'fh:-0.3,fh:0.25,fh:0.5,bh:-0.3,bh:0.25,bh:0.5,oh:0').split(',').map((s) => s.split(':'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.routeWebSocket(/./, () => {});
await page.goto('http://localhost:3952/?debug&noao&nolog' + opt('q', ''));
await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
const data = await page.evaluate(async ([who, poses]) => {
  window.__pause = true; window.__noDraw = true;
  document.getElementById('play').click();
  const C = await import('/src/correctives.js');
  const rig = __lev.game[who].rig;
  let mesh = null; rig.root.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  const out = { names: mesh.skeleton.bones.map((b) => b.name), poses: [] };
  for (const [t, s] of poses) {
    __lev.pose(t, +s, who);
    rig.root.updateMatrixWorld(true);
    const inv = rig.root.matrixWorld.clone().invert();
    out.poses.push({
      name: `${t}${s}`,
      G: mesh.skeleton.bones.map((b) => inv.clone().multiply(b.matrixWorld).toArray()), // кость в осях модели, по столбцам
      u: Object.fromEntries(['Left', 'Right'].map((sd) => [sd, C.armInChest(rig, sd, mesh).toArray()])),
    });
  }
  return out;
}, [WHO, POSES]);
writeFileSync(OUT, JSON.stringify(data));
console.log('позы:', data.poses.map((p) => p.name).join(' '), '→', OUT);
await browser.close();
