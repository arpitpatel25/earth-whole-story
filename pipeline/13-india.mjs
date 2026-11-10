// Step 13: India in depth. Compiles content/india into site/data/curated/india:
//   index.json   eras, lenses, regions, states, the matrix map and the counts the coverage audit reads
//   cells.json   the era x lens matrix (curated text, or an honest note where the record is thin)
//   events.json  curated, sourced events of the subcontinent (hand-written Explorer and Kid text)
//   people.json  biographies
//   states.json  a history view for every state and union territory
// Every record must point at a retrieved source: a Wikipedia article whose lead was fetched (cached in
// data-raw/wiki) or, for events taken from the automated layer, the retrieved lead in data-raw/events.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, RAW, DATA, CONTENT, readJSON, writeJSON, ensureDir, exists, round, slugify } from './lib/util.mjs';
import { readContentDir, parseSpan, parseDate } from './lib/content.mjs';
import { getLeads } from './lib/wiki.mjs';

const DIR = path.join(CONTENT, 'india');
const OUT = path.join(DATA, 'curated', 'india');
if (!exists(DIR)) {
  console.log('india: no content yet');
  process.exit(0);
}
ensureDir(OUT);

const LENSES = readJSON(path.join(CONTENT, 'lenses.json'));
const HUMAN = LENSES.human.map((l) => l.id);
const DEEP = LENSES.deep.map((l) => l.id);
const REGIONS = {
  north: 'North',
  northwest: 'Northwest',
  gangetic: 'Gangetic plains',
  east: 'East',
  northeast: 'Northeast',
  central: 'Central India',
  deccan: 'Deccan',
  south: 'South',
  west: 'West coast',
  himalaya: 'Himalaya',
  islands: 'Andaman, Nicobar and Lakshadweep',
  all: 'Across the subcontinent',
  pakistan: 'Today\'s Pakistan',
  bangladesh: 'Today\'s Bangladesh',
  nepal: 'Nepal',
  bhutan: 'Bhutan',
  srilanka: 'Sri Lanka',
  afghanistan: 'Afghanistan',
  abroad: 'Beyond the subcontinent',
};
const TAGS = new Set(['woman', 'scientist', 'artist', 'writer', 'reformer', 'dalit', 'adivasi', 'ruler', 'saint', 'soldier', 'freedom', 'ordinary', 'musician', 'athlete', 'business', 'thinker', 'traveller', 'builder', 'politician', 'poet', 'doctor', 'film']);

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

// ---- read everything -------------------------------------------------------------------------------------------
const records = readContentDir(DIR);
const psv = (sub) => {
  const out = [];
  const d = path.join(DIR, sub);
  if (!exists(d)) return out;
  for (const f of fs.readdirSync(d).sort()) {
    if (!f.endsWith('.psv')) continue;
    fs.readFileSync(path.join(d, f), 'utf8').split(/\r?\n/).forEach((line, n) => {
      if (!line.trim() || line.startsWith('#')) return;
      out.push({ cols: line.split(' | ').map((s) => s.trim()), where: `${sub}/${f}:${n + 1}` });
    });
  }
  return out;
};
const eventLines = psv('events');
const peopleLines = psv('people');

const all = readJSON(path.join(RAW, 'events', '_all.json'));
const byId = new Map(all.map((e) => [e.id, e]));
const byTitle = new Map(all.filter((e) => /city|town|capital/.test(String(e.type)) || true).map((e) => [e.title, e]));
const extracts = readJSON(path.join(RAW, 'events', 'extracts.json'));

