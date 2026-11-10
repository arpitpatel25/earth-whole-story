// A reading aid for the fact sweep: for each claim tests/sweep-facts.mjs flagged, print the passages of its sources
// that bear on the missing figure (near-equal numbers; for "N years ago", the dates and centuries that give that age).
// Usage: node tests/sweep-evidence.mjs [from] [to] [regex on the record key]
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, ROOT } from './lib/curated.mjs';
import { sourceText, qidOf } from './lib/sources.mjs';
const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'results', 'fact-sweep.json'), 'utf8'));
const [from = 0, to = 9999, kindRe = '.'] = process.argv.slice(2);
const recs = new Map(allCurated().map((c) => [`${c.kind}|${c.id}`, c]));
const autoById = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data-raw', 'events', '_all.json'), 'utf8')).map((e) => [e.id, e]));
const leads = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-raw', 'events', 'extracts.json'), 'utf8'));
const NOW = 2026;
const flags = r.flags.filter((f) => new RegExp(kindRe).test(f.key));
let i = 0;
for (const f of flags) {
  i++;
  if (i <= Number(from) || i > Number(to)) continue;
  const [kind, id, which] = f.key.split('|');
  const rec = recs.get(`${kind}|${id}`);
  let text = '';
  for (const s of rec.sources) {
    let t = await sourceText(s.url, { cacheOnly: true });
    if (!t) { const e = autoById.get(rec.id); if (e) t = qidOf(s.url) ? `[wikidata] ${e.title}. ${e.desc}. y=${e.y} m=${e.month} d=${e.day} end=${e.end || ''} loc=${e.loc || ''}` : (leads[rec.id] ? `${e.title}. ${leads[rec.id]}` : ''); }
    if (t) text += `\n${t}`;
  }
  text = text.replace(/\s+/g, ' ');
  console.log(`\n#${i} ${f.key} <${f.sources.join('; ')}> (${text.length} chars)\n  CLAIM: ${f.claim}`);
  const snip = (idx, len = 0) => text.slice(Math.max(0, idx - 110), idx + len + 110).trim();
  for (const v of f.nums || []) {
    const n = Number(v);
    const at = f.claim.replace(/,/g, '').indexOf(v);
    const ctx = f.claim.replace(/,/g, '').slice(Math.max(0, at - 40), at + v.length + 30);
    const out = [];
    const ago = /years ago|years old|year-old|for (about |more than |almost |nearly |over )?\d[\d,]* years|years\b/.test(ctx.slice(ctx.indexOf(v)));
    // 1. near-equal numbers in the source
    for (const m of text.replace(/(\d),(?=\d{3})/g, '$1').matchAll(/\d+(?:\.\d+)?/g)) {
      const x = Number(m[0]);
      if (x && Math.abs(x - n) / n <= 0.035 && out.length < 3) out.push(`≈ "${text.replace(/(\d),(?=\d{3})/g, '$1').slice(Math.max(0, m.index - 90), m.index + 90)}"`);
    }
    if (ago && n >= 60) {
      const cands = [];
      for (const m of text.matchAll(/(\d[\d,]{2,})\s*(BCE|BC)\b/g)) cands.push([NOW + Number(m[1].replace(/,/g, '')), m.index, m[0].length]);
      for (const m of text.matchAll(/(?<![\d,.])(\d{3,4})(?![\d,]|\s*(?:BCE|BC|years|km|m\b|metres|tons|tonnes))/g)) { const y = Number(m[1]); if (y < 2030) cands.push([NOW - y, m.index, m[0].length]); }
      for (const m of text.matchAll(/(\d{1,2})(?:st|nd|rd|th)[ -](century|millennium)( BCE| BC)?/g)) { const k = m[2] === 'century' ? 100 : 1000; const mid = Number(m[1]) * k - k / 2; cands.push([m[3] ? NOW + mid : NOW - mid, m.index, m[0].length]); }
      for (const m of text.matchAll(/(\d[\d,.]*)\s*(million |thousand )?years (ago|old|before present)/g)) cands.push([Number(m[1].replace(/,/g, '')) * (m[2] === 'million ' ? 1e6 : m[2] === 'thousand ' ? 1e3 : 1), m.index, m[0].length]);
      for (const m of text.matchAll(/(\d[\d,.]*)\s*(kya|ka|BP)\b/g)) cands.push([Number(m[1].replace(/,/g, '')) * (m[2] === 'BP' ? 1 : 1000), m.index, m[0].length]);
      const seen = new Set();
      for (const [age, idx, len] of cands.sort((a, b) => Math.abs(a[0] - n) - Math.abs(b[0] - n))) {
        if (Math.abs(age - n) / n > 0.15 || out.length >= 5) break;
        const sn = snip(idx, len); const k = sn.slice(60, 140);
        if (seen.has(k)) continue; seen.add(k);
        out.push(`age ${Math.round(age)}: "${sn}"`);
      }
    }
    console.log(`  [${v}] ctx "${ctx.trim()}"${out.length ? '' : '  -> NO EVIDENCE FOUND'}`);
    for (const o of out) console.log(`      ${o}`);
  }
  for (const nm of f.names || []) {
    const idx = text.toLowerCase().indexOf(nm.toLowerCase().slice(0, 5));
    console.log(`  {${nm}} ${idx >= 0 ? `~ "${snip(idx)}"` : '-> not in source'}`);
  }
}
