// Screenshots of country baselines: node tests/country-shots.mjs
import path from 'node:path';
import { startServer, launch, openPage, gotoView, SHOTS, ensureDir } from './lib/browser.mjs';
import { contactSheet } from './sheet.mjs';
const out = path.join(SHOTS, 'countries');
ensureDir(out);
const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query: '?capture=1', view: 'laptop' });
await page.waitForFunction(() => window.__earth && window.__earth.openCountry, null, { timeout: 30000 });
await gotoView(page, { y: 2026, lat: 10, lon: 30, altKm: 14000 });
const files = [];
for (const id of ['IND', 'MWI', 'TUV', 'BRA', 'VAT', 'ATA']) {
  await page.evaluate((cid) => window.__earth.openCountry(cid), id);
  await page.waitForFunction((cid) => { const t = document.querySelector('.deep .deep-title'); return t && window.__earth.deep.shown === `country:${cid}`; }, id, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__earthCapture.renderFrame());
  const file = path.join(out, `${id}.png`);
  await page.screenshot({ path: file });
  files.push(file);
  const info = await page.evaluate(() => ({ title: document.querySelector('.deep .deep-title').textContent, links: document.querySelectorAll('.deep .led-to .ev').length, chart: !!document.querySelector('.deep .chart') }));
  console.log(id, JSON.stringify(info));
}
await contactSheet(files, path.join(SHOTS, 'countries-sheet.jpg'), { cols: 3, w: 640 });
const uniq = [...new Set(errors)];
console.log(uniq.length ? `ERRORS:\n${uniq.join('\n')}` : 'no console errors');
await browser.close();
await srv.close();
process.exit(uniq.length ? 1 : 0);
