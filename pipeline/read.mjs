// Research helper: retrieve Wikipedia articles and print the text, so curated writing is done from
// what the source actually says.
// Usage:
//   node pipeline/read.mjs "Sturtian glaciation" "Marinoan glaciation"        (leads)
//   node pipeline/read.mjs --full "Bengal famine of 1943" --grep "million" --chars 3000
import { getArticle } from './lib/wiki.mjs';

const args = process.argv.slice(2);
let full = false;
let chars = 1200;
let grep = null;
const titles = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--full') full = true;
  else if (args[i] === '--chars') chars = Number(args[++i]);
  else if (args[i] === '--grep') grep = new RegExp(args[++i], 'i');
  else titles.push(args[i]);
}
for (const t of titles) {
  const a = await getArticle(t, { full });
  if (a.missing) {
    console.log(`### ${t}: MISSING`);
    continue;
  }
  console.log(`### ${a.title} | ${a.wikidata || ''} | ${a.coord ? `${a.coord.lat.toFixed(3)},${a.coord.lon.toFixed(3)}` : 'no-coord'} | ${a.url}`);
  if (grep) {
    const sentences = a.extract.split(/(?<=[.!?])\s+|\n+/).filter((s) => grep.test(s));
    console.log(sentences.join('\n').slice(0, chars));
  } else console.log(a.extract.slice(0, chars));
  console.log();
}
