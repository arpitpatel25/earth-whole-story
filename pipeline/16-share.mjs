// Step 16: share previews. A static site cannot vary its Open Graph tags by query string, so every story, trail,
// 3D scene and multi-region event gets a small static page under site/s/ with its own title, description and
// preview image; the page forwards at once to the exact state URL. Also renders site/assets/share.jpg, the
// preview for the site itself. Run after build-site.mjs (it photographs the built site in a headless browser).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { SITE, DATA, readJSON, ensureDir } from './lib/util.mjs';
import { createServer } from './serve.mjs';

const OUT = ensureDir(path.join(SITE, 's'));
const IMG = ensureDir(path.join(OUT, 'img'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const C = (f) => readJSON(path.join(DATA, 'curated', f));

const pages = [];
for (const s of C('stories/index.json')) pages.push({ file: `story-${s.id}`, title: s.title, desc: s.deck, query: `?story=${s.id}&step=0`, shot: { story: s.id, step: Math.min(2, s.scenes - 1) } });
for (const t of C('trails.json')) pages.push({ file: `trail-${t.id}`, title: `${t.title}: a trail of ${t.stops.length} stops`, desc: t.deck, query: `?trail=${t.id}&stop=0`, shot: { trail: t.id, stop: 0 } });
for (const m of C('models.json')) pages.push({ file: `model-${m.id}`, title: `${m.title} in 3D`, desc: m.summary, query: `?event=model:${m.id}${m.y != null ? `&y=${m.y}` : ''}${m.lat != null ? `&lat=${m.lat}&lon=${m.lon}&alt=2400` : ''}`, model: m.id });
for (const w of C('wide.json')) pages.push({ file: `event-${w.id}`, title: w.title, desc: w.summary, query: `?event=wide:${w.id}&y=${w.y}&lat=${w.views[0].lat}&lon=${w.views[0].lon}&alt=12000`, shot: { y: w.y + 0.3, lat: w.views[0].lat, lon: w.views[0].lon, altKm: 14000, event: `wide:${w.id}` } });
const india = C('india/index.json');
for (const e of india.eras) pages.push({ file: `india-${e.id}`, title: `${e.name}: India in depth`, desc: e.summary, query: `?event=iera:${e.id}&y=${e.deep ? Math.round(e.y0 * 0.66) : Math.round((e.y0 + Math.min(e.y1, 2026)) / 2)}&lat=${e.focus[0]}&lon=${e.focus[1]}&alt=${e.focus[2]}`, shot: { y: e.deep ? e.y0 * 0.66 : (e.y0 + Math.min(e.y1, 2026)) / 2, lat: e.focus[0], lon: e.focus[1], altKm: e.focus[2], event: `iera:${e.id}` } });

const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`${base}/?capture=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded && window.__earth.openModel && window.__earth.india && window.__earth.wide, null, { timeout: 60000 });
await page.evaluate(() => window.__earthCapture.setClock(3000));
const save = async (file) => { const png = await page.screenshot(); await sharp(png).jpeg({ quality: 78, mozjpeg: true }).toFile(file); };

// the site's own card: the whole Earth today, with the clock
await page.evaluate(() => window.__earthCapture.goto({ y: 2026, lat: 18, lon: 60, altKm: 17000, lens: 'all' }));
await save(path.join(SITE, 'assets', 'share.jpg'));
let n = 0;
for (const p of pages) {
  if (p.model) {
    await page.evaluate((id) => { window.__earth.openModel(id); window.__earth.modelViewer.renderOnce(); }, p.model);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__earth.modelViewer.renderOnce());
  } else {
    await page.evaluate(() => { if (window.__earth.modelViewer) window.__earth.modelViewer.close(); });
    if (p.shot.event) {
      // open the record the way a reader would, so the clock shows the precision the record has
      await page.evaluate(async (v) => { await window.__earthCapture.goto({ y: v.y, lat: v.lat, lon: v.lon, altKm: v.altKm }); await window.__earth.openEvent(v.event, { fly: true, time: true }); await window.__earthCapture.goto({}); }, p.shot);
      await page.waitForFunction((id) => window.__earth.deep.shown === id, p.shot.event, { timeout: 20000 });
    } else await page.evaluate((v) => window.__earthCapture.goto(v), p.shot);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__earthCapture.renderFrame());
  }
  await save(path.join(IMG, `${p.file}.jpg`));
  const desc = p.desc.length > 220 ? `${p.desc.slice(0, 217).replace(/\s+\S*$/, '')}…` : p.desc;
  fs.writeFileSync(path.join(OUT, `${p.file}.html`), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} | EARTH: The Whole Story</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="img/${p.file}.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="../${esc(p.query)}">
<meta http-equiv="refresh" content="0; url=../${esc(p.query)}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f4f1e8;font:17px/1.5 Georgia,serif;text-align:center}a{color:#ffd23f}</style>
</head>
<body>
<p>${esc(p.title)}<br><a href="../${esc(p.query)}">Open it on the globe</a></p>
</body>
</html>
`);
  n++;
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(Object.fromEntries(pages.map((p) => [p.file, { title: p.title, query: p.query }]))));
await browser.close();
await new Promise((r) => server.close(r));
const bytes = fs.readdirSync(IMG).reduce((s, f) => s + fs.statSync(path.join(IMG, f)).size, 0);
console.log(`share: ${n} preview pages in site/s/, images ${(bytes / 1048576).toFixed(1)} MB, and assets/share.jpg`);
