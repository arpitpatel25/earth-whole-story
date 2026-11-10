// Step 12: compile and validate everything written by hand in content/.
// Every curated record must name at least one retrieved source, carry Kid text, and resolve its places
// from retrieved data. The build fails loudly if any record does not.
//
// Output: src/generated/*.json (small, bundled with the app) and site/data/curated/* (loaded on demand).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CONTENT, DATA, writeJSON, readJSON, exists, round, ensureDir } from './lib/util.mjs';
import { readContentDir, parseSpan, parseDate, parseSource, list } from './lib/content.mjs';
import { getLeads } from './lib/wiki.mjs';

const GEN = ensureDir(path.join(ROOT, 'src', 'generated'));
const OUT = ensureDir(path.join(DATA, 'curated'));
const BIG_BANG = -13.8e9;
const MODEL = fs.readFileSync(path.join(ROOT, 'MODEL.txt'), 'utf8').trim();
const problems = [];
const fail = (rec, msg) => problems.push(`${rec._file}:${rec._line} ${rec.id}: ${msg}`);

// ---- sources: every Wikipedia title cited must have been retrieved ---------------------------------------
const cited = new Set();
const placeNames = new Set();
const all = readContentDir(CONTENT);
const isCoord = (v) => /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(v.trim());
/** "type | key=value | key=value" -> { type, key: value } */
function directive(text) {
  const parts = text.split('|').map((x) => x.trim());
  const d = { type: parts[0] };
  for (const p of parts.slice(1)) {
    const i = p.indexOf('=');
    if (i < 0) d[p] = '1';
    else d[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return d;
}
const wantPlace = (v) => {
  if (v && !isCoord(v)) placeNames.add(v.trim());
};
for (const r of all) {
  for (const s of r.src || []) {
    const src = parseSource(s);
    if (src.wp) cited.add(src.wp);
  }
  if (r.place) wantPlace(r.place.split('|')[0]);
  if (r.at && typeof r.at === 'string') wantPlace(r.at.split('|')[0]);
  for (const key of ['cam', 'cam-to']) if (r[key]) wantPlace(r[key].split('|')[0]);
  for (const sh of r.show || []) {
    const d = directive(sh);
    for (const k of ['at', 'from', 'to']) if (d[k] && !/^\d+(\.\d+)? ?(mya|kya|bya|bce|ce)?$/i.test(d[k])) wantPlace(d[k]);
    if (d.via) d.via.split(';').forEach(wantPlace);
  }
  for (const st of r.stop || []) {
    const d = directive(`stop | ${st}`);
    if (d.at) wantPlace(d.at);
  }
}
// keyframed lines and spreads live in JSON next to the stories
const tracksDir = path.join(CONTENT, 'tracks');
const tracks = {};
if (fs.existsSync(tracksDir)) {
  for (const f of fs.readdirSync(tracksDir).filter((x) => x.endsWith('.json'))) {
    const t = readJSON(path.join(tracksDir, f));
    tracks[t.id] = t;
    for (const fr of t.frames || []) fr.via.forEach(wantPlace);
    for (const p of t.base || []) wantPlace(p);
    for (const p of t.points || []) wantPlace(p.at);
    for (const src of t.sources || []) cited.add(src);
  }
}
const leads = await getLeads([...new Set([...cited, ...placeNames])]);

function sourcesOf(rec) {
  const out = [];
  for (const s of rec.src || []) {
    const src = parseSource(s);
    if (src.wp) {
      const lead = leads.get(src.wp);
      if (!lead || lead.missing) {
        fail(rec, `source article not found: "${src.wp}"`);
        continue;
      }
      out.push({ title: lead.title, publisher: 'Wikipedia', url: lead.url, license: 'CC BY-SA 4.0' });
    } else out.push({ title: src.title, publisher: src.publisher, author: src.author, url: src.url });
  }
  if (!out.length) fail(rec, 'no source');
  return out;
}

/** "Name" (looked up in retrieved article coordinates) or "lat, lon" typed from a cited source. */
function placeOf(rec, value = rec.place) {
  if (!value) return null;
  const [name, coords] = value.split('|').map((s) => s.trim());
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(coords || name);
  if (m) return { name: coords ? name : null, lat: Number(m[1]), lon: Number(m[2]) };
  const lead = leads.get(name);
  if (!lead || lead.missing || !lead.coord) {
    fail(rec, `place "${name}" has no retrieved coordinates`);
    return null;
  }
  return { name: lead.title, lat: round(lead.coord.lat, 3), lon: round(lead.coord.lon, 3) };
}

function need(rec, ...keys) {
  for (const k of keys) if (rec[k] === undefined || rec[k] === '' || (Array.isArray(rec[k]) && !rec[k].length)) fail(rec, `missing "${k}"`);
}

function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// ---- eras ---------------------------------------------------------------------------------------------------
const groups = readJSON(path.join(CONTENT, 'eras.json'));
const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
const eras = groups.map((g) => ({ ...g }));
const counters = {};
for (const r of all.filter((x) => x._type === 'era')) {
  need(r, 'name', 'kid', 'level', 'group', 'S', 'K');
  const g = groupById[r.group];
  if (!g) {
    fail(r, `unknown group "${r.group}"`);
    continue;
  }
  let start;
  let end;
  try {
    if (r.age) {
      const [a, b] = r.age.split('..').map(Number);
      start = BIG_BANG + a;
      end = BIG_BANG + b;
    } else {
      const sp = parseSpan(r.span);
      start = sp.y;
      end = sp.end ?? sp.y;
    }
  } catch (e) {
    fail(r, e.message);
    continue;
  }
  const level = Number(r.level);
  const key = `${r.group}:${level}`;
  counters[key] = (counters[key] || 0) + 1;
  const place = placeOf(r);
  eras.push({
    id: r.id,
    level,
    group: r.group,
    name: r.name,
    short: r.short || undefined,
    kidName: r.kid,
    start: round(start, 3),
    end: round(Math.min(end, 2027), 3),
    focus: r['focus-age'] !== undefined ? BIG_BANG + Number(r['focus-age']) : r.focus !== undefined ? Number(r.focus) : undefined,
    color: tint(g.color, level === 1 ? (counters[key] % 2 ? -0.16 : 0.1) : counters[key] % 2 ? 0.26 : 0.42),
    summary: r.S,
    kidSummary: [r.K].flat().join(' '),
    body: r.B || undefined,
    kidBody: undefined,
    lat: place ? place.lat : undefined,
    lon: place ? place.lon : undefined,
    sources: sourcesOf(r),
    confidence: r.conf || 'established',
    notes: r.note || undefined,
    contentNote: r['content-note'] || undefined,
  });
}

// The final moment: the site describing its own making, in the first person. The model name is read
// from MODEL.txt, the one file that differs between builds.
const finalText = readJSON(path.join(CONTENT, 'final-moment.json'));
const sub = (s) => s.replace(/\{MODEL\}/g, MODEL);
eras.push({
  id: 'this-website',
  level: 2,
  group: 'modern',
  name: sub(finalText.name),
  short: 'This website',
  kidName: sub(finalText.kidName),
  start: finalText.y,
  end: 2027,
  focus: finalText.y,
  color: '#ffd23f',
  summary: sub(finalText.summary),
  kidSummary: sub(finalText.kidSummary),
  body: finalText.body.map(sub),
  kidBody: finalText.kidBody.map(sub),
  sources: finalText.sources,
  confidence: 'established',
  final: true,
});

// lanes for level-2 bands: up to three rows, longer bands first within each group so the tape stays legible
const lanes = [[], [], []];
for (const e of eras.filter((x) => x.level === 2).sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))) {
  let placed = false;
  for (let i = 0; i < lanes.length && !placed; i++) {
    if (!lanes[i].length || lanes[i][lanes[i].length - 1] <= e.start + 1e-6) {
      lanes[i].push(e.end);
      e.lane = i;
      placed = true;
    }
  }
  if (!placed) e.lane = -1; // listed and searchable, but drawn only when its neighbours leave room
}
eras.sort((a, b) => a.level - b.level || a.start - b.start);
writeJSON(path.join(GEN, 'eras.json'), eras);

