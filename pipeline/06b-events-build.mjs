// Step 06b: clean, deduplicate, rank and tile the global event layer.
// Input: data-raw/events/*.json (Wikidata harvest), data-raw/noaa/*.json (NCEI hazards, optional),
//        data-raw/events/extracts.json (Wikipedia lead sentences, optional; added by step 07)
// Output under site/data/events/: index.json, b<bucket>/top.json, b<bucket>/c<x>_<y>.json,
//        detail/<hh>.json, parts/<hh>.json, days/<mm>.json, density.json, surprise.json
//        and site/data/search/ev-<n>.json
import { partsToYear } from '../src/core/time.js';
import fs from 'node:fs';
import path from 'node:path';
import { RAW, DATA, dataPath, writeJSON, readJSON, exists, round, ensureDir } from './lib/util.mjs';
import { CLASSES, LENSES } from './events-classes.mjs';

const NOW = 2026.86;
const HARVEST = path.join(RAW, 'events');
const TARGET_PER_BUCKET = 1800;
const TOP_PER_BUCKET = 260;
const CELL = 30;

// ---------- time -------------------------------------------------------------------------------------
/** Wikidata RDF time (XSD 1.1: year 0000 is 1 BCE) -> signed decimal year where -N means N BCE. */
function parseTime(iso, prec) {
  const m = /^([+-]?\d+)-(\d\d)-(\d\d)T/.exec(iso);
  if (!m) return null;
  let year = Number(m[1]);
  if (year <= 0) year -= 1; // astronomical -> BCE count
  const month = Number(m[2]) || 1;
  const day = Number(m[3]) || 1;
  const p = Number(prec);
  let y;
  let precision;
  if (p >= 11) {
    // the same calendar arithmetic the site uses to print dates, so a day never shifts on the way
    y = partsToYear(year, month - 1, day);
    precision = 'exact';
  } else if (p === 10) {
    y = partsToYear(year, month - 1, 15);
    precision = 'month';
  } else if (p === 9) {
    y = year + 0.5;
    precision = 'year';
  } else if (p === 8) {
    y = year + 5;
    precision = 'decade';
  } else if (p === 7) {
    // Wikidata stores a century as a year inside it (often the last); place the event mid-century.
    const c = year > 0 ? Math.ceil(year / 100) : -Math.ceil(-year / 100);
    y = year > 0 ? (c - 1) * 100 + 50 : c * 100 + 50;
    precision = 'century';
  } else {
    y = year;
    precision = 'approx';
  }
  if (year < 0 && p >= 9) y = p >= 10 ? partsToYear(year, month - 1, 15) : year + 0.5;
  return { y: round(y, p >= 11 ? 5 : 2), precision, month, day, exact: p >= 11 };
}

function parsePoint(wkt) {
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt || '');
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lon === 0 && lat === 0) return null;
  return { lon: round(lon, 3), lat: round(lat, 3) };
}

// ---------- load harvest -------------------------------------------------------------------------------
const typeIndex = new Map();
const types = [];
for (const c of CLASSES) {
  if (typeIndex.has(c.key)) continue;
  typeIndex.set(c.key, types.length);
  types.push({ key: c.key, label: c.label, verb: c.verb || null, lenses: c.lenses });
}
const lensBit = Object.fromEntries(LENSES.map((l, i) => [l, 1 << i]));

