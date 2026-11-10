// Research helper for curating India: lists automated events in the subcontinent with their retrieved
// Wikipedia lead, so a curated record can be written from the retrieved text (never from memory).
//   node pipeline/india-candidates.mjs [--from -3000] [--to 1200] [--country IND] [--skip 0] [--n 60] [--min-sl 3] [--type battle,temple] [--q word]
import path from 'node:path';
import fs from 'node:fs';
import { RAW, CONTENT, readJSON } from './lib/util.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const from = Number(arg('from', -1e10));
const to = Number(arg('to', 3000));
const countries = new Set(arg('country', 'IND').split(','));
const skip = Number(arg('skip', 0));
const n = Number(arg('n', 60));
const minSl = Number(arg('min-sl', 0));
const typeFilter = arg('type', '') ? new Set(arg('type', '').split(',')) : null;
const q = arg('q', '') ? new RegExp(arg('q', ''), 'i') : null;
const chars = Number(arg('chars', 210));

const all = readJSON(path.join(RAW, 'events', '_all.json'));
const types = readJSON(path.join(RAW, '..', 'site', 'data', 'events', 'index.json')).types || [];
const ex = readJSON(path.join(RAW, 'events', 'extracts.json'));
// what is already curated
const done = new Set();
const dir = path.join(CONTENT, 'india', 'events');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
  const m = /^(Q\d+)\s*\|/.exec(line);
  if (m) done.add(m[1]);
}
const typeKey = (e) => (types[e.type] && (types[e.type].key || types[e.type])) || String(e.type);
let list = all.filter((e) => countries.has(e.country) && e.y >= from && e.y < to && e.sl >= minSl && !done.has(e.id) && ex[e.id]);
if (typeFilter) list = list.filter((e) => typeFilter.has(typeKey(e)));
const not = arg('not', '') ? new Set(arg('not', '').split(',')) : null;
if (not) list = list.filter((e) => !not.has(typeKey(e)));
if (q) list = list.filter((e) => q.test(e.title) || q.test(ex[e.id] || ''));
list.sort((a, b) => b.sl - a.sl);
const total = list.length;
list = list.slice(skip, skip + n).sort((a, b) => a.y - b.y);
console.log(`# ${total} candidates (${done.size} already curated); showing ${list.length} from ${skip}`);
for (const e of list) {
  const yr = e.y < 0 ? `${Math.ceil(-e.y)} BCE` : String(Math.floor(e.y));
  // pronunciations and native scripts in brackets carry no facts: drop them to keep the listing short
  const lead = (ex[e.id] || '').replace(/\s*\([^()]*(\([^()]*\)[^()]*)*\)/g, '').replace(/\s+/g, ' ').replace(/ ,/g, ',');
  console.log(`${e.id} | ${e.title} | ${yr}${e.end ? `..${Math.floor(e.end)}` : ''} | ${typeKey(e)} | ${lead.slice(0, chars)}`);
}
