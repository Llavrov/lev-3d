// Подписи промо-ролика PNG с прозрачным фоном: в этой сборке ffmpeg нет drawtext, рисуем текст браузером.
import { chromium } from 'playwright-core';
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const shot = async (html, file) => { await p.setContent(`<body style="margin:0;background:transparent;font:700 64px -apple-system,system-ui,sans-serif;color:#fff">${html}</body>`); await p.screenshot({ path: file, omitBackground: true }); };
const sh = 'text-shadow:0 3px 18px rgba(0,0,0,.55)';
await shot(`<div style="position:absolute;top:84px;width:100%;text-align:center;${sh}">Лёва на&nbsp;корте</div>`, 'test-out/promo-title.png');
await shot(`<div style="position:absolute;top:560px;width:100%;text-align:center;font-size:40px;${sh}">lev-3d.37.27.39.224.sslip.io</div>`, 'test-out/promo-url.png');
await b.close();
