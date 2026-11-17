#!/usr/bin/env node
// Анатомия крупно: листы кадров (вид спереди, сбоку, сзади-сверху как камера игры) и замеры суставов.
// Нужен dev-сервер на 3952.
//   node tools/anat-shots.mjs poses --out test-out/anat-p1 [--types fh,bh] [--phases -0.45,-0.17,0,0.2,0.5] [--who lev]
//   node tools/anat-shots.mjs run --out test-out/anat-r1 [--plan "0.4:0,0;1.2:1,0;0.8:0,0"]   ход по плану «сек:x,y»
//   node tools/anat-shots.mjs ready --out test-out/anat-s1                                     стойка и бег крупно
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2), cmd = argv[0] ?? 'poses';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = opt('out', `test-out/anat-${cmd}`), WHO = opt('who', 'lev');
const TYPES = opt('types', 'fh,bh,fh-top,bh-top,fh-slice,bh-slice,oh,vfh,vbh').split(',');
const PHASES = opt('phases', '-0.45,-0.17,0,0.1,0.2,0.35,0.5').split(',').map(Number);
const TW = +opt('w', 300), TH = +opt('h', 400), VIEWS = opt('views', 'front,right,back,top').split(',');
const tmp = join(OUT, 'tiles'); mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: TW, height: TH } });
page.on('pageerror', (e) => console.error('ОШИБКА СТРАНИЦЫ:', e.message));
await page.routeWebSocket(/./, () => {}); // без HMR: правки других агентов не перезагружают страницу посреди съёмки
await page.goto('http://localhost:3952/?debug&noao&nolog' + opt('q', ''));
await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
await page.evaluate(() => {
  window.__pause = true; window.__noDraw = true;
  for (const id of ['loader', 'start', 'hud', 'hint', 'msg', 'pad']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  document.getElementById('play').click();
  for (const id of ['hud', 'hint', 'msg', 'pad']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
  // Замеры: прокрут кости вокруг своей оси от покоя (swing-twist), углы локтя и запястья, скрутка плеч к тазу.
  const Q = (q) => q.clone(), V3 = __lev.camera.position.constructor;
  const twist = (rig, name, child) => {
    const bone = rig.b[name], rest = rig.rest.get(bone), c = rig.b[child] ?? bone.children.find((o) => o.isBone);
    const axis = c.position.clone().normalize(), rel = Q(rest).invert().multiply(bone.quaternion);
    const d = rel.x * axis.x + rel.y * axis.y + rel.z * axis.z;
    let a = 2 * Math.atan2(d, rel.w) * 180 / Math.PI; if (a > 180) a -= 360; if (a < -180) a += 360;
    return Math.round(a);
  };
  const ang = (q1, q2) => Math.round(2 * Math.acos(Math.min(1, Math.abs(Q(q1).invert().multiply(q2).w))) * 180 / Math.PI);
  window.__anat = {
    metrics(who) {
      const p = __lev.game[who], rig = p.rig, b = rig.b, w = (n) => b[n].getWorldPosition(new V3());
      const o = { ...rig.audit() };
      for (const s of ['Right', 'Left']) {
        o[s].hum = twist(rig, s + 'Arm', s + 'ForeArm');
        o[s].fore = twist(rig, s + 'ForeArm', s + 'Hand');
        o[s].hand = twist(rig, s + 'Hand', s + 'HandMiddle1');
        o[s].clav = ang(rig.rest.get(b[s + 'Shoulder']), b[s + 'Shoulder'].quaternion);
        o[s].toHead = +w(s + 'Hand').distanceTo(w('Head')).toFixed(2);
      }
      const hl = w('LeftUpLeg').sub(w('RightUpLeg')).setY(0), sl = w('LeftArm').sub(w('RightArm')).setY(0);
      o.spineTwist = Math.round(Math.atan2(hl.x * sl.z - hl.z * sl.x, hl.x * sl.x + hl.z * sl.z) * 180 / Math.PI);
      const tr = w('Neck').sub(w('Hips')).normalize();
      o.lean = Math.round(Math.acos(tr.y) * 180 / Math.PI);
      o.shoulderW = +w('LeftArm').distanceTo(w('RightArm')).toFixed(3);
      o.hipsY = +w('Hips').y.toFixed(3);
      return o;
    },
    // Камера по осям игрока: f — вперёд к сетке, r — вправо; dist — метров, h — высота глаза.
    view(who, kind, at = 1.05) {
      const p = __lev.game[who], P = p.wrap.position, f = p.fwd, r = p.right, cam = __lev.camera;
      cam.fov = 36; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
      const V = { front: [3.4, 0, 1.25], right: [0, 3.4, 1.25], left: [0, -3.4, 1.25], back: [-3.2, 0.9, 2.3], top: [-0.9, 0.3, 4.2], legs: [2.0, 0.4, 0.7], hand: null }[kind];
      if (kind === 'legs') at = 0.5;
      if (kind === 'palm' || kind === 'knuck') { // кисть крупно со стороны ладони или тыла
        const rig = p.rig, hb = rig.b.RightHand, hq = hb.getWorldQuaternion(cam.quaternion.clone()), c = rig.palm('Right');
        const n = rig.hand.Right.n.clone().applyQuaternion(hq).multiplyScalar(kind === 'palm' ? 0.42 : -0.42);
        __lev.shot([c.x + n.x, c.y + n.y + 0.04, c.z + n.z], [c.x, c.y, c.z]); return;
      }
      if (kind === 'hand') { const h = __lev.bone('RightHand', who); __lev.shot([h[0] + 0.6 * f.x + 0.5 * r.x, h[1] + 0.25, h[2] + 0.6 * f.z + 0.5 * r.z], h); return; }
      __lev.shot([P.x + f.x * V[0] + r.x * V[1], V[2], P.z + f.z * V[0] + r.z * V[1]], [P.x, at, P.z]);
    },
  };
});

const shot = (name) => page.screenshot({ path: join(tmp, name + '.png') });
// Лист кадров через ffmpeg (magick тут собран под x86 и не запускается).
let sheetN = 0;
const sheet = (files, cols, out) => {
  const dir = join(tmp, 'seq' + sheetN++); mkdirSync(dir, { recursive: true });
  files.forEach((f, i) => copyFileSync(f, join(dir, String(i).padStart(3, '0') + '.png')));
  cols = Math.min(cols, files.length); const rowsN = Math.ceil(files.length / cols);
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, '%03d.png'), '-vf', `tile=${cols}x${rowsN}:padding=2:color=0x222222`, '-frames:v', '1', out]);
};

