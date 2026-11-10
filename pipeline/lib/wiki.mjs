// Wikipedia and Wikidata retrieval with an on-disk cache in data-raw/.
// Curated writing is only ever done from text retrieved through here (spec section 10).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAW, ensureDir, fetchJSON, sleep } from './util.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
const CACHE = ensureDir(path.join(RAW, 'wiki'));

function cacheFile(kind, key) {
  const safe = key.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 8);
  return path.join(ensureDir(path.join(CACHE, kind)), `${safe}.${hash}.json`);
}

function readCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function wikiURL(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/**
 * Plain-text article (or just the lead) with page metadata.
 * Returns { title, url, extract, wikidata, coord:{lat,lon}|null, image, missing, retrieved } and caches it.
 */
export async function getArticle(title, { full = true, refresh = false } = {}) {
  const file = cacheFile(full ? 'full' : 'lead', title);
  if (!refresh) {
    const hit = readCache(file);
    if (hit) return hit;
  }
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'extracts|pageprops|coordinates|pageimages|info',
    explaintext: '1',
    exsectionformat: 'plain',
    ppprop: 'wikibase_item',
    piprop: 'name|original',
    inprop: 'url',
    titles: title,
  });
  if (!full) params.set('exintro', '1');
  const json = await fetchJSON(`${API}?${params}`);
  const page = json.query && json.query.pages && json.query.pages[0];
  const out = {
    asked: title,
    title: page && !page.missing ? page.title : title,
    missing: !page || !!page.missing,
    url: page && page.fullurl ? page.fullurl : wikiURL(title),
    extract: (page && page.extract) || '',
    wikidata: (page && page.pageprops && page.pageprops.wikibase_item) || null,
    coord: page && page.coordinates && page.coordinates[0] ? { lat: page.coordinates[0].lat, lon: page.coordinates[0].lon } : null,
    image: (page && page.pageimage) || null,
    imageURL: (page && page.original && page.original.source) || null,
    retrieved: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(file, JSON.stringify(out));
  await sleep(60);
  return out;
}

/** What the build already retrieved for this title (the whole article if it has it, else the lead), or null. No network. */
export function cachedArticle(title) {
  return readCache(cacheFile('full', title)) || readCache(cacheFile('lead', title));
}

/** Lead extracts for many titles (20 per request). Returns Map(askedTitle -> record). */
export async function getLeads(titles, { sentences = 0, onProgress } = {}) {
  const out = new Map();
  const todo = [];
  for (const t of titles) {
    const hit = readCache(cacheFile('lead', t));
    if (hit) out.set(t, hit);
    else todo.push(t);
  }
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'extracts|pageprops|coordinates|pageimages|info',
      exintro: '1',
      explaintext: '1',
      exlimit: '20',
      colimit: '20',
      pilimit: '20',
      ppprop: 'wikibase_item',
      piprop: 'name|original',
      inprop: 'url',
      titles: batch.join('|'),
    });
    if (sentences) params.set('exsentences', String(sentences));
    let json;
    try {
      json = await fetchJSON(`${API}?${params}`);
    } catch (e) {
      console.error('lead batch failed', e.message);
      continue;
    }
    const q = json.query || {};
    const alias = new Map();
    for (const n of q.normalized || []) alias.set(n.from, n.to);
    for (const r of q.redirects || []) alias.set(r.from, r.to);
    const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const asked of batch) {
      let t = asked;
      for (let k = 0; k < 4 && alias.has(t); k++) t = alias.get(t);
      const page = byTitle.get(t);
      const rec = {
        asked,
        title: page && !page.missing ? page.title : asked,
        missing: !page || !!page.missing,
        url: page && page.fullurl ? page.fullurl : wikiURL(asked),
        extract: (page && page.extract) || '',
        wikidata: (page && page.pageprops && page.pageprops.wikibase_item) || null,
        coord: page && page.coordinates && page.coordinates[0] ? { lat: page.coordinates[0].lat, lon: page.coordinates[0].lon } : null,
        image: (page && page.pageimage) || null,
        imageURL: (page && page.original && page.original.source) || null,
        retrieved: new Date().toISOString().slice(0, 10),
      };
      // A truncated continuation batch can omit extracts; only cache complete answers.
      if (rec.missing || rec.extract) fs.writeFileSync(cacheFile('lead', asked), JSON.stringify(rec));
      out.set(asked, rec);
    }
    if (onProgress) onProgress(Math.min(todo.length, i + 20), todo.length);
    await sleep(120);
  }
  return out;
}

const SPARQL = 'https://query.wikidata.org/sparql';

/** Run a SPARQL query against Wikidata with caching and polite retry. Returns the bindings array. */
export async function sparql(query, { refresh = false, cacheKey } = {}) {
  const file = cacheFile('sparql', cacheKey || crypto.createHash('sha1').update(query).digest('hex'));
  if (!refresh) {
    const hit = readCache(file);
    if (hit) return hit;
  }
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(SPARQL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
          'User-Agent': 'EarthWholeStory/1.0 (open educational static site build; no tracking)',
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`SPARQL HTTP ${res.status}`);
        await sleep((Number(res.headers.get('retry-after')) || 5 * (attempt + 1)) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      const rows = json.results.bindings.map((b) => {
        const o = {};
        for (const [k, v] of Object.entries(b)) o[k] = v.value;
        return o;
      });
      fs.writeFileSync(file, JSON.stringify(rows));
      await sleep(400);
      return rows;
    } catch (e) {
      lastErr = e;
      await sleep(4000 * (attempt + 1));
    }
  }
  throw lastErr;
}
