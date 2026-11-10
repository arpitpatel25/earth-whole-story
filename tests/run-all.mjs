// Runs the tests and audits and writes tests/results/summary.md.
//
//   node tests/run-all.mjs                       every suite, in order
//   node tests/run-all.mjs --only links,facts    just these (the others keep their last recorded result)
//   node tests/run-all.mjs --skip explore        all but these
//   node tests/run-all.mjs --facts-seed 13       the seed for the fact audit's sample (a new sample each round)
//   node tests/run-all.mjs --summary             only rewrite the summary from the recorded results
//
// Each suite's last result is kept in tests/results/steps.json together with a fingerprint of what it ran against:
// the curated data for the audits that read only data (coverage, links, facts), the whole build (app bundle, page and
// curated data) for everything else. The summary marks a result "stale" if that has changed since, so a pass can
// never be carried over silently from an older build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/curated.mjs';

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : '');
const list = (k) => new Set(arg(k).split(',').filter(Boolean));
const only = list('--only');
const skip = list('--skip');
const seed = arg('--facts-seed');
const steps = [
  ['coverage', 'Coverage audit (13, and sources for 14)', ['tests/audit-coverage.mjs'], 'data'],
  ['placeholders', 'No placeholder text (16)', ['tests/scan-placeholders.mjs']],
  ['size', 'Size limits, no secrets or local paths (27)', ['tests/check-size.mjs']],
  ['acceptance', 'Browser acceptance tests (1-12, 17-20, 23, 25, 26)', ['tests/acceptance.mjs']],
  ['perf', 'First view and frame rate (22)', ['tests/perf.mjs']],
  ['screens', 'Screenshot review set (21)', ['tests/screens.mjs']],
  ['links', 'Source links resolve (14)', ['tests/audit-links.mjs'], 'data'],
  ['facts', 'Fact audit (15)', ['tests/audit-facts.mjs', ...(seed ? ['--seed', seed] : [])], 'data'],
  ['explore', 'Ten-minute random exploration (24)', ['tests/explore.mjs']],
  ['subpath', 'Works when served from a sub-folder (beyond the spec)', ['tests/subpath.mjs']],
  ['music', 'Music on by default, its control, moods, levels, capture mode (owner review)', ['tests/music.mjs']],
];

function fingerprint(scope = 'all') {
  const h = crypto.createHash('sha1');
  const add = (p) => { if (fs.existsSync(p)) h.update(fs.readFileSync(p)); };
  const assets = path.join(ROOT, 'site', 'assets');
  const sub = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) sub(p); else if (/\.(js|css)$/.test(f)) add(p); } };
  if (scope === 'all') sub(assets);
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.json')) add(p); } };
  walk(path.join(ROOT, 'site', 'data', 'curated'));
  add(path.join(ROOT, 'src', 'generated', 'eras.json'));
  if (scope === 'all') add(path.join(ROOT, 'site', 'index.html'));
  return h.digest('hex').slice(0, 10);
}

const file = path.join(ROOT, 'tests', 'results', 'steps.json');
const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
if (!process.argv.includes('--summary')) {
  for (const [key, label, cmd, scope = 'all'] of steps) {
    if (skip.has(key) || (only.size && !only.has(key))) continue;
    const t0 = Date.now();
    const build = fingerprint(scope);
    console.log(`\n=== ${label}`);
    const r = spawnSync(process.execPath, cmd, { cwd: ROOT, stdio: 'inherit' });
    // read the file again before writing, so that two runs of different suites at the same time keep each other's results
    if (fs.existsSync(file)) Object.assign(record, JSON.parse(fs.readFileSync(file, 'utf8')));
    record[key] = { result: r.status === 0 ? 'pass' : 'FAIL', seconds: Math.round((Date.now() - t0) / 1000), ranAt: new Date().toISOString(), build };
    fs.writeFileSync(file, JSON.stringify(record, null, 1));
  }
}
if (fs.existsSync(file)) Object.assign(record, JSON.parse(fs.readFileSync(file, 'utf8')));
const now = fingerprint();
const rows = steps.map(([key, label, , scope = 'all']) => {
  const r = record[key];
  if (!r) return [label, 'not run', '', ''];
  return [label, r.build === fingerprint(scope) ? r.result : `${r.result} (stale: ran against ${scope === 'data' ? 'data' : 'build'} ${r.build})`, `${r.seconds} s`, r.ranAt.slice(0, 16).replace('T', ' ')];
});
const ok = rows.every((r) => r[1] === 'pass');
const md = `# Test summary

Written ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node tests/run-all.mjs\`. Build fingerprint: \`${now}\` (curated data: \`${fingerprint('data')}\`).
${ok ? 'Every suite passes against this build.' : 'Not every suite has passed against this build.'}

| Suite | Result | Time | Ran (UTC) |
|---|---|---|---|
${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}

The numbers in brackets are the acceptance tests of SPEC.md section 18. Details: \`tests/results/acceptance.json\`,
\`tests/coverage-audit.md\`, \`tests/link-check.md\`, \`tests/fact-audit.md\`, \`tests/perf-log.md\`,
\`tests/exploration-log.md\`, \`tests/music-log.md\`, and the contact sheets in \`tests/screenshots/\`.
`;
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'summary.md'), md);
console.log(`\n${md}`);
process.exit(ok ? 0 : 1);
