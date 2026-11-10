// Research helper: print the retrieved lead of many Wikipedia articles, compactly.
// Usage: node pipeline/leads.mjs [--chars 500] [--file titles.txt] "Title one" "Title two" ...
import fs from 'node:fs';
import { getLeads } from './lib/wiki.mjs';

const args = process.argv.slice(2);
let chars = 500;
const titles = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--chars') chars = Number(args[++i]);
  else if (args[i] === '--file') titles.push(...fs.readFileSync(args[++i], 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
  else titles.push(args[i]);
}
const leads = await getLeads(titles);
for (const t of titles) {
  const a = leads.get(t);
  if (!a || a.missing) {
    console.log(`## ${t} :: MISSING\n`);
    continue;
  }
  const head = [a.title !== t ? `-> ${a.title}` : null, a.wikidata, a.coord ? `${a.coord.lat.toFixed(2)},${a.coord.lon.toFixed(2)}` : null].filter(Boolean).join(' | ');
  console.log(`## ${t} :: ${head}\n${a.extract.replace(/\s+/g, ' ').slice(0, chars)}\n`);
}
