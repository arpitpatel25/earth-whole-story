// Step 06: harvest dated, located events from Wikidata (CC0), class by class.
// Every class id is checked first by 06a-verify-classes.mjs. Results are cached per query in
// data-raw/wiki/sparql, so the step can be stopped and resumed.
// Usage: node pipeline/06-events-harvest.mjs [key ...]
import fs from 'node:fs';
import path from 'node:path';
import { RAW, ensureDir } from './lib/util.mjs';
import { sparql } from './lib/wiki.mjs';
import { CLASSES } from './events-classes.mjs';

const OUT = ensureDir(path.join(RAW, 'events'));
const only = new Set(process.argv.slice(2));

function coordPattern(kind) {
  switch (kind) {
    case 'direct':
      return '?item wdt:P625 ?coord .';
    case 'location':
      return '?item wdt:P276 ?loc . ?loc wdt:P625 ?coord . FILTER NOT EXISTS { ?item wdt:P625 [] }';
    case 'admin':
      return '?item wdt:P131 ?loc . ?loc wdt:P625 ?coord . FILTER NOT EXISTS { ?item wdt:P625 [] } FILTER NOT EXISTS { ?item wdt:P276 [] }';
    case 'capital':
      return '?item wdt:P36 ?loc . ?loc wdt:P625 ?coord .';
    case 'launch':
      return '?item wdt:P1427|wdt:P448 ?loc . ?loc wdt:P625 ?coord .';
    case 'place':
      return '?item wdt:P291|wdt:P159 ?loc . ?loc wdt:P625 ?coord .';
    default:
      throw new Error(kind);
  }
}

function query(c, coordKind) {
  return `SELECT ?item ?title ?desc ?date ?prec ?end ?coord ?sl ?partOf ?deaths ?locName WHERE {
  ?item wdt:P31 wd:${c.q} ; p:${c.date} ?st .
  ?st a wikibase:BestRank ; psv:${c.date} ?dv .
  ?dv wikibase:timeValue ?date ; wikibase:timePrecision ?prec .
  ${coordPattern(coordKind)}
  ?item wikibase:sitelinks ?sl .
  ${c.minSl ? `FILTER(?sl >= ${c.minSl})` : ''}
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?item wdt:P582 ?end }
  OPTIONAL { ?item wdt:P361 ?partOf }
  OPTIONAL { ?item wdt:P1120 ?deaths }
  ${coordKind === 'direct' ? '' : 'OPTIONAL { ?loc rdfs:label ?locName . FILTER(LANG(?locName) = "en") }'}
}`;
}

const summary = [];
for (const c of CLASSES) {
  if (only.size && !only.has(c.key)) continue;
  // Things that happen (no verb) often have no coordinates of their own; fall back to where they took place.
  const kinds = c.coord ? [c.coord] : c.verb ? ['direct'] : ['direct', 'location', 'admin'];
  for (const kind of kinds) {
    const name = `${c.key}.${c.q}.${c.date}.${kind}`;
    const file = path.join(OUT, `${name}.json`);
    if (fs.existsSync(file)) {
      summary.push([name, JSON.parse(fs.readFileSync(file, 'utf8')).length, 'cached']);
      continue;
    }
    const t0 = Date.now();
    try {
      const rows = await sparql(query(c, kind), { cacheKey: name });
      fs.writeFileSync(file, JSON.stringify(rows));
      summary.push([name, rows.length, `${((Date.now() - t0) / 1000).toFixed(1)}s`]);
      console.log(`${name}: ${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      summary.push([name, 0, `FAILED ${e.message.slice(0, 80)}`]);
      console.log(`${name}: FAILED ${e.message.slice(0, 120)}`);
    }
  }
}
const total = summary.reduce((s, r) => s + r[1], 0);
console.log(`\n${summary.length} queries, ${total} rows, ${summary.filter((r) => String(r[2]).startsWith('FAILED')).length} failed`);
fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 1));
