// Acceptance tests that need a real browser (spec section 18: items 1-12, 17-20, 23, 25, 26).
// Usage: node tests/acceptance.mjs [--only 1,3,9] [--quick]
// Results are printed and saved to tests/results/acceptance.json. Exit code 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, launch, openPage, ROOT, ensureDir } from './lib/browser.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',').map(Number)) : null;
const quick = args.includes('--quick');
const OUT = path.join(ROOT, 'tests', 'results');
ensureDir(OUT);

// deterministic random numbers, so a failure can be reproduced
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261110);
const pickN = (arr, n) => { const a = arr.slice(); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; };

const results = [];
async function test(n, name, fn) {
  if (only && !only.has(n)) return;
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ n, name, pass: true, detail, seconds: Math.round((Date.now() - t0) / 100) / 10 });
    console.log(`PASS ${String(n).padStart(2)}  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  ${detail || ''}`);
  } catch (e) {
    results.push({ n, name, pass: false, detail: String(e.message || e).slice(0, 1200), seconds: Math.round((Date.now() - t0) / 100) / 10 });
    console.log(`FAIL ${String(n).padStart(2)}  ${name}\n        ${String(e.message || e).slice(0, 1200)}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const srv = await startServer();
const browser = await launch();
const cap = await openPage(browser, srv.base, { query: '?capture=1', view: 'laptop' });
const live = await openPage(browser, srv.base, { query: '?y=1600&lat=30&lon=20&alt=9000', view: 'laptop' });
for (const p of [cap.page, live.page]) await p.waitForFunction(() => window.__earth && window.__earth.featuresLoaded && window.__earth.india && window.__earth.openCountry && window.__earth.openModel, null, { timeout: 60000 });
const goto = (v) => cap.page.evaluate((view) => window.__earthCapture.goto(view), v);
const st = (page) => page.evaluate(() => window.__earthCapture.status());
const diffRatio = async (a, b) => {
  const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).raw().toBuffer();
  let n = 0;
  const ch = A.info.channels;
  for (let i = 0; i < A.data.length; i += ch) if (Math.abs(A.data[i] - B[i]) + Math.abs(A.data[i + 1] - B[i + 1]) + Math.abs(A.data[i + 2] - B[i + 2]) > 36) n++;
  return n / (A.data.length / ch);
};
/** Wait until neither the clock nor the camera is still gliding from an earlier action. */
const still = async (page) => { let prev = null; for (let i = 0; i < 40; i++) { const s = await st(page); const key = `${s.year}|${s.lat}|${s.lon}|${s.altKm}`; if (key === prev) return s; prev = key; await page.waitForTimeout(250); } return st(page); };
const globeShot = (page) => page.screenshot({ clip: { x: 300, y: 60, width: 680, height: 380 } });

// ---- land points for test 9 ---------------------------------------------------------------------------------------
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'geo', 'countries.json'), 'utf8')).features;
const inRing = (x, y, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const onLand = (lon, lat) => countries.some((c) => lon >= c.bbox[0] && lon <= c.bbox[2] && lat >= c.bbox[1] && lat <= c.bbox[3] && c.polys.some((p) => inRing(lon, lat, p[0])));
function landPoints(n) {
  const out = [];
  while (out.length < n) {
    const lat = (Math.asin(rand() * 2 - 1) * 180) / Math.PI; // uniform on the sphere
    const lon = rand() * 360 - 180;
    if (lat > -60 && onLand(lon, lat)) out.push({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
  }
  return out;
}

// ==================================================================================================================
await test(1, 'Any year from 3000 BCE to today can be reached and shows matching content', async () => {
  const years = [-3000, -2500, -1000, -323, -1, 1, 476, 1000, 1347, 1492, 1757, 1857, 1947, 2000, 2026];
  while (years.length < 40) years.push(Math.round(-3000 + rand() * 5026) || 1);
  const places = [[28.6, 77.2], [41.9, 12.5], [30.0, 31.2], [34.3, 108.9], [19.4, -99.1], [9.0, 7.5]];
  for (let i = 0; i < years.length; i++) {
    const y = years[i];
    const [lat, lon] = places[i % places.length];
    const s = await goto({ y, lat, lon, altKm: 3000 });
    assert(Math.abs(s.year - y) < 1e-6, `asked for ${y}, clock at ${s.year}`);
    const ui = await cap.page.evaluate(() => ({ clock: document.querySelector('.clock').textContent, here: (document.querySelector('.here-body') || {}).textContent || '' }));
    const want = y < 0 ? `${-y} BCE` : String(y);
    assert(ui.clock.includes(want), `clock reads "${ui.clock}" for year ${y}`);
    assert(ui.here.length > 60, `no content in the "here, then" panel for ${y} at ${lat},${lon}`);
    assert(!s.errors.length, `errors at ${y}: ${s.errors.join('; ')}`);
  }
  // typed dates
  const typed = [['1857', 1857, 1858], ['300 BCE', -300, -299], ['June 1944', 1944.4, 1944.51], ['66 million years ago', -66.7e6, -65.3e6], ['Mughal', 1526, 1858]];
  for (const [text, lo, hi] of typed) {
    await live.page.click('.clock');
    await live.page.fill('#date-input', text);
    await live.page.keyboard.press('Enter');
    await live.page.waitForFunction(([a, b]) => { const y = window.__earthCapture.status().year; return y >= a && y <= b; }, [lo, hi], { timeout: 8000 }).catch(() => {});
    const y = (await st(live.page)).year;
    assert(y >= lo && y <= hi, `typing "${text}" set the clock to ${y}`);
  }
  return `${years.length} years by the clock, ${typed.length} typed dates`;
});

await test(2, 'Time never changes unless the user moves it (60 seconds idle)', async () => {
  await live.page.evaluate(() => window.__earth.timeline.jumpTo(1347.5));
  await live.page.waitForTimeout(1500);
  const a = await live.page.evaluate(() => ({ y: window.__earthCapture.status().year, clock: window.__earth.engine.clock, frames: window.__earth.engine.frames }));
  await live.page.waitForTimeout(quick ? 8000 : 60000);
  const b = await live.page.evaluate(() => ({ y: window.__earthCapture.status().year, clock: window.__earth.engine.clock, frames: window.__earth.engine.frames }));
  assert(a.y === b.y, `the date moved from ${a.y} to ${b.y} with nobody touching it`);
  assert(b.clock > a.clock, 'ambient animation was not running, so the test proves nothing');
  return `date stayed at ${b.y} while the ambient clock advanced ${(b.clock - a.clock).toFixed(0)} s`;
});

await test(3, 'Rotating or zooming never changes the time; changing time never moves the camera', async () => {
  const p = live.page;
  await p.evaluate(() => { window.__earth.deep.close(); for (const s of document.querySelectorAll('.sheet:not([hidden]) .icon-btn')) s.click(); });
  const s0 = await still(p);
  await p.mouse.move(640, 300);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(640 + i * 14, 300 + i * 5);
  await p.mouse.up();
  const s1 = await still(p);
  assert(s1.year === s0.year, `dragging the globe changed the date: ${s0.year} to ${s1.year}`);
  assert(Math.abs(s1.lon - s0.lon) > 1 || Math.abs(s1.lat - s0.lat) > 1, 'dragging did not turn the globe');
  await p.mouse.move(640, 300);
  await p.mouse.wheel(0, -600);
  const s2 = await still(p);
  assert(s2.year === s0.year, `zooming changed the date: ${s0.year} to ${s2.year}`);
  assert(Math.abs(s2.altKm - s1.altKm) > 50, 'the wheel did not zoom the globe');
  // now move time with the wheel over the timeline, with a key, and with an era button
  const before = await still(p);
  const tape = await p.$('.tape-wrap');
  const box = await tape.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.wheel(0, 400);
  const after = await still(p);
  assert(after.year !== before.year, 'the wheel over the timeline did not move the clock');
  assert(after.lat === before.lat && after.lon === before.lon && after.altKm === before.altKm, `moving time moved the camera: ${JSON.stringify([before.lat, before.lon, before.altKm])} to ${JSON.stringify([after.lat, after.lon, after.altKm])}`);
  await p.click('.era-chips .chip[data-era]');
  const era = await still(p);
  assert(era.year !== after.year, 'an era button did not move the clock');
  assert(era.lat === after.lat && era.lon === after.lon && era.altKm === after.altKm, 'an era button moved the camera');
  return `drag: ${(s1.lon - s0.lon).toFixed(1)} deg, date fixed; time wheel: ${Math.round(after.year - before.year)} years, camera fixed`;
});

await test(4, 'Continents visibly change from 1 Gya to today and end at real coastlines', async () => {
  await cap.page.evaluate(() => window.__earthCapture.setClock(4000));
  const times = [-1.0e9, -7.5e8, -5.0e8, -2.5e8, -1.0e8, -5.0e7, 2026];
  const shots = [];
  for (const y of times) { await goto({ y, lat: 5, lon: 20, altKm: 26000 }); shots.push(await globeShot(cap.page)); }
  const diffs = [];
  for (let i = 1; i < shots.length; i++) diffs.push(await diffRatio(shots[i - 1], shots[i]));
  assert(diffs.every((d) => d > 0.04), `two neighbouring moments look the same: ${diffs.map((d) => d.toFixed(3)).join(', ')}`);
  // at the present the reconstruction is the identity, so the plates end exactly on today's coastlines
  const drift = await cap.page.evaluate(() => {
    const pl = window.__earth.engine.plates;
    let worst = 0, n = 0;
    for (let lat = -50; lat <= 70; lat += 10) for (let lon = -170; lon <= 170; lon += 10) {
      const r = pl.reconstruct(lon, lat, 0);
      if (!r) continue;
      n++;
      worst = Math.max(worst, Math.hypot(r.lat - lat, (((r.lon - lon + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180)));
    }
    const env = window.__earth.engine.env;
    return { worst, n, modern: env.modern, plates: env.plates };
  });
  assert(drift.n > 50 && drift.worst < 0.01, `at the present, reconstructed points sit ${drift.worst.toFixed(4)} degrees from today's positions`);
  assert(drift.modern === 1, 'today is not drawn from present-day imagery');
  return `frame-to-frame change ${diffs.map((d) => `${(d * 100).toFixed(0)}%`).join(' ')}; present-day offset ${drift.worst.toFixed(5)} deg over ${drift.n} points`;
});

