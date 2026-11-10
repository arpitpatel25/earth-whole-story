// Step 07: the first sentences of each event's English Wikipedia article (CC BY-SA 4.0).
// Kept in its own directory (site/data/wikipedia) so share-alike text stays separable from CC0 data.
// Resumable: progress is saved every few hundred articles.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, DATA, readJSON, writeJSON, fetchJSON, sleep, ensureDir, pool } from './lib/util.mjs';

const all = readJSON(path.join(RAW, 'events', '_all.json')).filter((e) => e.src !== 'noaa');
const file = path.join(RAW, 'events', 'extracts.json');
const done = fs.existsSync(file) ? readJSON(file) : {};
// PRIORITY=IND,PAK moves those countries to the front of the queue (used while curating a region)
const first = new Set((process.env.PRIORITY || '').split(',').filter(Boolean));
let todo = all.filter((e) => done[e.id] === undefined).sort((a, b) => (first.has(b.country) ? 1 : 0) - (first.has(a.country) ? 1 : 0) || b.sl - a.sl);
// WRITE_ONLY=1 deploys the leads already retrieved without fetching any more.
if (process.env.WRITE_ONLY) todo = [];
console.log(`${all.length} events, ${todo.length} to fetch`);

// Saving merges with whatever is on disk, so an interrupted or overlapping run never loses fetched text.
function save() {
  let disk = {};
  try {
    disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    disk = {};
  }
  for (const [k, v] of Object.entries(disk)) if (done[k] === undefined || (done[k] === '' && v)) done[k] = v;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(done));
  fs.renameSync(tmp, file);
}

function clean(text) {
  let t = text.replace(/\s+/g, ' ').replace(/\(\s*[;,]?\s*\)/g, '').replace(/ ,/g, ',').trim();
  if (t.length > 420) {
    const cut = t.slice(0, 420);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.) '));
    t = stop > 140 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
  }
  return t;
}

// Three polite workers; progress is saved as it goes so the step can be stopped and resumed.
const batches = [];
for (let i = 0; i < todo.length; i += 20) batches.push(todo.slice(i, i + 20));
let finished = 0;
let lastSave = 0;
await pool(batches, Number(process.env.WORKERS) || 2, async (batch) => {
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '2', exlimit: '20', titles: batch.map((e) => e.title).join('|') });
  try {
    const j = await fetchJSON(`https://en.wikipedia.org/w/api.php?${params}`);
    const q = j.query || {};
    const alias = new Map();
    for (const n of q.normalized || []) alias.set(n.from, n.to);
    for (const r of q.redirects || []) alias.set(r.from, r.to);
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const e of batch) {
      let t = e.title;
      for (let k = 0; k < 4 && alias.has(t); k++) t = alias.get(t);
      const p = pages.get(t);
      done[e.id] = p && p.extract ? clean(p.extract) : '';
    }
  } catch (err) {
    console.error(`batch failed: ${err.message}`);
    await sleep(5000);
  }
  finished += batch.length;
  if (finished - lastSave >= 1200) {
    lastSave = finished;
    save();
    console.log(`${finished}/${todo.length}`);
  }
  await sleep(60);
});
save();

// Write the share-alike text into its own tree, chunked the same way as the event details.
const hashId = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 256;
};
const chunks = Array.from({ length: 256 }, () => ({}));
let n = 0;
for (const e of all) {
  if (!done[e.id]) continue;
  chunks[hashId(e.id)][e.id] = done[e.id];
  n++;
}
const out = ensureDir(path.join(DATA, 'wikipedia', 'extracts'));
chunks.forEach((c, i) => writeJSON(path.join(out, `${i.toString(16).padStart(2, '0')}.json`), c));
writeJSON(path.join(DATA, 'wikipedia', 'ATTRIBUTION.json'), { text: 'Lead sentences from English Wikipedia articles, by Wikipedia contributors.', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: 'https://en.wikipedia.org/', retrieved: new Date().toISOString().slice(0, 10), note: 'Each extract is shown with a link to its article, whose history lists the authors.' });
console.log(`extracts written for ${n} events`);
