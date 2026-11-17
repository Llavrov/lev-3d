#!/usr/bin/env node
// Сравнение скелета и весов кадрами: одна и та же поза у вариантов модели бок о бок (слева первый вариант).
// Нужен dev-сервер на 3952.
//   node tools/rig-compare.mjs --out test-out/rig-cmp [--variants "v1:,v2:&rig=2"] [--only fh,armpit] [--who lev]
// Позы: стойка (fh 0.9, контрольный кадр сзади), удары fh/bh в фазах −0.3, 0, 0.25, 0.5, смэш −0.17 и 0, бег; проверка сгибов для DQS: локоть 120°, глубокий присед,
// рука над головой (подмышка). Виды: спереди-сбоку (как меню), грудь крупно, сзади (как камера игры), плечо сзади.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = opt('out', 'test-out/rig-cmp'), WHO = opt('who', 'lev'), ONLY = opt('only', null)?.split(',');
const VARIANTS = opt('variants', 'v1:,v2:&rig=2').split(',').map((s) => s.split(':'));
const POSES = [['fh', 0.9], ['fh', -0.3], ['fh', 0], ['fh', 0.25], ['fh', 0.5], ['bh', -0.3], ['bh', 0], ['bh', 0.25], ['bh', 0.5], ['oh', -0.17], ['oh', 0], ['elbow'], ['squat'], ['armpit'], ['run']]
  .filter(([t]) => !ONLY || ONLY.includes(t));
// menuL/menuR — спереди-сбоку, как камера стартового экрана; chest — грудь и плечи спереди крупно.
const VIEWS = { menuL: 1, menuR: 1, chest: 1, back: 1, shoulder: 1, waist: 0, side: 0, elbow: 0, knee: 0, front: 0 };
const viewsFor = (t, s) => s === 0.9 ? ['game', 'menuL', 'chest'] : t === 'elbow' ? ['elbow', 'front', 'side'] : t === 'squat' ? ['knee', 'side', 'back'] : t === 'armpit' ? ['front', 'back', 'shoulder'] : Object.keys(VIEWS).filter((v) => VIEWS[v]);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, q] of VARIANTS) {
  const dir = join(OUT, 'tiles', name); mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 560 } });
  page.on('pageerror', (e) => console.error(name, 'ОШИБКА СТРАНИЦЫ:', e.message));
  await page.routeWebSocket(/./, () => {}); // без HMR: правки других агентов не перезагружают страницу посреди съёмки
  await page.goto('http://localhost:3952/?debug&noao&nolog' + q);
  await page.waitForFunction(() => window.__lev?.game?.lev?.contactPt && !document.getElementById('play').disabled, null, { timeout: 120000 });
  await page.evaluate(async () => {
    window.__pause = true; window.__noDraw = true;
    document.getElementById('play').click();
    for (const id of ['loader', 'start', 'hud', 'hint', 'msg', 'pad', 'rk']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    const S = await import('/src/swing.js'), V3 = __lev.camera.position.constructor;
    const V = (x, y, z) => new V3(-x, y, z).normalize(); // как в swing.js: x вправо
    // Особые позы для проверки сгибов: ключи поверх стойки.
    const SPECIAL = {
      elbow: { rUp: V(0.25, -0.95, 0.1), rFo: V(0.1, 0.6, 0.75), lUp: V(-0.25, -0.95, 0.1), lFo: V(-0.1, 0.6, 0.75) }, // локоть ~120°
      squat: {},
      armpit: { rUp: V(0.35, 0.93, 0), rFo: V(0.2, 0.97, 0.1), lUp: V(-1, 0.05, 0.1), lFo: V(-1, 0.1, 0.25), lh: 0 }, // правая вверх, левая в сторону
    };
    window.__cmp = {
      pose(who, t, s) {
        const p = __lev.game[who];
        p.racket.visible = !SPECIAL[t];
        if (!SPECIAL[t]) return __lev.pose(t, s, who);
        const K = { ...S.READY, ...SPECIAL[t] };
        const r = p.rig.pose(K, K, 0, { Left: p.feet.Left, Right: p.feet.Right, crouch: t === 'squat' ? 0.5 : 0.07 });
        p.rig.placeRacket(r.rk, r.face);
      },
      run(who) { __lev.game.state = 'test'; __lev.game.b.live = false; for (let i = 0; i < 96; i++) __lev.step(1 / 120, { x: 1, y: 0 }); },
      view(who, v) {
        const p = __lev.game[who], P = p.wrap.position, f = p.fwd, r = p.right, cam = __lev.camera, b = (n) => p.rig.b[n].getWorldPosition(new V3());
        cam.fov = 34; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
        const at = (c, df, dr, dy) => __lev.shot([c.x + f.x * df + r.x * dr, c.y + dy, c.z + f.z * df + r.z * dr], [c.x, c.y, c.z]);
        const mid = new V3(P.x, 1.05, P.z);
        if (v === 'back') return at(mid, -3.3, 0.6, 0.75);
        if (v === 'game') { cam.fov = 42; cam.updateProjectionMatrix(); return at(mid, -2.4, 0.2, 0.35); } // контрольный кадр Лёвы: стойка сзади
        if (v === 'side') return at(mid, 0.3, 3.4, 0.2);
        if (v === 'front') return at(new V3(P.x, 1.2, P.z), 3.0, 0.3, 0.15);
        if (v === 'menuL' || v === 'menuR') return at(new V3(P.x, 1.15, P.z), 2.3, v === 'menuL' ? -1.6 : 1.6, 0.25);
        if (v === 'chest') return at(b('Spine2'), 1.25, 0.15, 0.05);
        if (v === 'shoulder') return at(b('RightArm').lerp(b('Spine2'), 0.4), -0.85, 0.55, 0.25);
        if (v === 'waist') return at(b('Spine'), -1.0, 0.45, 0.15);
        if (v === 'elbow') return at(b('RightForeArm'), 0.5, 0.6, 0.1);
        if (v === 'knee') return at(b('RightLeg'), 0.6, 1.0, 0.15);
      },
    };
  });
  for (const [t, s] of POSES) {
    if (t === 'run') await page.evaluate((who) => __cmp.run(who), WHO);
    else await page.evaluate(([who, t, s]) => __cmp.pose(who, t, s), [WHO, t, s]);
    for (const v of viewsFor(t, s)) {
      await page.evaluate(([who, v]) => __cmp.view(who, v), [WHO, v]);
      await page.screenshot({ path: join(dir, `${t}${s ?? ''}-${v}.png`) });
    }
  }
  await page.close();
}
await browser.close();
// Склейка: варианты слева направо, по файлу на позу и вид.
for (const [t, s] of POSES) for (const v of viewsFor(t, s)) {
  const n = `${t}${s ?? ''}-${v}.png`, ins = VARIANTS.flatMap(([name]) => ['-i', join(OUT, 'tiles', name, n)]);
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', ...ins, ...(VARIANTS.length > 1 ? ['-filter_complex', `hstack=inputs=${VARIANTS.length}`] : []), join(OUT, n)]);
}
console.log('кадры:', OUT);
