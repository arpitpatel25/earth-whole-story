// Screenshots of the six deep-time lenses (and no lens) at a few moments, as one contact sheet for review.
// Usage: node tests/lens-shots.mjs   -> tests/screenshots/deep-lenses-sheet.jpg
import path from 'node:path';
import fs from 'node:fs';
import { startServer, launch, openPage, SHOTS, ensureDir } from './lib/browser.mjs';
import { contactSheet } from './sheet.mjs';

const out = ensureDir(path.join(SHOTS, 'x'));
const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query: '?capture=1', view: 'laptop' });
await page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded, null, { timeout: 60000 });
await page.evaluate(() => window.__earthCapture.setClock(4000));
const moments = (process.argv[2] ? JSON.parse(process.argv[2]) : [
  ['100ma', { y: -100e6, lat: -20, lon: 60, altKm: 14000 }],
  ['252ma', { y: -252e6, lat: 10, lon: 10, altKm: 16000 }],
  ['66ma', { y: -66e6, lat: 30, lon: -60, altKm: 9000 }],
]);
const files = [];
const texts = [];
for (const [name, view] of moments) {
  for (const lens of ['all', 'geology', 'climate', 'life', 'extinctions', 'oceans', 'cosmos']) {
    await page.evaluate((v) => window.__earthCapture.goto(v), { ...view, lens });
    await page.evaluate(() => window.__earthCapture.goto({}));
    const f = path.join(out, `lens-${name}-${lens}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    texts.push(`${name} ${lens}: ${await page.evaluate(() => { const e = document.querySelector('.here-lens'); return e ? e.textContent : '(no lens section)'; })}`);
  }
}
await contactSheet(files, path.join(SHOTS, 'deep-lenses-sheet.jpg'), { cols: 7, w: 420 });
console.log(texts.join('\n'));
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].join('\n'));
await browser.close();
await srv.close();