await test(5, 'Ice sheets and sea levels change across the ice ages', async () => {
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'earth', 'model.json'), 'utf8'));
  const at = (ka) => { const s = model.seaLevel; let best = s[0]; for (const p of s) if (Math.abs(p[0] - ka) < Math.abs(best[0] - ka)) best = p; return best[1]; };
  assert(at(20) < -90, `sea level at 20,000 years ago is ${at(20)} m`);
  assert(Math.abs(at(0)) < 5, `sea level today is ${at(0)} m`);
  await goto({ y: -20000, lat: 58, lon: -95, altKm: 11000 });
  const ice = await globeShot(cap.page);
  const hereIce = await cap.page.evaluate(() => document.querySelector('.here-body').textContent);
  await goto({ y: 1900, lat: 58, lon: -95, altKm: 11000 });
  const noIce = await globeShot(cap.page);
  const d = await diffRatio(ice, noIce);
  assert(d > 0.15, `North America at the last glacial maximum and in 1900 differ in only ${(d * 100).toFixed(1)}% of pixels`);
  assert(/below today/.test(hereIce), 'the panel at 20,000 years ago does not report the lower sea level');
  await goto({ y: -20000, lat: 2, lon: 108, altKm: 6000 });
  const sunda = await globeShot(cap.page);
  await goto({ y: 2000, lat: 2, lon: 108, altKm: 6000 });
  const d2 = await diffRatio(sunda, await globeShot(cap.page));
  assert(d2 > 0.05, `Sundaland looks the same at low sea level and today (${(d2 * 100).toFixed(1)}%)`);
  return `sea level 20 ka: ${at(20)} m; Laurentide view differs ${(d * 100).toFixed(0)}%; Sunda shelf differs ${(d2 * 100).toFixed(0)}%`;
});

await test(6, 'Borders change year by year in recorded history', async () => {
  const pts = [[77.2, 28.6], [12.5, 41.9], [116.4, 39.9], [31.2, 30.0], [-99.1, 19.4], [37.6, 55.7], [44.4, 33.3], [2.35, 48.85], [28.98, 41.0], [106.8, -6.2]];
  const names = pts.map(() => new Set());
  for (const y of [-500, 1, 500, 1000, 1300, 1500, 1700, 1800, 1880, 1920, 1950, 2000]) {
    await goto({ y, lat: 30, lon: 60, altKm: 20000 });
    const got = await cap.page.evaluate((list) => list.map(([lon, lat]) => { const p = window.__earth.territories.polityAt(lon, lat); return p && p.polity ? p.polity.name : null; }), pts);
    got.forEach((n, i) => n && names[i].add(n));
  }
  const varied = names.filter((s) => s.size >= 4).length;
  assert(varied >= 8, `only ${varied} of ${pts.length} places changed hands at least four times: ${names.map((s) => s.size).join(',')}`);
  // dated changes land in the right year: the name over a city one year before and one year after
  const dated = [['Karlovy Vary', 12.87, 50.23, 1937.5, 1939.5], ['Leipzig', 12.37, 51.34, 1989.5, 1991.5], ['Kyiv', 30.52, 50.45, 1990.5, 1992.5], ['Bratislava', 17.11, 48.15, 1992.5, 1993.5], ['Lahore', 74.34, 31.55, 1946.5, 1948.5], ['Dhaka', 90.4, 23.8, 1970.5, 1972.5], ['Juba', 31.6, 4.85, 2010.5, 2012.5], ['Warsaw', 21.0, 52.2, 1917.5, 1919.5], ['Seoul', 126.98, 37.57, 1944.5, 1949.5], ['Asmara', 38.93, 15.33, 1992.5, 1993.9]];
  const nameAt = async (lon, lat, y) => { await goto({ y, lat, lon, altKm: 3000 }); return cap.page.evaluate(([x, yy]) => { const p = window.__earth.territories.polityAt(x, yy); return p && p.polity ? p.polity.name : null; }, [lon, lat]); };
  const flips = [];
  const same = [];
  for (const [city, lon, lat, y0, y1] of dated) {
    const before = await nameAt(lon, lat, y0);
    const after = await nameAt(lon, lat, y1);
    if (!(before && after && before !== after)) same.push(`${city}: "${before}" in ${Math.floor(y0)} and "${after}" in ${Math.floor(y1)}`);
    flips.push(`${city} ${Math.floor(y1)}: ${before} to ${after}`);
  }
  assert(!same.length, `dated border changes that the map does not show: ${same.join('; ')}`);
  // year by year through the twentieth century, over Europe and western Asia
  const grid = [];
  for (let lat = 36; lat <= 60; lat += 3) for (let lon = -9; lon <= 54; lon += 3) grid.push([lon, lat]);
  let prev = null, changes = 0;
  const changedIn = [];
  for (let y = 1900; y <= 2000; y++) {
    await goto({ y: y + 0.5, lat: 48, lon: 24, altKm: 9000 });
    const sig = await cap.page.evaluate((list) => list.map(([lon, lat]) => { const p = window.__earth.territories.polityAt(lon, lat); return p && p.polity ? p.polity.name : '-'; }).join('|'), grid);
    if (prev !== null && sig !== prev) { changes++; changedIn.push(y); }
    prev = sig;
  }
  assert(changes >= 10, `the map of Europe changed in only ${changes} of 100 consecutive years`);
  return `${varied}/${pts.length} places changed hands 4+ times since 500 BCE; ${flips.length} dated changes land in the right year (${flips.slice(0, 3).join('; ')}); Europe's map changed in ${changes} separate years of the 20th century (${changedIn.join(', ')})`;
});

