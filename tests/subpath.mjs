// The site must work from any folder of a host, not only from the root of a domain. This serves the project folder
// and opens the build at /site/, walks through the main kinds of view, follows a share preview page, and fails on
// any request that does not resolve.
// Usage: node tests/subpath.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../pipeline/serve.mjs';
import { launch, ROOT } from './lib/browser.mjs';

const server = createServer(ROOT);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/site/`;
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const bad = [];
const errors = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(base, '')}`); });
page.on('requestfailed', (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) bad.push(`failed ${r.url().replace(base, '')}`); });
page.on('pageerror', (e) => errors.push(String(e.message || e)));
const outside = [];
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });

await page.goto(`${base}?capture=1`);
await page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded && window.__earth.india && window.__earth.openModel && window.__earth.wide, null, { timeout: 60000 });
const steps = [];
const go = async (name, view) => { const s = await page.evaluate((v) => window.__earthCapture.goto(v), view); steps.push(`${name}: ${s.ready ? 'ready' : 'NOT READY'}`); };
await go('today, India', { y: 2026, lat: 21, lon: 78, altKm: 3000 });
await go('1347, the Black Death', { y: 1347, lat: 45, lon: 30, altKm: 6000 });
await go('250 million years ago', { y: -250e6 });
await go('a story scene', { story: 'world-war-two', step: 20 });
await page.evaluate(() => window.__earth.story.close());
await go('a trail stop', { trail: 'salt', stop: 3 });
await page.evaluate(() => window.__earth.trails.close());
await page.evaluate(async () => { await window.__earth.openEvent('icell:mughal.arts', { fly: true, time: true }); await window.__earthCapture.goto({}); });
steps.push(`an India record: ${await page.evaluate(() => window.__earth.deep.shown)}`);
await page.evaluate(async () => { await window.__earth.openEvent('country:PER', { fly: true, time: true }); await window.__earthCapture.goto({}); });
steps.push(`a country: ${await page.evaluate(() => window.__earth.deep.shown)}`);
await page.evaluate(() => { window.__earth.openModel('taj-mahal'); window.__earth.modelViewer.renderOnce(); });
steps.push(`a 3D scene: ${await page.evaluate(() => !!document.querySelector('.mv:not([hidden])'))}`);
// a share preview page forwards into the app at the same folder
const preview = fs.readdirSync(path.join(ROOT, 'site', 's')).find((f) => /^story-.*\.html$/.test(f));
await page.goto(`${base}s/${preview}`);
await page.waitForFunction(() => window.__earth && window.__earth.isReady, null, { timeout: 60000 });
const landed = page.url().replace(base, '');
steps.push(`preview page s/${preview} forwards to: ${landed.slice(0, 60)}`);
const forwarded = !landed.startsWith('s/') && (await page.evaluate(() => !!window.__earth.story.story));
await browser.close();
await new Promise((r) => server.close(r));

const pass = !bad.length && !errors.length && !outside.length && forwarded && steps.every((s) => !/NOT READY|: (null|false)$/.test(s));
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'subpath.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass, steps, bad: [...new Set(bad)], errors: [...new Set(errors)], outside: [...new Set(outside)] }, null, 1));
for (const s of steps) console.log(`  ${s}`);
console.log(`${bad.length} unresolved requests, ${errors.length} page errors, ${outside.length} requests outside the folder; preview forwarded into a story: ${forwarded}`);
for (const b of [...new Set(bad)].slice(0, 10)) console.log(`  ${b}`);
for (const e of [...new Set(errors)].slice(0, 5)) console.log(`  error: ${e}`);
console.log(pass ? 'The build works from a sub-folder.' : 'FAILED');
process.exit(pass ? 0 : 1);
