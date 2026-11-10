// Step 06a: check every Wikidata class id in events-classes.mjs against its live label, so a mistyped
// id can never mislabel a whole class of events. Prints key, id, live label and description.
import { CLASSES } from './events-classes.mjs';
import { fetchJSON } from './lib/util.mjs';

const ids = [...new Set(CLASSES.map((c) => c.q))];
const info = {};
for (let i = 0; i < ids.length; i += 45) {
  const batch = ids.slice(i, i + 45);
  const j = await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|descriptions&languages=en&ids=${batch.join('|')}`);
  for (const [id, e] of Object.entries(j.entities)) info[id] = { label: e.labels?.en?.value || '(none)', desc: e.descriptions?.en?.value || '' };
}
const seen = new Set();
for (const c of CLASSES) {
  if (seen.has(c.q)) continue;
  seen.add(c.q);
  console.log(`${c.key.padEnd(22)} ${c.q.padEnd(10)} ${info[c.q].label.padEnd(34)} ${info[c.q].desc.slice(0, 70)}`);
}