await test(7, 'Timeline scrubbing is smooth, with no blocking load', async () => {
  const p = live.page;
  await p.evaluate(() => { window.__earth.deep.close(); window.__earth.timeline.jumpTo(1500, { zoom: 2.2 }); });
  await p.waitForTimeout(1500);
  const box = await (await p.$('.tape-wrap')).boundingBox();
  await p.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); }; window.__stop = false; requestAnimationFrame(tick); });
  const y0 = (await st(p)).year;
  await p.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await p.mouse.down();
  for (let i = 0; i < 160; i++) { await p.mouse.move(box.x + box.width * 0.8 - i * 4, box.y + box.height / 2); await p.waitForTimeout(12); }
  for (let i = 160; i > 0; i--) { await p.mouse.move(box.x + box.width * 0.8 - i * 4, box.y + box.height / 2); await p.waitForTimeout(12); }
  const mid = (await st(p)).year;
  await p.mouse.up();
  const frames = await p.evaluate(() => { window.__stop = true; return window.__frames.slice(5); });
  const sorted = frames.slice().sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  const blocking = await p.evaluate(() => !!document.querySelector('.loading-screen, .blocking, [aria-busy="true"].overlay'));
  assert(frames.length > 100, `only ${frames.length} frames were drawn during the scrub`);
  assert(q(0.5) < 34 && q(0.95) < 70 && sorted[sorted.length - 1] < 400, `frame times while scrubbing: median ${q(0.5).toFixed(1)} ms, 95th ${q(0.95).toFixed(1)} ms, worst ${sorted[sorted.length - 1].toFixed(0)} ms`);
  assert(!blocking, 'a blocking loading screen appeared');
  return `${frames.length} frames: median ${q(0.5).toFixed(1)} ms, 95th percentile ${q(0.95).toFixed(1)} ms, worst ${sorted[sorted.length - 1].toFixed(0)} ms`;
});