// ---- stories ----------------------------------------------------------------------------------------------------
const mediaIndexFile = path.join(ROOT, 'data-raw', 'media', 'index.json');
const media = exists(mediaIndexFile) ? readJSON(mediaIndexFile) : {};
const STORY_OUT = ensureDir(path.join(OUT, 'stories'));

function coordOf(rec, v, what) {
  v = v.trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2])];
  const lead = leads.get(v);
  if (!lead || lead.missing || !lead.coord) {
    fail(rec, `${what}: "${v}" has no retrieved coordinates`);
    return [0, 0];
  }
  return [round(lead.coord.lat, 3), round(lead.coord.lon, 3)];
}
function camOf(rec, v) {
  // "lat, lon, alt" or "Place | alt"
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/.exec(v.trim());
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const [name, alt] = v.split('|').map((x) => x.trim());
  const c = coordOf(rec, name, 'cam');
  return [c[0], c[1], Number(alt) || 3000];
}
function imageOf(rec, v) {
  const [file, caption] = v.split('|').map((x) => x.trim());
  const m = media[file];
  if (!m) {
    fail(rec, `image not in the media index (run pipeline/11-media.mjs): ${file}`);
    return null;
  }
  return { src: m.src, alt: caption || m.description || '', caption: caption || '', credit: m.credit, license: m.license, url: m.page, w: m.w, h: m.h };
}
function trackOf(rec, id) {
  const t = tracks[id];
  if (!t) {
    fail(rec, `unknown track "${id}"`);
    return null;
  }
  const out = { id };
  const trec = { _file: `content/tracks/${id}.json`, _line: 0, id };
  if (t.frames) out.frames = t.frames.map((f) => ({ y: parseDate(f.date).y, pts: f.via.map((p) => coordOf(trec, p, 'track')) }));
  if (t.base) out.base = t.base.map((p) => coordOf(trec, p, 'track base'));
  if (t.points) out.points = t.points.map((p) => ({ ...Object.fromEntries(['lat', 'lon'].map((k, i) => [k, coordOf(trec, p.at, 'spread')[i]])), y: parseDate(p.date).y, precision: parseDate(p.date).precision, label: p.label || p.at }));
  if (t.frames) {
    const n = out.frames[0].pts.length;
    if (out.frames.some((f) => f.pts.length !== n)) fail(trec, 'every frame of a front needs the same number of points');
    out.frames.sort((a, b) => a.y - b.y);
  }
  return out;
}
function showOf(rec, text) {
  const d = directive(text);
  const out = { type: d.type, color: d.color || undefined, label: d.label || d.text || undefined };
  if (d.from !== undefined && /^(c\.? ?)?\d/.test(d.from) && ['site', 'label', 'ring', 'region', 'area'].includes(d.type)) out.from_y = parseDate(d.from).y;
  if (d.until) out.until_y = parseDate(d.until).y;
  if (d.since) out.from_y = parseDate(d.since).y;
  switch (d.type) {
    case 'site':
    case 'label':
    case 'ring': {
      const c = coordOf(rec, d.at, d.type);
      out.lat = c[0];
      out.lon = c[1];
      if (d.ring) out.ring = true;
      if (d.size) out.size = Number(d.size);
      if (d.event) out.event = d.event;
      break;
    }
    case 'arrow':
      out.from = coordOf(rec, d.from, 'arrow from');
      out.to = coordOf(rec, d.to, 'arrow to');
      if (d.width) out.width = Number(d.width);
      if (d.still) out.still = true;
      break;
    case 'route':
      out.points = d.via.split(';').map((p) => coordOf(rec, p, 'route'));
      if (d.dash) out.dash = true;
      if (d.head) out.head = true;
      if (d.width) out.width = Number(d.width);
      if (d.still) out.still = true;
      break;
    case 'area':
      out.points = d.via.split(';').map((p) => coordOf(rec, p, 'area'));
      if (d.hatch) out.hatch = true;
      if (d.opacity) out.opacity = Number(d.opacity);
      break;
    case 'region':
      out.countries = list(d.countries);
      if (d.hatch) out.hatch = true;
      if (d.opacity) out.opacity = Number(d.opacity);
      break;
    case 'polity':
      // highlight named territories from whichever border snapshot is current
      out.names = d.names.split(';').map((x) => x.trim()).filter(Boolean);
      if (d.opacity) out.opacity = Number(d.opacity);
      break;
    case 'front':
    case 'spread': {
      const t = trackOf(rec, d.id);
      if (t) Object.assign(out, t);
      if (d.width) out.width = Number(d.width);
      if (d.labels) out.labels = d.labels;
      break;
    }
    default:
      fail(rec, `unknown show type "${d.type}"`);
  }
  return out;
}