// ---- which articles must have been retrieved ---------------------------------------------------------------------
const want = new Set();
const isCoord = (v) => /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v);
for (const r of records) {
  for (const s of [].concat(r.src || [])) if (!/^https?:/.test(s)) want.add(s.split('|')[0].trim());
  if (r.focus && !isCoord(r.focus.split('|')[0].trim()) && !/^-?\d/.test(r.focus)) want.add(r.focus.split('|')[0].trim());
}
for (const { cols } of eventLines) {
  if (cols[0].startsWith('+')) {
    if (cols[2] && !isCoord(cols[2])) want.add(cols[2]);
    for (const s of (cols[5] || '').split(';')) if (s.trim()) want.add(s.trim());
  } else {
    const o = /place=([^;]+)/.exec(cols[5] || '');
    if (o && !isCoord(o[1].trim())) want.add(o[1].trim());
  }
}
for (const { cols } of peopleLines) {
  want.add(cols[0]);
  if (cols[2] && !isCoord(cols[2])) want.add(cols[2]);
}
const leads = await getLeads([...want]);
const lead = (t) => {
  const l = leads.get(t);
  return l && !l.missing ? l : null;
};
const wpSource = (t, where) => {
  const l = lead(t);
  if (!l) {
    fail(where, `source article not found: "${t}"`);
    return null;
  }
  return { title: l.title, publisher: 'Wikipedia', url: l.url, license: 'CC BY-SA 4.0' };
};
const sourcesOf = (r, where) => {
  const out = [];
  for (const s of [].concat(r.src || [])) {
    if (/^https?:/.test(s)) {
      const p = s.split('|').map((x) => x.trim());
      out.push({ url: p[0], title: p[1] || p[0], publisher: p[2] });
    } else {
      const got = wpSource(s.split('|')[0].trim(), where);
      if (got) out.push(got);
    }
  }
  if (!out.length) fail(where, 'no source');
  return out;
};
const coordOf = (v, where) => {
  if (!v) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(v);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]) };
  const l = lead(v);
  if (!l || !l.coord) {
    // some city articles carry no coordinates in the API; the Wikidata record of the same name does
    const w = byTitle.get(v);
    if (w) return { lat: round(w.lat, 3), lon: round(w.lon, 3), name: v };
    fail(where, `place "${v}" has no retrieved coordinates`);
    return null;
  }
  return { lat: round(l.coord.lat, 3), lon: round(l.coord.lon, 3), name: l.title };
};
const text = (v) => [].concat(v || []).join(' ').trim();
const lensList = (s, where, pool = HUMAN) => {
  const out = String(s || '').split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
  for (const l of out) if (!pool.includes(l)) fail(where, `unknown lens "${l}"`);
  if (!out.length) fail(where, 'no lens');
  return out;
};

// ---- eras ----------------------------------------------------------------------------------------------------------
const eras = [];
for (const r of records.filter((x) => x._type === 'iera')) {
  const where = `${r._file}:${r._line} ${r.id}`;
  let span = { y: 0, end: 0 };
  try {
    span = parseSpan(r.span);
  } catch (e) {
    fail(where, e.message);
  }
  for (const k of ['name', 'kid', 'span', 'S', 'K']) if (!r[k]) fail(where, `missing "${k}"`);
  let focus = [22, 79, 5200];
  if (r.focus) {
    const p = r.focus.split(',').map((x) => Number(x.trim()));
    if (p.length === 3 && p.every(Number.isFinite)) focus = p;
    else fail(where, 'focus must be "lat, lon, altKm"');
  }
  eras.push({ id: r.id, name: r.name, kidName: r.kid, y0: span.y, y1: span.end ?? span.y, deep: r.deep ? true : undefined, order: Number(r.order) || eras.length + 1, summary: text(r.S), kidSummary: text(r.K), regions: r.regions ? r.regions.split(/,\s*/) : undefined, focus, note: r.note || undefined, sources: sourcesOf(r, where) });
}
eras.sort((a, b) => a.order - b.order);
const eraById = new Map(eras.map((e) => [e.id, e]));

// ---- matrix cells ----------------------------------------------------------------------------------------------------
const cells = {};
const matrix = {};
let curatedCells = 0;
let thinCells = 0;
for (const r of records.filter((x) => x._type === 'icell')) {
  const where = `${r._file}:${r._line} ${r.id}`;
  const [eraId, lens] = r.id.split('.');
  const era = eraById.get(eraId);
  if (!era) {
    fail(where, `unknown era "${eraId}"`);
    continue;
  }
  if (!(era.deep ? DEEP : HUMAN).includes(lens)) fail(where, `lens "${lens}" does not belong to this era`);
  if (cells[r.id]) fail(where, 'duplicate cell');
  const T = text(r.T);
  const K = text(r.K);
  if (!T) fail(where, 'missing T');
  if (!K) fail(where, 'missing K');
  const thin = !!r.thin;
  cells[r.id] = { text: T, kid: K, thin: thin || undefined, region: r.regions || undefined, confidence: r.conf || undefined, sources: thin && !r.src ? [] : sourcesOf(r, where) };
  (matrix[eraId] = matrix[eraId] || {})[lens] = thin ? 't' : 'c';
  if (thin) thinCells++;
  else curatedCells++;
}
const missing = [];
for (const era of eras) for (const lens of era.deep ? DEEP : HUMAN) if (!(matrix[era.id] || {})[lens]) missing.push(`${era.id}.${lens}`);

