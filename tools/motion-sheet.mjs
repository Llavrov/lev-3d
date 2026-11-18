#!/usr/bin/env node
// Лист кадров подряд «видео | было | стало»: ряды по 1/30 с, выровненные по моменту удара, с подписями — видно плавность,
// а не позу. node tools/motion-sheet.mjs sheet.json out.png
// sheet.json: { cellH: 220, rows: [{ label, dir, pattern: 'back-%03d.png', from: 30, count: 20, step: 1, crop: [x, y, w, h] }] }
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8')), H = spec.cellH ?? 220;
const name = (p, i) => p.replace(/%0(\d)d/, (_, n) => String(i).padStart(+n, '0'));
const rows = spec.rows.map((r) => {
  const [x, y, w, h] = r.crop, k = H / h, step = r.step ?? 1;
  const cells = Array.from({ length: r.count }, (_, j) => {
    const f = 'file://' + resolve(r.dir, name(r.pattern, r.from + j * step));
    return `<div style="flex:none;width:${w * k}px;height:${H}px;background:url('${f}') ${-x * k}px ${-y * k}px / ${r.srcW * k}px auto no-repeat"></div>`;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:2px;margin-bottom:4px"><div style="flex:none;width:90px;font:13px -apple-system,sans-serif">${r.label}</div>${cells}</div>`;
}).join('');
const html = join(dirname(resolve(out)), '.sheet.html');
writeFileSync(html, `<html><body style="margin:6px;background:#fff">${rows}</body></html>`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto('file://' + html);
await page.waitForLoadState('load');
const size = await page.evaluate(() => [Math.max(...[...document.body.children].map((r) => [...r.children].reduce((w, c) => w + c.getBoundingClientRect().width + 2, 0))) + 12, document.body.scrollHeight + 12].map(Math.ceil));
await page.setViewportSize({ width: size[0], height: size[1] });
await page.screenshot({ path: out });
await browser.close();
console.log(out, size.join('×'));
