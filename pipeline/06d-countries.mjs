// Step 6d: a baseline for every country and territory.
// For each of the 258 entries in Natural Earth's 1:10m admin-0 table this writes site/data/countries/<ID>.json:
//   the dated, located events inside today's borders (a spread across time, most widely written-about first),
//   which polity the historical border maps draw over its label point, snapshot by snapshot,
//   and its population through time (Our World in Data, from HYDE, Gapminder and the UN).
// Where fewer than 30 events exist the file says so (thin: true) and the interface states it plainly.
import fs from 'node:fs';
import path from 'node:path';
import * as shapefile from 'shapefile';
import { RAW, DATA, readJSON, writeJSON, ensureDir, exists, round, download } from './lib/util.mjs';
import { partsToYear } from '../src/core/time.js';

const OUT = path.join(DATA, 'countries');
ensureDir(OUT);

// ---- geometry: the detailed (1:10m) outlines, so that microstates and islands are matched properly -----------------
const neDir = path.join(RAW, 'ne', 'ne_10m_admin_0_countries');
const shp = fs.readdirSync(neDir).find((f) => f.endsWith('.shp'));
const fc = await shapefile.read(path.join(neDir, shp), path.join(neDir, shp.replace(/\.shp$/, '.dbf')), { encoding: 'utf-8' });
const clean = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : v);
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const bboxOf = (polys) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
const inRing = (x, y, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const inPolys = (x, y, polys) => { for (const poly of polys) { if (!inRing(x, y, poly[0])) continue; let hole = false; for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) hole = true; if (!hole) return true; } return false; };
const lands = fc.features.map((f) => { const polys = polysOf(f.geometry); return { id: clean(f.properties.ADM0_A3), polys, bbox: bboxOf(polys), area: (bboxOf(polys)[2] - bboxOf(polys)[0]) * (bboxOf(polys)[3] - bboxOf(polys)[1]) }; });
lands.sort((a, b) => a.area - b.area); // the smallest outline that contains a point wins (enclaves, microstates)
const countryAt = (lon, lat) => { for (const c of lands) { const b = c.bbox; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue; if (inPolys(lon, lat, c.polys)) return c.id; } return null; };

