// Acceptance test 14 (second half): a random 300 of the source links in curated records must resolve.
// Usage: node tests/audit-links.mjs [--seed 1] [--n 300]
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, sample, ROOT } from './lib/curated.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const seed = arg('--seed', 1);
const n = arg('--n', 300);
const UA = 'EarthWholeStory/1.0 (open educational static site; link check)';
const urls = new Map();
for (const r of allCurated()) for (const s of r.sources) if (/^https:/.test(s.url)) { if (!urls.has(s.url)) urls.set(s.url, []); urls.get(s.url).push(`${r.kind} ${r.id}`); }
// picture credits and chart sources are sources too
for (const f of ['credits.json', 'curated/charts.json']) {
  const p = path.join(ROOT, 'site', 'data', f);
  if (!fs.existsSync(p)) continue;
  JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')), (k, v) => { if (k === 'url' && typeof v === 'string' && /^https:/.test(v)) { if (!urls.has(v)) urls.set(v, []); urls.get(v).push(f); } return v; });
}
const all = [...urls.keys()].sort();
const picked = sample(all, n, seed);
console.log(`${all.length} distinct source links in curated records; checking ${picked.length} (seed ${seed})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function check(url) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' }, signal: ctl.signal });
      clearTimeout(t);
      // a refusal for being too fast is waited out for as long as the server asks
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(90, Number(r.headers.get('retry-after')) || 5 * (attempt + 1)) * 1000 + 500); continue; }
      let note = '';
      if (r.ok && /wikipedia\.org\/wiki\//.test(url)) { const body = await r.text(); if (/Wikipedia does not have an article with this exact name/.test(body)) return { ok: false, status: 'no such article' }; note = r.url !== url ? 'redirected' : ''; }
      return { ok: r.ok, status: r.status, note };
    } catch (e) {
      if (attempt === 7) return { ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message };
      await sleep(2000);
    }
  }
  return { ok: false, status: 'gave up after retries' };
}
const results = [];
let i = 0;
async function worker() { while (i < picked.length) { const url = picked[i++]; const r = await check(url); results.push({ url, ...r, usedBy: urls.get(url).slice(0, 3) }); if (results.length % 50 === 0) console.log(`  ${results.length}/${picked.length}`); await sleep(400); } }
await Promise.all([worker(), worker()]); // two at a time is plenty, and polite
const bad = results.filter((r) => !r.ok);
const hosts = {};
for (const r of results) { const h = new URL(r.url).host; hosts[h] = (hosts[h] || 0) + 1; }
const md = `# Link check\n\nRun on ${new Date().toISOString().slice(0, 10)} by \`node tests/audit-links.mjs --seed ${seed}\`.\n\n- Distinct source links in curated records: ${all.length}\n- Checked (random sample, seed ${seed}): ${results.length}\n- Resolved: ${results.length - bad.length}\n- Failed: ${bad.length}\n- Hosts: ${Object.entries(hosts).map(([h, c]) => `${h} ${c}`).join(', ')}\n\n${bad.length ? `## Failures\n\n${bad.map((b) => `- ${b.url} (${b.status}); used by ${b.usedBy.join(', ')}`).join('\n')}\n` : 'Every sampled link resolved.\n'}`;
fs.writeFileSync(path.join(ROOT, 'tests', 'link-check.md'), md);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'links.json'), JSON.stringify({ ranAt: new Date().toISOString(), seed, checked: results.length, pass: !bad.length, bad }, null, 2));
console.log(bad.length ? `${bad.length} links failed:\n  ${bad.slice(0, 20).map((b) => `${b.url} (${b.status}) used by ${b.usedBy[0]}`).join('\n  ')}` : `All ${results.length} sampled links resolve.`);
process.exit(bad.length ? 1 : 0);
