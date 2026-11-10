// Acceptance test 16: no placeholder text anywhere. Scans the deployed site, the authored content and the source
// for lorem ipsum, TODO, TBD, FIXME, "coming soon" and the like, and checks curated records for empty fields.
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, ROOT } from './lib/curated.mjs';

// Text quoted from Wikipedia and titles from open databases legitimately contain phrases such as "under construction"
// or "XXX Corps", so those folders are checked only for the unambiguous markers.
const QUOTED = /site\/data\/(wikipedia|events|countries|search|life|geo)\//;
const MARKERS = [/\blorem ipsum\b/i, /\bTODO\b/, /\bFIXME\b/, /\bTBD\b/];
const WORDS = [/\blorem\b/i, /\bipsum\b/i, /\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /\bXXX\b/, /coming soon/i, /under construction/i, /to be (written|added|done|filled)/i, /placeholder (text|content|copy)/i, /\bmock data\b/i, /\bdummy (text|data)\b/i, /\bstub(bed)?\b(?! ?(axle|wing))/i];
const TEXT = /\.(html|js|mjs|css|json|md|txt|psv|svg)$/;
const SKIP = /node_modules|\.git\/|data-raw|\.cache|\.venv|tests\/screenshots|tests\/results|site\/tiles|site\/tex|orch\/|logs\//;
const hits = [];
let files = 0;
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (SKIP.test(p)) continue;
    if (f.isDirectory()) walk(p);
    else if (TEXT.test(f.name)) {
      const text = fs.readFileSync(p, 'utf8');
      files++;
      for (const re of QUOTED.test(p) ? MARKERS : WORDS) {
        const m = re.exec(text);
        if (!m) continue;
        const at = Math.max(0, m.index - 60);
        hits.push(`${path.relative(ROOT, p)}: "${text.slice(at, m.index + 60).replace(/\s+/g, ' ')}"`);
      }
    }
  }
}
for (const d of ['site', 'content', 'src']) walk(path.join(ROOT, d));
// the scan itself and the specification name these words; they are not shipped
const real = hits.filter((h) => !/^tests\//.test(h));

// empty fields in curated records
const empty = [];
for (const r of allCurated()) {
  if (r.text.length < 25) empty.push(`${r.kind} ${r.id}: text is ${r.text.length} characters`);
  if (r.kid.length < 15) empty.push(`${r.kind} ${r.id}: Kid text is ${r.kid.length} characters`);
  if (/\bNaN\b|\[object |^(undefined|null)$|undefined undefined|: undefined|null null/.test(`${r.text} ${r.kid}`)) empty.push(`${r.kind} ${r.id}: a broken value in the text`);
}
// automatic events: every row has a title, a date and a place
let rows = 0;
const evDir = path.join(ROOT, 'site', 'data', 'events');
for (const b of fs.readdirSync(evDir).filter((d) => /^b\d+$/.test(d))) {
  for (const f of fs.readdirSync(path.join(evDir, b))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(evDir, b, f), 'utf8'))) {
      rows++;
      if (!r[1] || !String(r[1]).trim() || !Number.isFinite(r[2]) || !Number.isFinite(r[3]) || !Number.isFinite(r[4])) empty.push(`event ${r[0]} in ${b}/${f}: incomplete row`);
    }
  }
}
console.log(`scanned ${files} text files and ${rows.toLocaleString('en-US')} event rows`);
if (real.length) console.log(`placeholder words found (${real.length}):\n  ${real.slice(0, 30).join('\n  ')}`);
if (empty.length) console.log(`empty or broken fields (${empty.length}):\n  ${empty.slice(0, 30).join('\n  ')}`);
const pass = !real.length && !empty.length;
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'placeholders.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass, files, rows, hits: real, empty }, null, 2));
console.log(pass ? 'No placeholder text and no empty fields.' : 'FAILED');
process.exit(pass ? 0 : 1);
