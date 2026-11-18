#!/usr/bin/env node
// Кривые движения: видео Лёвы (Vision 3D, tools/pose-track.swift) и игра (кости, tools/motion.mjs) одними метриками.
//   node tools/motion-report.mjs spec.json out-dir
// spec: [{ label, game: 'test-out/motion/fh' } | { label, video: 'track.json', from, to }, t0 — момент удара (с) для выравнивания].
// Метрики: углы колена, бедра, локтя; наклон корпуса вперёд и вбок; поворот таза и плеч и их разница; высота таза;
// ширина стойки; угловая скорость и ускорение сегментов (рывки); скольжение стоящей ступни. Графики — SVG, снимок Chromium.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [specPath, OUT] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
mkdirSync(OUT, { recursive: true });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a), norm = (a) => { const l = len(a) || 1; return a.map((v) => v / l); };
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2), scale = (a, k) => a.map((v) => v * k);
const flat = (a, up) => norm(sub(a, scale(up, dot(a, up))));
const ang = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180) / Math.PI;
const signed = (a, b, up) => (Math.atan2(dot(cross(a, b), up), dot(a, b)) * 180) / Math.PI; // от a к b вокруг up
const GAME = { root: 'Hips', neck: 'Neck', lSh: 'LeftArm', rSh: 'RightArm', lEl: 'LeftForeArm', rEl: 'RightForeArm', lWr: 'LeftHand', rWr: 'RightHand',
  lHip: 'LeftUpLeg', rHip: 'RightUpLeg', lKn: 'LeftLeg', rKn: 'RightLeg', lAn: 'LeftFoot', rAn: 'RightFoot' };

// Метрики одной позы: P — точки по именам Vision, up — вертикаль в тех же осях, camX — ось «вправо» для поворота таза.
function metrics(P, up, yawRef) {
  const r = flat(sub(P.rHip, P.lHip), up), f = cross(up, r), t = sub(P.neck, P.root), sh = flat(sub(P.rSh, P.lSh), up);
  const flex = (a, b, c) => 180 - ang(sub(a, b), sub(c, b));
  const lowAn = dot(P.lAn, up) < dot(P.rAn, up) ? P.lAn : P.rAn;
  return {
    kneeL: flex(P.lHip, P.lKn, P.lAn), kneeR: flex(P.rHip, P.rKn, P.rAn),
    hipL: flex(P.neck, P.lHip, P.lKn), hipR: flex(P.neck, P.rHip, P.rKn),
    elbowL: flex(P.lSh, P.lEl, P.lWr), elbowR: flex(P.rSh, P.rEl, P.rWr),
    leanF: (Math.atan2(dot(t, f), dot(t, up)) * 180) / Math.PI, leanS: (Math.atan2(dot(t, r), dot(t, up)) * 180) / Math.PI,
    pelvisYaw: yawRef ? signed(yawRef, r, up) : 0, sep: signed(r, sh, up), // sep — плечи от таза (X-фактор)
    pelvisH: dot(sub(P.root, lowAn), up), stance: len(sub(sub(P.lAn, P.rAn), scale(up, dot(sub(P.lAn, P.rAn), up)))) / len(sub(P.lHip, P.rHip)),
    seg: { thighL: norm(sub(P.lKn, P.lHip)), thighR: norm(sub(P.rKn, P.rHip)), shinL: norm(sub(P.lAn, P.lKn)), shinR: norm(sub(P.rAn, P.rKn)),
      armR: norm(sub(P.rEl, P.rSh)), foreR: norm(sub(P.rWr, P.rEl)), armL: norm(sub(P.lEl, P.lSh)), foreL: norm(sub(P.lWr, P.lEl)), trunk: norm(t), pelvis: r, shoulders: sh },
  };
}

