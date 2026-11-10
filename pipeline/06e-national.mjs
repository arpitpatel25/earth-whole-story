// Step 6e: national events for countries whose located record is thin.
// Elections, referendums, coups, wars, treaties, epidemics and disasters often have a date and a country in
// Wikidata but no single point on the map. They belong on that country's timeline, so for every entry with fewer
// than 30 located events this step asks Wikidata (CC0) for them and caches the answers in data-raw/national.
// Step 6d then merges them into the country files. They are listed, never pinned: no point is invented for them.
import path from 'node:path';
import { RAW, DATA, readJSON, writeJSON, ensureDir, exists, sleep, UA } from './lib/util.mjs';

const OUT = path.join(RAW, 'national');
ensureDir(OUT);
const index = readJSON(path.join(DATA, 'geo', 'country-index.json'));
const counts = readJSON(path.join(DATA, 'countries', 'index.json')).counts;
const CLASSES = ['Q40231', 'Q43109', 'Q45382', 'Q273120', 'Q10931', 'Q198', 'Q8465', 'Q131569', 'Q168247', 'Q8068', 'Q44512', 'Q7944', 'Q8092', 'Q3199915', 'Q124757'];
const query = (qid) => `SELECT ?e ?eLabel ?eDescription ?date ?prec ?cls ?clsLabel ?sl ?article WHERE {
  VALUES ?cls { ${CLASSES.map((c) => `wd:${c}`).join(' ')} }
  { ?e wdt:P17 wd:${qid} } UNION { ?e wdt:P1001 wd:${qid} }
  ?e wdt:P31/wdt:P279* ?cls .
  { ?e p:P585/psv:P585 ?t } UNION { ?e p:P580/psv:P580 ?t }
  ?t wikibase:timeValue ?date ; wikibase:timePrecision ?prec .
  ?e wikibase:sitelinks ?sl . FILTER(?sl >= 1)
  OPTIONAL { ?article schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 600`;

const todo = index.filter((c) => c.wd && (counts[c.id] || 0) < 30 && !exists(path.join(OUT, `${c.id}.json`)));
console.log(`national events: ${todo.length} countries to ask about`);
let done = 0;
for (const c of todo) {
  let rows = null;
  for (let attempt = 0; attempt < 4 && !rows; attempt++) {
    try {
      const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query(c.wd))}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
      if (r.status === 429 || r.status >= 500) { await sleep(8000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      rows = (await r.json()).results.bindings;
    } catch (e) {
      if (attempt === 3) console.log(`  ${c.id}: ${e.message}`);
      await sleep(4000);
    }
  }
  if (!rows) continue;
  const seen = new Map();
  for (const b of rows) {
    const id = b.e.value.split('/').pop();
    const label = b.eLabel ? b.eLabel.value : id;
    if (/^Q\d+$/.test(label)) continue; // no English name
    const m = /^(-?)(\d+)-(\d\d)-(\d\d)/.exec(b.date.value);
    if (!m) continue;
    const year = (m[1] ? -1 : 1) * Number(m[2]);
    const prec = Number(b.prec.value);
    const rec = { id, title: label, desc: b.eDescription ? b.eDescription.value : null, year, month: prec >= 10 ? Number(m[3]) : null, day: prec >= 11 ? Number(m[4]) : null, cls: b.clsLabel ? b.clsLabel.value : null, sl: Number(b.sl.value), wp: b.article ? decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' ') : null };
    const old = seen.get(id);
    if (!old || (rec.day && !old.day)) seen.set(id, rec);
  }
  writeJSON(path.join(OUT, `${c.id}.json`), [...seen.values()].sort((a, b) => a.year - b.year));
  done++;
  if (done % 10 === 0) console.log(`  ${done}/${todo.length}`);
  await sleep(1200);
}
console.log(`national events: ${done} fetched`);
