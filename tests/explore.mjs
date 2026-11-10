// Acceptance test 24: no uncaught console errors across a scripted random exploration (ten minutes by default).
// Usage: node tests/explore.mjs [--minutes 10] [--seed 3]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, ROOT, ensureDir } from './lib/browser.mjs';
import { rng } from './lib/curated.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const minutes = arg('--minutes', 10);
const seed = arg('--seed', 3);
const rand = rng(seed);
const pick = (a) => a[Math.floor(rand() * a.length)];
ensureDir(path.join(ROOT, 'tests', 'results'));
const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query: '?y=1500&lat=25&lon=40&alt=11000', view: 'laptop' });
const foreign = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(srv.base) && !/^(data|blob):/.test(u)) foreign.push(u); });
await page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded && window.__earth.india && window.__earth.openModel && window.__earth.openCountry, null, { timeout: 60000 });
const ids = await page.evaluate(() => ({ stories: window.__earth.stories.map((s) => [s.id, s.scenes]), models: window.__earth.modelList.map((m) => m.id), trails: window.__earth.trailList.map((t) => [t.id, t.stops.length]), countries: window.__earth.countryIndex.map((c) => c.id), lenses: [...window.__earth.lenses.human.map((l) => l.id), 'all'], wide: window.__earth.wide.list.map((w) => w.id) }));
const year = () => { const r = rand(); return r < 0.5 ? -3000 + rand() * 5026 : r < 0.7 ? 1800 + rand() * 226 : r < 0.82 ? -300000 + rand() * 297000 : r < 0.95 ? -540e6 * rand() - 3e6 : -13.8e9 * rand(); };
const words = ['Plassey', 'Rome', 'salt', 'Ashoka', '1857', 'Nairobi', 'Black Death', 'Tokyo', '66 million years ago', 'Gandhi', 'Mughal', 'Lucy', 'Taj Mahal', 'tsunami', 'Kerala', 'zero'];
const esc = () => page.keyboard.press('Escape');
const actions = {
  time: () => page.evaluate((y) => window.__earth.timeline.jumpTo(y), year()),
  scrub: async () => { const b = await (await page.$('.tape-wrap')).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); for (let i = 0; i < 25; i++) await page.mouse.move(b.x + b.width / 2 + (rand() - 0.5) * 500, b.y + b.height / 2); await page.mouse.up(); },
  drag: async () => { await page.mouse.move(640, 300); await page.mouse.down(); for (let i = 0; i < 10; i++) await page.mouse.move(640 + (rand() - 0.5) * 500, 300 + (rand() - 0.5) * 240); await page.mouse.up(); },
  zoom: async () => { await page.mouse.move(640, 300); await page.mouse.wheel(0, (rand() - 0.5) * 2400); },
  fly: () => page.evaluate((p) => window.__earth.controls.flyTo(p), { lat: (rand() - 0.5) * 140, lon: (rand() - 0.5) * 360, altKm: 400 + rand() * 20000 }),
  lens: () => page.evaluate((l) => { document.querySelector('.lens-btn').click(); const o = [...document.querySelectorAll('.lens-opt')]; if (o.length) o[Math.floor(l * o.length)].click(); }, rand()),
  pin: async () => { const p = await page.evaluate(() => { const app = window.__earth; const v = app.engine.camera.position.clone(); const o = { x: 0, y: 0, visible: false }; const out = []; for (const e of app.pins.visible.slice(0, 200)) { v.set(e.x, e.yv, e.z); app.engine.project(v, o); if (o.visible && o.x > 300 && o.x < 900 && o.y > 80 && o.y < 420) out.push([o.x, o.y]); } return out; }); if (p.length) { const [x, y] = pick(p); await page.mouse.click(x, y); } },
  closeDeep: () => page.evaluate(() => window.__earth.deep.close()),
  follow: () => page.evaluate((r) => { const links = [...document.querySelectorAll('.deep .ev')]; if (links.length) links[Math.floor(r * links.length)].click(); }, rand()),
  sheet: async () => { await page.evaluate((r) => { const b = [...document.querySelectorAll('.tool-btn[data-tool]')].filter((x) => x.offsetParent); b[Math.floor(r * b.length)].click(); }, rand()); await page.waitForTimeout(500); await page.evaluate((r) => { const b = [...document.querySelectorAll('.sheet:not([hidden]) .sheet-body button')]; if (b.length && r < 0.7) b[Math.floor((r / 0.7) * b.length)].click(); }, rand()); },
  closeSheet: () => page.evaluate(() => { for (const b of document.querySelectorAll('.sheet:not([hidden]) .sheet-head .icon-btn')) b.click(); }),
  story: async () => { const [id, n] = pick(ids.stories); await page.evaluate(([sid, step]) => window.__earth.story.open(sid, step), [id, Math.floor(rand() * n)]); await page.waitForTimeout(700); for (let i = 0; i < 4; i++) { await page.mouse.move(250, 400); await page.mouse.wheel(0, (rand() - 0.3) * 1600); await page.waitForTimeout(350); } },
  leaveStory: () => page.evaluate(() => { if (window.__earth.story.story) window.__earth.story.close(); }),
  model: async () => { await page.evaluate((id) => window.__earth.openModel(id), pick(ids.models)); await page.waitForTimeout(600); await page.evaluate((r) => { const b = [...document.querySelectorAll('.mv-parts button')]; if (b.length) b[Math.floor(r * b.length)].click(); }, rand()); await page.mouse.move(400, 350); await page.mouse.down(); await page.mouse.move(520, 380); await page.mouse.up(); await page.waitForTimeout(400); await page.evaluate(() => window.__earth.modelViewer.close()); },
  india: async () => { await page.evaluate((r) => window.__earth.india.open(['matrix', 'events', 'people', 'states'][Math.floor(r * 4)]), rand()); await page.waitForTimeout(600); await page.evaluate((r) => { const b = [...document.querySelectorAll('.sheet.india .imx-cell, .sheet.india .ev')]; if (b.length) b[Math.floor(r * b.length)].click(); }, rand()); },
  search: async () => { await page.fill('.search-input', pick(words)); await page.waitForTimeout(700); await page.keyboard.press('Enter'); },
  level: () => page.evaluate((r) => document.querySelector(`.level button[data-level="${r < 0.5 ? 'kid' : 'explorer'}"]`).click(), rand()),
  trail: () => page.evaluate(([id, stop]) => window.__earth.openTrailStop(id, stop), (() => { const [id, n] = pick(ids.trails); return [id, Math.floor(rand() * n)]; })()),
  leaveTrail: () => page.evaluate(() => { if (window.__earth.trails) window.__earth.trails.close(); }),
  country: () => page.evaluate((id) => window.__earth.openCountry(id), pick(ids.countries)),
  wide: () => page.evaluate((id) => window.__earth.openEvent(`wide:${id}`, { fly: true, time: true }), pick(ids.wide)),
  surprise: () => page.evaluate(() => window.__earth.surprise()),
  escape: esc,
  keys: async () => { await page.focus('#globe'); for (const k of ['a', 'd', 'w', 's', '+', '-']) if (rand() < 0.5) await page.keyboard.press(k); },
  resize: async () => { const sizes = [[1280, 720], [1024, 700], [820, 900], [1440, 900]]; const [w, h] = pick(sizes); await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300); if (rand() < 0.7) await page.setViewportSize({ width: 1280, height: 720 }); },
};
const weights = { time: 9, scrub: 4, drag: 8, zoom: 7, fly: 5, lens: 5, pin: 9, closeDeep: 4, follow: 6, sheet: 4, closeSheet: 4, story: 3, leaveStory: 3, model: 2, india: 3, search: 4, level: 2, trail: 2, leaveTrail: 2, country: 3, wide: 2, surprise: 2, escape: 2, keys: 2, resize: 1 };
const bag = Object.entries(weights).flatMap(([k, w]) => Array(w).fill(k));
const counts = {};
const harness = [];
const t0 = Date.now();
let n = 0;
let lastReport = 0;
while (Date.now() - t0 < minutes * 60000) {
  const name = pick(bag);
  try { await actions[name](); counts[name] = (counts[name] || 0) + 1; } catch (e) { harness.push(`${name}: ${String(e.message).split('\n')[0].slice(0, 120)}`); await page.setViewportSize({ width: 1280, height: 720 }).catch(() => {}); }
  n++;
  await page.waitForTimeout(250 + rand() * 900);
  if (Date.now() - lastReport > 60000) { lastReport = Date.now(); console.log(`  ${Math.round((Date.now() - t0) / 60000)} min: ${n} actions, ${new Set(errors).size} errors`); }
}
const status = await page.evaluate(() => window.__earthCapture.status());
const uniq = [...new Set([...errors, ...status.errors.map((e) => `engine: ${e}`)])];
await browser.close();
await srv.close();
const pass = !uniq.length && !foreign.length;
const md = `# Exploration log\n\nRun on ${new Date().toISOString().slice(0, 10)} by \`node tests/explore.mjs --minutes ${minutes} --seed ${seed}\`.\n\n- Duration: ${((Date.now() - t0) / 60000).toFixed(1)} minutes\n- Random actions performed: ${n}\n- Actions: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}\n- Console errors, page errors, failed or 4xx/5xx requests: ${uniq.length}\n- Requests to other origins: ${foreign.length}\n- Actions the harness could not perform (element not on screen at that moment): ${harness.length}\n\n${uniq.length ? `## Errors\n\n${uniq.map((e) => `- ${e}`).join('\n')}\n` : 'No errors of any kind.\n'}`;
fs.writeFileSync(path.join(ROOT, 'tests', 'exploration-log.md'), md);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'explore.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass, minutes, actions: n, counts, errors: uniq, foreign, harness: harness.slice(0, 40) }, null, 2));
console.log(`${n} actions in ${((Date.now() - t0) / 60000).toFixed(1)} minutes; ${uniq.length} errors; ${foreign.length} foreign requests; ${harness.length} actions skipped by the harness`);
if (uniq.length) console.log(uniq.slice(0, 20).join('\n'));
process.exit(pass ? 0 : 1);