if (cmd === 'poses') {
  const rows = [];
  for (const type of TYPES) {
    const files = Object.fromEntries([...VIEWS, 'hand'].map((v) => [v, []]));
    for (const s of PHASES) {
      const m = await page.evaluate(([who, type, s]) => { __lev.pose(type, s, who); return __anat.metrics(who); }, [WHO, type, s]);
      rows.push({ type, s, ...m });
      for (const v of Object.keys(files)) {
        await page.evaluate(([who, v]) => __anat.view(who, v), [WHO, v]);
        const n = `${type}_${s}_${v}`; await shot(n); files[v].push(join(tmp, n + '.png'));
      }
    }
    sheet(VIEWS.flatMap((v) => files[v]), PHASES.length, join(OUT, `${WHO}-${type}.png`));
    sheet(files.hand, PHASES.length, join(OUT, `${WHO}-${type}-hand.png`));
  }
  writeFileSync(join(OUT, 'metrics.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
  const f = (r) => `${r.type.padEnd(8)} ${String(r.s).padStart(5)} | R hum ${String(r.Right.hum).padStart(4)} roll ${String(r.Right.fore + r.Right.hand).padStart(4)} clav ${String(r.Right.clav).padStart(2)} elb ${String(r.Right.elbow).padStart(3)} wr ${String(r.Right.wrist).padStart(3)} | L hum ${String(r.Left.hum).padStart(4)} roll ${String(r.Left.fore + r.Left.hand).padStart(4)} elb ${String(r.Left.elbow).padStart(3)} wr ${String(r.Left.wrist).padStart(3)} on ${r.leftOn} | twist ${String(r.spineTwist).padStart(4)} lean ${String(r.lean).padStart(3)} head R${r.Right.toHead} L${r.Left.toHead} grip ${r.gripGap}${r.Right.elbowBack || r.Left.elbowBack ? ' ЛОКОТЬ-НАЗАД' : ''}${r.Right.kneeBack || r.Left.kneeBack ? ' КОЛЕНО-НАЗАД' : ''}`;
  console.log(rows.map(f).join('\n'));
}

// Ход по плану: каждые 1/120 с пишем ступни (скольжение опорной ступни), шаги, полёт, высоту таза; кадры каждые 1/30 с.
if (cmd === 'run' || cmd === 'ready') {
  const plan = (opt('plan', cmd === 'ready' ? '1.2:0,0' : '0.5:0,0;1.3:1,0;0.9:0,0;0.5:-0.6,0;0.6:0,0')).split(';').map((s) => { const [t, xy] = s.split(':'); const [x, y] = xy.split(',').map(Number); return { t: +t, x, y }; });
  const every = +opt('every', 4), view = opt('view', cmd === 'ready' ? 'front' : 'back');
  const frames = [], log = [];
  let k = 0;
  for (const seg of plan) {
    for (let i = 0; i < Math.round(seg.t * 120); i++, k++) {
      const r = await page.evaluate(([x, y, who]) => {
        __lev.step(1 / 120, { x, y });
        const p = __lev.game[who], b = p.rig.b, V3 = __lev.camera.position.constructor, w = (n) => b[n].getWorldPosition(new V3());
        const ft = (s) => { const f = p.feet[s], toe = b[s + 'ToeBase'] ? w(s + 'ToeBase') : w(s + 'Foot'); return { a: w(s + 'Foot').toArray(), toe: toe.toArray(), step: !!f.step, lift: f.lift, tgt: f.pos.toArray() }; };
        return { t: __lev.game.now, pos: p.pos.toArray(), v: p.vel.length(), turn: p.bodyTurn, slide: p.sliding, split: !!p.split, L: ft('Left'), R: ft('Right'), hipsY: w('Hips').y, head: p.headYaw };
      }, [seg.x, seg.y, WHO]);
      log.push(r);
      if (k % every === 0 && k >= +opt('from', 0) && k <= +opt('to', 1e9)) {
        await page.evaluate(([who, v]) => __anat.view(who, v, 0.9), [WHO, view]);
        const n = `run_${String(k).padStart(4, '0')}`; await shot(n); frames.push(join(tmp, n + '.png'));
      }
    }
  }
  // Скольжение: опорная ступня (без шага, на земле) не должна ехать. Считаем по носку и щиколотке.
  let slip = 0, slipMax = 0, steps = 0, flight = 0, runT = 0;
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1], c = log[i];
    for (const s of ['L', 'R']) {
      if (!c[s].step && !a[s].step && !c.split && c.slide < 0.3 && c[s].lift === 0) {
        const d = Math.hypot(c[s].toe[0] - a[s].toe[0], c[s].toe[2] - a[s].toe[2]);
        slip += d; slipMax = Math.max(slipMax, d * 120);
      }
      if (c[s].step && !a[s].step && c.v > 3) steps++;
    }
    if (c.v > 3) { runT += 1 / 120; if (c.L.step && c.R.step) flight += 1 / 120; }
  }
  const hips = log.map((r) => r.hipsY);
  const sum = { frames: frames.length, slipTotal: +slip.toFixed(3), slipMaxSpeed: +slipMax.toFixed(2), runTime: +runT.toFixed(2), stepsPerSecRun: runT ? +(steps / runT).toFixed(2) : 0, flightFrac: runT ? +(flight / runT).toFixed(2) : 0, hipsMin: +Math.min(...hips).toFixed(3), hipsMax: +Math.max(...hips).toFixed(3), vmax: +Math.max(...log.map((r) => r.v)).toFixed(2) };
  writeFileSync(join(OUT, 'run.jsonl'), log.map((r) => JSON.stringify(r)).join('\n'));
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(sum, null, 2));
  const cols = +opt('cols', 10); for (let i = 0; i < frames.length; i += cols * 4) sheet(frames.slice(i, i + cols * 4), cols, join(OUT, `${cmd}-${view}-${String(i / 40).padStart(2, '0')}.png`));
  console.log(JSON.stringify(sum));
}
// Выпад: удар по фиктивному мячу в стороне (--wide м дальше обычной точки, --fwd вперёд, --bh высота) — смотрим базу и наклон.
if (cmd === 'lunge') {
  const type = opt('type', 'fh'), wide = +opt('wide', 0.6), fwd = +opt('fwd', 0), hb = +opt('bh', 0.9), view = opt('view', 'back');
  const frames = [], log = [];
  await page.evaluate(([type, wide, fwd, hb, who]) => {
    const p = __lev.game[who], now = __lev.game.now;
    p.press(type, now, null, now + 0.7);
    const st = p.stroke, cp = p.contactPt[type];
    st.h = hb; st.cross = p.pos.clone().addScaledVector(p.right, -cp.s.x + Math.sign(-cp.s.x) * wide).addScaledVector(p.fwd, cp.s.z + fwd).setY(hb);
  }, [type, wide, fwd, hb, WHO]);
  for (let k = 0; k < 150; k++) {
    const r = await page.evaluate((who) => {
      __lev.step(1 / 120);
      const p = __lev.game[who], b = p.rig.b, V3 = __lev.camera.position.constructor, w = (n) => b[n].getWorldPosition(new V3());
      const tr = w('Neck').sub(w('Hips')).normalize();
      return { t: +__lev.game.now.toFixed(3), lunge: +p.lunge.length().toFixed(3), drop: +(p.lungeDrop ?? 0).toFixed(3), hipsY: +w('Hips').y.toFixed(3), lean: Math.round(Math.acos(tr.y) * 180 / Math.PI),
        base: +w('LeftFoot').distanceTo(w('RightFoot')).toFixed(2), slide: +p.sliding.toFixed(2), v: +p.vel.length().toFixed(2), reach: p.stroke?.reach?.lunge };
    }, WHO);
    log.push(r);
    if (k % +opt('every', 6) === 0 && k >= +opt('from', 0)) {
      await page.evaluate(([who, v]) => __anat.view(who, v, 0.9), [WHO, view]);
      const n = `l_${String(k).padStart(4, '0')}`; await shot(n); frames.push(join(tmp, n + '.png'));
    }
  }
  sheet(frames, +opt('cols', 9), join(OUT, `lunge-${type}-${wide}-${view}.png`));
  writeFileSync(join(OUT, `lunge-${type}-${wide}.jsonl`), log.map((r) => JSON.stringify(r)).join('\n'));
  const m = log.reduce((a, r) => ({ lunge: Math.max(a.lunge, r.lunge), lean: Math.max(a.lean, r.lean), base: Math.max(a.base, r.base), hipsMin: Math.min(a.hipsMin, r.hipsY) }), { lunge: 0, lean: 0, base: 0, hipsMin: 9 });
  console.log(JSON.stringify(m));
}
// Стартовый экран: тестовые взмахи как в main.js (press без мяча, update без ввода), камера menuCam спереди-сбоку.
// --angles -0.6,0,0.6 — углы облёта (рад), --types fh,bh,fh-top,bh-slice, кадр каждые --every тиков 1/120 с.
if (cmd === 'menu') {
  const angles = opt('angles', '-0.6,0.6').split(',').map(Number), every = +opt('every', 12), dur = +opt('dur', 1.5);
  for (const type of opt('types', 'fh,bh,fh-top,bh-slice').split(',')) {
    const files = angles.map(() => []);
    await page.evaluate(([type, who]) => { const g = __lev.game, p = g[who]; p.stroke = null; for (let i = 0; i < 120; i++) { g.now += 1 / 120; p.update(1 / 120, g.now, new (__lev.camera.position.constructor)(), g.b); } p.press(type, g.now, null); }, [type, WHO]);
    for (let k = 0; k <= dur * 120; k++) {
      await page.evaluate((who) => { const g = __lev.game, p = g[who]; g.now += 1 / 120; p.update(1 / 120, g.now, new (__lev.camera.position.constructor)(), g.b); }, WHO);
      if (k % every) continue;
      for (const [j, a] of angles.entries()) {
        await page.evaluate(([who, a]) => {
          const p = __lev.game[who], L = p.wrap.position, cam = __lev.camera, r = 2.6;
          cam.fov = 42; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
          __lev.shot([L.x + Math.sin(a) * r * p.side, 1.35, L.z - Math.cos(a) * r * p.side], [L.x, 1.05, L.z]);
        }, [WHO, a]);
        const n = `m_${type}_${j}_${String(k).padStart(4, '0')}`; await shot(n); files[j].push(join(tmp, n + '.png'));
      }
    }
    sheet(files.flat(), files[0].length, join(OUT, `menu-${type}.png`));
  }
}
rmSync(tmp, { recursive: true, force: true });
await browser.close();