const events = new Map();
let rowsRead = 0;
for (const c of CLASSES) {
  for (const kind of ['direct', 'location', 'admin', 'capital', 'launch', 'place']) {
    const file = path.join(HARVEST, `${c.key}.${c.q}.${c.date}.${kind}.json`);
    if (!fs.existsSync(file)) continue;
    for (const r of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      rowsRead++;
      const id = r.item.slice(r.item.lastIndexOf('/') + 1);
      const t = parseTime(r.date, r.prec);
      const pt = parsePoint(r.coord);
      if (!t || !pt || !r.title) continue;
      if (t.y > NOW || t.y < -13.8e9) continue;
      if (/^(List of|Lists of|Timeline of|Outline of)\b/.test(r.title)) continue;
      let e = events.get(id);
      const mask = c.lenses.reduce((m, l) => m | lensBit[l], 0);
      if (!e) {
        e = {
          id,
          title: r.title,
          desc: r.desc || '',
          y: t.y,
          precision: t.precision,
          month: t.exact ? t.month : 0,
          day: t.exact ? t.day : 0,
          lon: pt.lon,
          lat: pt.lat,
          type: typeIndex.get(c.key),
          mask,
          sl: Number(r.sl) || 0,
          partOf: r.partOf ? r.partOf.slice(r.partOf.lastIndexOf('/') + 1) : null,
          deaths: r.deaths ? Number(r.deaths) : null,
          loc: kind === 'direct' ? null : r.locName || null,
          approxPlace: kind !== 'direct',
          end: null,
        };
        events.set(id, e);
      } else {
        e.mask |= mask;
        // Prefer the earliest well-formed date and the item's own coordinates.
        if (t.y < e.y && t.precision !== 'approx') {
          e.y = t.y;
          e.precision = t.precision;
          e.month = t.exact ? t.month : 0;
          e.day = t.exact ? t.day : 0;
        }
        if (kind === 'direct' && e.approxPlace) {
          e.lon = pt.lon;
          e.lat = pt.lat;
          e.approxPlace = false;
          e.loc = null;
        }
      }
      if (r.end && !e.end) {
        const te = parseTime(r.end, 11);
        if (te && te.y > e.y && te.y <= NOW) e.end = round(te.y, 3);
      }
    }
  }
}
console.log(`harvest: ${rowsRead} rows -> ${events.size} distinct items`);

// ---------- NOAA NCEI significant hazards (optional merge) ------------------------------------------------
const noaaDir = path.join(RAW, 'noaa');
let noaaAdded = 0;
let noaaMerged = 0;
if (fs.existsSync(path.join(noaaDir, 'events.json'))) {
  const list = readJSON(path.join(noaaDir, 'events.json'));
  // index Wikidata quakes/eruptions/tsunamis by year for matching
  const byYear = new Map();
  for (const e of events.values()) {
    const k = types[e.type].key;
    if (k !== 'earthquake' && k !== 'eruption' && k !== 'tsunami') continue;
    const yr = Math.floor(e.y);
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr).push(e);
  }
  for (const n of list) {
    const cands = byYear.get(Math.floor(n.y)) || [];
    const match = cands.find((e) => types[e.type].key === n.kind && Math.abs(e.y - n.y) < 0.02 && Math.hypot(e.lat - n.lat, (e.lon - n.lon) * Math.cos((n.lat * Math.PI) / 180)) < 3);
    if (match) {
      match.noaa = n.ref;
      if (n.mag && !match.mag) match.mag = n.mag;
      if (n.deaths && !match.deaths) match.deaths = n.deaths;
      noaaMerged++;
      continue;
    }
    events.set(n.id, {
      id: n.id, title: n.title, desc: n.desc, y: n.y, precision: n.precision, month: n.month || 0, day: n.day || 0,
      lon: n.lon, lat: n.lat, type: typeIndex.get(n.kind), mask: lensBit.nature, sl: n.rank, partOf: null,
      deaths: n.deaths || null, loc: null, approxPlace: false, end: null, noaa: n.ref, mag: n.mag || null, src: 'noaa',
    });
    noaaAdded++;
  }
  console.log(`noaa: ${noaaAdded} added, ${noaaMerged} merged into Wikidata records`);
}

// ---------- country by point-in-polygon (Natural Earth) ---------------------------------------------------
const countries = readJSON(dataPath('geo', 'countries.json')).features;
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function countryAt(lon, lat) {
  for (const c of countries) {
    const b = c.bbox;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    for (const poly of c.polys) {
      if (!inRing(lon, lat, poly[0])) continue;
      let hole = false;
      for (let k = 1; k < poly.length; k++) if (inRing(lon, lat, poly[k])) hole = true;
      if (!hole) return c.id;
    }
  }
  return null;
}
// Coastal and island events often fall just outside simplified polygons: fall back to the nearest label point.
function nearestCountry(lon, lat, maxDeg = 2.5) {
  let best = null;
  let bestD = maxDeg;
  for (const c of countries) {
    const b = c.bbox;
    if (lon < b[0] - maxDeg || lon > b[2] + maxDeg || lat < b[1] - maxDeg || lat > b[3] + maxDeg) continue;
    for (const poly of c.polys) {
      const ring = poly[0];
      for (let i = 0; i < ring.length; i += 2) {
        const d = Math.hypot(ring[i][0] - lon, ring[i][1] - lat);
        if (d < bestD) {
          bestD = d;
          best = c.id;
        }
      }
    }
  }
  return best;
}

