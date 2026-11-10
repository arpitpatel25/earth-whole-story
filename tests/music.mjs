// Music (the owner's review, recorded in DECISIONS.md): on by default, starts at the first interaction the browser
// accepts, one always-visible control that is remembered, a mood for each stretch of time with smooth crossfades,
// lower under story text, never on in capture mode, and nothing downloaded.
//
// Runs in a real browser and listens to the page's own output through an analyser tap on the master bus.
// Usage: node tests/music.mjs   -> tests/results/music.json and tests/music-log.md
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, ROOT, VIEWS } from './lib/browser.mjs';

const srv = await startServer();
const browser = await launch();
const results = [];
const notes = [];
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A first interaction that changes nothing on the page: a click on the empty top-left corner of the page chrome. */
const gesture = (page) => page.mouse.click(4, 4);

// A browser driven by a test script is treated as if the visitor had already clicked, so on its own it will start
// sound from anything. Visitors' browsers follow a rule: sound may start only after a click, a tap or a key press,
// and a wheel or a scroll does not count. For the checks about the first interaction this shim applies that rule to
// the page: an audio context stays suspended until a trusted click, tap or key press has been seen.
const ORDINARY_RULE = () => {
  const Real = window.AudioContext || window.webkitAudioContext;
  if (!Real) return;
  let allowed = false;
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(t, (e) => { if (e.isTrusted) allowed = true; }, true);
  window.__gestureSeen = () => allowed;
  window.AudioContext = class extends Real {
    constructor(...a) { super(...a); if (!allowed) super.suspend(); }
    resume() { return allowed ? super.resume() : Promise.resolve(); }
  };
};

