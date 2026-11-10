// Development screenshots: node tests/shot.mjs [--phone] [--out dir] [--clock ms] view...
// A view is either "capture" (the nine contract views) or a query like "y=-250e6,lat=10,lon=20,alt=22000".
import path from 'node:path';
import { startServer, launch, openPage, gotoView, SHOTS, ensureDir, CAPTURE_VIEWS } from './lib/browser.mjs';

const args = process.argv.slice(2);
let view = 'desktop';
let out = path.join(SHOTS, 'dev');
let clock = 4000;
let query = '?capture=1';
const wanted = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--phone') view = 'phone';
  else if (args[i] === '--laptop') view = 'laptop';
  else if (args[i] === '--out') out = path.resolve(args[++i]);
  else if (args[i] === '--clock') clock = Number(args[++i]);
  else if (args[i] === '--query') query = args[++i];
  else wanted.push(args[i]);
}
ensureDir(out);
const views = [];
for (const w of wanted.length ? wanted : ['capture']) {
  if (w === 'capture') views.push(...CAPTURE_VIEWS);
  else {
    const v = { name: w.replace(/[^\w.-]+/g, '_').slice(0, 60) };
    for (const part of w.split(',')) {
      const [k, val] = part.split('=');
      const key = k === 'alt' ? 'altKm' : k;
      v[key] = ['lens', 'story', 'event', 'trail', 'name'].includes(key) ? val : Number(val);
    }
    views.push(v);
  }
}

const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query, view });
const t0 = Date.now();
for (const v of views) {
  const { name, ...target } = v;
  await page.evaluate((ms) => window.__earthCapture.setClock(ms), clock);
  const s = await gotoView(page, target);
  const file = path.join(out, `${name}${view === 'phone' ? '-phone' : ''}.png`);
  await page.screenshot({ path: file });
  console.log(`${name}: y=${s.year} alt=${Math.round(s.altKm)} errors=${s.errors.length} -> ${path.relative(process.cwd(), file)}`);
  if (s.errors.length) console.log('   ', s.errors.join(' | '));
}
console.log(`${views.length} views in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
await srv.close();