// ---- events ---------------------------------------------------------------------------------------------------------
const all = readJSON(path.join(RAW, 'events', '_all.json'));
const index = readJSON(path.join(DATA, 'geo', 'country-index.json'));
const by = new Map(index.map((c) => [c.id, []]));
let moved = 0;
for (const e of all) {
  const exact = countryAt(e.lon, e.lat);
  const id = exact || e.country;
  if (exact && exact !== e.country) moved++;
  if (id && by.has(id)) by.get(id).push(e);
}
const PREC = { exact: 'e', month: 'm', year: 'y', decade: 'd', century: 'c', approx: 'a' };
const pick = (list) => {
  // a spread across time: the most widely written-about events of each century (each millennium before 3000 BCE)
  const groups = new Map();
  for (const e of list) { const k = e.y < -3000 ? `m${Math.floor(e.y / 1000)}` : `c${Math.floor(e.y / 100)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  let out = [];
  const per = Math.max(6, Math.ceil(420 / Math.max(1, groups.size)));
  for (const g of groups.values()) out.push(...g.sort((a, b) => b.imp - a.imp || (b.sl || 0) - (a.sl || 0)).slice(0, per));
  if (out.length > 420) out = out.sort((a, b) => b.imp - a.imp || (b.sl || 0) - (a.sl || 0)).slice(0, 420);
  return out.sort((a, b) => a.y - b.y);
};

// ---- polities on the historical border maps -----------------------------------------------------------------------
const hbDir = path.join(RAW, 'borders', 'hb', 'historical-basemaps-master', 'geojson');
const snaps = fs.readdirSync(hbDir).filter((f) => /^world_(bc)?\d+\.geojson$/.test(f)).map((f) => { const m = /^world_(bc)?(\d+)/.exec(f); return { year: m[1] ? -Number(m[2]) : Number(m[2]), file: f }; }).sort((a, b) => a.year - b.year);
const polities = new Map(index.map((c) => [c.id, []]));
for (const s of snaps) {
  const gj = JSON.parse(fs.readFileSync(path.join(hbDir, s.file), 'utf8'));
  const feats = gj.features.filter((f) => f.geometry && f.properties && f.properties.NAME).map((f) => { const polys = polysOf(f.geometry); return { name: String(f.properties.NAME).trim(), polys, bbox: bboxOf(polys) }; });
  for (const c of index) {
    const [lon, lat] = c.label;
    let name = null;
    for (const f of feats) { const b = f.bbox; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue; if (inPolys(lon, lat, f.polys)) { name = f.name; break; } }
    const list = polities.get(c.id);
    if (name && (!list.length || list[list.length - 1][1] !== name)) list.push([s.year, name]);
  }
}

// ---- population through time ----------------------------------------------------------------------------------------
const popFile = path.join(RAW, 'population', 'owid-population.csv');
if (!exists(popFile)) await download('https://ourworldindata.org/grapher/population.csv?v=1&csvType=full&useColumnShortNames=true', popFile);
const pop = new Map();
const KEEP = new Set([-10000, -8000, -6000, -5000, -4000, -3000, -2000, -1000, 0, 200, 400, 600, 800, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1750, 1800, 1820, 1840, 1860, 1880, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2023]);
for (const line of fs.readFileSync(popFile, 'utf8').split(/\r?\n/).slice(1)) {
  const m = /^(.*),([A-Z_]{3,}),(-?\d+),(\d+(?:\.\d+)?)$/.exec(line);
  if (!m || m[2].length !== 3) continue;
  const year = Number(m[3]);
  if (!KEEP.has(year)) continue;
  if (!pop.has(m[2])) pop.set(m[2], []);
  pop.get(m[2]).push([year, Math.round(Number(m[4]))]);
}
// Natural Earth uses a few codes of its own
const ALIAS = { SDS: 'SSD', PSX: 'PSE', KOS: 'OWID_KOS', SAH: 'ESH' };

// ---- write ----------------------------------------------------------------------------------------------------------
const counts = {};
const located = {};
const thin = [];
// national events (step 6e): dated, tied to the country, with no single point on the map
const nationalOf = (c, have) => {
  const file = path.join(RAW, 'national', `${c.id}.json`);
  if (!exists(file)) return [];
  return readJSON(file).filter((r) => !have.has(r.id)).sort((a, b) => b.sl - a.sl).slice(0, 200).sort((a, b) => a.year - b.year)
    .map((r) => [r.id, r.title, round(r.day ? partsToYear(r.year, r.month - 1, r.day) : r.month ? partsToYear(r.year, r.month - 1, 15) : r.year + 0.5, 5), r.cls, r.day ? 'e' : r.month ? 'm' : 'y', r.wp, r.desc]);
};
for (const c of index) {
  const list = by.get(c.id);
  const n = list.length;
  const national = n < 30 ? nationalOf(c, new Set(list.map((e) => e.id))) : [];
  const total = n + national.length;
  counts[c.id] = total;
  located[c.id] = n;
  if (total < 30) thin.push(c.id);
  const ys = [...list.map((e) => e.y), ...national.map((r) => r[2])];
  writeJSON(path.join(OUT, `${c.id}.json`), {
    id: c.id, n, total, thin: total < 30,
    first: total ? round(Math.min(...ys), 2) : null, last: total ? round(Math.max(...ys), 2) : null,
    rows: pick(list).map((e) => [e.id, e.title, round(e.y, 5), e.type, e.imp, round(e.lat, 3), round(e.lon, 3), PREC[e.precision] || 'y']),
    national,
    polities: polities.get(c.id),
    pop: pop.get(ALIAS[c.id] || c.id) || null,
  });
}
writeJSON(path.join(OUT, 'index.json'), {
  note: 'counts = dated events for each present-day country: those located inside its border (Natural Earth 1:10m), plus, where that is under 30, national events from Wikidata that have a date but no single point. Fewer than 30 in all is marked thin.',
  counts, located, thin,
  sources: {
    events: 'Wikidata (CC0) and NOAA NCEI (public domain), as in the event layer',
    national: 'Wikidata (CC0): elections, referendums, coups, wars, treaties, epidemics and disasters recorded for the country',
    polities: 'historical-basemaps (GPL-3.0): the polity drawn over the label point in each world snapshot; approximate',
    population: 'Our World in Data, Population (historical estimates), CC BY 4.0; underlying data HYDE 3.3, Gapminder and UN World Population Prospects',
  },
});
const un = index.filter((c) => c.un);
console.log(`countries: ${index.length} entries (${un.length} UN-coded); ${thin.length} thin (<30 events in all), of which ${un.filter((c) => counts[c.id] < 30).length} UN-coded; ${moved} events re-assigned by the detailed outlines; population for ${index.filter((c) => pop.get(ALIAS[c.id] || c.id)).length}`);
console.log(`thin: ${thin.map((id) => `${id}:${counts[id]}`).join(' ')}`);
