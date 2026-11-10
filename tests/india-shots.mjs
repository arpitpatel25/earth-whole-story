// Screenshots of India in depth: node tests/india-shots.mjs [--phone]
// Drives the real interface (sheet, tabs, cells, records) and reports console errors.
import path from 'node:path';
import { startServer, launch, openPage, gotoView, SHOTS, ensureDir } from './lib/browser.mjs';

const phone = process.argv.includes('--phone');
const out = path.join(SHOTS, 'india');
ensureDir(out);
const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query: '?capture=1', view: phone ? 'phone' : 'desktop' });
const shot = async (name) => {
  await page.evaluate(() => window.__earthCapture.renderFrame());
  const file = path.join(out, `${name}${phone ? '-phone' : ''}.png`);
  await page.screenshot({ path: file });
  console.log(path.relative(process.cwd(), file));
  return file;
};
const wait = (ms) => page.waitForTimeout(ms);
await page.waitForFunction(() => window.__earth && window.__earth.india, null, { timeout: 30000 });
await gotoView(page, { y: 2026, lat: 20, lon: 78, altKm: 12000 });

// 1. the matrix, nothing chosen
await page.evaluate(() => window.__earth.india.open('matrix'));
await page.waitForSelector(phone ? '.imx-acc' : '.imx');
await shot('01-matrix');
// 2. a cell
if (phone) {
  await page.evaluate(() => window.__earth.india.open('matrix', { cell: 'maurya.war' }));
  await page.waitForSelector('.imx-acc details[open] .imx-text');
} else {
  await page.click('.imx-cell[aria-label^="Maurya Empire, War"]');
  await page.waitForSelector('.imx-reader .imx-text');
}
await shot('02-matrix-cell');
// 3. a thin cell
await page.evaluate(() => window.__earth.india.open('matrix', { cell: 'early-humans.language' }));
await wait(100);
await shot('03-matrix-thin');
// 4. kid mode on the same cell
await page.click('.level button[data-level="kid"]');
await page.evaluate(() => window.__earth.india.open('matrix', { cell: 'chola.women' }));
await wait(100);
await shot('04-matrix-kid');
await page.click('.level button[data-level="explorer"]');
// 5. events, filtered
await page.evaluate(() => window.__earth.india.open('events', { era: 'mughal', lens: 'arts', region: '', q: '' }));
await page.waitForSelector('.india .ev-list li');
await shot('05-events');
// 6. people, women
await page.evaluate(() => window.__earth.india.open('people', { tag: 'woman' }));
await page.waitForSelector('.india .ev-list li');
await shot('06-people');
// 7. states
await page.evaluate(() => window.__earth.india.open('states'));
await page.waitForSelector('.india .ev-list.two li');
await shot('07-states');
// 8. a state view
await page.evaluate(async () => { window.__earth.india.sheet.close(); await window.__earth.openEvent('istate:IN-KL', { fly: true, time: true }); });
await page.waitForSelector('.deep .deep-title');
await wait(400);
await shot('08-state-kerala');
// 9. a curated event and 10. a person
await page.evaluate(async () => { const e = window.__earth.india.events.find((x) => x.t.includes('Salt March')) || window.__earth.india.events[600]; await window.__earth.openEvent(e.id, { fly: true, time: true }); });
await page.waitForSelector('.deep .deep-title');
await wait(400);
await shot('09-event');
await page.evaluate(async () => { const p = window.__earth.india.people.find((x) => x.n.includes('Savitribai')) || window.__earth.india.people[100]; await window.__earth.openEvent(p.id, { fly: true, time: true }); });
await wait(500);
await shot('10-person');
// 11. the matrix cell in "here, then"
await page.evaluate(() => window.__earth.deep.close());
await gotoView(page, { y: -250, lat: 25.6, lon: 85.1, altKm: 2500 });
await page.evaluate(() => window.__earth.india.loadCells().then(() => window.__earth.here.render()));
await wait(300);
await shot('11-here-cell');
// 12. deep time over the drifting plate
await gotoView(page, { y: -70e6, lat: -25, lon: 60, altKm: 14000 });
await wait(300);
await shot('12-deep-time');

const uniq = [...new Set(errors)];
console.log(uniq.length ? `ERRORS:\n${uniq.join('\n')}` : 'no console errors');
await browser.close();
await srv.close();
process.exit(uniq.length ? 1 : 0);