function loadSeries(s) {
  let rows = [];
  if (s.game) {
    const d = JSON.parse(readFileSync(join(s.game, 'frames.json'), 'utf8'));
    const tc = d.frames.find((f) => f.stroke?.contacted)?.t;
    const t0 = s.t0 ?? (tc != null ? tc - 1 / 60 : 0); // касание внутри кадра: середина
    rows = d.frames.map((f) => {
      const P = Object.fromEntries(Object.entries(GAME).map(([k, b]) => [k, f.bones[b]]));
      const m = metrics(P, [0, 1, 0], [1, 0, 0]);
      const feet = ['Left', 'Right'].map((k) => f.feet[k]);
      return { t: f.t - t0, ...m, hipY: f.bones.Hips[1], anklePos: [f.bones.LeftFoot, f.bones.RightFoot], planted: feet.map((x) => !x.step && x.lift < 0.003), speed: Math.hypot(f.vel[0], f.vel[2]), stroke: f.stroke };
    });
  } else {
    const d = JSON.parse(readFileSync(s.video, 'utf8')), fps = s.fps ?? 29.97;
    for (let i = s.from; i < s.to; i++) {
      const r = d[i];
      if (!r?.j3 || !r.camUp) { rows.push(null); continue; }
      const m = metrics(r.j3, norm(r.camUp), norm(r.camX ?? [1, 0, 0]));
      rows.push({ t: (i - s.from) / fps - (s.t0 ?? 0), ...m });
    }
    // Пропуски Vision — соседним кадром.
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = { ...(rows[i - 1] ?? rows.find(Boolean)), t: (i) / fps - (s.t0 ?? 0) };
  }
  return rows;
}

// Сглаживание как у видео (Vision дрожит): медиана 3 + среднее 3. Для честного сравнения — одинаково для всех рядов.
const smooth = (xs) => {
  const m3 = xs.map((_, i) => [xs[Math.max(0, i - 1)], xs[i], xs[Math.min(xs.length - 1, i + 1)]].sort((a, b) => a - b)[1]);
  return m3.map((_, i) => (m3[Math.max(0, i - 1)] + m3[i] + m3[Math.min(m3.length - 1, i + 1)]) / 3);
};
const SCAL = ['kneeL', 'kneeR', 'hipL', 'hipR', 'elbowL', 'elbowR', 'leanF', 'leanS', 'sep', 'pelvisH', 'stance', 'pelvisYaw'];
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

const series = spec.map((s) => {
  const rows = loadSeries(s), dt = rows.length > 1 ? rows[1].t - rows[0].t : 1 / 30;
  const sm = Object.fromEntries(SCAL.map((k) => [k, s.raw ? rows.map((r) => r[k]) : smooth(rows.map((r) => r[k]))]));
  // Угловая скорость сегментов (°/с) и её изменение за кадр (°/с²): рывок — всплеск ускорения.
  const segs = Object.keys(rows[0].seg), w = {};
  for (const k of segs) {
    const v = rows.map((r, i) => (i ? ang(rows[i - 1].seg[k], r.seg[k]) / dt : 0)); v[0] = v[1] ?? 0;
    w[k] = s.raw ? v : smooth(v);
  }
  const acc = {}; for (const k of segs) acc[k] = w[k].map((v, i) => (i ? Math.abs(v - w[k][i - 1]) / dt : 0));
  // Скольжение: стоящая ступня (по флагу игры) сдвинулась по корту, см за кадр.
  let slide = null;
  if (rows[0].anklePos) slide = rows.map((r, i) => (i ? Math.max(...[0, 1].map((k) => (r.planted[k] && rows[i - 1].planted[k] ? Math.hypot(r.anklePos[k][0] - rows[i - 1].anklePos[k][0], r.anklePos[k][2] - rows[i - 1].anklePos[k][2]) * 100 : 0))) : 0));
  const sum = { label: s.label, frames: rows.length };
  for (const k of SCAL) { const xs = sm[k]; sum[k] = [Math.min(...xs), +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), Math.max(...xs)].map((v) => +(+v).toFixed(k === 'pelvisH' || k === 'stance' ? 3 : 1)); }
  sum.pelvisBob = +(Math.max(...sm.pelvisH) - Math.min(...sm.pelvisH)).toFixed(3);
  sum.pelvisVz95 = +(pct(sm.pelvisH.map((h, i) => (i ? Math.abs(h - sm.pelvisH[i - 1]) / dt : 0)), 0.95)).toFixed(2); // м/с
  sum.w95 = Object.fromEntries(segs.map((k) => [k, Math.round(pct(w[k], 0.95))]));
  sum.acc95 = Object.fromEntries(segs.map((k) => [k, Math.round(pct(acc[k], 0.95))]));
  sum.accMax = Object.fromEntries(segs.map((k) => { const i = acc[k].indexOf(Math.max(...acc[k])); return [k, [Math.round(acc[k][i]), +rows[i].t.toFixed(2)]]; }));
  if (slide) sum.slideMaxCm = +Math.max(...slide).toFixed(1);
  // Таз по высоте над кортом (только игра): скачок за кадр и вторая разность — «таз прыгает».
  if (rows[0].hipY != null) {
    const y = rows.map((r) => r.hipY), d1 = y.slice(1).map((h, i) => Math.abs(h - y[i]) * 100), d2 = y.slice(2).map((h, i) => Math.abs(h - 2 * y[i + 1] + y[i]) * 100);
    Object.assign(sum, { hipRangeCm: +((Math.max(...y) - Math.min(...y)) * 100).toFixed(1), hipJumpMaxCm: +Math.max(...d1).toFixed(1), hipJump95Cm: +pct(d1, 0.95).toFixed(1), hipD2MaxCm: +Math.max(...d2).toFixed(1) });
  }
  return { ...s, rows, sm, w, acc, slide, sum };
});
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(series.map((s) => s.sum), null, 1));