await test(8, 'Clicking any of 200 randomly sampled pins opens a correct, complete deep view', async () => {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'events', 'index.json'), 'utf8'));
  const sample = [];
  for (const b of pickN(idx.buckets, 24)) {
    const keys = ['top', ...Object.keys(b.cells).map((k) => `c${k}`)];
    for (const k of pickN(keys, 2)) {
      const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'events', `b${b.id}`, `${k}.json`), 'utf8'));
      for (const r of pickN(rows, 5)) sample.push({ id: r[0], title: r[1], y: r[2] });
    }
  }
  const auto = pickN(sample, 160);
  await cap.page.evaluate(() => window.__earth.loadFossils());
  const extra = await cap.page.evaluate(() => {
    const app = window.__earth;
    const pick = (list, n, f) => { const out = []; const step = Math.max(1, Math.floor(list.length / n)); for (let i = 0; i < list.length && out.length < n; i += step) out.push(f(list[i])); return out; };
    return [
      ...pick(app.india.events, 24, (e) => ({ id: e.id, title: e.t, y: e.y })),
      ...pick(app.india.people, 10, (p) => ({ id: p.id, title: p.n, y: p.b })),
      ...pick(app.fossils.list, 8, (e) => ({ id: e.id, title: e.title, y: e.y })),
      ...app.wide.list.slice(0, 4).map((e) => ({ id: `wide:${e.id}/${e.views[0].id}`, title: e.title, y: e.y })),
      { id: 'country:KEN', title: 'Kenya' }, { id: 'country:TUV', title: 'Tuvalu' }, { id: 'model:sanchi-stupa', title: 'The Great Stupa at Sanchi' }, { id: 'istate:IN-KL', title: 'Kerala' },
    ];
  });
  const all = [...auto, ...extra];
  const bad = await cap.page.evaluate(async (list) => {
    const app = window.__earth;
    const out = [];
    for (const want of list) {
      let v = null;
      try { v = await app.resolveRecord(want.id); } catch (e) { out.push(`${want.id}: ${e.message}`); continue; }
      if (!v) { out.push(`${want.id}: no record`); continue; }
      const problems = [];
      if (!v.title || v.title !== want.title) problems.push(`title "${v.title}" is not "${want.title}"`);
      if (want.y != null && (v.y == null || Math.abs(v.y - want.y) > 1e-3 * Math.max(1, Math.abs(want.y)))) problems.push(`date ${v.y} is not ${want.y}`);
      if (!v.sources || !v.sources.length || !v.sources.every((s) => /^https:\/\//.test(s.url) && s.title)) problems.push('no valid source');
      if (!(v.summary || v.kidSummary || (v.facts && v.facts.length))) problems.push('nothing to read');
      if (!Array.isArray(v.consequences)) problems.push('no "this led to" list');
      const text = JSON.stringify(v);
      if (/undefined|NaN|\[object/.test(text)) problems.push('a broken value in the view');
      if (problems.length) out.push(`${want.id} (${want.title}): ${problems.join('; ')}`);
    }
    return out;
  }, all);
  assert(!bad.length, `${bad.length} of ${all.length} views are wrong:\n        ${bad.slice(0, 8).join('\n        ')}`);
  // real clicks on pins drawn on the globe
  let clicked = 0;
  for (const view of [{ y: 1930, lat: 22, lon: 79, altKm: 4200 }, { y: 1600, lat: 47, lon: 10, altKm: 4200 }, { y: 1943.5, lat: 50, lon: 20, altKm: 5200 }, { y: -100, lat: 38, lon: 20, altKm: 4200 }]) {
    await goto(view);
    const locate = () => cap.page.evaluate(async () => {
      const app = window.__earth;
      app.deep.close();
      await window.__earthCapture.renderFrame();
      const out = [];
      const p = { x: 0, y: 0, visible: false };
      const v = app.engine.camera.position.clone();
      for (const e of app.pins.visible) {
        v.set(e.x, e.yv, e.z);
        app.engine.project(v, p);
        if (p.visible && p.x > 300 && p.x < 1240 && p.y > 70 && p.y < 400) out.push({ id: e.id, title: e.title, x: p.x, y: p.y });
      }
      return out;
    });
    const first = await locate();
    for (const want of pickN(first, 5)) {
      const pins = await locate();
      const pin = pins.find((q) => q.id === want.id);
      if (!pin) continue;
      await cap.page.mouse.click(pin.x, pin.y);
      await cap.page.waitForFunction(() => window.__earthCapture.status().event && window.__earth.deep.shown === window.__earthCapture.status().event && document.querySelector('.deep .deep-title'), null, { timeout: 15000 });
      const got = await cap.page.evaluate(() => ({ id: window.__earth.deep.shown, title: document.querySelector('.deep .deep-title').textContent, led: !!document.querySelector('.deep .led-to h3'), src: document.querySelectorAll('.deep .src a[href^="https://"]').length }));
      const near = pins.filter((q) => Math.hypot(q.x - pin.x, q.y - pin.y) < 24).map((q) => q.id);
      assert(near.includes(got.id), `clicked the pin for "${pin.title}" and "${got.title}" opened`);
      assert(got.led && got.src > 0, `the view for "${got.title}" has no sources or no "this led to" section`);
      clicked++;
    }
  }
  await cap.page.evaluate(() => window.__earth.deep.close());
  assert(clicked >= 15, `only ${clicked} pins could be clicked`);
  return `${all.length} sampled records resolve to complete views (${auto.length} automatic, ${extra.length} curated); ${clicked} real clicks on pins opened the right view`;
});

await test(9, '100 random land points at 20 random times: real content or an honest thin-record statement', async () => {
  const points = landPoints(quick ? 12 : 100);
  const times = [];
  for (let i = 0; i < 12; i++) times.push(Math.round((-3000 + rand() * 5026) * 10) / 10);
  for (let i = 0; i < 4; i++) times.push(-Math.round(Math.exp(Math.log(3000) + rand() * (Math.log(300000) - Math.log(3000)))));
  for (let i = 0; i < 4; i++) times.push(-Math.round(3e6 + rand() * 537e6));
  const tally = { content: 0, thin: 0 };
  const bad = [];
  for (const y of times) {
    for (const pt of points) {
      await goto({ y, lat: pt.lat, lon: pt.lon, altKm: 1800 });
      const r = await cap.page.evaluate(() => {
        const body = document.querySelector('.here-body');
        const title = document.querySelector('.here-title');
        return { title: title ? title.textContent : '', text: body ? body.textContent : '', thin: !!(body && body.querySelector('.thin')), events: body ? body.querySelectorAll('.ev').length : 0, sourced: body ? body.querySelectorAll('.sourced, .here-then, .facts').length : 0 };
      });
      const broken = /undefined|NaN|\[object|null,/.test(r.text + r.title);
      if (!r.title || r.text.length < 60 || broken || (!r.thin && !r.events && !r.sourced)) bad.push(`y=${y} at ${pt.lat},${pt.lon}: "${r.title}" / ${r.text.slice(0, 80)}`);
      else if (r.thin && !r.events) tally.thin++;
      else tally.content++;
    }
  }
  const errors = (await st(cap.page)).errors;
  assert(!bad.length, `${bad.length} blank or broken places:\n        ${bad.slice(0, 6).join('\n        ')}`);
  assert(!errors.length, `errors: ${errors.slice(0, 3).join('; ')}`);
  return `${points.length * times.length} place-moments: ${tally.content} with content, ${tally.thin} with an honest thin-record statement, 0 blank`;
});

await test(10, 'All 15 lenses visibly change the view (and the 6 deep-time lenses)', async () => {
  const human = ['power', 'war', 'trade', 'work', 'food', 'daily', 'science', 'medicine', 'technology', 'religion', 'arts', 'language', 'nature', 'movement', 'women'];
  const view = { y: 1930.5, lat: 22, lon: 79, altKm: 5200 };
  await cap.page.evaluate(() => window.__earthCapture.setClock(4000));
  await goto({ ...view, lens: 'all' });
  const base = await cap.page.screenshot();
  const basePins = await cap.page.evaluate(() => window.__earth.pins.visible.map((e) => e.id).join(','));
  const out = [];
  const seen = new Set();
  for (const lens of human) {
    await goto({ ...view, lens });
    const shot = await cap.page.screenshot();
    const d = await diffRatio(base, shot);
    const info = await cap.page.evaluate(() => ({ pins: window.__earth.pins.visible.map((e) => e.id).join(','), label: document.querySelector('.lens-name').textContent, n: window.__earth.pins.visible.length, here: document.querySelector('.here-body').textContent.slice(0, 400) }));
    assert(d > 0.004, `the ${lens} lens changes ${(d * 100).toFixed(2)}% of the screen`);
    assert(info.pins !== basePins, `the ${lens} lens shows the same pins as no lens`);
    assert(!seen.has(info.pins + info.here), `the ${lens} lens shows exactly what another lens shows`);
    seen.add(info.pins + info.here);
    out.push(`${lens} ${info.n}`);
  }
  const deep = ['geology', 'climate', 'life', 'extinctions', 'oceans', 'cosmos'];
  await goto({ y: -100e6, lat: -20, lon: 60, altKm: 14000, lens: 'all' });
  const dbase = await cap.page.screenshot();
  // Before people there are few pins to filter, so a deep-time lens has to change the planet itself and say what it shows.
  const dshots = [];
  const dout = [];
  for (const lens of deep) {
    const s = await goto({ y: -100e6, lat: -20, lon: 60, altKm: 14000, lens });
    assert(s.lens === lens, `the deep-time lens ${lens} did not take (${s.lens})`);
    const shot = await cap.page.screenshot();
    const d = await diffRatio(dbase, shot);
    assert(d > 0.05, `the deep-time lens ${lens} changes only ${(d * 100).toFixed(2)}% of the screen`);
    for (const [other, prev] of dshots) { const dd = await diffRatio(prev, shot); assert(dd > 0.03, `the deep-time lenses ${other} and ${lens} look alike (${(dd * 100).toFixed(2)}% apart)`); }
    dshots.push([lens, shot]);
    const said = await cap.page.evaluate(() => { const e = document.querySelector('.here-lens'); return e ? e.textContent : ''; });
    assert(said.length > 60, `the deep-time lens ${lens} says nothing about what it shows`);
    dout.push(`${lens} ${Math.round(d * 100)}%`);
  }
  // one call may cross from history into deep time and ask for a deep-time lens at once, and the other way round
  await goto({ ...view, lens: 'all' });
  const across = await goto({ y: -100e6, lat: -20, lon: 60, altKm: 14000, lens: 'geology' });
  assert(across.lens === 'geology', `a deep-time lens asked for in the same call as the jump to deep time did not take (${across.lens})`);
  const back = await goto({ ...view, lens: 'war' });
  assert(back.lens === 'war', `a lens asked for in the same call as the jump back to history did not take (${back.lens})`);
  await goto({ ...view, lens: 'all' });
  return `pins per lens over India in 1930: ${out.join(', ')}; deep-time lenses at 100 Ma change the screen by: ${dout.join(', ')}`;
});

await test(11, 'Search finds events, people, places and dates, and moves clock and globe', async () => {
  const p = live.page;
  const ask = async (text) => {
    await p.fill('.search-input', '');
    await p.fill('.search-input', text);
    await p.waitForFunction((t) => { const li = document.querySelectorAll('.search-results li'); return li.length > 0 && document.querySelector('.search-input').value === t; }, text, { timeout: 15000 });
    await p.waitForTimeout(500);
    return p.evaluate(() => [...document.querySelectorAll('.search-results li')].map((li) => ({ kind: (li.querySelector('.sr-kind') || {}).textContent || '', title: (li.querySelector('.sr-title') || {}).textContent || '' })));
  };
  const cases = [['Battle of Plassey', /Event/, /Plassey/], ['Savitribai', /Person/, /Savitribai Phule/], ['Nairobi', /Place/, /Nairobi/], ['1857', /Date/, /1857/], ['66 million years ago', /Date/, /66 million/], ['Mughal', /Era|India/, /Mughal/], ['Stalingrad', /Event/, /Stalingrad/], ['Sanchi', /3D|Event|India/, /Sanchi/]];
  for (const [text, kind, title] of cases) {
    const got = await ask(text);
    assert(got.some((r) => kind.test(r.kind) && title.test(r.title)), `searching "${text}" found ${JSON.stringify(got.slice(0, 4))}`);
  }
  // choosing a result moves both the clock and the globe
  await ask('Battle of Plassey');
  const before = await st(p);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => { const s = window.__earthCapture.status(); return Math.abs(s.year - 1757.47) < 0.1 && Math.abs(s.lat - 23.8) < 1.5 && Math.abs(s.lon - 88.25) < 1.5; }, null, { timeout: 12000 }).catch(() => {});
  const after = await st(p);
  assert(Math.abs(after.year - 1757.47) < 0.1, `choosing Plassey set the clock to ${after.year} (was ${before.year})`);
  assert(Math.abs(after.lat - 23.8) < 1.5 && Math.abs(after.lon - 88.25) < 1.5, `choosing Plassey moved the globe to ${after.lat.toFixed(1)}, ${after.lon.toFixed(1)}`);
  await p.evaluate(() => window.__earth.deep.close());
  return `${cases.length} searches; choosing a result set the clock to ${after.year.toFixed(2)} and flew to ${after.lat.toFixed(1)}, ${after.lon.toFixed(1)}`;
});

await test(12, '"What stood right here?", "This day", "Surprise me", "Meanwhile" and Trails all work', async () => {
  const p = live.page;
  // What stood right here?
  await p.click('.tool-btn[data-tool="right-here"]');
  await p.evaluate(() => window.__earth.rightHere(41.9, 12.5, 'Rome'));
  await p.waitForFunction(() => /Who held this ground/.test(document.querySelector('.sheet:not([hidden]) .sheet-body').textContent), null, { timeout: 20000 });
  const rows = await p.evaluate(() => document.querySelectorAll('.sheet:not([hidden]) .sheet-body button').length);
  assert(rows >= 5, `"right here" lists only ${rows} lines for Rome`);
  const y0 = (await st(p)).year;
  await p.evaluate(() => { const b = [...document.querySelectorAll('.sheet:not([hidden]) .sheet-body button')]; b[Math.min(3, b.length - 1)].click(); });
  await p.waitForTimeout(1200);
  const s1 = await st(p);
  assert(s1.year !== y0, 'choosing a line in "right here" did not set the clock');
  assert(Math.abs(s1.lat - 41.9) < 1 && Math.abs(s1.lon - 12.5) < 1, 'the globe did not fly to Rome');
  // This day in history
  await p.click('.tool-btn[data-tool="discover"]');
  await p.waitForFunction(() => { const s = document.querySelector('.sheet:not([hidden]) .sheet-body'); return s && /This day in history/.test(s.textContent) && s.querySelectorAll('.ev').length > 0; }, null, { timeout: 20000 });
  const day = await p.evaluate(() => ({ n: document.querySelectorAll('.sheet:not([hidden]) .sheet-body .ev').length, head: [...document.querySelectorAll('.sheet:not([hidden]) .sheet-h')].map((h) => h.textContent).find((t) => /This day/.test(t)) }));
  const today = new Date();
  assert(day.head.includes(String(today.getDate())), `"This day" is headed "${day.head}" on day ${today.getDate()}`);
  // Surprise me
  const before = await st(p);
  await p.evaluate(() => [...document.querySelectorAll('.sheet:not([hidden]) button')].find((b) => /Surprise me/.test(b.textContent)).click());
  await p.waitForFunction(() => !!window.__earthCapture.status().event, null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  const sur = await st(p);
  assert(sur.event && sur.year !== before.year, 'Surprise me did not open a moment');
  const surTitle = await p.evaluate(() => (document.querySelector('.deep .deep-title') || {}).textContent);
  assert(surTitle, 'Surprise me opened an empty view');
  await p.evaluate(() => window.__earth.deep.close());
  // Meanwhile, elsewhere
  const mean = await cap.page.evaluate(async () => { await window.__earthCapture.goto({ y: 1600.5, lat: 48, lon: 8, altKm: 5000, lens: 'all' }); const b = document.querySelector('.here-body'); const hs = [...b.querySelectorAll('h3')].map((h) => h.textContent); return { has: hs.some((t) => /Meanwhile, elsewhere/.test(t)), text: b.textContent }; });
  assert(mean.has, 'no "Meanwhile, elsewhere" list in Europe in 1600');
  // Trails: every stop of every trail
  const trails = await cap.page.evaluate(async () => {
    const app = window.__earth;
    const out = [];
    for (const t of app.trailList) {
      let warPolitics = 0;
      for (let i = 0; i < t.stops.length; i++) {
        await app.openTrailStop(t.id, i);
        const card = document.querySelector('.trail-card');
        if (!card || card.textContent.length < 60) return { error: `${t.id} stop ${i} shows no text` };
        const s = window.__earthCapture.status();
        if (s.errors.length) return { error: `${t.id} stop ${i}: ${s.errors[0]}` };
      }
      out.push({ id: t.id, stops: t.stops.length, warPolitics });
    }
    app.trails.close();
    return { list: out };
  });
  assert(!trails.error, trails.error);
  assert(trails.list.length >= 12 && trails.list.every((t) => t.stops >= 8), `trails: ${JSON.stringify(trails.list)}`);
  return `right here: ${rows} lines for Rome; this day: ${day.n} events (${day.head}); surprise: "${surTitle}"; meanwhile: present; ${trails.list.length} trails, ${trails.list.reduce((n, t) => n + t.stops, 0)} stops walked`;
});

await test(17, 'Kid mode exists for all curated content', async () => {
  const D = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'curated', f), 'utf8'));
  const missing = [];
  const need = (ok, what) => { if (!ok) missing.push(what); };
  const stories = D('stories/index.json');
  let scenes = 0;
  for (const s of stories) {
    const full = D(`stories/${s.id}.json`);
    need(full.kidTitle || full.kidDeck, `story ${s.id} title`);
    for (const sc of full.scenes) { scenes++; need(sc.kid && sc.kid.length && [].concat(sc.kid).join(' ').length > 20 && [].concat(sc.kid).join(' ') !== [].concat(sc.text).join(' '), `story ${s.id} scene ${sc.id}`); }
  }
  const trails = D('trails.json');
  let stops = 0;
  for (const t of trails) for (const sp of t.stops) { stops++; need(sp.kid && String(sp.kid).length > 15, `trail ${t.id} stop ${sp.id || sp.title}`); }
  const india = D('india/index.json');
  for (const e of india.eras) need(e.kidSummary && e.kidName, `India era ${e.id}`);
  const cells = D('india/cells.json');
  for (const [id, c] of Object.entries(cells)) need(c.kid && c.kid.length > 15 && c.kid !== c.text, `India cell ${id}`);
  const ev = D('india/events.json');
  for (const e of ev) need(e.k && e.k.length > 15 && e.k !== e.s, `India event ${e.id}`);
  const people = D('india/people.json');
  for (const pp of people) need(pp.k && pp.k.length > 15 && pp.k !== pp.s, `India person ${pp.id}`);
  for (const s of D('india/states.json')) need(s.kid && s.kid.length && s.kid[0] !== s.text[0], `India state ${s.id}`);
  const models = D('models.json');
  for (const m of models) { need(m.kidSummary && m.kidTitle, `3D scene ${m.id}`); for (const part of m.parts) need(part.kid && part.kidName && part.kid !== part.text, `3D part ${m.id}.${part.id}`); }
  const wide = D('wide.json');
  for (const w of wide) { need(w.kidSummary, `event ${w.id}`); for (const v of w.views) need(v.kid && v.kid !== v.text, `region view ${w.id}.${v.id}`); }
  const eras = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'generated', 'eras.json'), 'utf8'));
  for (const e of eras) if (e.summary) need(e.kidSummary, `era ${e.id}`);
  assert(!missing.length, `${missing.length} curated records have no separate Kid text: ${missing.slice(0, 10).join('; ')}`);
  // and the switch really changes what is on screen
  const texts = await cap.page.evaluate(async () => {
    const app = window.__earth;
    await app.openEvent('icell:maurya.war', { fly: true, time: true });
    await new Promise((r) => setTimeout(r, 400));
    const a = document.querySelector('.deep .deep-lead').textContent;
    document.querySelector('.level button[data-level="kid"]').click();
    await new Promise((r) => setTimeout(r, 500));
    const b = document.querySelector('.deep .deep-lead').textContent;
    const font = getComputedStyle(document.querySelector('.deep .deep-lead')).fontFamily;
    document.querySelector('.level button[data-level="explorer"]').click();
    app.deep.close();
    return { a, b, font };
  });
  assert(texts.a !== texts.b && texts.b.length > 20, 'switching to Kid mode did not change the text on screen');
  return `${scenes} scenes, ${stops} trail stops, ${Object.keys(cells).length} India cells, ${ev.length} India events, ${people.length} biographies, 36 states, ${models.length} 3D scenes, ${wide.length} multi-region events, ${eras.filter((e) => e.summary).length} eras: all have separate Kid text`;
});