const all = [...events.values()];
for (const e of all) {
  e.country = countryAt(e.lon, e.lat) || nearestCountry(e.lon, e.lat);
  // importance from how widely the subject is written about
  const s = e.sl;
  e.imp = e.src === 'noaa' ? e.sl : s >= 50 ? 5 : s >= 25 ? 4 : s >= 12 ? 3 : s >= 5 ? 2 : 1;
}
all.sort((a, b) => a.y - b.y || b.sl - a.sl);

// Wikipedia lead sentences are written by step 07 into site/data/wikipedia (kept apart: CC BY-SA).
const extractFile = path.join(HARVEST, 'extracts.json');
const extracts = exists(extractFile) ? readJSON(extractFile) : {};

// ---------- buckets ---------------------------------------------------------------------------------------
const buckets = [];
for (let i = 0; i < all.length; ) {
  let j = Math.min(all.length, i + TARGET_PER_BUCKET);
  // never split a single year across two buckets
  while (j < all.length && Math.floor(all[j].y) === Math.floor(all[j - 1].y)) j++;
  buckets.push(all.slice(i, j));
  i = j;
}
const row = (e) => {
  const r = [e.id, e.title, e.y, e.lat, e.lon, e.type, e.imp, e.mask, e.end || 0, e.precision[0]];
  return r;
};
const outDir = path.join(DATA, 'events');
fs.rmSync(outDir, { recursive: true, force: true });
ensureDir(outDir);
const bucketIndex = [];
buckets.forEach((list, bi) => {
  const ranked = [...list].sort((a, b) => b.imp - a.imp || b.sl - a.sl);
  const top = ranked.slice(0, TOP_PER_BUCKET);
  const topSet = new Set(top.map((e) => e.id));
  const cells = new Map();
  for (const e of list) {
    if (topSet.has(e.id)) continue;
    const cx = Math.min(11, Math.floor((e.lon + 180) / CELL));
    const cy = Math.min(5, Math.floor((e.lat + 90) / CELL));
    const key = `${cx}_${cy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(e);
  }
  writeJSON(path.join(outDir, `b${bi}`, 'top.json'), top.sort((a, b) => a.y - b.y).map(row));
  const cellCounts = {};
  for (const [key, evs] of cells) {
    writeJSON(path.join(outDir, `b${bi}`, `c${key}.json`), evs.map(row));
    cellCounts[key] = evs.length;
  }
  bucketIndex.push({ id: bi, y0: list[0].y, y1: list[list.length - 1].y, n: list.length, top: top.length, cells: cellCounts });
});

// ---------- details, parts ---------------------------------------------------------------------------------
const hashId = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 256;
};
const detail = Array.from({ length: 256 }, () => ({}));
const byPart = new Map();
for (const e of all) {
  const d = { d: e.desc || undefined, wp: e.src === 'noaa' ? undefined : e.title, sl: e.src === 'noaa' ? undefined : e.sl, c: e.country || undefined };
  if (e.partOf) d.p = e.partOf;
  if (e.deaths) d.k = e.deaths;
  if (e.mag) d.m = e.mag;
  if (e.loc) d.l = e.loc;
  if (e.noaa) d.n = e.noaa;
  detail[hashId(e.id)][e.id] = d;
  if (e.partOf) {
    if (!byPart.has(e.partOf)) byPart.set(e.partOf, []);
    byPart.get(e.partOf).push(e);
  }
}
detail.forEach((d, i) => writeJSON(path.join(outDir, 'detail', `${i.toString(16).padStart(2, '0')}.json`), d));
// Groups: events that Wikidata says are part of the same larger event (a war's battles, for instance).
const parts = Array.from({ length: 256 }, () => ({}));
let groups = 0;
for (const [pid, list] of byPart) {
  if (list.length < 2) continue;
  groups++;
  const parent = events.get(pid);
  parts[hashId(pid)][pid] = { t: parent ? parent.title : null, e: list.sort((a, b) => a.y - b.y).slice(0, 400).map((e) => [e.id, e.title, e.y, e.lat, e.lon, e.imp]) };
}
parts.forEach((d, i) => writeJSON(path.join(outDir, 'parts', `${i.toString(16).padStart(2, '0')}.json`), d));

// ---------- this day in history ------------------------------------------------------------------------------
for (let m = 1; m <= 12; m++) {
  const days = {};
  for (const e of all) {
    if (e.month !== m || !e.day || e.y < 1) continue;
    (days[e.day] = days[e.day] || []).push(e);
  }
  for (const d of Object.keys(days)) days[d] = days[d].sort((a, b) => b.sl - a.sl).slice(0, 24).map(row);
  writeJSON(path.join(outDir, 'days', `${String(m).padStart(2, '0')}.json`), days);
}

// ---------- density along the timeline scale ---------------------------------------------------------------
// (same scale as src/core/time.js; duplicated here in compact form so the pipeline has no browser imports)
const BIG_BANG = -13.8e9;
const SCALE = [[BIG_BANG, 0, 'age'], [BIG_BANG + 1, 0.008, 'age'], [BIG_BANG + 380000, 0.018, 'age'], [BIG_BANG + 1e8, 0.03, 'age'], [BIG_BANG + 1e9, 0.045, 'age'], [-4.6e9, 0.07, 'ago'], [-4.0e9, 0.085, 'ago'], [-2.5e9, 0.105, 'ago'], [-1.0e9, 0.125, 'ago'], [-539e6, 0.15, 'ago'], [-252e6, 0.185, 'ago'], [-66e6, 0.22, 'ago'], [-2.58e6, 0.27, 'ago'], [-300000, 0.32, 'ago'], [-10000, 0.385, 'lin'], [-3000, 0.45, 'lin'], [-500, 0.53, 'lin'], [500, 0.6, 'lin'], [1500, 0.7, 'lin'], [1800, 0.79, 'lin'], [1900, 0.86, 'lin'], [1950, 0.92, 'lin'], [2000, 0.965, 'lin'], [NOW, 1, 'lin']];
function yearToU(y) {
  for (let i = SCALE.length - 2; i >= 0; i--) {
    if (y >= SCALE[i][0]) {
      const [y0, u0, kind] = SCALE[i];
      const [y1, u1] = SCALE[i + 1];
      let t;
      if (kind === 'lin') t = (y - y0) / (y1 - y0);
      else if (kind === 'ago') t = (Math.log10(NOW - y) - Math.log10(NOW - y0)) / (Math.log10(NOW - y1) - Math.log10(NOW - y0));
      else t = (Math.log10(Math.max(1e-9, y - BIG_BANG)) - Math.log10(Math.max(1e-9, y0 - BIG_BANG))) / (Math.log10(Math.max(1e-9, y1 - BIG_BANG)) - Math.log10(Math.max(1e-9, y0 - BIG_BANG)));
      return u0 + (u1 - u0) * Math.min(1, Math.max(0, t));
    }
  }
  return 0;
}
const BINS = 2400;
const hist = new Float64Array(BINS);
for (const e of all) hist[Math.min(BINS - 1, Math.floor(yearToU(e.y) * BINS))] += 1;
const maxH = Math.max(...hist);
writeJSON(path.join(outDir, 'density.json'), { bins: BINS, v: Array.from(hist, (v) => (v ? Math.max(1, Math.round((Math.sqrt(v) / Math.sqrt(maxH)) * 255)) : 0)) });

// ---------- surprise me: well-documented moments spread across eras, places and kinds ------------------------
const surprise = [];
const seenCombo = new Map();
for (const e of [...all].sort((a, b) => b.sl - a.sl)) {
  if (e.sl < 20 || e.src === 'noaa') continue;
  const era = e.y < -500 ? 0 : e.y < 500 ? 1 : e.y < 1500 ? 2 : e.y < 1800 ? 3 : e.y < 1900 ? 4 : 5;
  const combo = `${era}|${Math.floor((e.lon + 180) / 60)}|${types[e.type].key}`;
  const n = seenCombo.get(combo) || 0;
  if (n >= 3) continue;
  seenCombo.set(combo, n + 1);
  surprise.push(row(e));
  if (surprise.length >= 900) break;
}
writeJSON(path.join(outDir, 'surprise.json'), surprise);

// ---------- search shards -------------------------------------------------------------------------------------
const SHARDS = 8;
const shards = Array.from({ length: SHARDS }, () => []);
[...all].sort((a, b) => b.sl - a.sl).forEach((e, i) => shards[i % SHARDS].push([e.title, e.id, e.y, e.lat, e.lon, e.imp, e.type]));
fs.rmSync(path.join(DATA, 'search'), { recursive: true, force: true });
shards.forEach((s, i) => writeJSON(dataPath('search', `ev-${i}.json`), s));

// ---------- cities that appear when they were founded -------------------------------------------------------
// City labels before 1800 only use places whose founding is recorded, so no modern name appears too early.
const CITY_KEYS = new Set(['city-founded', 'town-founded', 'big-city-founded', 'capital-founded', 'ancient-city']);
const histCities = all
  .filter((e) => CITY_KEYS.has(types[e.type].key) && e.sl >= 20 && e.precision !== 'approx')
  .sort((a, b) => b.sl - a.sl)
  .slice(0, 6000)
  .map((e) => [e.id, e.title.replace(/,.*$/, ''), e.lon, e.lat, Math.floor(e.y), e.sl]);
writeJSON(dataPath('geo', 'cities-hist.json'), { source: 'Wikidata (CC0): settlements with a recorded date of founding', fields: ['id', 'name', 'lon', 'lat', 'founded', 'sitelinks'], rows: histCities });

// ---------- index and report ------------------------------------------------------------------------------------
const perLens = Object.fromEntries(LENSES.map((l) => [l, all.filter((e) => e.mask & lensBit[l]).length]));
const perCountry = {};
for (const e of all) if (e.country) perCountry[e.country] = (perCountry[e.country] || 0) + 1;
writeJSON(path.join(outDir, 'index.json'), {
  count: all.length,
  built: new Date().toISOString().slice(0, 10),
  cellDeg: CELL,
  fields: ['id', 'title', 'y', 'lat', 'lon', 'type', 'imp', 'lensMask', 'end', 'precision'],
  lenses: LENSES,
  types,
  buckets: bucketIndex,
  searchShards: SHARDS,
  perLens,
  sources: {
    wikidata: { title: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0 1.0' },
    wikipedia: { title: 'Wikipedia', url: 'https://en.wikipedia.org/', license: 'CC BY-SA 4.0' },
    noaa: { title: 'NOAA NCEI Global Significant Earthquake, Volcanic Eruption and Tsunami Databases', url: 'https://www.ngdc.noaa.gov/hazard/hazards.shtml', license: 'Public domain (US Government work)' },
  },
});
writeJSON(path.join(RAW, 'events', '_built.json'), { count: all.length, perLens, perCountry, groups });
writeJSON(path.join(RAW, 'events', '_all.json'), all);
const byType = {};
for (const e of all) byType[types[e.type].key] = (byType[types[e.type].key] || 0) + 1;
console.log(`events: ${all.length} in ${buckets.length} buckets; ${groups} part-of groups; with extract ${all.filter((e) => extracts[e.id]).length}`);
console.log('per lens:', JSON.stringify(perLens));
console.log('top types:', Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('era spread:', [-1e10, -3000, -500, 500, 1000, 1500, 1800, 1900, 1950, 2000, 3000].map((y, i, a) => (i ? `${a[i - 1]}..${y}: ${all.filter((e) => e.y >= a[i - 1] && e.y < y).length}` : '')).filter(Boolean).join(' | '));
console.log(`countries with events: ${Object.keys(perCountry).length}; under 30: ${countries.filter((c) => (perCountry[c.id] || 0) < 30).length}`);