// Графики: по метрике — все ряды на общей оси времени (0 — удар).
const COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#7768ae', '#f3a712', '#555'];
function chart(title, get, unit) {
  const W = 560, H = 190, L = 44, B = 22;
  const all = series.flatMap((s) => s.rows.map((r, i) => [r.t, get(s, i)]).filter(([, v]) => Number.isFinite(v)));
  const t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
  let v0 = Math.min(...all.map((p) => p[1])), v1 = Math.max(...all.map((p) => p[1])); if (v1 - v0 < 1e-6) v1 = v0 + 1;
  const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - 8), Y = (v) => 8 + (1 - (v - v0) / (v1 - v0)) * (H - B - 8);
  const lines = series.map((s, k) => `<polyline fill="none" stroke="${COLORS[k % 6]}" stroke-width="1.6" points="${s.rows.map((r, i) => `${X(r.t).toFixed(1)},${Y(get(s, i)).toFixed(1)}`).join(' ')}"/>`).join('');
  const zero = t0 < 0 && t1 > 0 ? `<line x1="${X(0)}" x2="${X(0)}" y1="8" y2="${H - B}" stroke="#bbb" stroke-dasharray="3 3"/>` : '';
  return `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${zero}
    <text x="${L}" y="${H - 6}" font-size="10">${t0.toFixed(2)} с</text><text x="${W - 50}" y="${H - 6}" font-size="10">${t1.toFixed(2)} с</text>
    <text x="2" y="14" font-size="10">${v1.toFixed(unit === 'м' ? 2 : 0)}</text><text x="2" y="${H - B}" font-size="10">${v0.toFixed(unit === 'м' ? 2 : 0)}</text>
    <text x="${L + 6}" y="20" font-size="12" font-weight="bold">${title}, ${unit}</text>${lines}</svg>`;
}
const plots = [
  ['Колено левое', (s, i) => s.sm.kneeL[i], '°'], ['Колено правое', (s, i) => s.sm.kneeR[i], '°'],
  ['Бедро левое', (s, i) => s.sm.hipL[i], '°'], ['Бедро правое', (s, i) => s.sm.hipR[i], '°'],
  ['Локоть правый', (s, i) => s.sm.elbowR[i], '°'], ['Локоть левый', (s, i) => s.sm.elbowL[i], '°'],
  ['Наклон вперёд', (s, i) => s.sm.leanF[i], '°'], ['Наклон вбок', (s, i) => s.sm.leanS[i], '°'],
  ['Плечи от таза', (s, i) => s.sm.sep[i], '°'], ['Высота таза над ступнёй', (s, i) => s.sm.pelvisH[i], 'м'],
  ['Ширина стойки / ширина таза', (s, i) => s.sm.stance[i], '×'], ['Таз, скорость поворота', (s, i) => s.w.pelvis[i], '°/с'],
  ['Плечи, скорость поворота', (s, i) => s.w.shoulders[i], '°/с'], ['Плечо правое, скорость', (s, i) => s.w.armR[i], '°/с'],
  ['Голень, ускорение (рывки)', (s, i) => Math.max(s.acc.shinL[i], s.acc.shinR[i]), '°/с²'], ['Корпус, ускорение (рывки)', (s, i) => s.acc.trunk[i], '°/с²'],
];
const legend = series.map((s, k) => `<span style="color:${COLORS[k % 6]};margin-right:14px">■ ${s.label}</span>`).join('');
const html = `<html><body style="margin:8px;font:12px -apple-system,sans-serif;background:#f4f4f4"><div style="margin-bottom:6px">${legend}</div>
  <div style="display:grid;grid-template-columns:repeat(2,560px);gap:6px">${plots.map(([t, g, u]) => chart(t, g, u)).join('')}</div></body></html>`;
writeFileSync(join(OUT, 'charts.html'), html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1140, height: 900 } });
await page.goto('file://' + resolve(OUT, 'charts.html'));
await page.screenshot({ path: join(OUT, 'charts.png'), fullPage: true });
await browser.close();
for (const s of series) console.log(JSON.stringify(s.sum));
