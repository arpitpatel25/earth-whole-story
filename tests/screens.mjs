// Acceptance test 21: capture well over 100 varied views and lay them out as contact sheets for review.
// Usage: node tests/screens.mjs            (writes tests/screenshots/review/*.png and tests/screenshots/sheet-NN.jpg)
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, SHOTS, ensureDir, ROOT } from './lib/browser.mjs';
import { contactSheet } from './sheet.mjs';

const out = path.join(SHOTS, 'review');
fs.rmSync(out, { recursive: true, force: true });
ensureDir(out);
const srv = await startServer();
const browser = await launch();
const desk = await openPage(browser, srv.base, { query: '?capture=1', view: 'desktop' });
const phone = await openPage(browser, srv.base, { query: '?capture=1', view: 'phone' });
for (const p of [desk.page, phone.page]) { await p.waitForFunction(() => window.__earth && window.__earth.featuresLoaded && window.__earth.india && window.__earth.openModel && window.__earth.openCountry && window.__earth.wide, null, { timeout: 60000 }); await p.evaluate(() => window.__earthCapture.setClock(5000)); }
const files = [];
let n = 0;
const problems = [];
async function shot(page, name, prepare) {
  try {
    await page.evaluate(() => { const a = window.__earth; if (a.modelViewer) a.modelViewer.close(); for (const b of document.querySelectorAll('.sheet:not([hidden]) .sheet-head .icon-btn')) b.click(); if (document.documentElement.dataset.level === 'kid' ) document.querySelector('.level button[data-level="explorer"]').click(); });
    await prepare(page);
    await page.waitForTimeout(120);
    await page.evaluate(() => (document.querySelector('.mv:not([hidden])') ? window.__earth.modelViewer.renderOnce() : window.__earthCapture.renderFrame()));
    const file = path.join(out, `${String(++n).padStart(3, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    files.push(file);
    const errs = await page.evaluate(() => window.__earthCapture.status().errors);
    if (errs.length) problems.push(`${name}: ${errs[0]}`);
  } catch (e) { problems.push(`${name}: ${String(e.message).split('\n')[0]}`); }
}
const go = (v) => (page) => page.evaluate((view) => window.__earthCapture.goto(view), v);
const open = (id, v) => async (page) => { if (v) await page.evaluate((view) => window.__earthCapture.goto(view), v); await page.evaluate(async (rid) => { await window.__earth.openEvent(rid, { fly: true, time: true }); await window.__earthCapture.goto({}); }, id); await page.waitForFunction((rid) => window.__earth.deep.shown === rid, id, { timeout: 20000 }); await page.waitForTimeout(250); };
const D = desk.page, P = phone.page;

// A. the nine capture views
const nine = [['big-bang', { y: -13800000000 }], ['molten-earth', { y: -4500000000 }], ['pangaea', { y: -250000000 }], ['chicxulub', { y: -66000000 }], ['ice-age', { y: -20000 }], ['indus', { y: -2500, lat: 27.3, lon: 68.1, altKm: 500 }], ['black-death', { y: 1347, lat: 45, lon: 30, altKm: 6000 }], ['stalingrad', { y: 1942.8, lat: 48.7, lon: 44.5, altKm: 2500 }], ['today-india', { y: 2026, lat: 20, lon: 78, altKm: 12000 }]];
for (const [name, v] of nine) await shot(D, `capture-${name}`, go(v));
// B. moments across all of time
const moments = [['first-stars', { y: -13.4e9 }], ['galaxies', { y: -10e9 }], ['sun-forms', { y: -4.6e9 }], ['moon-impact', { y: -4.45e9, lat: 10, lon: 0, altKm: 30000 }], ['first-oceans', { y: -3.8e9, lat: 0, lon: 60, altKm: 22000 }], ['oxidation', { y: -2.4e9, lat: 20, lon: -40, altKm: 22000 }], ['snowball', { y: -700e6, lat: 10, lon: 30, altKm: 22000 }], ['cambrian', { y: -520e6, lat: -20, lon: 100, altKm: 20000 }], ['ordovician', { y: -450e6, lat: -30, lon: 20, altKm: 18000 }], ['devonian', { y: -380e6, lat: 0, lon: -20, altKm: 18000 }], ['coal-forests', { y: -310e6, lat: 0, lon: 0, altKm: 16000 }], ['great-dying', { y: -252e6, lat: 30, lon: 60, altKm: 18000 }], ['jurassic', { y: -150e6, lat: 30, lon: -20, altKm: 14000 }], ['cretaceous-life', { y: -75e6, lat: 45, lon: -85, altKm: 7000, lens: 'life' }], ['india-drifts', { y: -55e6, lat: -5, lon: 70, altKm: 12000 }], ['miocene', { y: -15e6, lat: 10, lon: 30, altKm: 16000 }], ['pliocene', { y: -3.2e6, lat: 8, lon: 38, altKm: 5000 }], ['early-homo', { y: -300000, lat: 0, lon: 30, altKm: 12000 }], ['toba', { y: -72000, lat: 10, lon: 95, altKm: 9000 }], ['beringia', { y: -18000, lat: 62, lon: -170, altKm: 7000 }], ['doggerland', { y: -9000, lat: 55, lon: 3, altKm: 3500 }], ['green-sahara', { y: -6000, lat: 20, lon: 10, altKm: 8000 }], ['sumer', { y: -3000, lat: 31, lon: 46, altKm: 2500 }], ['bronze-collapse', { y: -1180, lat: 35, lon: 30, altKm: 4500 }], ['axial', { y: -480, lat: 36, lon: 40, altKm: 7000 }], ['ashoka', { y: -250, lat: 23, lon: 80, altKm: 5500 }], ['rome-han', { y: 100, lat: 38, lon: 60, altKm: 14000 }], ['gupta', { y: 400, lat: 25, lon: 82, altKm: 4500 }], ['caliphate', { y: 800, lat: 30, lon: 40, altKm: 9000 }], ['song-china', { y: 1100, lat: 32, lon: 112, altKm: 5500 }], ['mongols', { y: 1260, lat: 45, lon: 85, altKm: 12000 }], ['mali-and-zimbabwe', { y: 1330, lat: 5, lon: 15, altKm: 11000 }], ['aztec-inca', { y: 1500, lat: 5, lon: -85, altKm: 11000 }], ['mughal', { y: 1650, lat: 25, lon: 78, altKm: 5500 }], ['revolutions', { y: 1790, lat: 45, lon: -30, altKm: 13000 }], ['scramble', { y: 1890, lat: 2, lon: 20, altKm: 11000 }], ['1914', { y: 1914.6, lat: 50, lon: 15, altKm: 5500 }], ['partition', { y: 1947.63, lat: 28, lon: 77, altKm: 4500 }], ['apollo', { y: 1969.55, lat: 28.5, lon: -80.6, altKm: 5000 }], ['berlin-1989', { y: 1989.86, lat: 52.5, lon: 13.4, altKm: 2500 }], ['today-pacific', { y: 2026, lat: 0, lon: -150, altKm: 22000 }], ['today-night-europe', { y: 2026, lat: 48, lon: 10, altKm: 3500 }], ['today-city', { y: 2026, lat: 19.07, lon: 72.87, altKm: 320 }], ['antarctica', { y: 1911.9, lat: -85, lon: 0, altKm: 6000 }], ['open-ocean', { y: 1500, lat: -40, lon: -120, altKm: 6000 }]];
for (const [name, v] of moments) await shot(D, `moment-${name}`, go({ lens: 'all', ...v }));
// C. lenses
for (const lens of ['power', 'war', 'trade', 'work', 'food', 'daily', 'science', 'medicine', 'technology', 'religion', 'arts', 'language', 'nature', 'movement', 'women']) await shot(D, `lens-${lens}`, go({ y: 1930.5, lat: 22, lon: 79, altKm: 5200, lens }));
for (const lens of ['geology', 'climate', 'life', 'extinctions', 'oceans', 'cosmos']) await shot(D, `deep-lens-${lens}`, go({ y: -100e6, lat: -20, lon: 60, altKm: 14000, lens }));
// D. stories
const stories = await D.evaluate(() => window.__earth.stories.map((s) => [s.id, s.scenes, s.flagship]));
for (const [id, scenes, flag] of stories) for (const step of flag ? [0, 7, 16, 25, 33, scenes - 1] : [Math.floor(scenes * 0.4)]) await shot(D, `story-${id}-${step}`, go({ story: id, step }));
// E. trails
const trails = await D.evaluate(() => window.__earth.trailList.map((t) => [t.id, t.stops.length]));
await D.evaluate(() => window.__earthCapture.goto({ y: 1500, lat: 20, lon: 20, altKm: 9000 })); // leaves the last story
for (const [id, stops] of trails) await shot(D, `trail-${id}`, go({ trail: id, stop: Math.floor(stops / 2) }));
await D.evaluate(() => window.__earth.trails.close());
// F. deep views of every kind
const ids = await D.evaluate(async () => { const a = window.__earth; await a.loadFossils(); return { ev: (a.india.events.find((e) => /Salt|Dandi/.test(e.t) && e.y > 1929) || a.india.events[640]).id, person: (a.india.people.find((p) => /Ambedkar/.test(p.n)) || a.india.people[120]).id, fossil: (a.fossils.list.find((f) => f.title === 'Triceratops') || a.fossils.list.find((f) => f.row[2] === 'dinosaur')).id }; });
await shot(D, 'deep-automatic', open('Q203233', { y: 1757.4, lat: 23.8, lon: 88.2, altKm: 2500 }));
await shot(D, 'deep-india-event', open(ids.ev));
await shot(D, 'deep-person', open(ids.person));
await shot(D, 'deep-india-cell', open('icell:chola.trade'));
await shot(D, 'deep-india-era', open('iera:indus'));
await shot(D, 'deep-state', open('istate:IN-RJ'));
await shot(D, 'deep-country', open('country:PER'));
await shot(D, 'deep-country-thin', open('country:TUV'));
await shot(D, 'deep-wide-event', open('wide:atlantic-slave-trade'));
await shot(D, 'deep-fossil', open(ids.fossil));
await shot(D, 'deep-era', open('era:this-website', { y: 2026.8, lat: 30, lon: 0, altKm: 20000 }));
await shot(D, 'deep-model-card', open('model:great-bath'));
await D.evaluate(() => window.__earth.deep.close());
// G. Kid mode
const kid = (prepare) => async (page) => { await prepare(page); await page.evaluate(() => { const b = [...document.querySelectorAll('.level button[data-level="kid"]')].find((x) => x.offsetParent); b.click(); }); await page.waitForTimeout(300); };
await shot(D, 'kid-here', kid(go({ y: -250, lat: 25.6, lon: 85.1, altKm: 3000, lens: 'all' })));
await shot(D, 'kid-story', kid(go({ story: 'how-we-became-human', step: 9 })));
await shot(D, 'kid-deep', kid(async (page) => { await page.evaluate(() => { if (window.__earth.story.story) window.__earth.story.close(); }); await open('icell:mughal.food', { y: 1600, lat: 27, lon: 78, altKm: 4000 })(page); }));
await shot(D, 'kid-matrix', kid(async (page) => { await page.evaluate(() => window.__earthCapture.goto({ y: 1100, lat: 11, lon: 79, altKm: 6000 })); await page.evaluate(() => window.__earth.india.open('matrix', { cell: 'chola.arts' })); await page.waitForSelector('.imx-reader .imx-text'); }));
await D.evaluate(() => { window.__earth.deep.close(); if (window.__earth.story.story) window.__earth.story.close(); });
// H. sheets and the 3D viewer
const tool = (id, after) => async (page) => { await page.evaluate(() => window.__earthCapture.goto({ y: 1600, lat: 30, lon: 60, altKm: 14000, lens: 'all' })); await page.click(`.tool-btn[data-tool="${id}"]`); await page.waitForTimeout(700); if (after) await after(page); };
await shot(D, 'sheet-stories', tool('stories'));
await shot(D, 'sheet-right-here', tool('right-here', async (page) => { await page.evaluate(() => window.__earth.rightHere(30.04, 31.24, 'Cairo')); await page.waitForFunction(() => /Who held this ground/.test(document.querySelector('.sheet:not([hidden]) .sheet-body').textContent), null, { timeout: 20000 }); }));
await shot(D, 'sheet-discover', tool('discover', (page) => page.waitForFunction(() => document.querySelectorAll('.sheet:not([hidden]) .ev').length > 0, null, { timeout: 20000 })));
await shot(D, 'sheet-trails', tool('trails'));
await shot(D, 'sheet-share', tool('share', (page) => page.waitForTimeout(900)));
await shot(D, 'sheet-sources', tool('about'));
await shot(D, 'sheet-3d', tool('models'));
for (const tab of ['matrix', 'events', 'people', 'states']) await shot(D, `sheet-india-${tab}`, async (page) => { await page.evaluate(() => window.__earthCapture.goto({ y: 1600, lat: 22, lon: 79, altKm: 9000 })); await page.evaluate((t) => window.__earth.india.open(t, t === 'matrix' ? { cell: 'mughal.arts' } : {}), tab); await page.waitForTimeout(900); });
await shot(D, 'search-results', async (page) => { await page.evaluate(() => window.__earthCapture.goto({ y: 1600, lat: 30, lon: 60, altKm: 14000 })); await page.fill('.search-input', 'Ashoka'); await page.waitForSelector('.search-results li'); await page.waitForTimeout(500); });
await D.fill('.search-input', '');
await D.keyboard.press('Escape');
await shot(D, 'lens-menu', async (page) => { await page.evaluate(() => window.__earthCapture.goto({ y: 1600, lat: 30, lon: 60, altKm: 14000 })); await page.click('.lens-btn'); await page.waitForTimeout(300); });
await D.keyboard.press('Escape');
await shot(D, 'date-entry', async (page) => { await page.click('.clock'); await page.fill('#date-input', 'June 1944'); await page.waitForTimeout(200); });
await D.keyboard.press('Escape');
const models = await D.evaluate(() => window.__earth.modelList.map((m) => m.id));
for (const id of models) await shot(D, `3d-${id}`, async (page) => { await page.evaluate((mid) => { const a = window.__earth; a.openModel(mid); a.modelViewer.select(a.models[mid].parts[0].id); a.modelViewer.renderOnce(); }, id); await page.waitForTimeout(250); });
await D.evaluate(() => window.__earth.modelViewer.close());
await shot(D, 'solar-system-offer', go({ y: 2026, lat: 10, lon: 40, altKm: 60000 }));
// I. phone
await shot(P, 'phone-today', go({ y: 2026, lat: 20, lon: 78, altKm: 12000, lens: 'all' }));
await shot(P, 'phone-deep-time', go({ y: -150e6, lat: 20, lon: -20, altKm: 16000 }));
await shot(P, 'phone-ice-age', go({ y: -20000, lat: 50, lon: 10, altKm: 12000 }));
await shot(P, 'phone-1857', go({ y: 1857.5, lat: 26.5, lon: 80.3, altKm: 2500 }));
await shot(P, 'phone-deep-view', open('icell:raj.food', { y: 1900, lat: 22, lon: 79, altKm: 6000 }));
await P.evaluate(() => window.__earth.deep.close());
await shot(P, 'phone-story', go({ story: 'world-war-two', step: 27 }));
await shot(P, 'phone-story-human', go({ story: 'how-we-became-human', step: 5 }));
await P.evaluate(() => window.__earthCapture.goto({ y: 1500, lat: 20, lon: 20, altKm: 9000 }));
await shot(P, 'phone-trail', go({ trail: 'salt', stop: 4 }));
await P.evaluate(() => { window.__earth.trails.close(); });
await shot(P, 'phone-menu', async (page) => { await page.evaluate(() => window.__earthCapture.goto({ y: 1600, lat: 30, lon: 60, altKm: 14000 })); await page.tap('.menu-btn'); await page.waitForTimeout(300); });
await P.evaluate(() => { delete document.documentElement.dataset.tools; });
await shot(P, 'phone-india-matrix', async (page) => { await page.evaluate(() => window.__earth.india.open('matrix', { cell: 'gupta.science' })); await page.waitForSelector('.imx-acc details[open] .imx-text'); });
await shot(P, 'phone-india-events', async (page) => { await page.evaluate(() => window.__earth.india.open('events', { era: 'chola', lens: '', region: '', q: '' })); await page.waitForTimeout(600); });
await shot(P, 'phone-3d', async (page) => { await page.evaluate(() => { const a = window.__earth; a.openModel('qutb-minar'); a.modelViewer.select('balconies'); a.modelViewer.renderOnce(); }); await page.waitForTimeout(250); });
await P.evaluate(() => window.__earth.modelViewer.close());
await shot(P, 'phone-kid', kid(go({ y: -2500, lat: 27.3, lon: 68.1, altKm: 900 })));
await shot(P, 'phone-country', open('country:KEN', { y: 2000, lat: 0, lon: 38, altKm: 5000 }));
// J. the opening, as a first-time visitor sees it
const first = await openPage(browser, srv.base, { query: '', view: 'desktop' });
await first.page.waitForFunction(() => window.__earth && window.__earth.engine.frames > 3, null, { timeout: 30000 });
await first.page.waitForTimeout(1800);
const snap = async (name) => { const file = path.join(out, `${String(++n).padStart(3, '0')}-${name}.png`); await first.page.screenshot({ path: file }); files.push(file); };
await snap('intro-first-frame');
for (const [name, dy] of [['intro-first-stars', 1400], ['intro-sun-and-planets', 2600], ['intro-molten-earth', 1800], ['intro-oceans', 1500]]) { await first.page.mouse.move(700, 450); for (let i = 0; i < 8; i++) { await first.page.mouse.wheel(0, dy / 8); await first.page.waitForTimeout(140); } await first.page.waitForTimeout(900); await snap(name); }

const errors = [...new Set([...desk.errors, ...phone.errors, ...first.errors])];
await browser.close();
await srv.close();
// contact sheets
for (const f of fs.readdirSync(SHOTS)) if (/^sheet-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(SHOTS, f));
const wide = files.filter((f) => !/-phone-/.test(f));
const tall = files.filter((f) => /-phone-/.test(f));
let s = 0;
for (let i = 0; i < wide.length; i += 12) await contactSheet(wide.slice(i, i + 12), path.join(SHOTS, `sheet-${String(++s).padStart(2, '0')}.jpg`), { cols: 4, w: 480 });
for (let i = 0; i < tall.length; i += 14) await contactSheet(tall.slice(i, i + 14), path.join(SHOTS, `sheet-${String(++s).padStart(2, '0')}.jpg`), { cols: 7, w: 274 });
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'screens.json'), JSON.stringify({ ranAt: new Date().toISOString(), views: files.length, sheets: s, problems, errors, pass: files.length >= 100 && !problems.length && !errors.length }, null, 2));
console.log(`${files.length} views captured, ${s} contact sheets in tests/screenshots/`);
if (problems.length) console.log(`problems:\n  ${problems.join('\n  ')}`);
if (errors.length) console.log(`console errors:\n  ${errors.slice(0, 10).join('\n  ')}`);
process.exit(files.length >= 100 && !problems.length && !errors.length ? 0 : 1);
