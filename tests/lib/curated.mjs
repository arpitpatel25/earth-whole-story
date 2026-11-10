// Every curated record in the deployed site, in one flat list: { id, kind, text, kid, sources: [{ title, url }] }.
// The audits (sources, links, facts, Kid text) all read the shipped JSON through this one function.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const D = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', 'curated', f), 'utf8'));
const wiki = (t) => ({ title: t, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`, publisher: 'Wikipedia' });
const join = (v) => [].concat(v || []).join(' ').trim();

export function allCurated() {
  const out = [];
  const add = (kind, id, text, kid, sources, extra = {}) => out.push({ kind, id, text: join(text), kid: join(kid), sources: (sources || []).filter(Boolean), ...extra });
  for (const s of D('stories/index.json')) {
    const full = D(`stories/${s.id}.json`);
    let carried = full.sources || [];
    for (const sc of full.scenes) {
      // a scene without its own source line continues the previous scene's sources (the authoring format allows this)
      if (sc.sources && sc.sources.length) carried = sc.sources;
      add('story scene', `${s.id}/${sc.id}`, sc.text, sc.kid, sc.sources && sc.sources.length ? sc.sources : carried, { own: !!(sc.sources && sc.sources.length) });
    }
  }
  for (const t of D('trails.json')) for (const sp of t.stops) add('trail stop', `${t.id}/${sp.id}`, sp.text, sp.kid, sp.sources);
  const eras = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'generated', 'eras.json'), 'utf8'));
  for (const e of eras) if (e.summary) add('era', e.id, [e.summary, ...(e.body || [])], [e.kidSummary, ...(e.kidBody || [])], e.sources);
  const india = D('india/index.json');
  for (const e of india.eras) add('India era', e.id, e.summary, e.kidSummary, e.sources);
  for (const [id, c] of Object.entries(D('india/cells.json'))) add(c.thin ? 'India cell (thin)' : 'India cell', id, c.text, c.kid, c.sources, { thin: !!c.thin });
  // an event taken over from the automatic layer also cites its Wikidata item, where its date and place come from (as the site shows)
  for (const e of D('india/events.json')) add('India event', e.id, e.s, e.k, [...e.src.map(wiki), e.q ? { title: `Wikidata: ${e.t} (${e.id})`, url: `https://www.wikidata.org/wiki/${e.id}`, publisher: 'Wikidata' } : null], { title: e.t });
  for (const p of D('india/people.json')) add('India biography', p.id, p.s, p.k, p.src.map(wiki), { title: p.n });
  for (const s of D('india/states.json')) add('India state', s.id, s.text, s.kid, s.sources);
  for (const m of D('models.json')) { add('3D scene', m.id, m.summary, m.kidSummary, m.sources); for (const p of m.parts) add('3D part', `${m.id}.${p.id}`, p.text, p.kid, p.sources); }
  for (const w of D('wide.json')) { add('multi-region event', w.id, w.summary, w.kidSummary, w.sources); for (const v of w.views) add('region view', `${w.id}.${v.id}`, v.text, v.kid, v.sources); }
  return out;
}

/** A small deterministic random generator, so that a sample can be drawn again. */
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function sample(list, n, seed) { const r = rng(seed); const a = list.slice(); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; }
