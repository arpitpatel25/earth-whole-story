// Step 15: events that belong to no single country, each with region views ("this event, from here").
// Compiles content/wide into site/data/curated/wide.json. Every view cites a retrieved article and is placed at a
// retrieved coordinate.
import path from 'node:path';
import { DATA, CONTENT, writeJSON, exists, round } from './lib/util.mjs';
import { readContentDir, parseSpan, list } from './lib/content.mjs';
import { getLeads } from './lib/wiki.mjs';

const DIR = path.join(CONTENT, 'wide');
if (!exists(DIR)) { console.log('wide: no content yet'); process.exit(0); }
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
  for (const s of [].concat(r.src || [])) { const l = lead(s.trim()); if (!l) fail(where, `source article not found: "${s}"`); else out.push({ title: l.title, publisher: 'Wikipedia', url: l.url, license: 'CC BY-SA 4.0' }); }
  if (!out.length) fail(where, 'no source');
  return out;
};
const span = (r, where) => { try { const s = parseSpan(r.date); return { y: round(s.y, 5), end: s.end == null ? undefined : round(s.end, 5), precision: s.precision }; } catch (e) { fail(where, `date: ${e.message}`); return {}; } };

const storyIds = new Set(readContentDir(path.join(CONTENT, 'stories')).filter((x) => x._type === 'story').map((x) => x.id));
const out = [];
for (const r of records.filter((x) => x._type === 'wide')) {
  const where = `${r._file}:${r._line} ${r.id}`;
  for (const k of ['title', 'kid', 'date', 'S', 'K']) if (!r[k]) fail(where, `missing "${k}"`);
  const views = records.filter((v) => v._type === 'wview' && v.id.startsWith(`${r.id}.`)).map((v) => {
    const w = `${v._file}:${v._line} ${v.id}`;
    for (const k of ['name', 'at', 'T', 'K']) if (!v[k]) fail(w, `missing "${k}"`);
    const l = lead((v.at || '').trim());
    if (!l || !l.coord) fail(w, `place "${v.at}" has no retrieved coordinates`);
    return { id: v.id.slice(r.id.length + 1), name: v.name, place: l ? l.title : v.at, lat: l && l.coord ? round(l.coord.lat, 3) : 0, lon: l && l.coord ? round(l.coord.lon, 3) : 0, altKm: Number(v.alt) || 3000, ...(v.date ? span(v, w) : {}), text: text(v.T), kid: text(v.K), sources: sourcesOf(v, w) };
  });
  if (views.length < 3) fail(where, 'a multi-region event needs at least three region views');
  if (r.story && !storyIds.has(r.story)) fail(where, `story "${r.story}" does not exist`);
  out.push({ id: r.id, title: r.title, kidTitle: r.kid, ...span(r, where), window: r.window ? Number(r.window) : undefined, lenses: list(r.lenses), story: r.story || undefined, summary: text(r.S), kidSummary: text(r.K), contentNote: r.note || undefined, sources: sourcesOf(r, where), views });
}
out.sort((a, b) => a.y - b.y);
writeJSON(path.join(DATA, 'curated', 'wide.json'), out);
console.log(`wide: ${out.length} multi-region events, ${out.reduce((n, e) => n + e.views.length, 0)} region views`);
if (problems.length) { console.error(`\n${problems.length} problems:\n${problems.join('\n')}`); process.exit(1); }
