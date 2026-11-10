// A sweep that supports acceptance test 15: every curated claim (Explorer and Kid text), checked against the text of its
// cited sources as the build retrieved it (data-raw/wiki; no network). The fact audit proper
// (tests/audit-facts.mjs) draws a random sample and retrieves the sources again; this sweep finds, ahead of that,
// every claim the mechanical check cannot confirm, so that each can be read by hand and fixed or explained.
//
// Usage: node tests/sweep-facts.mjs [--kind "India event"]   -> tests/results/fact-sweep.json
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, ROOT } from './lib/curated.mjs';
import { sourceText, qidOf } from './lib/sources.mjs';
import { supported, noteFor } from './lib/claims.mjs';

const only = process.argv.includes('--kind') ? process.argv[process.argv.indexOf('--kind') + 1] : null;
const notesFile = path.join(ROOT, 'tests', 'fact-audit-notes.json');
const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};
// What the build holds for a record taken over from the automatic layer: its Wikipedia lead and its Wikidata fields.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const autoById = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data-raw', 'events', '_all.json'), 'utf8')).map((e) => [e.id, e]));
const leads = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-raw', 'events', 'extracts.json'), 'utf8'));
const yearText = (y) => (y < 1 ? `${Math.ceil(-y) || 1} BCE` : String(Math.floor(y)));
function localText(r, s) {
  const e = autoById.get(r.id);
  if (!e) return null;
  if (qidOf(s.url)) return [e.title, e.desc, e.day ? `${e.day} ${MONTHS[e.month - 1]} ${yearText(e.y)}` : e.month ? `${MONTHS[e.month - 1]} ${yearText(e.y)}` : yearText(e.y), e.end ? yearText(e.end) : '', e.loc || '', e.deaths ? `deaths ${e.deaths}` : ''].filter(Boolean).join('. ');
  return leads[r.id] ? `${e.title}. ${leads[r.id]}` : null;
}
const pool = allCurated().filter((r) => !r.thin && r.id !== 'this-website' && (!only || r.kind === only));
const flags = [];
let n = 0, claims = 0, byHand = 0;
for (const r of pool) {
  const texts = [];
  for (const s of r.sources) { const t = (await sourceText(s.url, { cacheOnly: true })) || localText(r, s); if (t) texts.push(t); }
  for (const which of ['text', 'kid']) {
    const claim = r[which];
    if (!claim) continue;
    claims++;
    const key = `${r.kind}|${r.id}|${which}`;
    if (!texts.length) { flags.push({ key, claim, sources: r.sources.map((s) => s.title), detail: 'no source text' }); continue; }
    const res = supported(claim, texts.join('\n'));
    if (res.ok) continue;
    if (noteFor(notes, key, claim)) { byHand++; continue; }
    flags.push({ key, claim, sources: r.sources.map((s) => s.title), nums: res.missingNums, names: res.missingNames });
  }
  if (++n % 250 === 0) console.log(`  ${n}/${pool.length} records`);
}
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'fact-sweep.json'), JSON.stringify({ ranAt: new Date().toISOString(), records: pool.length, claims, readByHand: byHand, flagged: flags.length, flags }, null, 1));
console.log(`${claims} claims in ${pool.length} records; ${claims - flags.length} supported (${byHand} after reading by hand); ${flags.length} need reading`);