// ---- events ------------------------------------------------------------------------------------------------------------
const events = [];
const seen = new Set();
for (const { cols, where } of eventLines) {
  let rec;
  if (cols[0].startsWith('+')) {
    const [slug, date, place, lenses, region, src, title, S, K] = cols;
    if (cols.length < 9) {
      fail(where, `new event needs 9 fields, has ${cols.length}`);
      continue;
    }
    let span = { y: 0, end: null, precision: 'year' };
    try {
      span = parseSpan(date);
    } catch (e) {
      fail(where, e.message);
    }
    const c = coordOf(place, where);
    const sources = src.split(';').map((s) => wpSource(s.trim(), where)).filter(Boolean);
    if (!sources.length) fail(where, 'no source');
    // if the automatic layer already has this subject (same article), the curated record takes its id and replaces it
    const twin = byTitle.get(src.split(';')[0].trim()) || (sources[0] && byTitle.get(sources[0].title));
    const useTwin = twin && !seen.has(twin.id) && !eventLines.some((l) => l.cols[0] === twin.id);
    rec = { id: useTwin ? twin.id : `in-${slug.slice(1)}`, q: useTwin ? 1 : undefined, ap: place === 'India' ? 1 : undefined, t: title, y: round(span.y, 5), e: span.end != null ? round(span.end, 5) : undefined, p: span.precision, la: c ? c.lat : 0, lo: c ? c.lon : 0, pl: c && c.name ? c.name : undefined, l: lensList(lenses, where), r: region, s: S, k: K, src: sources.map((s) => s.title) };
  } else {
    const [id, lenses, region, S, K, over] = cols;
    if (cols.length < 5) {
      fail(where, `event needs 5 fields, has ${cols.length}`);
      continue;
    }
    const e = byId.get(id);
    if (!e) {
      fail(where, `${id} is not in the event layer`);
      continue;
    }
    if (!extracts[id]) fail(where, `${id} (${e.title}) has no retrieved lead text`);
    rec = { id, t: e.title, y: e.y, e: e.end || undefined, p: e.precision, la: e.lat, lo: e.lon, l: lensList(lenses, where), r: region, s: S, k: K, src: [e.title], q: 1 };
    for (const part of (over || '').split(';')) {
      const m = /^\s*(\w+)=(.+)$/.exec(part);
      if (!m) continue;
      if (m[1] === 'date') {
        try {
          const span = parseSpan(m[2].trim());
          rec.y = round(span.y, 5);
          rec.e = span.end != null ? round(span.end, 5) : undefined;
          rec.p = span.precision;
        } catch (err) {
          fail(where, err.message);
        }
      } else if (m[1] === 'title') rec.t = m[2].trim();
      else if (m[1] === 'place') {
        const c = coordOf(m[2].trim(), where);
        if (c) {
          rec.la = c.lat;
          rec.lo = c.lon;
        }
      }
    }
  }
  if (!REGIONS[rec.r]) fail(where, `unknown region "${rec.r}"`);
  if (!rec.s || rec.s.length < 20) fail(where, 'summary missing or too short');
  if (!rec.k || rec.k.length < 15) fail(where, 'kid text missing or too short');
  if (seen.has(rec.id)) {
    fail(where, `duplicate event ${rec.id}`);
    continue;
  }
  seen.add(rec.id);
  events.push(rec);
}
events.sort((a, b) => a.y - b.y);

