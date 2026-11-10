// Step 14: the explorable 3D scenes. Compiles content/models into site/data/curated/models.json.
// The geometry is code (src/models/defs.js); this step owns the words: every scene and every labelled part must
// cite a retrieved article, and every part named here must exist in the geometry (and the other way round).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, CONTENT, writeJSON, exists, round } from './lib/util.mjs';
import { readContentDir, parseSpan, list } from './lib/content.mjs';
import { getLeads } from './lib/wiki.mjs';

const DIR = path.join(CONTENT, 'models');
if (!exists(DIR)) { console.log('models: no content yet'); process.exit(0); }
const records = readContentDir(DIR);
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const text = (v) => [].concat(v || []).join(' ').trim();

const want = new Set();
for (const r of records) { for (const s of [].concat(r.src || [])) want.add(s.trim()); if (r.at) want.add(r.at.trim()); }
const leads = await getLeads([...want]);
const lead = (t) => { const l = leads.get(t); return l && !l.missing ? l : null; };
const sourcesOf = (r, where) => {
  const out = [];
  for (const s of [].concat(r.src || [])) {
    const l = lead(s.trim());
    if (!l) fail(where, `source article not found: "${s}"`);
    else out.push({ title: l.title, publisher: 'Wikipedia', url: l.url, license: 'CC BY-SA 4.0' });
  }
  if (!out.length) fail(where, 'no source');
  return out;
};

// part ids declared by the geometry: P('part-id', ...) inside "export function <id with _>(k)" blocks
const defs = fs.readFileSync(path.join(ROOT, 'src', 'models', 'defs.js'), 'utf8');
const geometry = new Map();
for (const m of defs.matchAll(/^  '([\w-]+)': \(k\) => \{([\s\S]*?)^  \},$/gm)) geometry.set(m[1], new Set([...m[2].matchAll(/\bP\('([\w-]+)'/g)].map((x) => x[1])));

const models = [];
for (const r of records.filter((x) => x._type === 'model')) {
  const where = `${r._file}:${r._line} ${r.id}`;
  for (const k of ['title', 'kid', 'date', 'S', 'K', 'note']) if (!r[k]) fail(where, `missing "${k}"`);
  let y = null, end = null, precision = 'year';
  try {
    const s = parseSpan(r.date);
    y = s.y; end = s.end; precision = s.precision;
  } catch (e) { fail(where, `date: ${e.message}`); }
  let lat = null, lon = null;
  if (r.at) {
    const l = lead(r.at.trim());
    if (!l || !l.coord) fail(where, `place "${r.at}" has no retrieved coordinates`);
    else { lat = round(l.coord.lat, 3); lon = round(l.coord.lon, 3); }
  }
  const parts = records.filter((p) => p._type === 'mpart' && p.id.startsWith(`${r.id}.`)).map((p) => {
    const w = `${p._file}:${p._line} ${p.id}`;
    for (const k of ['name', 'kid', 'T', 'K']) if (!p[k]) fail(w, `missing "${k}"`);
    return { id: p.id.slice(r.id.length + 1), name: p.name, kidName: p.kid, text: text(p.T), kid: text(p.K), sources: sourcesOf(p, w) };
  });
  if (parts.length < 2) fail(where, 'a scene needs at least two labelled parts');
  const geo = geometry.get(r.id);
  if (!geo) fail(where, 'no geometry in src/models/defs.js');
  else {
    for (const p of parts) if (!geo.has(p.id)) fail(where, `part "${p.id}" has text but no geometry`);
    for (const g of geo) if (!parts.some((p) => p.id === g)) fail(where, `geometry part "${g}" has no text`);
  }
  models.push({ id: r.id, title: r.title, kidTitle: r.kid, y: y == null ? null : round(y, 5), end: end == null ? undefined : round(end, 5), precision, order: Number(r.order) || 99, lat, lon, placeText: r.at || undefined, lenses: list(r.lenses), summary: text(r.S), kidSummary: text(r.K), note: r.note, sources: sourcesOf(r, where), parts });
}
for (const id of geometry.keys()) if (!models.some((m) => m.id === id)) fail(`defs.js ${id}`, 'geometry without content');
for (const p of records.filter((x) => x._type === 'mpart')) if (!models.some((m) => p.id.startsWith(`${m.id}.`))) fail(`${p._file}:${p._line} ${p.id}`, 'part of an unknown scene');
models.sort((a, b) => a.order - b.order);
writeJSON(path.join(DATA, 'curated', 'models.json'), models);
console.log(`models: ${models.length} scenes, ${models.reduce((n, m) => n + m.parts.length, 0)} labelled parts`);
if (problems.length) { console.error(`\n${problems.length} problems:\n${problems.join('\n')}`); process.exit(1); }
