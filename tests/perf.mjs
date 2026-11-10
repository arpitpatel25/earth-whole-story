// Acceptance test 22 (frame rate is logged) and the load budget of section 15: first meaningful view under 3 s,
// initial download under 5 MB, nothing fetched from another origin. Writes tests/perf-log.md.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, VIEWS, ROOT, ensureDir } from './lib/browser.mjs';

ensureDir(path.join(ROOT, 'tests', 'results'));
const srv = await startServer();
const browser = await launch();
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

// ---- first view: a cold load of the front page ----
async function coldLoad(view) {
  const context = await browser.newContext({ viewport: VIEWS[view], deviceScaleFactor: VIEWS[view].deviceScaleFactor, isMobile: !!VIEWS[view].isMobile, hasTouch: !!VIEWS[view].hasTouch });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqs = new Map();
  let bytes = 0;
  const foreign = [];
  cdp.on('Network.requestWillBeSent', (e) => { reqs.set(e.requestId, e.request.url); if (!e.request.url.startsWith(srv.base) && !/^(data|blob):/.test(e.request.url)) foreign.push(e.request.url); });
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${srv.base}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__earth && window.__earth.engine && window.__earth.engine.frames >= 2, null, { timeout: 30000 });
  const firstFrame = Date.now() - t0;
  const firstBytes = bytes;
  const firstCount = reqs.size;
  await page.waitForFunction(() => window.__earth.isReady && window.__earth.featuresLoaded, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const settled = { ms: Date.now() - t0, bytes, count: reqs.size };
  const intro = await page.evaluate(() => ({ intro: !!document.querySelector('.intro'), text: (document.querySelector('.intro') || {}).textContent || '', dark: getComputedStyle(document.body).backgroundColor }));
  await context.close();
  return { view, firstFrame, firstBytes, firstCount, settled, foreign, intro };
}
const loads = [await coldLoad('desktop'), await coldLoad('phone')];
for (const l of loads) {
  check(l.firstFrame < 3000, `${l.view}: first frame of the universe after ${l.firstFrame} ms (limit 3000)`);
  check(l.settled.bytes < 5 * 1024 * 1024, `${l.view}: ${(l.firstBytes / 1024).toFixed(0)} KB in ${l.firstCount} requests before the first frame, ${(l.settled.bytes / 1024).toFixed(0)} KB in ${l.settled.count} requests once everything for the opening has loaded (limit 5 MB)`);
  check(!l.foreign.length, `${l.view}: no request leaves the site${l.foreign.length ? ` (${l.foreign.slice(0, 3).join(', ')})` : ''}`);
  check(l.intro.intro && /scroll/i.test(l.intro.text), `${l.view}: the page opens in darkness on the intro, with one line inviting a scroll`);
}

// ---- frame rate on a desktop viewport, while the globe is being turned ----
const context = await browser.newContext({ viewport: VIEWS.desktop, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${srv.base}/?y=2026&lat=20&lon=78&alt=12000`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded, null, { timeout: 60000 });
const scenes = [
  ['Today, whole Earth', { y: 2026, lat: 20, lon: 78, altKm: 16000 }],
  ['Today, India close up', { y: 2026, lat: 22, lon: 79, altKm: 2500 }],
  ['1943, Europe, pins and borders', { y: 1943.5, lat: 50, lon: 20, altKm: 5000 }],
  ['1347, the Black Death', { y: 1347.5, lat: 45, lon: 30, altKm: 6000 }],
  ['2500 BCE, the Indus', { y: -2500, lat: 27.3, lon: 68.1, altKm: 900 }],
  ['20,000 years ago, ice sheets', { y: -20000, lat: 55, lon: -60, altKm: 14000 }],
  ['66 million years ago, moving plates', { y: -66e6, lat: 15, lon: -60, altKm: 16000 }],
  ['250 million years ago, Pangaea', { y: -250e6, lat: 0, lon: 20, altKm: 20000 }],
  ['4.5 billion years ago, molten Earth', { y: -4.5e9, lat: 0, lon: 0, altKm: 20000 }],
  ['The Big Bang', { y: -13.8e9, lat: 0, lon: 0, altKm: 20000 }],
];
const rows = [];
for (const [name, v] of scenes) {
  await page.evaluate(async (view) => { const app = window.__earth; app.deep.close(); app.timeline.jumpTo(view.y); await app.controls.flyTo(view, 0); }, v);
  await page.waitForTimeout(1800);
  // turn the globe steadily for four seconds and count the frames actually rendered
  const res = await page.evaluate(() => new Promise((resolve) => {
    const app = window.__earth;
    const f0 = app.engine.frames;
    const t0 = performance.now();
    const gaps = [];
    let last = t0;
    const step = (t) => {
      gaps.push(t - last);
      last = t;
      app.controls.flyTo({ lon: window.__earthCapture.status().lon + 0.25 }, 0);
      if (t - t0 < 4000) requestAnimationFrame(step);
      else resolve({ fps: ((app.engine.frames - f0) * 1000) / (t - t0), worst: Math.max(...gaps.slice(2)), quality: app.engine.quality });
    };
    requestAnimationFrame(step);
  }));
  rows.push({ name, ...res });
  console.log(`     ${name}: ${res.fps.toFixed(1)} fps, slowest frame ${res.worst.toFixed(0)} ms, quality ${res.quality}`);
}
const fpsAll = rows.map((r) => r.fps).sort((a, b) => a - b);
const median = fpsAll[Math.floor(fpsAll.length / 2)];
check(median >= 50, `median frame rate while turning the globe: ${median.toFixed(1)} fps over ${rows.length} views (target 60)`);
check(fpsAll[0] >= 30, `slowest view: ${fpsAll[0].toFixed(1)} fps`);
check(!errors.length, `no page errors during the frame-rate run${errors.length ? `: ${errors[0]}` : ''}`);
await context.close();
await browser.close();
await srv.close();

const md = `# Performance log

Run on ${new Date().toISOString().slice(0, 10)} by \`node tests/perf.mjs\` in headless Chromium (${process.platform}, GPU through ANGLE), served from a local static server.

## First view (cold load of the front page)

| Viewport | First frame | Downloaded before the first frame | Downloaded once the opening has fully loaded | Requests to other origins |
|---|---|---|---|---|
${loads.map((l) => `| ${l.view} (${VIEWS[l.view].width}x${VIEWS[l.view].height}) | ${l.firstFrame} ms | ${(l.firstBytes / 1024).toFixed(0)} KB, ${l.firstCount} requests | ${(l.settled.bytes / 1024).toFixed(0)} KB, ${l.settled.count} requests | ${l.foreign.length} |`).join('\n')}

Limits: first meaningful view under 3 s, initial download under 5 MB. The local server does not compress, so a real host will send less.

## Frame rate (desktop, 1440x900, while the globe turns)

| View | Frames per second | Slowest frame | Quality tier |
|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.fps.toFixed(1)} | ${r.worst.toFixed(0)} ms | ${r.quality} |`).join('\n')}

Median ${median.toFixed(1)} fps; slowest view ${fpsAll[0].toFixed(1)} fps. The target is 60.
`;
fs.writeFileSync(path.join(ROOT, 'tests', 'perf-log.md'), md);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'perf.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass: !fails.length, loads, rows, fails }, null, 2));
process.exit(fails.length ? 1 : 0);
