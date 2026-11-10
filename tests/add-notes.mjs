// Records hand readings for the fact audit. Input: a JSON file { "<kind>|<id>|<text or kid>": "ok: why the source supports
// the claim, quoting it" }. Each note is stored in tests/fact-audit-notes.json together with the exact wording of the
// claim as it stands now; if the claim is edited later, the note stops applying and the claim must be read again.
// Usage: node tests/add-notes.mjs notes.json
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, ROOT } from './lib/curated.mjs';

const file = path.join(ROOT, 'tests', 'fact-audit-notes.json');
const notes = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const recs = new Map(allCurated().map((c) => [`${c.kind}|${c.id}`, c]));
let n = 0;
for (const [key, note] of Object.entries(add)) {
  if (!note.startsWith('ok:')) throw new Error(`the note for ${key} must start with "ok:"`);
  const [kind, id, which] = key.split('|');
  const rec = recs.get(`${kind}|${id}`);
  if (!rec || !rec[which]) throw new Error(`no curated claim for ${key}`);
  notes[key] = { claim: rec[which], note };
  n++;
}
fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(notes).sort(([a], [b]) => a.localeCompare(b))), null, 1));
console.log(`${n} notes recorded; ${Object.keys(notes).length} in all`);