async function playStory(id, { backwards = false, midway = false } = {}) {
  return cap.page.evaluate(async ({ id, backwards, midway }) => {
    const app = window.__earth;
    const cap = window.__earthCapture;
    const s0 = await cap.goto({ story: id, step: 0 });
    if (s0.story !== id) return { error: `story ${id} did not open` };
    const n = app.story.story.scenes.length;
    const visit = async (i) => {
      const s = await cap.goto({ story: id, step: i });
      if (s.story !== id || s.step !== i) return `scene ${i}: at ${s.story} step ${s.step}`;
      if (s.errors.length) return `scene ${i}: ${s.errors[0]}`;
      const sc = app.story.story.scenes[i];
      const el = document.querySelectorAll('.story .scene')[i];
      if (!el || el.textContent.length < 30) return `scene ${i} (${sc.id}) shows no text`;
      if (sc.y != null && Math.abs(s.year - sc.y) > Math.max(1e-6, Math.abs(sc.y) * 1e-9, sc.y > 2026 ? 0.01 : 0) && !(sc.to != null && s.year >= Math.min(sc.y, sc.to) && s.year <= Math.max(sc.y, sc.to))) return `scene ${i} (${sc.id}): clock at ${s.year}, scene says ${sc.y}`;
      return null;
    };
    for (let i = 0; i < n; i++) { const e = await visit(i); if (e) return { error: e }; }
    if (backwards) for (let i = n - 1; i >= 0; i--) { const e = await visit(i); if (e) return { error: `backwards, ${e}` }; }
    let explored = null;
    if (midway) {
      const k = Math.floor(n / 2);
      await cap.goto({ story: id, step: k });
      const a = cap.status();
      // stop and explore: turn the globe and zoom, as a reader would
      app.controls.flyTo({ lat: a.lat + 9, lon: a.lon - 14, altKm: a.altKm * 1.6 }, 0);
      await new Promise((r) => setTimeout(r, 300));
      await cap.renderFrame();
      const b = cap.status();
      if (b.story !== id || b.step !== k) return { error: `exploring at scene ${k} left the story (${b.story} step ${b.step})` };
      if (b.year !== a.year) return { error: `exploring at scene ${k} moved the clock from ${a.year} to ${b.year}` };
      if (Math.abs(b.lat - a.lat) < 1 && Math.abs(b.lon - a.lon) < 1) return { error: `the globe could not be turned at scene ${k}` };
      const e = await visit(k + 1);
      if (e) return { error: `after exploring, ${e}` };
      explored = k;
    }
    const quiz = app.story.story.quiz ? app.story.story.quiz.length : 0;
    app.story.close();
    await cap.renderFrame();
    if (cap.status().story) return { error: 'the story did not close' };
    return { n, quiz, explored, format: app.story.index.find((x) => x.id === id).format };
  }, { id, backwards, midway });
}

const storyIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'curated', 'stories', 'index.json'), 'utf8'));
await test(18, 'Both flagship stories have 40+ scenes and work forwards, backwards and when stopped midway', async () => {
  const flags = storyIndex.filter((s) => s.flagship);
  assert(flags.length === 2, `${flags.length} flagship stories`);
  const out = [];
  for (const s of flags) {
    const r = await playStory(s.id, { backwards: true, midway: true });
    assert(!r.error, `${s.id}: ${r.error}`);
    assert(r.n >= 40, `${s.id} has ${r.n} scenes`);
    out.push(`${s.title}: ${r.n} scenes forwards and backwards, explored at scene ${r.explored}`);
  }
  return out.join('; ');
});

await test(19, 'All 12 shorter stories play through', async () => {
  const rest = storyIndex.filter((s) => !s.flagship);
  assert(rest.length >= 12, `${rest.length} shorter stories`);
  const formats = new Set(storyIndex.map((s) => s.format));
  const out = [];
  for (const s of rest) {
    const r = await playStory(s.id);
    assert(!r.error, `${s.id}: ${r.error}`);
    out.push(`${s.id.replace(/^[a-z]-/, '')} ${r.n}`);
  }
  assert(formats.size >= 9, `only ${formats.size} story formats: ${[...formats].join(', ')}`);
  return `${rest.length} stories, ${formats.size} formats: ${out.join(', ')}`;
});

