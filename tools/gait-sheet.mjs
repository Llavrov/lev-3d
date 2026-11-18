#!/usr/bin/env node
// Листы «было — стало» по сценариям tools/gait.mjs: ряды сбоку и сзади (на корте — сверху), кадры через 1/15 с.
//   node tools/gait-sheet.mjs test-out/gait-before test-out/gait-after test-out/gait-sheets [walk,jog,...]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [A, B, OUT, only] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
// Окно кадров (номер кадра 1/30 с, сколько ячеек через 2 кадра) и рамка вокруг игрока на кадре 420×520.
const WIN = { idle: [0, 16], walk: [30, 16], jog: [24, 16], sprint: [44, 16], turn: [30, 20], turn90: [6, 18], stop: [34, 16], 'court-run': [6, 20], 'court-back': [6, 18] };
const CROP = { side: [90, 90, 240, 320], back: [90, 50, 240, 360], top: [60, 60, 300, 360] };
for (const [name, [from, count]] of Object.entries(WIN)) {
  if (only && !only.split(',').includes(name)) continue;
  const views = name.startsWith('court') ? ['top'] : ['side', 'back'], rows = [];
  for (const v of views) for (const [label, dir] of [['было', A], ['стало', B]]) {
    if (!existsSync(join(dir, name, `${v}-${String(from).padStart(3, '0')}.png`))) continue;
    rows.push({ label: `${label}, ${v === 'side' ? 'сбоку' : v === 'back' ? 'сзади' : 'сверху'}`, dir: join(dir, name), pattern: `${v}-%03d.png`, from, count, step: 2, crop: CROP[v], srcW: 420 });
  }
  const spec = join(OUT, `${name}.json`);
  writeFileSync(spec, JSON.stringify({ cellH: 230, rows }));
  execFileSync('node', ['tools/motion-sheet.mjs', spec, join(OUT, `${name}.png`)], { stdio: 'inherit' });
}