const FORMATS = new Set(['war', 'rivalry', 'spread', 'flow', 'rise-fall', 'chain', 'deep-time', 'daily-life', 'biography']);
const scenesByStory = new Map();
for (const r of all.filter((x) => x._type === 'scene')) {
  if (!scenesByStory.has(r.story)) scenesByStory.set(r.story, []);
  scenesByStory.get(r.story).push(r);
}
const quizByStory = new Map();
for (const r of all.filter((x) => x._type === 'quiz')) {
  if (!quizByStory.has(r.story)) quizByStory.set(r.story, []);
  quizByStory.get(r.story).push(r);
}
const storyIndex = [];
let sceneCount = 0;
for (const r of all.filter((x) => x._type === 'story')) {
  need(r, 'title', 'format', 'deck', 'kid-deck');
  if (!FORMATS.has(r.format)) fail(r, `unknown format "${r.format}"`);
  const scenes = (scenesByStory.get(r.id) || []).map((sc) => {
    need(sc, 'title', 'y', 'cam', 'T', 'K');
    if (!sc.src || !sc.src.length) fail(sc, 'scene has no source');
    let y = 0;
    let to;
    let autoRes;
    try {
      const d = parseDate(sc.y);
      y = d.y;
      // the clock's wording follows the precision the scene's date was written with
      autoRes = d.precision === 'exact' ? 0.003 : d.precision === 'month' ? 0.1 : undefined;
      if (sc.to) {
        const e = parseDate(sc.to);
        to = e.y;
        // a span between two bare years is told in years, never in invented months
        const coarse = (q) => q !== 'exact' && q !== 'month';
        if (coarse(d.precision) && coarse(e.precision)) autoRes = Math.max(Math.abs(to - y) / 60, 1.2);
      }
    } catch (e) {
      fail(sc, e.message);
    }
    return {
      id: sc.id,
      title: sc.title,
      kidTitle: sc['kid-title'] || undefined,
      y,
      to,
      linear: sc.linear ? true : undefined,
      res: sc.res ? Number(sc.res) : autoRes,
      cam: sc.cam ? camOf(sc, sc.cam) : [0, 0, 20000],
      camTo: sc['cam-to'] ? camOf(sc, sc['cam-to']) : undefined,
      look: sc.look || 'text',
      weight: sc.weight ? Number(sc.weight) : to !== undefined ? 1.6 : 1,
      text: sc.T ? [sc.T].flat() : [],
      kid: sc.K ? [sc.K].flat() : [],
      sources: sourcesOf(sc),
      show: (sc.show || []).map((t) => showOf(sc, t)),
      img: sc.img && sc.img.length ? imageOf(sc, sc.img[0]) || undefined : undefined,
      quote: sc.quote && sc.quote.length ? (() => { const q = sc.quote[0].split('|').map((x) => x.trim()); return { text: q[0], by: q[1], source: q[3] ? { title: q[2], url: q[3] } : undefined }; })() : undefined,
      chart: sc.chart && sc.chart.length ? sc.chart[0] : undefined,
      model: sc.model || undefined,
      note: sc.note || undefined,
      toll: sc.toll ? Number(sc.toll) : undefined,
    };
  });
  if (!scenes.length) fail(r, 'story has no scenes');
  const quiz = (quizByStory.get(r.id) || []).map((q) => {
    need(q, 'q', 'a', 'why');
    const options = (q.options || '').split(';').map((x) => x.trim()).filter(Boolean);
    const answer = options.indexOf((q.a || '').trim());
    if (answer < 0) fail(q, 'the answer must be one of the options');
    return { q: q.q, options, answer, why: q.why };
  });
  const ledTo = (r.led || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [target, title, tag] = x.split('|').map((v) => v.trim());
    return { target, title, tag };
  });
  const storySources = [];
  const seenSrc = new Set();
  for (const sc of scenes) for (const src of sc.sources) if (!seenSrc.has(src.url)) { seenSrc.add(src.url); storySources.push(src); }
  const story = {
    id: r.id, title: r.title, kidTitle: r['kid-title'] || undefined, format: r.format, deck: r.deck, kidDeck: r['kid-deck'],
    color: r.color || undefined, flagship: r.flagship ? true : undefined, contentNote: r['content-note'] || undefined,
    counter: r.counter || undefined, scenes, quiz, ledTo, sources: storySources,
  };
  writeJSON(path.join(STORY_OUT, `${r.id}.json`), story);
  sceneCount += scenes.length;
  storyIndex.push({ id: r.id, title: r.title, kidTitle: story.kidTitle, format: r.format, deck: r.deck, kidDeck: story.kidDeck, color: story.color, flagship: !!r.flagship, scenes: scenes.length, y: scenes[0] ? scenes[0].y : 0, cam: scenes[0] ? scenes[0].cam : null, order: Number(r.order) || 99, contentNote: story.contentNote });
}
storyIndex.sort((a, b) => a.order - b.order);
writeJSON(path.join(STORY_OUT, 'index.json'), storyIndex);