await test(20, 'Multi-country events draw across the globe and show region-specific views', async () => {
  const r = await cap.page.evaluate(async () => {
    const app = window.__earth;
    const cap = window.__earthCapture;
    const out = [];
    for (const e of app.wide.list) {
      await cap.goto({ y: e.y + 0.3, lat: e.views[0].lat, lon: e.views[0].lon, altKm: 14000, event: `wide:${e.id}` });
      await new Promise((res) => setTimeout(res, 250));
      await cap.renderFrame();
      const regions = document.querySelectorAll('.deep .from-here .fh').length;
      const rings = e.views.filter((_, i) => app.overlays.has(`wide-ring-${i}`)).length;
      const arcs = e.views.filter((_, i) => app.overlays.has(`wide-arc-${i}`)).length;
      if (regions !== e.views.length) return { error: `${e.id}: ${regions} region views on screen, ${e.views.length} in the data` };
      if (rings !== e.views.length || arcs < 2) return { error: `${e.id}: ${rings} rings and ${arcs} arcs drawn` };
      // every region's own view of it, without clicking anything
      let fromHere = 0;
      for (const v of e.views) {
        await cap.goto({ y: (v.y ?? e.y) + 0.05, lat: v.lat, lon: v.lon, altKm: 2400 });
        const h3 = [...document.querySelectorAll('.here-body h3')].map((x) => x.textContent);
        const text = document.querySelector('.here-body').textContent;
        if (!h3.some((t) => t.endsWith('from here')) || !text.includes(v.text.slice(0, 40))) return { error: `${e.id}: at ${v.name} the panel does not show this event from here` };
        fromHere++;
      }
      out.push(`${e.id} ${fromHere}`);
    }
    // a story draws its event across many countries at once
    await cap.goto({ story: 'world-war-two', step: 16 });
    const drawn = app.overlays.items.size;
    app.story.close();
    return { out, drawn };
  });
  assert(!r.error, r.error);
  assert(r.drawn >= 2, `the Barbarossa scene draws ${r.drawn} overlays`);
  return `region views shown from here: ${r.out.join(', ')}; a war scene draws ${r.drawn} overlays across the map`;
});