// ---- people ------------------------------------------------------------------------------------------------------------
const people = [];
for (const { cols, where } of peopleLines) {
  const [article, life, place, lenses, tags, S, K, display] = cols;
  if (cols.length < 7) {
    fail(where, `person needs 7 fields, has ${cols.length}`);
    continue;
  }
  const src = wpSource(article, where);
  let span = { y: 0, end: null, precision: 'year' };
  try {
    span = parseSpan(life);
  } catch (e) {
    fail(where, e.message);
  }
  const c = coordOf(place, where);
  const tg = tags.split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
  for (const t of tg) if (!TAGS.has(t)) fail(where, `unknown tag "${t}"`);
  if (!S || S.length < 30) fail(where, 'summary missing or too short');
  if (!K || K.length < 20) fail(where, 'kid text missing or too short');
  const id = `p-${slugify(article)}`;
  if (people.some((p) => p.id === id)) {
    fail(where, `duplicate person ${id}`);
    continue;
  }
  people.push({ id, n: display || (src ? src.title.replace(/ \(.*\)$/, '') : article), b: round(span.y, 2), d: span.end != null ? round(span.end, 2) : undefined, p: span.precision, la: c ? c.lat : 0, lo: c ? c.lon : 0, pl: c && c.name ? c.name : place, l: lensList(lenses, where), g: tg, s: S, k: K, src: src ? [src.title] : [] });
}
people.sort((a, b) => a.b - b.b);

// ---- states ------------------------------------------------------------------------------------------------------------
const states = [];
for (const r of records.filter((x) => x._type === 'istate')) {
  const where = `${r._file}:${r._line} ${r.id}`;
  for (const k of ['name', 'T', 'K', 'kind']) if (!r[k]) fail(where, `missing "${k}"`);
  const c = r.at ? coordOf(r.at.trim(), where) : null;
  states.push({ id: r.id, name: r.name, kind: r.kind, match: r.match ? r.match.split(/;\s*/) : [r.name], la: c ? c.lat : undefined, lo: c ? c.lon : undefined, alt: r.alt ? Number(r.alt) : undefined, text: [].concat(r.T), kid: [].concat(r.K), formed: r.formed || undefined, sources: sourcesOf(r, where) });
}
states.sort((a, b) => a.name.localeCompare(b.name));

// ---- write ---------------------------------------------------------------------------------------------------------------
const counts = { eras: eras.length, cells: curatedCells, thin: thinCells, missing: missing.length, events: events.length, people: people.length, states: states.length, women: people.filter((p) => p.g.includes('woman')).length };
writeJSON(path.join(OUT, 'cells.json'), cells);
writeJSON(path.join(OUT, 'events.json'), events);
writeJSON(path.join(OUT, 'people.json'), people);
writeJSON(path.join(OUT, 'states.json'), states);
writeJSON(path.join(OUT, 'index.json'), { eras, lenses: HUMAN, deepLenses: DEEP, regions: REGIONS, matrix, counts, missing });
// the audit file (not shipped): which cells are still empty, and the spread of events
const perEra = eras.map((e) => `${e.id} ${events.filter((x) => x.y >= e.y0 && x.y <= e.y1).length}`).join(', ');
const perRegion = Object.keys(REGIONS).map((r) => `${r} ${events.filter((x) => x.r === r).length}`).join(', ');
const perLens = HUMAN.map((l) => `${l} ${events.filter((x) => x.l.includes(l)).length}`).join(', ');
console.log(`india: ${eras.length} eras; cells ${curatedCells} curated + ${thinCells} thin, ${missing.length} missing; ${events.length} events; ${people.length} people (${counts.women} women); ${states.length} states`);
if (process.argv.includes('--audit')) {
  console.log(`  events per era: ${perEra}`);
  console.log(`  events per region: ${perRegion}`);
  console.log(`  events per lens: ${perLens}`);
  const tagCount = {};
  for (const p of people) for (const t of p.g) tagCount[t] = (tagCount[t] || 0) + 1;
  console.log(`  people tags: ${Object.entries(tagCount).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (missing.length && process.argv.includes('--missing')) console.log(`  missing cells: ${missing.join(' ')}`);
  else if (missing.length) console.log(`  missing cells by era: ${eras.map((e) => `${e.id} ${missing.filter((m) => m.startsWith(`${e.id}.`)).length}`).join(', ')}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problems:\n${problems.slice(0, 60).join('\n')}`);
  process.exit(1);
}
void ROOT;
void parseDate;