// ---- trails -----------------------------------------------------------------------------------------------------
const stopsByTrail = new Map();
for (const r of all.filter((x) => x._type === 'stop')) {
  if (!stopsByTrail.has(r.trail)) stopsByTrail.set(r.trail, []);
  stopsByTrail.get(r.trail).push(r);
}
const trails = [];
for (const r of all.filter((x) => x._type === 'trail')) {
  need(r, 'title', 'deck', 'kid-deck', 'theme');
  const stops = (stopsByTrail.get(r.id) || []).map((st) => {
    need(st, 'title', 'date', 'at', 'T', 'K');
    let span = { y: 0, end: null, precision: 'year' };
    try {
      span = parseSpan(st.date);
    } catch (e) {
      fail(st, e.message);
    }
    const c = st.at ? coordOf(st, st.at.split('|')[0], 'stop') : [0, 0];
    return { id: st.id, title: st.title, y: span.y, end: span.end, precision: span.precision, lat: c[0], lon: c[1], place: st.place || (st.at && !isCoord(st.at) ? st.at.split('|')[0].trim() : undefined), alt: st.alt ? Number(st.alt) : undefined, text: [st.T].flat().join(' '), kid: [st.K].flat().join(' '), sources: sourcesOf(st), event: st.event || undefined };
  });
  if (stops.length < 8) fail(r, `trail has ${stops.length} stops; at least 8 are required`);
  trails.push({ id: r.id, title: r.title, kidTitle: r['kid-title'] || undefined, deck: r.deck, kidDeck: r['kid-deck'], color: r.color || undefined, theme: r.theme, order: Number(r.order) || 99, stops });
}
trails.sort((a, b) => a.order - b.order);
writeJSON(path.join(OUT, 'trails.json'), trails);