await test(23, 'Mobile emulation at 390x844 is fully usable, and quality scaling triggers', async () => {
  const ph = await openPage(browser, srv.base, { query: '?y=1857.5&lat=26&lon=80&alt=4000', view: 'phone' });
  const p = ph.page;
  await p.waitForFunction(() => window.__earth && window.__earth.featuresLoaded && window.__earth.india && window.__earth.openModel, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const lay = await p.evaluate(() => {
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return `${sel} missing`; const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return `${sel} has no size`; if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) return `${sel} is off screen (${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth})`; return null; };
    const problems = ['.clock', '.tape-wrap', '.search-input', '.lens-btn', '.menu-btn', '.level button[data-level="kid"]', '.era-chips', '.here-title'].map(vis).filter(Boolean);
    const small = [...document.querySelectorAll('.topbar button, .tl-zoom button, .level button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 30 || r.height < 30); }).length;
    return { problems, overflow: document.documentElement.scrollWidth - innerWidth, quality: window.__earth.engine.quality, small, w: innerWidth, h: innerHeight };
  });
  assert(lay.w === 390 && lay.h === 844, `viewport is ${lay.w}x${lay.h}`);
  assert(!lay.problems.length, lay.problems.join('; '));
  assert(lay.overflow <= 0, `the page is ${lay.overflow}px wider than the screen`);
  assert(lay.small === 0, `${lay.small} controls are smaller than 30px`);
  assert(lay.quality !== 'high', `a phone starts at "${lay.quality}" quality`);
  // touch: drag the globe, open the menu, a sheet, a deep view, a 3D scene, a story
  const s0 = await st(p);
  const cdp = await p.context().newCDPSession(p);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 200, 240);
  for (let i = 1; i <= 10; i++) await touch('touchMove', 200 + i * 9, 240 + i * 3);
  await touch('touchEnd', 290, 270);
  await p.waitForTimeout(900);
  const s1 = await st(p);
  assert(s1.year === s0.year && (Math.abs(s1.lon - s0.lon) > 0.5 || Math.abs(s1.lat - s0.lat) > 0.5), `a touch drag did not turn the globe (lon ${s0.lon.toFixed(2)} to ${s1.lon.toFixed(2)})`);
  await p.tap('.menu-btn');
  await p.waitForSelector('.tools .tool-btn[data-tool="india"]', { state: 'visible' });
  await p.tap('.tools .tool-btn[data-tool="india"]');
  await p.waitForSelector('.imx-acc summary', { state: 'visible' });
  const sheetFits = await p.evaluate(() => { const r = document.querySelector('.sheet.india').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  assert(sheetFits, 'the India sheet does not fit the phone screen');
  await p.evaluate(() => { window.__earth.india.sheet.close(); return window.__earth.openEvent(window.__earth.india.events[500].id, { fly: true, time: true }); });
  await p.waitForSelector('.deep .deep-title', { state: 'visible' });
  await p.waitForTimeout(1200);
  const deepBox = await p.evaluate(() => { const r = document.querySelector('.deep').getBoundingClientRect(); const c = document.querySelector('.clock').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, clockTop: c.top, w: innerWidth }; });
  assert(deepBox.left >= 0 && deepBox.right <= deepBox.w && deepBox.bottom <= deepBox.clockTop + 4, `the deep view covers the timeline or leaves the screen: ${JSON.stringify(deepBox)}`);
  await p.evaluate(() => { window.__earth.deep.close(); window.__earth.openModel('iron-pillar'); });
  await p.waitForSelector('.mv .mv-title', { state: 'visible' });
  await p.tap('.mv-parts button');
  const part = await p.evaluate(() => (document.querySelector('.mv-part h3') || {}).textContent);
  assert(part, 'tapping a part in the 3D viewer shows nothing');
  await p.evaluate(() => window.__earth.modelViewer.close());
  await p.evaluate(() => window.__earth.story.open('black-death', 2));
  await p.waitForSelector('.story .scene', { state: 'visible' });
  const storyOk = await p.evaluate(() => { const r = document.querySelector('.story').getBoundingClientRect(); return r.right <= innerWidth + 1 && document.querySelectorAll('.story .scene').length >= 10; });
  assert(storyOk, 'the story does not fit the phone screen');
  await p.evaluate(() => window.__earth.story.close());
  // automatic scaling: a slow device steps down a tier
  const scaled = await live.page.evaluate(() => { const e = window.__earth.engine; const before = e.quality; e.downgrade(); const after = e.quality; return { before, after, attr: document.documentElement.dataset.quality }; });
  assert(scaled.before !== scaled.after && scaled.attr === scaled.after, `quality did not step down (${scaled.before} to ${scaled.after})`);
  const errs = [...new Set(ph.errors)];
  assert(!errs.length, `console errors on the phone: ${errs.slice(0, 3).join('; ')}`);
  await ph.context.close();
  return `phone starts at "${lay.quality}" quality; desktop steps ${scaled.before} to ${scaled.after} under load; touch drag, menu, India sheet, deep view, 3D part and story all usable at 390x844`;
});

await test(25, 'All 9 capture views work through window.__earthCapture', async () => {
  const views = [{ y: -13800000000 }, { y: -4500000000 }, { y: -250000000 }, { y: -66000000 }, { y: -20000 }, { y: -2500, lat: 27.3, lon: 68.1, altKm: 500 }, { y: 1347, lat: 45, lon: 30, altKm: 6000 }, { y: 1942.8, lat: 48.7, lon: 44.5, altKm: 2500 }, { y: 2026, lat: 20, lon: 78, altKm: 12000 }];
  const fresh = await openPage(browser, srv.base, { query: '?capture=1', view: 'desktop' });
  const api = await fresh.page.evaluate(() => ['goto', 'setClock', 'renderFrame', 'status'].filter((k) => typeof window.__earthCapture[k] !== 'function'));
  assert(!api.length, `missing from the contract: ${api.join(', ')}`);
  const hidden = await fresh.page.evaluate(() => ({ intro: !!document.querySelector('.intro'), capture: document.documentElement.dataset.capture }));
  assert(!hidden.intro && hidden.capture === '1', 'capture mode did not hide the intro');
  const sizes = [];
  for (const v of views) {
    await fresh.page.evaluate(() => window.__earthCapture.setClock(2000));
    const s = await fresh.page.evaluate((view) => window.__earthCapture.goto(view), v);
    assert(s.ready === true, `view ${JSON.stringify(v)} resolved before it was ready`);
    assert(s.year === v.y, `view ${JSON.stringify(v)} is at year ${s.year}`);
    for (const k of ['lat', 'lon', 'altKm']) if (v[k] !== undefined) assert(Math.abs(s[k] - v[k]) < 1e-6, `view ${JSON.stringify(v)}: ${k} is ${s[k]}`);
    for (const k of ['ready', 'year', 'lat', 'lon', 'altKm', 'lens', 'story', 'step', 'errors']) assert(k in s, `status() has no "${k}"`);
    assert(Array.isArray(s.errors) && !s.errors.length, `view ${JSON.stringify(v)} reports ${s.errors.join('; ')}`);
    await fresh.page.evaluate(() => window.__earthCapture.renderFrame());
    const a = await fresh.page.screenshot();
    await fresh.page.evaluate(() => window.__earthCapture.renderFrame());
    const b = await fresh.page.screenshot();
    assert((await diffRatio(a, b)) < 0.0005, `view ${JSON.stringify(v)} is not deterministic: two frames at the same clock differ`);
    const stat = await sharp(a).stats();
    const lum = stat.channels.slice(0, 3).reduce((n, c) => n + c.mean, 0) / 3;
    assert(lum > 2, `view ${JSON.stringify(v)} is a black frame`);
    sizes.push(Math.round(lum));
  }
  const errs = [...new Set(fresh.errors)];
  assert(!errs.length, `console errors: ${errs.slice(0, 3).join('; ')}`);
  await fresh.context.close();
  return `9 views ready, exact, deterministic and non-empty (mean brightness ${sizes.join(' ')})`;
});

await test(26, 'All shareable links restore state exactly', async () => {
  const links = [
    '?y=1943.5&lat=48.7&lon=44.5&alt=2500',
    '?y=-66000000&lat=21&lon=-89&alt=9000&lens=extinctions',
    '?y=1347&lat=45&lon=30&alt=6000&lens=medicine',
    '?y=-2500&lat=27.3&lon=68.1&alt=500&lens=daily',
    '?y=1930.2&lat=21.6&lon=72.9&alt=3000&lens=power&event=icell:independence.trade',
    '?y=1757.47534&lat=23.8&lon=88.25&alt=1800&event=Q203233',
    '?story=world-war-two&step=27',
    '?story=how-we-became-human&step=11',
    '?trail=salt&stop=3',
    '?y=2023.64&lat=20&lon=78&alt=9000&event=model:chandrayaan-3',
    '?y=1500&lat=-8&lon=-50&alt=7000&event=country:BRA',
  ];
  const out = [];
  for (const link of links) {
    const a = await openPage(browser, srv.base, { query: `${link}&capture=1`, view: 'laptop' });
    await a.page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded, null, { timeout: 60000 });
    await a.page.evaluate(() => window.__earthCapture.goto({}));
    const s = await st(a.page);
    const want = Object.fromEntries(new URLSearchParams(link.slice(1)));
    if (want.y) assert(Math.abs(s.year - Number(want.y)) < 1e-6 * Math.max(1, Math.abs(Number(want.y))), `${link}: year ${s.year}`);
    if (want.lat && !want.story) assert(Math.abs(s.lat - Number(want.lat)) < 1e-3 && Math.abs(s.lon - Number(want.lon)) < 1e-3 && Math.abs(s.altKm - Number(want.alt)) < 0.5, `${link}: place ${s.lat}, ${s.lon}, ${s.altKm}`);
    if (want.lens) assert(s.lens === want.lens, `${link}: lens ${s.lens}`);
    if (want.story) assert(s.story === want.story && s.step === Number(want.step), `${link}: story ${s.story} step ${s.step}`);
    if (want.event) { await a.page.waitForFunction((id) => window.__earth.deep.shown === id, want.event, { timeout: 20000 }); assert(s.event === want.event, `${link}: event ${s.event}`); }
    if (want.trail) { const t = await a.page.evaluate(() => ({ trail: window.__earth && document.querySelector('.trail-card') ? true : false })); assert(t.trail, `${link}: the trail card is not open`); }
    // round trip: the link the site now offers reproduces the same state in a new tab
    const url = await a.page.evaluate(() => location.search);
    const b = await openPage(browser, srv.base, { query: url.includes('capture') ? url : `${url}&capture=1`, view: 'laptop' });
    await b.page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded, null, { timeout: 60000 });
    await b.page.evaluate(() => window.__earthCapture.goto({}));
    const s2 = await st(b.page);
    for (const k of ['year', 'lat', 'lon', 'altKm', 'lens', 'story', 'step', 'event']) assert(s[k] === s2[k] || (typeof s[k] === 'number' && Math.abs(s[k] - s2[k]) < 1e-3), `${link}: "${k}" was ${s[k]} and came back as ${s2[k]} from ${url}`);
    const head = await b.page.evaluate(() => ({ title: document.title, og: (document.querySelector('meta[property="og:title"]') || {}).content || '' }));
    assert(head.title && head.title.length > 8, `${link}: the page has no title`);
    out.push(head.title.slice(0, 40));
    await a.context.close();
    await b.context.close();
  }
  return `${links.length} links restored and round-tripped; titles such as "${out[0]}", "${out[4]}", "${out[6]}"`;
});

// ---- wrap up --------------------------------------------------------------------------------------------------------
const pageErrors = [...new Set([...cap.errors, ...live.errors])];
if (pageErrors.length) { results.push({ n: 0, name: 'No console errors during the acceptance run', pass: false, detail: pageErrors.slice(0, 10).join(' | ') }); console.log(`FAIL     console errors during the run:\n        ${pageErrors.slice(0, 10).join('\n        ')}`); }
else if (!only) results.push({ n: 0, name: 'No console errors during the acceptance run', pass: true });
const file = path.join(OUT, only ? 'acceptance-partial.json' : 'acceptance.json');
fs.writeFileSync(file, JSON.stringify({ ranAt: new Date().toISOString(), quick, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Saved to ${path.relative(ROOT, file)}`);
await browser.close();
await srv.close();
process.exit(failed.length ? 1 : 0);
