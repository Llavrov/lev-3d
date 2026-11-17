// Подгрузка для чужих прогонов: node --import ./tools/anat-nohmr.mjs tools/playtest.mjs ...
// Отрезает HMR-сокет Vite, чтобы правки других агентов не перезагружали страницу посреди прогона.
import { chromium } from 'playwright-core';
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const b = await launch(...a), newPage = b.newPage.bind(b);
  b.newPage = async (...o) => { const p = await newPage(...o); await p.routeWebSocket(/./, () => {}); return p; };
  return b;
};
