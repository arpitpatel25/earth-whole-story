// Applies exact text replacements to content/. Input: a JSON list of [from, to] pairs; each "from" must match exactly
// once across content/, or nothing is written.   Usage: node pipeline/edit-content.mjs edits.json [--partial]
import fs from 'node:fs';
import path from 'node:path';
const edits = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(txt|psv|json|md)$/.test(f)) files.push(p); } };
walk('content');
const text = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
let bad = 0;
for (const [from, to] of edits) {
  const hits = files.filter((f) => text.get(f).includes(from));
  const count = hits.reduce((n, f) => n + text.get(f).split(from).length - 1, 0);
  if (count !== 1) { console.log(`!! ${count} matches for: ${from.slice(0, 90)}`); bad++; continue; }
  text.set(hits[0], text.get(hits[0]).replace(from, () => to));
  console.log(`ok ${path.relative('content', hits[0])}: ${to.slice(0, 70)}`);
}
if (bad && !process.argv.includes('--partial')) { console.log(`${bad} edits did not apply; nothing written`); process.exit(1); }
for (const [f, t] of text) if (t !== fs.readFileSync(f, 'utf8')) fs.writeFileSync(f, t);
