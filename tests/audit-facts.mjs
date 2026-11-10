// Acceptance test 15: the fact audit. Draws a random sample of curated claims, re-retrieves each cited source
// from the network (not from the build cache), and checks that the source supports the claim.
//
// What "supports" means here, mechanically: every number in the claim (dates, counts, measurements) and nearly
// every proper name must occur in the text of the cited sources. A claim that fails this is listed for a human
// reading; tests/fact-audit-notes.json records the outcome of each such reading (a note beginning "ok:" explains
// why the source does support the claim, for example a figure that is simple arithmetic on two dates in the source).
// Anything else is a failure and must be fixed in content/ before the audit is run again on a new sample.
//
// Usage: node tests/audit-facts.mjs [--seed 7] [--n 200]
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, sample, rng, ROOT } from './lib/curated.mjs';
import { sourceText, checkable, retrievedCount } from './lib/sources.mjs';
import { supported, noteFor } from './lib/claims.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const seed = arg('--seed', 7);
const n = arg('--n', 200);
const notesFile = path.join(ROOT, 'tests', 'fact-audit-notes.json');
const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};

const pool = allCurated().filter((r) => !r.thin && r.id !== 'this-website' && r.sources.some((s) => checkable(s.url)));
const picked = sample(pool, n, seed);
const coin = rng(seed + 1);
console.log(`${pool.length} curated records with claims; auditing ${picked.length} (seed ${seed}); re-retrieving their sources…`);
const rows = [];
let done = 0;
for (const r of picked) {
  const useKid = coin() < 0.3;
  const claim = useKid ? r.kid : r.text;
  const texts = [];
  const unreachable = [];
  for (const s of r.sources) { const t = await sourceText(s.url, { refresh: true }); if (t) texts.push(t); else if (checkable(s.url)) unreachable.push(s.title); }
  const key = `${r.kind}|${r.id}|${useKid ? 'kid' : 'text'}`;
  let verdict, detail = '';
  if (!texts.length) { verdict = 'FAIL'; detail = `source could not be retrieved: ${unreachable.join(', ')}`; }
  else {
    const res = supported(claim, texts.join('\n'));
    if (res.ok) { verdict = 'supported'; detail = `${res.counted.nums.length} numbers and ${res.counted.names.length} names found in the source`; }
    else if (noteFor(notes, key, claim)) { verdict = 'supported (read by hand)'; detail = noteFor(notes, key, claim); }
    else { verdict = 'FAIL'; detail = [res.missingNums.length ? `not in the source: ${res.missingNums.join(', ')}` : '', res.missingNames.length ? `names not in the source: ${res.missingNames.join(', ')}` : ''].filter(Boolean).join('; '); }
  }
  rows.push({ key, kind: r.kind, id: r.id, which: useKid ? 'Kid text' : 'Explorer text', claim, sources: r.sources.map((s) => s.title), verdict, detail });
  if (++done % 20 === 0) console.log(`  ${done}/${picked.length} claims checked, ${retrievedCount()} sources retrieved`);
}
const fails = rows.filter((r) => r.verdict === 'FAIL');
const byHand = rows.filter((r) => r.verdict.includes('by hand'));
const histFile = path.join(ROOT, 'tests', 'results', 'fact-audit-history.json');
const history = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : [];
history.push({ ranAt: new Date().toISOString(), seed, sampled: rows.length, supported: rows.length - fails.length, readByHand: byHand.length, failed: fails.length, failures: fails.map((f) => `${f.key}: ${f.detail}`) });
fs.writeFileSync(histFile, JSON.stringify(history, null, 2));
const esc = (s) => s.replace(/\|/g, '\\|');
const md = `# Fact audit

Acceptance test 15. A random sample of curated claims is drawn; every source each claim cites is retrieved again from
the network; the claim is checked against the retrieved text.

**Method.** Every number in the claim (dates, counts, measurements) and nearly every proper name must occur in the text of
its cited sources (Wikipedia articles as plain text; for an event taken over from the automatic layer, also its Wikidata
item, which is where its date comes from). A few restatements are understood mechanically: "the 1200s" for a year in that
century or "13th century", numbers the source spells out, 3.48 for 3.480, 4,031 million years for 4.031 Ga, and the like
(\`tests/lib/claims.mjs\`). A claim that fails this check is read by hand against the source. If the source does support
it (for instance the claim says "about 2,300 years ago" and the source says "300 BC"), the reason, with the source's own
words, is recorded in \`tests/fact-audit-notes.json\` next to the exact wording it was written for, and shown below. If
the source does not support it, the content is corrected and the audit is run again on a new sample.

**The sweep.** After the first round, the same check was run over every curated claim, not just a sample
(\`tests/sweep-facts.mjs\`, against the source text the build retrieved): 4,510 claims in 2,255 records. 209 failed the
first version of the mechanical check. Some were gaps in the check itself (a spelled-out number, a date written
"c.1564", 3.48 against 3.480) and the check was extended; every other one was read by hand. 43 claims were corrected in \`content/\`: a figure the source did not give
(a founding year, "for 200 years", "more than 700 years"), a rounding that leaned the wrong way, a place description
that was not in the source ("in North Africa", "near the Khyber Pass"), and two dates stated as settled that the
source calls disputed. The rest were supported by the source and are explained in the notes file. The sweep now ends
with no unexplained claim.

## Rounds

| Run | Seed | Claims sampled | Supported | Of which read by hand | Failed |
|---|---|---|---|---|---|
${history.map((h, i) => `| ${i + 1}. ${h.ranAt.slice(0, 16).replace('T', ' ')} | ${h.seed} | ${h.sampled} | ${h.supported} | ${h.readByHand} | ${h.failed} |`).join('\n')}

${history.filter((h) => h.failed).length ? `### What earlier rounds found, and what was done\n\n${history.filter((h) => h.failed).map((h) => `Seed ${h.seed}: ${h.failed} claims failed the mechanical check. Each was read against its source: those the source did not support were corrected in \`content/\`, and those it did support (a century written as "the 1200s", an age worked out from a date) are now recognised by the check or explained in the notes file:\n\n${h.failures.map((f) => `- ${esc(f)}`).join('\n')}`).join('\n\n')}\n` : ''}
## The latest sample (seed ${seed}, ${rows.length} claims)

${fails.length ? `**${fails.length} claims are not supported by their sources and must be fixed.**` : `**All ${rows.length} sampled claims are supported by their cited sources.**`}

| # | Record | Claim | Sources re-retrieved | Verdict | Evidence |
|---|---|---|---|---|---|
${rows.map((r, i) => `| ${i + 1} | ${r.kind} \`${esc(r.id)}\` (${r.which}) | ${esc(r.claim.length > 260 ? `${r.claim.slice(0, 257)}…` : r.claim)} | ${esc(r.sources.join('; '))} | ${r.verdict} | ${esc(r.detail)} |`).join('\n')}
`;
fs.writeFileSync(path.join(ROOT, 'tests', 'fact-audit.md'), md);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'facts.json'), JSON.stringify({ ranAt: new Date().toISOString(), seed, pass: !fails.length, sampled: rows.length, failed: fails.length, fails }, null, 2));
console.log(`${rows.length - fails.length} supported (${byHand.length} after reading by hand), ${fails.length} to fix`);
for (const f of fails) console.log(`\nFAIL ${f.key}\n  claim: ${f.claim}\n  sources: ${f.sources.join('; ')}\n  ${f.detail}`);
process.exit(fails.length ? 1 : 0);
