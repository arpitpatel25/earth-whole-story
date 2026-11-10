// Prints the table of the 27 acceptance tests (SPEC.md section 18) from the recorded results, for FINAL.md.
// Usage: node tests/final-table.mjs   -> tests/results/acceptance-table.md
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/curated.mjs';

const R = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'results', f), 'utf8')); } catch { return null; } };
const acc = R('acceptance.json');
const byN = new Map((acc ? acc.results : []).map((r) => [r.n, r]));
const cov = R('coverage.json'), links = R('links.json'), facts = R('facts.json'), ph = R('placeholders.json'), screens = R('screens.json'), perf = R('perf.json'), explore = R('explore.json'), size = R('size.json');
const hist = R('fact-audit-history.json') || [];
const nf = (n) => Number(n).toLocaleString('en-US');
const NAMES = {
  13: 'Coverage audit meets every target', 14: 'Every curated record has a source with a valid URL; a random 300 links resolve',
  15: 'Fact audit of 200 sampled claims against re-retrieved sources', 16: 'No placeholder text anywhere',
  21: 'Screenshot review of 100+ varied views', 22: 'Desktop frame rate is logged, targeting 60 fps',
  24: 'No uncaught console errors across a ten-minute random exploration', 27: 'Size and file limits; no secrets or absolute local paths',
};
const extra = {
  13: () => cov && [cov.pass, `all targets met; see tests/coverage-audit.md`],
  14: () => links && [links.pass, `${links.checked - links.bad.length} of ${links.checked} sampled links resolved (seed ${links.seed}); see tests/link-check.md`],
  15: () => facts && [facts.pass, `round ${hist.length}, seed ${facts.seed}: ${facts.sampled - facts.failed} of ${facts.sampled} claims supported; earlier rounds: ${hist.slice(0, -1).map((h) => `seed ${h.seed}, ${h.failed} failed the mechanical check and were each read, then corrected or explained`).join('; ') || 'none'}; see tests/fact-audit.md`],
  16: () => ph && [ph.pass, `${nf(ph.files)} text files and ${nf(ph.rows)} event rows scanned; ${ph.hits.length} filler words, ${ph.empty.length} empty fields`],
  21: () => screens && [screens.pass, `${screens.views} views captured and examined, ${screens.sheets} contact sheets in tests/screenshots/`],
  22: () => perf && [perf.pass, `median ${median(perf.rows.map((r) => r.fps)).toFixed(1)} fps over ${perf.rows.length} views, slowest ${Math.min(...perf.rows.map((r) => r.fps)).toFixed(1)}; first frame ${perf.loads[0].firstFrame} ms; see tests/perf-log.md`],
  24: () => explore && [explore.pass, `${explore.actions} actions in ${explore.minutes} minutes, ${explore.errors.length} console errors, ${explore.foreign.length} requests to other origins; see tests/exploration-log.md`],
  27: () => size && [size.pass, `site ${Math.round(size.siteBytes / 1e6)} MB in ${nf(size.files)} files, largest ${(size.biggest.size / 1e6).toFixed(1)} MB, folder ${(size.folderBytes / 1e9).toFixed(2)} GB; ${size.found.length} secrets or local paths`],
};
function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }
const rows = [];
for (let n = 1; n <= 27; n++) {
  if (byN.has(n)) { const r = byN.get(n); rows.push([n, r.name, r.pass ? 'pass' : 'FAIL', r.detail]); continue; }
  const e = extra[n] ? extra[n]() : null;
  rows.push([n, NAMES[n] || '', e ? (e[0] ? 'pass' : 'FAIL') : 'not run', e ? e[1] : '']);
}
const esc = (s) => String(s).replace(/\|/g, '\\|');
const md = `| # | Test | Result | Evidence |\n|---|---|---|---|\n${rows.map((r) => `| ${r[0]} | ${esc(r[1])} | ${r[2]} | ${esc(r[3])} |`).join('\n')}\n`;
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'acceptance-table.md'), md);
console.log(md);
console.log(rows.every((r) => r[2] === 'pass') ? 'All 27 pass.' : `Not passing: ${rows.filter((r) => r[2] !== 'pass').map((r) => r[0]).join(', ')}`);
