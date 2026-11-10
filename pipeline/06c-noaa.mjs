// Step 06c: NOAA NCEI Global Significant Earthquake, Volcanic Eruption and Tsunami databases
// (US Government work, public domain). Output: data-raw/noaa/events.json, merged by step 06b.
import path from 'node:path';
import { RAW, fetchJSON, writeJSON, ensureDir, round, sleep } from './lib/util.mjs';

const API = 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1';
const OUT = ensureDir(path.join(RAW, 'noaa'));
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

async function all(endpoint) {
  const items = [];
  let page = 1;
  for (;;) {
    const j = await fetchJSON(`${API}/${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}`);
    items.push(...j.items);
    if (page >= j.totalPages) break;
    page++;
    await sleep(150);
  }
  return items;
}

/** NOAA writes "COUNTRY:  PLACE; PLACE". Keep it readable without changing what it says. */
function tidy(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s:;,(\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Of|And|The|De|Del|La|Near|Off|In)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function when(it) {
  // NOAA years are astronomical-free: negative means BCE.
  const y = it.year;
  if (it.month && it.day) return { y: round(y + (CUM[it.month - 1] + it.day - 0.5) / 365.25, 4), precision: 'exact', month: it.month, day: it.day };
  if (it.month) return { y: round(y + (CUM[it.month - 1] + 15) / 365.25, 3), precision: 'month' };
  return { y: y + 0.5, precision: 'year' };
}

const deathsOf = (it) => it.deathsTotal ?? it.deaths ?? null;
function rank(deaths, size, cut) {
  if (deaths >= 10000 || size >= cut[2]) return 5;
  if (deaths >= 1000 || size >= cut[1]) return 4;
  if (deaths >= 100 || size >= cut[0]) return 3;
  if (deaths >= 1) return 2;
  return 1;
}

const out = [];
const quakes = await all('earthquakes');
for (const it of quakes) {
  if (it.latitude == null || it.longitude == null || it.year == null) continue;
  const place = tidy(it.locationName || it.country);
  const mag = it.eqMagnitude ?? null;
  const d = deathsOf(it);
  out.push({
    id: `noaa-eq-${it.id}`, kind: 'earthquake', title: `Earthquake: ${place}`,
    desc: `significant earthquake${mag ? ` of magnitude ${mag}` : ''} recorded in the NOAA NCEI database`,
    ...when(it), lat: round(it.latitude, 3), lon: round(it.longitude, 3), mag, deaths: d,
    rank: rank(d || 0, mag || 0, [7, 7.8, 8.6]), ref: `https://www.ngdc.noaa.gov/hazel/view/hazards/earthquake/event-more-info/${it.id}`,
  });
}
const volc = await all('volcanoes');
for (const it of volc) {
  if (it.latitude == null || it.longitude == null || it.year == null) continue;
  const d = deathsOf(it);
  out.push({
    id: `noaa-vo-${it.id}`, kind: 'eruption', title: `Eruption of ${it.name}`,
    desc: `significant volcanic eruption${it.vei != null ? ` (VEI ${it.vei})` : ''} of ${it.name}, ${tidy(it.country)}, recorded in the NOAA NCEI database`,
    ...when(it), lat: round(it.latitude, 3), lon: round(it.longitude, 3), mag: null, deaths: d,
    rank: rank(d || 0, it.vei || 0, [4, 5, 6]), ref: `https://www.ngdc.noaa.gov/hazel/view/hazards/volcano/event-more-info/${it.id}`,
  });
}
const tsu = await all('tsunamis/events');
for (const it of tsu) {
  if (it.latitude == null || it.longitude == null || it.year == null) continue;
  if (it.eventValidity != null && it.eventValidity < 3) continue; // keep probable and definite tsunamis only
  const d = deathsOf(it);
  out.push({
    id: `noaa-ts-${it.id}`, kind: 'tsunami', title: `Tsunami: ${tidy(it.locationName || it.country)}`,
    desc: `tsunami${it.maxWaterHeight ? ` with a maximum recorded water height of ${it.maxWaterHeight} m` : ''} recorded in the NOAA NCEI database`,
    ...when(it), lat: round(it.latitude, 3), lon: round(it.longitude, 3), mag: it.eqMagnitude ?? null, deaths: d,
    rank: rank(d || 0, it.maxWaterHeight || 0, [5, 15, 30]), ref: `https://www.ngdc.noaa.gov/hazel/view/hazards/tsunami/event-more-info/${it.id}`,
  });
}
writeJSON(path.join(OUT, 'events.json'), out);
console.log(`noaa: ${quakes.length} earthquakes, ${volc.length} eruptions, ${tsu.length} tsunamis -> ${out.length} records`);
