// Research helper: pull the sentences that match a pattern out of full Wikipedia articles.
// Usage: node pipeline/facts.mjs [--chars 500] "Article title :: regex" "Another :: regex" ...
import { getArticle } from './lib/wiki.mjs';

const args = process.argv.slice(2);
let chars = 500;
const jobs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--chars') chars = Number(args[++i]);
  else jobs.push(args[i]);
}
for (const job of jobs) {
  const [title, pattern] = job.split('::').map((s) => s.trim());
  const a = await getArticle(title, { full: true });
  if (a.missing) {
    console.log(`## ${title} :: MISSING\n`);
    continue;
  }
  const re = new RegExp(pattern || '.', 'i');
  const hits = a.extract.split(/(?<=[.!?])\s+(?=[A-Z"“(])|\n+/).filter((s) => re.test(s) && s.length > 30);
  console.log(`## ${a.title}${a.coord ? ` [${a.coord.lat.toFixed(2)},${a.coord.lon.toFixed(2)}]` : ''} :: /${pattern}/\n${hits.join('\n').slice(0, chars)}\n`);
}