// ---- charts and credits --------------------------------------------------------------------------------------
const chartsFile = path.join(CONTENT, 'charts.json');
const charts = exists(chartsFile) ? readJSON(chartsFile) : {};
for (const [id, c] of Object.entries(charts)) {
  if (!c.source || !/^https?:/.test(c.source.url || '')) problems.push(`content/charts.json ${id}: chart has no source`);
}
writeJSON(path.join(OUT, 'charts.json'), charts);
writeJSON(path.join(DATA, 'credits.json'), readJSON(path.join(CONTENT, 'credits.json')));
// What exists, so the app never asks for a file that is not there.
const manifest = { stories: storyIndex.length, trails: trails.length, india: exists(path.join(OUT, 'india', 'index.json')), models: exists(path.join(OUT, 'models.json')), people: exists(path.join(OUT, 'people.json')), built: new Date().toISOString().slice(0, 10), model: MODEL };
writeJSON(path.join(OUT, 'manifest.json'), manifest);

// ---- report ----------------------------------------------------------------------------------------------------
const kinds = {};
for (const r of all) kinds[r._type] = (kinds[r._type] || 0) + 1;
console.log(`curated: ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}; ${cited.size} cited articles`);
console.log(`stories: ${storyIndex.length} with ${sceneCount} scenes; trails: ${trails.length} with ${trails.reduce((n, t) => n + t.stops.length, 0)} stops`);
console.log(`eras: ${eras.length} (${eras.filter((e) => e.level === 1).length} level 1, ${eras.filter((e) => e.level === 2).length} level 2, ${eras.filter((e) => e.lane === -1).length} without a lane)`);
if (problems.length) {
  console.error(`\n${problems.length} problems:\n${problems.slice(0, 60).join('\n')}`);
  process.exit(1);
}
