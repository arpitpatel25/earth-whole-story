// Research helper: look up Wikidata ids by name. Usage: node pipeline/wdsearch.mjs "coal mine" "gurdwara"
import { fetchJSON, sleep } from './lib/util.mjs';
for (const term of process.argv.slice(2)) {
  const j = await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=4&search=${encodeURIComponent(term)}`);
  console.log(`# ${term}`);
  for (const r of j.search || []) console.log(`   ${r.id.padEnd(11)} ${r.label} | ${(r.description || '').slice(0, 80)}`);
  await sleep(80);
}
