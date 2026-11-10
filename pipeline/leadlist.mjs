// Research helper: compact retrieved leads for a list of Wikipedia titles (one line each).
//   node pipeline/leadlist.mjs [--chars 230] "Title A" "Title B" ...     or   --file list.txt (one title per line)
// Prints: resolved title | lat,lon (if the article has coordinates) | lead with bracketed asides removed.
import fs from 'node:fs';
import { getLeads } from './lib/wiki.mjs';

const args = process.argv.slice(2);
let chars = 230;
let people = false;
let titles = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--chars') chars = Number(args[++i]);
  else if (args[i] === '--people') people = true;
  else if (args[i] === '--file') titles.push(...fs.readFileSync(args[++i], 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
  else titles.push(args[i]);
}
const leads = await getLeads(titles);
for (const t of titles) {
  const l = leads.get(t);
  if (!l || l.missing) {
    console.log(`!! MISSING | ${t}`);
    continue;
  }
  const text = (l.extract || '').replace(/\s*\([^()]*(\([^()]*\)[^()]*)*\)/g, '').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  const c = l.coord ? `${l.coord.lat.toFixed(2)},${l.coord.lon.toFixed(2)}` : '-';
  if (people) {
    // a life needs its dates (kept from the first bracket) and, if the lead gives one, a place of birth
    const raw = (l.extract || '').replace(/\s+/g, ' ');
    const m = /\(([^()]*\d{3,4}[^()]*)\)/.exec(raw.slice(0, 400));
    const dates = m ? m[1].replace(/[^;]*;\s*/g, (x) => (/\d{3,4}/.test(x) ? x : '')).slice(0, 70) : '?';
    const born = text.split(/(?<=[.!?])\s+/).find((x) => /\b[Bb]orn (in|at|into|to|on)\b|\bnative of\b|\bwas from\b/.test(x));
    let out = text.slice(0, chars);
    if (born && !out.includes(born.slice(0, 40))) out += ` […] ${born.slice(0, 150)}`;
    console.log(`${l.title === t ? t : `${t} => ${l.title}`} | [${dates}] | ${out}`);
    continue;
  }
  let shown = text.slice(0, chars);
  // a record needs a date: if the opening lines carry none, add the first later sentence that does
  const hasDate = (x) => /\b(1\d{3}|20\d{2}|\d{1,4} (BCE|BC|CE|AD)|\d{1,2}(st|nd|rd|th)[- ]century)\b/.test(x);
  if (!hasDate(shown)) {
    const later = text.slice(chars).split(/(?<=[.!?])\s+/).find(hasDate);
    if (later) shown += ` […] ${later.slice(0, 190)}`;
  }
  console.log(`${l.title === t ? t : `${t} => ${l.title}`} | ${c} | ${shown}`);
}