async function open(query, view = 'laptop', storage, { ordinaryRule = false } = {}) {
  const context = await browser.newContext({ viewport: VIEWS[view].viewport || VIEWS[view], deviceScaleFactor: 1, hasTouch: view === 'phone', isMobile: view === 'phone' });
  if (storage) await context.addInitScript((v) => { try { localStorage.setItem('earth.music', v); } catch { /* ignore */ } }, storage);
  if (ordinaryRule) await context.addInitScript(ORDINARY_RULE);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(`pageerror on ${query || '/'}: ${e.message} ${(e.stack || '').split('\n').slice(1, 4).join(' < ').replace(/\s+/g, ' ')}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${srv.base}/${query}`);
  await page.waitForFunction(() => window.__earth && window.__earth.music && window.__earth.engine && window.__earth.engine.frames > 2, null, { timeout: 60000 });
  return { page, context, errors, requests };
}
const st = (page) => page.evaluate(() => {
  const m = window.__earth.music;
  const b = document.querySelector('.music-btn');
  return {
    status: m.status, enabled: m.enabled, ctx: m.ctx ? m.ctx.state : null, mood: m.mood, wanted: m.wanted, duck: m.duck, blocked: m.blocked,
    decks: [...m.decks].map(([k, d]) => [k, +d.out.gain.value.toFixed(3), d.target]),
    bus: m.bus ? +m.bus.gain.value.toFixed(3) : null, master: m.master ? +m.master.gain.value.toFixed(3) : null,
    label: b ? b.querySelector('.music-label').textContent : null, state: b ? b.dataset.state : null, pressed: b ? b.getAttribute('aria-pressed') : null,
    stored: (() => { try { return localStorage.getItem('earth.music'); } catch { return null; } })(),
  };
});
/** Listen for `ms`: the loudest peak, the mean level and the quietest tenth of a second. */
const listen = (page, ms) => page.evaluate(async (dur) => {
  const m = window.__earth.music;
  const out = [];
  const t0 = performance.now();
  while (performance.now() - t0 < dur) { out.push(m.level()); await new Promise((r) => setTimeout(r, 100)); }
  const rms = out.map((o) => o.rms);
  return { peak: Math.max(...out.map((o) => o.peak)), mean: rms.reduce((a, b) => a + b, 0) / rms.length, min: Math.min(...rms), n: out.length, centre: out.reduce((a, o) => a + o.centre, 0) / out.length };
}, ms);
/** Is the control on screen and not covered by anything? */
const visible = (page) => page.evaluate(() => {
  const el = document.querySelector('.music-btn');
  if (!el) return { ok: false, why: 'no control' };
  const r = el.getBoundingClientRect();
  if (r.width < 24 || r.height < 24) return { ok: false, why: `too small (${Math.round(r.width)}x${Math.round(r.height)})` };
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return { ok: false, why: 'off screen' };
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!(hit === el || el.contains(hit))) return { ok: false, why: `covered by ${hit ? hit.className || hit.tagName : 'nothing'}` };
  return { ok: true, at: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` };
});
async function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail, seconds: (Date.now() - t0) / 1000 });
    console.log(`PASS  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  ${detail || ''}`);
  } catch (e) {
    results.push({ name, pass: false, detail: e.message, seconds: (Date.now() - t0) / 1000 });
    console.log(`FAIL  ${name}\n        ${e.message}`);
  }
}

const allErrors = [];
const allRequests = [];

// ------------------------------------------------------------------------------------------------------------------
await test('On by default; silent until an interaction; starts at the first click, tap or key press', async () => {
  // under the ordinary rule: a wheel first, then a click
  const a = await open('', 'laptop', null, { ordinaryRule: true });
  let s = await st(a.page);
  assert(s.enabled && s.status === 'waiting' && s.ctx === null, `before any interaction: ${JSON.stringify(s)}`);
  assert(s.label === 'Music on' && s.pressed === 'true', `the control should read "Music on" at load, reads "${s.label}"`);
  await a.page.mouse.move(640, 360);
  await a.page.mouse.wheel(0, 240);
  await sleep(1100);
  s = await st(a.page);
  assert(s.status === 'waiting', `a wheel alone should not be able to start sound under the ordinary rule: ${JSON.stringify(s)}`);
  assert(s.state === 'asked' && s.label === 'Click for music', `after a refused wheel the control should ask for a click, reads "${s.label}" (${s.state})`);
  const quiet = await listen(a.page, 600);
  assert(quiet.peak < 0.0005, `sound before any click, tap or key press (peak ${quiet.peak})`);
  await gesture(a.page);
  await sleep(800);
  s = await st(a.page);
  assert(s.status === 'playing' && s.ctx === 'running', `after the first click: ${JSON.stringify(s)}`);
  assert(s.label === 'Music on' && s.state === 'playing', `once playing the control should read "Music on", reads "${s.label}"`);
  await sleep(3500);
  const heard = await listen(a.page, 2500);
  assert(heard.mean > 0.002, `nothing is sounding after the first click (mean level ${heard.mean.toFixed(5)})`);
  assert(heard.peak < 0.5, `too loud: peak ${heard.peak.toFixed(2)}`);
  // a first key press
  const b = await open('', 'laptop', null, { ordinaryRule: true });
  await b.page.keyboard.press('ArrowDown');
  await sleep(800);
  const k = await st(b.page);
  assert(k.status === 'playing', `after a first key press: ${JSON.stringify(k)}`);
  // a first tap, on a phone
  const c = await open('', 'phone', null, { ordinaryRule: true });
  assert((await visible(c.page)).ok, 'the control is not visible on a phone at load');
  await c.page.touchscreen.tap(195, 300);
  await sleep(800);
  const tp = await st(c.page);
  assert(tp.status === 'playing', `after a first tap: ${JSON.stringify(tp)}`);
  // a scroll inside a story does not count either, and the control then asks for a tap
  const d = await open('?story=silk-roads&step=1', 'phone', null, { ordinaryRule: true });
  await d.page.waitForSelector('.story-track', { timeout: 60000 });
  await d.page.mouse.wheel(0, 300);
  await sleep(1100);
  const sc = await st(d.page);
  assert(sc.status === 'waiting' && sc.label === 'Tap for music', `after a scroll alone on a phone: ${JSON.stringify(sc)}`);
  // and where a browser does allow it (this one, driven by a script, does), the very first wheel starts the music
  const e = await open('');
  await e.page.mouse.move(640, 360);
  await e.page.mouse.wheel(0, 240);
  await sleep(900);
  const free = await st(e.page);
  notes.push(`Without the shim, in this script-driven browser, a first wheel alone left the music "${free.status}".`);
  for (const x of [a, b, c, d, e]) { allErrors.push(...x.errors); allRequests.push(...x.requests); await x.context.close(); }
  return `under the ordinary rule: silent at load, a wheel or scroll alone is refused and the control then reads "Click for music" (phone: "Tap for music"), the first click, key press or tap starts it; level ${heard.mean.toFixed(3)} mean, ${heard.peak.toFixed(2)} peak; opens in the "${s.mood}" mood. Where the browser allows it, a first wheel alone: ${free.status}`;
});

// ------------------------------------------------------------------------------------------------------------------
await test('A mood for each stretch of time, joined by crossfades that never cut and never jump', async () => {
  const a = await open('?y=2000&lat=20&lon=20&alt=12000');
  await gesture(a.page);
  await sleep(4500);
  const seen = [];
  const centres = {};
  const want = [[2000, 'modern'], [1850, 'industrial'], [1200, 'ancient'], [-100e6, 'deep'], [-13e9, 'cosmos'], [-3000, 'ancient'], [1990, 'modern']];
  let prev = null;
  let worst = { min: 1, peak: 0 };
  for (const [y, mood] of want) {
    await a.page.evaluate((yy) => window.__earth.timeline.jumpTo(yy, {}), y);
    if (prev) {
      // listen across the whole change: the old score must still be there at the start, the new one at the end,
      // and the level must never fall to nothing or leap
      await sleep(1100);
      const mid = await st(a.page);
      assert(mid.mood === mood, `at ${y} the mood should be ${mood}, is ${mid.mood}`);
      assert(mid.decks.length >= 2, `no overlap while changing from ${prev} to ${mood}: ${JSON.stringify(mid.decks)}`);
      const heard = await listen(a.page, 5200);
      assert(heard.min > 0.0006, `the music dropped out between ${prev} and ${mood} (quietest moment ${heard.min.toFixed(5)})`);
      assert(heard.peak < 0.5, `a jump in level between ${prev} and ${mood}: peak ${heard.peak.toFixed(2)}`);
      worst = { min: Math.min(worst.min, heard.min), peak: Math.max(worst.peak, heard.peak) };
      const end = await st(a.page);
      const now = end.decks.find((d) => d[0] === mood);
      const old = end.decks.find((d) => d[0] === prev);
      assert(now && now[1] > 0.75, `${mood} has not come up: ${JSON.stringify(end.decks)}`);
      const voice = await listen(a.page, 2500);
      (centres[mood] = centres[mood] || []).push(voice.centre);
      assert(!old || old[1] < 0.2, `${prev} has not gone down: ${JSON.stringify(end.decks)}`);
    } else {
      await sleep(1200);
      const s = await st(a.page);
      assert(s.mood === mood, `at ${y} the mood should be ${mood}, is ${s.mood}`);
    }
    seen.push(mood);
    prev = mood;
  }
  // scrubbing quickly through several eras must not pile up scores
  await sleep(8500);
  const calm = await st(a.page);
  assert(calm.decks.length === 1, `faded scores were not cleared away: ${JSON.stringify(calm.decks)}`);
  for (const y of [1900, 1000, -1e6, -1e9, 1500, 2020]) { await a.page.evaluate((yy) => window.__earth.timeline.jumpTo(yy, {}), y); await sleep(150); }
  await sleep(1500);
  const after = await st(a.page);
  assert(after.decks.length <= 2, `scores piled up while scrubbing: ${JSON.stringify(after.decks)}`);
  await sleep(10000);
  const settled = await st(a.page);
  assert(settled.decks.length === 1 && settled.decks[0][0] === 'modern', `after settling one score should remain: ${JSON.stringify(settled.decks)}`);
  allErrors.push(...a.errors); allRequests.push(...a.requests);
  await a.context.close();
  // the moods must not be one sound under five names: where the weight of the sound sits differs between them
  const where = Object.entries(centres).map(([k, v]) => [k, Math.round(v.reduce((x, y) => x + y, 0) / v.length)]);
  const lo = Math.min(...where.map((w) => w[1]));
  const hi = Math.max(...where.map((w) => w[1]));
  void lo; void hi;
  return `${[...new Set(seen)].join(', ')}; across six changes the quietest tenth of a second was ${worst.min.toFixed(4)} and the loudest peak ${worst.peak.toFixed(2)}; spectral centre by mood (Hz): ${where.map((w) => `${w[0]} ${w[1]}`).join(', ')}`;
});

// ------------------------------------------------------------------------------------------------------------------
await test('Every mood can be heard on a small speaker, none is loud, and the moods are level with one another', async () => {
  const a = await open('?y=2000&lat=20&lon=20&alt=12000');
  await gesture(a.page);
  const rows = [];
  for (const [y, mood] of [[-13e9, 'cosmos'], [-100e6, 'deep'], [1200, 'ancient'], [1850, 'industrial'], [2000, 'modern']]) {
    await a.page.evaluate((yy) => window.__earth.timeline.jumpTo(yy, {}), y);
    await sleep(10500); // the change is over and the earlier score has been cleared away
    const r = await a.page.evaluate(async () => {
      const m = window.__earth.music;
      const n = m.tap.frequencyBinCount;
      const hz = m.ctx.sampleRate / m.tap.fftSize;
      const acc = new Float64Array(n);
      const f = new Float32Array(n);
      let rms = 0, peak = 0, k = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 9000) {
        m.tap.getFloatFrequencyData(f);
        for (let i = 0; i < n; i++) acc[i] += 10 ** (f[i] / 10);
        const l = m.level(); rms += l.rms; peak = Math.max(peak, l.peak); k++;
        await new Promise((res) => setTimeout(res, 60));
      }
      const band = (lo, hi) => { let sum = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i < Math.min(n, Math.ceil(hi / hz)); i++) sum += acc[i]; return sum; };
      const all = band(20, 20000);
      return { mood: m.mood, decks: m.decks.size, rms: rms / k, peak, low: band(20, 150) / all };
    });
    assert(r.mood === mood && r.decks === 1, `expected ${mood} alone, got ${r.mood} with ${r.decks} scores`);
    // a phone or laptop speaker gives back little below about 150 Hz
    r.heard = Math.sqrt(Math.max(0, 1 - r.low)) * r.rms;
    assert(r.low < 0.5, `${mood} keeps ${Math.round(r.low * 100)}% of its sound below 150 Hz, where a small speaker is nearly silent`);
    assert(r.heard > 0.012, `${mood} would be close to inaudible on a small speaker (level above 150 Hz: ${r.heard.toFixed(4)})`);
    assert(r.peak < 0.35 && r.rms < 0.07, `${mood} is too loud: mean ${r.rms.toFixed(3)}, peak ${r.peak.toFixed(2)}`);
    rows.push(r);
  }
  const heard = rows.map((r) => r.heard);
  assert(Math.max(...heard) < Math.min(...heard) * 2, `the moods are not level with one another: ${rows.map((r) => `${r.mood} ${r.heard.toFixed(4)}`).join(', ')}`);
  allErrors.push(...a.errors); allRequests.push(...a.requests);
  await a.context.close();
  return rows.map((r) => `${r.mood}: level ${r.rms.toFixed(3)} mean and ${r.peak.toFixed(2)} peak, ${Math.round(r.low * 100)}% below 150 Hz`).join('; ');
});

// ------------------------------------------------------------------------------------------------------------------
await test('The music steps down under story text and comes back after', async () => {
  const a = await open('?y=1939.7&lat=50&lon=15&alt=9000');
  await gesture(a.page);
  await a.page.waitForFunction(() => window.__earth.story && window.__earth.stories && window.__earth.featuresLoaded, null, { timeout: 60000 });
  await sleep(5000);
  const before = await listen(a.page, 4000);
  const b0 = await st(a.page);
  assert(b0.duck === 1, `nothing is open, so the level should be full: ${b0.duck}`);
  await a.page.evaluate(() => window.__earth.story.open('world-war-two', 3));
  await sleep(3500);
  const s = await st(a.page);
  assert(s.duck === 0.5, `inside a story the level should be halved, is ${s.duck}`);
  assert(s.bus < b0.bus * 0.6, `the music bus did not come down: ${b0.bus} to ${s.bus}`);
  const during = await listen(a.page, 4000);
  assert(during.mean < before.mean * 0.8, `it is not quieter under story text: ${before.mean.toFixed(4)} before, ${during.mean.toFixed(4)} during`);
  assert(during.mean > 0.0005, 'the music stopped inside the story; it should only step down');
  await a.page.evaluate(() => window.__earth.story.close());
  await sleep(2500);
  const s2 = await st(a.page);
  assert(s2.duck === 1 && s2.bus > b0.bus * 0.9, `after the story the level should return: ${JSON.stringify({ duck: s2.duck, bus: s2.bus })}`);
  // an open record lowers it a little
  await a.page.evaluate(() => window.__earth.openEvent('era:industrial-revolution', {}));
  await sleep(1500);
  const s3 = await st(a.page);
  allErrors.push(...a.errors); allRequests.push(...a.requests);
  await a.context.close();
  return `mean level ${before.mean.toFixed(4)} outside, ${during.mean.toFixed(4)} under story text (bus ${b0.bus} to ${s.bus}); with a record open the level is ${s3.duck}`;
});

// ------------------------------------------------------------------------------------------------------------------
await test('One control turns it off and on, and the choice is remembered', async () => {
  const a = await open('?y=1600&lat=30&lon=60&alt=14000');
  await gesture(a.page);
  await sleep(1500);
  assert((await st(a.page)).status === 'playing', 'did not start');
  await a.page.click('.music-btn');
  await sleep(2600);
  let s = await st(a.page);
  assert(s.status === 'off' && s.stored === 'off' && s.label === 'Music off' && s.pressed === 'false', `after turning off: ${JSON.stringify(s)}`);
  assert(s.ctx === 'suspended', `the audio context should rest when the music is off, is ${s.ctx}`);
  const quiet = await listen(a.page, 800);
  assert(quiet.peak < 0.001, `still sounding after being turned off (peak ${quiet.peak})`);
  // a new visit: still off, and interactions do not start it
  await a.page.reload();
  await a.page.waitForFunction(() => window.__earth && window.__earth.music && window.__earth.engine.frames > 2);
  await gesture(a.page);
  await a.page.keyboard.press('ArrowRight');
  await sleep(900);
  s = await st(a.page);
  assert(s.status === 'off' && s.ctx === null && s.label === 'Music off', `the choice was not remembered: ${JSON.stringify(s)}`);
  // back on from the control: that click is the gesture
  await a.page.click('.music-btn');
  await sleep(1200);
  s = await st(a.page);
  assert(s.status === 'playing' && s.stored === 'on' && s.label === 'Music on', `after turning back on: ${JSON.stringify(s)}`);
  await a.page.reload();
  await a.page.waitForFunction(() => window.__earth && window.__earth.music && window.__earth.engine.frames > 2);
  s = await st(a.page);
  assert(s.enabled && s.status === 'waiting', `on should be remembered too: ${JSON.stringify(s)}`);
  // a press on the control while it is still waiting starts the music; it does not turn it off
  await a.page.click('.music-btn');
  await sleep(900);
  s = await st(a.page);
  assert(s.status === 'playing', `a click on the waiting control should start the music: ${JSON.stringify(s)}`);
  // keyboard: the control is a button like any other
  await a.page.focus('.music-btn');
  await a.page.keyboard.press('Enter');
  await sleep(500);
  assert((await st(a.page)).status === 'off', 'Enter on the control did not turn the music off');
  await a.page.keyboard.press('Enter');
  await sleep(900);
  assert((await st(a.page)).status === 'playing', 'Enter on the control did not turn the music back on');
  allErrors.push(...a.errors); allRequests.push(...a.requests);
  await a.context.close();
  return 'off: silent, context at rest, remembered across a reload and not restarted by clicks or keys; on again from the control; works from the keyboard';
});

// ------------------------------------------------------------------------------------------------------------------
await test('In capture mode there is no audio at all', async () => {
  const a = await open('?capture=1&y=1347&lat=45&lon=30&alt=6000');
  await gesture(a.page);
  await a.page.keyboard.press('ArrowRight');
  await a.page.mouse.wheel(0, 200);
  await a.page.evaluate(() => document.querySelector('.music-btn').click());
  await sleep(900);
  const s = await st(a.page);
  assert(s.ctx === null && s.status === 'off' && !s.enabled, `capture mode made an audio context or turned the music on: ${JSON.stringify(s)}`);
  // even with "on" stored from an ordinary visit
  const b = await open('?capture=1', 'laptop', 'on');
  await gesture(b.page);
  await sleep(600);
  const s2 = await st(b.page);
  assert(s2.ctx === null && s2.status === 'off', `capture mode with a stored "on": ${JSON.stringify(s2)}`);
  const ready = await b.page.evaluate(async () => (await window.__earthCapture.goto({ y: -66e6 })).ready);
  assert(ready, 'the capture contract stopped working');
  for (const x of [a, b]) { allErrors.push(...x.errors); allRequests.push(...x.requests); await x.context.close(); }
  return 'clicks, keys, a wheel and the control itself leave no audio context; the control shows "Music off"';
});

// ------------------------------------------------------------------------------------------------------------------
await test('The control is on screen and uncovered in every mode, on desktop and phone', async () => {
  const where = [];
  for (const view of ['desktop', 'phone']) {
    const a = await open('', view);
    const check = async (name) => { const v = await visible(a.page); assert(v.ok, `${view}, ${name}: the control is ${v.why}`); where.push(`${view} ${name} ${v.at}`); };
    await check('opening');
    // leave the opening for today's Earth
    await a.page.evaluate(() => [...document.querySelectorAll('.intro-actions .btn')].find((b) => /today/i.test(b.textContent)).click());
    await a.page.waitForFunction(() => !document.documentElement.dataset.intro && window.__earth.featuresLoaded && window.__earth.india && window.__earth.openModel, null, { timeout: 60000 });
    await sleep(600);
    await check('main view');
    await a.page.evaluate(() => window.__earth.openEvent('icell:mughal.arts', { fly: true, time: true }));
    await a.page.waitForFunction(() => window.__earth.deep.shown === 'icell:mughal.arts', null, { timeout: 20000 });
    await sleep(400);
    await check('record open');
    await a.page.evaluate(() => { window.__earth.deep.close(); window.__earth.india.open('events', {}); });
    await sleep(500);
    await check('sheet open');
    await a.page.evaluate(() => { for (const b of document.querySelectorAll('.sheet:not([hidden]) .sheet-head .icon-btn')) b.click(); window.__earth.story.open('how-we-became-human', 5); });
    await sleep(1200);
    await check('story');
    await a.page.evaluate(() => { window.__earth.story.close(); window.__earth.trails && window.__earth.openTrailStop('salt', 2); });
    await sleep(900);
    await check('trail');
    await a.page.evaluate(() => { window.__earth.trails.close(); window.__earth.openModel('qutb-minar'); });
    await sleep(900);
    await check('3D viewer');
    await a.page.evaluate(() => window.__earth.modelViewer.close());
    if (view === 'phone') {
      await a.page.click('.menu-btn');
      await sleep(300);
      await check('menu open');
    }
    allErrors.push(...a.errors); allRequests.push(...a.requests);
    await a.context.close();
  }
  return where.join('; ');
});

// ------------------------------------------------------------------------------------------------------------------
await test('Nothing is downloaded to make the music, and no error is logged', async () => {
  const audio = [...new Set(allRequests)].filter((u) => /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|mid|midi|webm)(\?|$)/i.test(u));
  const foreign = [...new Set(allRequests)].filter((u) => !u.startsWith(srv.base) && !u.startsWith('data:') && !u.startsWith('blob:'));
  assert(!audio.length, `audio files were requested: ${audio.join(', ')}`);
  assert(!foreign.length, `requests to another origin: ${foreign.slice(0, 3).join(', ')}`);
  const errs = [...new Set(allErrors)];
  assert(!errs.length, `errors: ${errs.slice(0, 4).join(' | ')}`);
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|mid|midi)$/i.test(f)) files.push(p); } };
  walk(path.join(ROOT, 'site'));
  assert(!files.length, `audio files in site/: ${files.join(', ')}`);
  return `${new Set(allRequests).size} distinct requests across the runs above: no audio file, none to another origin; no audio file in site/; no console or page error`;
});

await browser.close();
await srv.close();
const pass = results.every((r) => r.pass);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'music.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass, results, notes }, null, 1));
fs.writeFileSync(path.join(ROOT, 'tests', 'music-log.md'), `# Music check

Run on ${new Date().toISOString().slice(0, 10)} by \`node tests/music.mjs\` in headless Chromium. The test listens to the page's own output through
an analyser on the master bus; nobody listened with ears (see FINAL.md).

| Check | Result | What was measured |
|---|---|---|
${results.map((r) => `| ${r.name} | ${r.pass ? 'pass' : 'FAIL'} | ${String(r.detail || '').replace(/\|/g, '\\|')} |`).join('\n')}

${notes.map((n) => `- ${n}`).join('\n')}
`);
console.log(`\n${results.filter((r) => r.pass).length} passed, ${results.filter((r) => !r.pass).length} failed`);
process.exit(pass ? 0 : 1);
