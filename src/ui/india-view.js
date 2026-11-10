// India in depth: the era-by-lens matrix, the curated events, the biographies and the state views.
// All text here is compiled from content/india by pipeline/13-india.mjs; nothing is written in this file.
import { state, setUI, on } from '../core/store.js';
import { h, icon, ICONS, clear } from './dom.js';
import { fetchJSON } from '../data/net.js';
import { formatEventDate, NOW } from '../core/time.js';
import { lensBit } from '../data/events.js';
import { distanceKm, continentAt } from '../data/context.js';
import { sourceLine } from './here.js';

const DIR = 'data/curated/india/';
const SUBCONTINENT = new Set(['IND', 'PAK', 'BGD', 'NPL', 'BTN', 'LKA', 'AFG']);
const CENTRE = { lat: 22, lon: 79, altKm: 5600 };
const TAG_NAMES = { woman: 'Women', scientist: 'Scientists', artist: 'Artists', writer: 'Writers', poet: 'Poets', musician: 'Musicians', film: 'Film', reformer: 'Reformers', dalit: 'Dalit lives', adivasi: 'Adivasi lives', ordinary: 'Ordinary lives', saint: 'Saints and teachers', thinker: 'Thinkers', ruler: 'Rulers', politician: 'Politicians', freedom: 'Freedom movement', soldier: 'Soldiers', doctor: 'Doctors', builder: 'Builders', traveller: 'Travellers', business: 'Business', athlete: 'Athletes' };
const TAG_ORDER = ['woman', 'scientist', 'artist', 'reformer', 'dalit', 'adivasi', 'ordinary', 'writer', 'poet', 'musician', 'film', 'saint', 'thinker', 'ruler', 'freedom', 'politician', 'soldier', 'doctor', 'builder', 'traveller', 'business', 'athlete'];
const PAGE = 60;

const wiki = (t) => ({ title: t, publisher: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`, license: 'CC BY-SA 4.0' });
const resFor = (p) => (p === 'exact' ? 1 / 365 : p === 'month' ? 1 / 12 : p === 'century' ? 25 : p === 'decade' ? 4 : p === 'year' ? 1.5 : undefined);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function initIndia(app, index, { Sheet }) {
  const eras = index.eras.slice().sort((a, b) => a.order - b.order);
  const eraById = Object.fromEntries(eras.map((e) => [e.id, e]));
  const [events, people] = await Promise.all([fetchJSON(`${DIR}events.json`), fetchJSON(`${DIR}people.json`)]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const approx = (r) => !!r.ap || r.pl === 'India';
  let cells = null;
  let cellsLoading = null;
  let states = null;
  let statesLoading = null;
  let stateOf = null; // record id -> state id (computed once the state outlines are loaded)

  const loadCells = () => cellsLoading || (cellsLoading = fetchJSON(`${DIR}cells.json`).then((c) => (cells = c)));
  const loadStates = () => statesLoading || (statesLoading = Promise.all([fetchJSON(`${DIR}states.json`), app.geo.loadStates()]).then(([list]) => {
    states = list;
    stateOf = new Map();
    for (const r of [...events, ...people]) {
      if (approx(r)) continue;
      const f = app.geo.stateAt(r.lo, r.la);
      if (f && f.country === 'IND') stateOf.set(r.id, f.id);
    }
    return list;
  }));

  const kidMode = () => state.level === 'kid';
  const eraName = (e) => (kidMode() && e.kidName) || e.name;
  const lensName = (id) => { const l = app.lensById[id]; return l ? (kidMode() ? l.kid : l.name) : id; };
  const eraPrecision = (e) => (e.deep || e.y0 < -3000 ? 'approx' : 'year');
  const eraDates = (e) => formatEventDate(e.y0, Math.min(e.y1, NOW), eraPrecision(e));
  const lensesOf = (e) => (e.deep ? index.deepLenses : index.lenses);

  /** The India era a moment and place belong to: the era whose heartland is nearest, then the shortest. */
  function eraFor(y, lat, lon) {
    let best = null;
    let bestScore = Infinity;
    for (const e of eras) {
      if (y < e.y0 || y > e.y1) continue;
      const d = lat == null || !e.focus ? 0 : distanceKm(lat, lon, e.focus[0], e.focus[1]);
      const score = Math.round(d / 400) * 1e6 + Math.min(999999, e.y1 - e.y0);
      if (score < bestScore) { best = e; bestScore = score; }
    }
    return best;
  }
  const eventsIn = (era, lens, region) => events.filter((e) => e.y >= era.y0 && e.y <= era.y1 && (!lens || e.l.includes(lens)) && (!region || e.r === region));

  // ------------------------------------------------------------------------------------------------------------
  // Pins: curated events and people with a sourced place join the globe. Records whose source gives no place are
  // listed and searchable but are not pinned, so no pin ever claims a location the source did not give.
  // ------------------------------------------------------------------------------------------------------------
  const maskOf = (ls) => ls.reduce((m, l) => m | lensBit(l), 0);
  app.events.addCurated(events.filter((e) => !approx(e)).map((e) => ({ id: e.id, title: e.t, y: e.y, end: e.e || null, lat: e.la, lon: e.lo, imp: 3, mask: maskOf(e.l), lenses: e.l, precision: e.p, kind: 'curated', label: 'Event, India in depth' })));
  app.events.addCurated(people.filter((p) => !approx(p)).map((p) => ({ id: p.id, title: p.n, y: p.b, end: p.d || null, lat: p.la, lon: p.lo, imp: 2, mask: maskOf(p.l), lenses: p.l, precision: p.p || 'year', kind: 'person', label: 'Person', person: true })));

  // ------------------------------------------------------------------------------------------------------------
  // Deep-view records
  // ------------------------------------------------------------------------------------------------------------
  const evLink = (e, tag) => ({ id: e.id, title: e.t, y: e.y, end: e.e, precision: e.p, tag });
  const personLink = (p, tag) => ({ id: p.id, title: p.n, y: p.b, end: p.d, precision: p.p || 'year', label: 'Person', tag });
  const cellLink = (era, lens, tag) => ({ id: `icell:${era.id}.${lens}`, title: `${eraName(era)}: ${lensName(lens)}`, y: era.y0, end: Math.min(era.y1, NOW), precision: eraPrecision(era), tag });
  const eraLink = (era, tag) => ({ id: `iera:${era.id}`, title: eraName(era), y: era.y0, end: Math.min(era.y1, NOW), precision: eraPrecision(era), tag });
  const placeLine = (r) => (approx(r) ? 'The source gives no single place, so this record has no pin on the globe.' : [r.pl, index.regions[r.r]].filter(Boolean).join(', ') || null);

  function elsewhereAt(y, lat, lon) {
    const out = [];
    const seen = new Set([continentAt(lon, lat), 'the ocean']);
    for (const o of app.events.query(y, Math.max(1, app.pins.timeWindow()), 0).sort((a, b) => b.imp - a.imp)) {
      const cc = continentAt(o.lon, o.lat);
      if (seen.has(cc) || o.person) continue;
      seen.add(cc);
      out.push({ id: o.id, title: o.title, y: o.y, precision: o.precision, label: o.label, tag: `in ${cc}` });
      if (out.length >= 3) break;
    }
    return out;
  }

  function eventView(e) {
    const era = eraFor(e.y, e.la, e.lo);
    const after = events.filter((o) => o.y > e.y && o.id !== e.id);
    const sameRegion = after.filter((o) => o.r === e.r).slice(0, 2);
    const sameLens = after.filter((o) => o.l.includes(e.l[0]) && !sameRegion.includes(o)).slice(0, 2);
    const sources = e.src.map(wiki);
    if (e.q) sources.push({ title: `Wikidata: ${e.t} (${e.id})`, url: `https://www.wikidata.org/wiki/${e.id}`, publisher: 'Wikidata', license: 'CC0' });
    return {
      id: e.id, title: e.t, label: 'India in depth', y: e.y, end: e.e, precision: e.p,
      lat: approx(e) ? null : e.la, lon: approx(e) ? null : e.lo, altKm: 2600,
      placeText: placeLine(e), lenses: e.l, summary: e.s, kidSummary: e.k, sources, confidence: 'established',
      facts: [['When', formatEventDate(e.y, e.e, e.p)], ['Region', index.regions[e.r]]],
      related: era ? [eraLink(era, 'the era'), cellLink(era, e.l[0], 'the wider picture')] : [],
      consequences: [...sameRegion.map((o) => evLink(o, 'next in the same region')), ...sameLens.map((o) => evLink(o, 'next through the same lens'))],
      elsewhere: e.y > -5000 ? elsewhereAt(e.y, e.la, e.lo) : [],
    };
  }

  function personView(p) {
    const era = eraFor(p.b, p.la, p.lo);
    const life = p.d ? `${formatEventDate(p.b, null, p.p || 'year')} to ${formatEventDate(p.d, null, p.p || 'year')}` : `born ${formatEventDate(p.b, null, p.p || 'year')}`;
    const peers = people.filter((o) => o.id !== p.id && o.b > p.b && o.g.some((g) => p.g.includes(g))).slice(0, 3);
    const lifeEvents = p.d ? events.filter((e) => e.y >= p.b && e.y <= p.d && e.l.some((l) => p.l.includes(l))).slice(0, 3) : [];
    return {
      id: p.id, title: p.n, label: 'Person', y: p.b, end: p.d, precision: p.p || 'year',
      lat: approx(p) ? null : p.la, lon: approx(p) ? null : p.lo, altKm: 2600,
      placeText: approx(p) ? 'The source gives no birthplace, so this person has no pin on the globe.' : `Born at ${p.pl}`,
      lenses: p.l, summary: p.s, kidSummary: p.k, sources: p.src.map(wiki), confidence: 'established',
      facts: [['Life', life], ['Remembered as', p.g.map((g) => (TAG_NAMES[g] || g).toLowerCase()).join(', ')]],
      related: [...(era ? [eraLink(era, 'the era')] : []), ...lifeEvents.map((e) => evLink(e, 'in this lifetime'))],
      consequences: peers.map((o) => personLink(o, 'a later life in the same field')),
      nextTitle: 'Who came after',
    };
  }

  async function cellView(rid) {
    await loadCells();
    const id = rid.slice(6);
    const [eid, lens] = id.split('.');
    const era = eraById[eid];
    const cell = cells[id];
    if (!era || !cell) return null;
    const ls = lensesOf(era);
    const others = ls.filter((l) => l !== lens);
    const start = Math.max(0, ls.indexOf(lens));
    const near = [1, 2, 3].map((k) => others[(start + k - 1) % others.length]).filter(Boolean);
    const later = eras.filter((e) => e.order > era.order && index.matrix[e.id] && index.matrix[e.id][lens]).slice(0, 2);
    return {
      id: rid, title: `${era.name}: ${app.lensById[lens].name}`, kidTitle: `${era.kidName || era.name}: ${app.lensById[lens].kid}`, label: 'India in depth',
      y: era.y0, end: Math.min(era.y1, NOW), precision: eraPrecision(era), lat: era.focus[0], lon: era.focus[1], altKm: era.focus[2],
      lenses: [lens], summary: cell.text, kidSummary: cell.kid, sources: cell.sources, confidence: cell.thin ? 'fragmentary' : cell.confidence || 'established',
      related: [eraLink(era, 'the era'), ...near.map((l) => cellLink(era, l, 'the same era, another lens')), ...eventsIn(era, era.deep ? null : lens).slice(0, 3).map((e) => evLink(e, 'an event from this era'))],
      consequences: later.map((e) => cellLink(e, lens, 'the same lens, later')),
      nextTitle: 'The same lens, later',
    };
  }

  function eraView(rid) {
    const era = eraById[rid.slice(5)];
    if (!era) return null;
    const next = eras.filter((e) => e.order > era.order).slice(0, 2);
    return {
      id: rid, title: era.name, kidTitle: era.kidName, label: 'India in depth, era',
      y: era.y0, end: Math.min(era.y1, NOW), precision: eraPrecision(era), lat: era.focus[0], lon: era.focus[1], altKm: era.focus[2],
      summary: era.summary, kidSummary: era.kidSummary, sources: era.sources, confidence: 'established',
      related: lensesOf(era).map((l) => cellLink(era, l, index.matrix[era.id][l] === 't' ? 'the record is thin' : null)),
      consequences: next.map((e) => eraLink(e, 'next')),
      nextTitle: 'What came next',
    };
  }

  async function stateView(rid) {
    await loadStates();
    const st = states.find((s) => s.id === rid.slice(7));
    if (!st) return null;
    const f = app.geo.states.find((x) => x.id === st.id);
    const here = events.filter((e) => stateOf.get(e.id) === st.id);
    // a spread across time rather than the first thirty: every era that has events here gets a voice
    const picked = [];
    const byEra = new Map();
    for (const e of here) { const era = eraFor(e.y, e.la, e.lo); const k = era ? era.id : '?'; if (!byEra.has(k)) byEra.set(k, []); byEra.get(k).push(e); }
    let round = 0;
    while (picked.length < Math.min(30, here.length)) { for (const list of byEra.values()) if (list[round] && picked.length < 30) picked.push(list[round]); round++; }
    picked.sort((a, b) => a.y - b.y);
    const born = people.filter((p) => stateOf.get(p.id) === st.id).slice(0, 14);
    const kindName = st.kind === 'ut' ? 'Union territory' : 'State';
    return {
      id: rid, title: st.name, label: `${kindName} of India, history`, y: null,
      lat: f ? f.label[1] : null, lon: f ? f.label[0] : null, altKm: f ? altFor(f) : 2500,
      summary: st.text[0], body: st.text.slice(1), kidSummary: st.kid[0], kidBody: st.kid.slice(1), sources: st.sources, confidence: 'established',
      facts: [[st.kind === 'ut' ? 'Union territory since' : 'Formed', st.formed], ['Curated events here', here.length ? String(here.length) : 'none yet']],
      people: born.map((p) => ({ id: p.id, name: p.n, role: p.d ? `${formatEventDate(p.b, null, 'year')} to ${formatEventDate(p.d, null, 'year')}` : `born ${formatEventDate(p.b, null, 'year')}` })),
      peopleTitle: 'Born here',
      notes: 'The outline is today\'s boundary. Events are placed by where they happened, so older events fall inside borders that did not yet exist.',
      consequences: picked.map((e) => evLink(e, null)),
      nextTitle: 'Through time here',
      nextEmpty: 'No curated event with a sourced place falls inside this boundary yet. The matrix and the wider region views cover its history.',
    };
  }
  const altFor = (f) => Math.max(700, Math.min(4200, Math.max(f.bbox[3] - f.bbox[1], (f.bbox[2] - f.bbox[0]) * 0.9) * 111 * 2.4));

  for (const e of events) app.records.set(e.id, () => eventView(e));
  for (const p of people) app.records.set(p.id, () => personView(p));
  app.recordPrefixes.push(['icell:', cellView], ['iera:', eraView], ['istate:', stateView]);

  /** Where a record sits in time and space, for "open and go there". */
  async function locate(id) {
    if (eventById.has(id)) { const e = eventById.get(id); return approx(e) ? { y: e.y, res: resFor(e.p), ...CENTRE } : { y: e.y, res: resFor(e.p), lat: e.la, lon: e.lo, altKm: Math.min(state.altKm, 3200) }; }
    if (personById.has(id)) { const p = personById.get(id); return approx(p) ? { y: p.b, res: 2, ...CENTRE } : { y: p.b, res: 2, lat: p.la, lon: p.lo, altKm: Math.min(state.altKm, 3200) }; }
    if (id.startsWith('icell:') || id.startsWith('iera:')) {
      const era = eraById[id.startsWith('iera:') ? id.slice(5) : id.slice(6).split('.')[0]];
      if (!era) return null;
      const end = Math.min(era.y1, NOW);
      return { y: era.deep ? era.y0 * 0.66 : (era.y0 + end) / 2, res: era.deep ? undefined : Math.max(1.5, (end - era.y0) / 60), lat: era.focus[0], lon: era.focus[1], altKm: era.focus[2] };
    }
    if (id.startsWith('istate:')) {
      await loadStates();
      const f = app.geo.states.find((x) => x.id === id.slice(7));
      return f ? { lat: f.label[1], lon: f.label[0], altKm: altFor(f) } : null;
    }
    return undefined;
  }
  const openBase = app.openEvent;
  app.openEvent = async (id, opts = {}) => {
    const at = await locate(id);
    if (at === undefined) return openBase(id, opts);
    if (at) {
      if (opts.time && at.y != null) app.timeline.jumpTo(at.y, { res: at.res });
      if (opts.fly && at.lat != null) app.controls.flyTo({ lat: at.lat, lon: at.lon, altKm: at.altKm });
    }
    setUI({ event: id }, 'ui');
  };

  // the outline of the state being read is drawn on the globe
  const syncOutline = async () => {
    const id = state.event && state.event.startsWith('istate:') ? state.event.slice(7) : null;
    if (!id) { if (app.overlays.has('india-state')) app.overlays.remove('india-state'); return; }
    await loadStates();
    const f = app.geo.states.find((x) => x.id === id);
    if (f && state.event === `istate:${id}`) app.overlays.addPolys('india-state', f.polys, { color: '#ffd23f', opacity: 0.2 });
  };
  on(['event'], syncOutline);

  // ------------------------------------------------------------------------------------------------------------
  // "Here, then": the matrix cell for the place and moment under the camera
  // ------------------------------------------------------------------------------------------------------------
  function inSubcontinent(lon, lat, y) {
    const ma = (NOW - y) / 1e6;
    if (ma > 2) {
      const pl = app.engine.plates;
      if (!pl || !pl.ready || ma > pl.meta.maxMa) return false;
      const p = pl.presentPlaceOf(lon, lat, ma);
      return !!p && p.lat > 6 && p.lat < 36 && p.lon > 66 && p.lon < 97;
    }
    if (lat < 4 || lat > 39 || lon < 59 || lon > 99) return false;
    const c = app.geo.countryAt(lon, lat);
    return c ? SUBCONTINENT.has(c.id) : false;
  }
  app.indiaCell = (lon, lat, y, lens) => {
    if (!inSubcontinent(lon, lat, y)) return null;
    const era = eraFor(y, y < -2e6 ? null : lat, lon);
    if (!era) return null;
    if (!cells) { loadCells().then(() => app.here && app.here.render()).catch(() => {}); return null; }
    const ls = lensesOf(era);
    const pick = ls.includes(lens) ? lens : ls[0];
    const cell = cells[`${era.id}.${pick}`];
    if (!cell) return null;
    return { heading: `${eraName(era)}: ${lensName(pick)}`, text: cell.text, kid: cell.kid, sources: cell.sources, more: () => openAt('matrix', { cell: `${era.id}.${pick}` }) };
  };

  // ------------------------------------------------------------------------------------------------------------
  // The sheet
  // ------------------------------------------------------------------------------------------------------------
  const sheet = new Sheet(app, { id: 'india', label: 'India', title: 'India in depth', iconPath: ICONS.layers, wide: true });
  sheet.el.classList.add('india');
  const view = { tab: 'matrix', cell: null, era: '', lens: '', region: '', q: '', tag: '', pq: '', shown: PAGE, pshown: PAGE };
  const tabs = [['matrix', 'Eras and lenses'], ['events', `Events (${events.length.toLocaleString('en-US')})`], ['people', `People (${people.length})`], ['states', 'States']];
  const tabBar = h('div.seg', { role: 'tablist', 'aria-label': 'India in depth' }, tabs.map(([id, label]) => h('button', { type: 'button', role: 'tab', dataset: { tab: id }, onclick: () => openAt(id) }, label)));
  const pane = h('div.india-pane', { role: 'tabpanel' });
  sheet.body.append(tabBar, pane);

  function openAt(tab, opts = {}) {
    Object.assign(view, { tab }, opts);
    if (opts.era !== undefined || opts.lens !== undefined || opts.region !== undefined) view.shown = PAGE;
    const fresh = !opts.cell;
    const done = sheet.el.hidden ? (sheet.open(), null) : render();
    // a new tab starts at its top; a chosen cell scrolls itself into view instead
    if (fresh) Promise.resolve(done).then(() => { sheet.body.scrollTop = 0; });
  }
  sheet.onOpen = () => render();
  on(['level'], () => { if (!sheet.el.hidden) render(); });

  async function render() {
    for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.dataset.tab === view.tab));
    if (view.tab === 'matrix') { if (!cells) { clear(pane).append(h('p.sheet-lead', 'Loading the matrix…')); await loadCells(); } if (view.tab === 'matrix') renderMatrix(); }
    else if (view.tab === 'events') renderEvents();
    else if (view.tab === 'people') renderPeople();
    else { if (!states) { clear(pane).append(h('p.sheet-lead', 'Loading the state outlines…')); await loadStates(); } if (view.tab === 'states') renderStates(); }
  }

  // ---- matrix ----
  function goToEra(era, lens) {
    const end = Math.min(era.y1, NOW);
    app.timeline.jumpTo(era.deep ? era.y0 * 0.66 : (era.y0 + end) / 2, { res: era.deep ? undefined : Math.max(1.5, (end - era.y0) / 60) });
    app.controls.flyTo({ lat: era.focus[0], lon: era.focus[1], altKm: era.focus[2] });
    if (lens && state.lens !== lens) setUI({ lens }, 'ui');
  }

  function cellReader(id) {
    const kid = kidMode();
    if (!id) {
      const c = index.counts;
      return [h('h3.imx-title', kid ? 'Pick any square' : 'Choose a square'),
        h('p.imx-text', kid
          ? 'Each row is a time in India\'s story. Each column is a way of looking at it: who ruled, what people ate, what they believed. Tap a square to read.'
          : `Each row is an era of the subcontinent; each column is a lens. ${c.cells} squares are written from retrieved sources. ${c.thin} are hollow: there the evidence is too thin to say more, and the square says so.`),
        h('p.imx-key', h('i.k-full'), 'written from sources', h('i.k-thin'), 'the record is thin')];
    }
    const [eid, lens] = id.split('.');
    const era = eraById[eid];
    const cell = cells[id];
    const n = eventsIn(era, era.deep ? null : lens).length;
    return [
      h('p.imx-kicker', eraDates(era)),
      h('h3.imx-title', h('span', eraName(era)), h('span.imx-lens', { style: { '--c': app.lensById[lens].color } }, lensName(lens))),
      cell.thin ? h('p.imx-thin', kid ? 'We do not know much about this.' : 'The record is thin here.') : null,
      cell.confidence === 'debated' ? h('p.imx-thin', kid ? 'Experts do not all agree about this.' : 'Scholars disagree about parts of this.') : null,
      h('p.imx-text', kid ? cell.kid : cell.text),
      cell.sources && cell.sources.length ? sourceLine(cell.sources) : null,
      h('div.sheet-actions',
        h('button.btn', { type: 'button', onclick: () => { goToEra(era, era.deep || lens === state.lens ? null : lens); if (innerWidth < 900) sheet.close(); } }, icon(ICONS.pin, 16), kid ? 'Take me there' : 'Go to this time'),
        n ? h('button.btn', { type: 'button', onclick: () => openAt('events', { era: era.id, lens: era.deep ? '' : lens, region: '', q: '' }) }, `${n} ${n === 1 ? 'event' : 'events'}`) : null,
        h('button.btn', { type: 'button', onclick: () => { sheet.close(); app.openEvent(`icell:${id}`, { fly: true, time: true }); } }, kid ? 'Open the big card' : 'Open as a card')),
    ];
  }

  function renderMatrix() {
    const kid = kidMode();
    clear(pane);
    const narrow = innerWidth < 720;
    const human = app.lenses.human;
    const deep = app.lenses.deep;
    const reader = h('div.imx-reader', { 'aria-live': 'polite' }, cellReader(view.cell));
    const select = (id, btn) => {
      view.cell = id;
      for (const b of pane.querySelectorAll('[aria-pressed="true"]')) b.setAttribute('aria-pressed', 'false');
      if (btn) btn.setAttribute('aria-pressed', 'true');
      clear(reader).append(...cellReader(id).filter(Boolean));
      if (narrow && btn) btn.closest('details').querySelector('.imx-slot').append(reader);
    };
    const cellBtn = (era, l, r, c) => {
      const id = `${era.id}.${l.id}`;
      const thin = index.matrix[era.id][l.id] === 't';
      return h('button.imx-cell', { type: 'button', role: 'gridcell', dataset: { s: thin ? 't' : 'c', r, c }, style: { '--c': l.color }, 'aria-pressed': String(view.cell === id), 'aria-label': `${era.name}, ${l.name}${thin ? ': the record is thin' : ''}`, title: `${eraName(era)}: ${kid ? l.kid : l.name}`, onclick: (ev) => select(id, ev.currentTarget) },
        narrow ? h('span', kid ? l.kid : l.name) : null);
    };

    if (narrow) {
      // phone: one era at a time, lenses as a list
      pane.append(h('p.sheet-lead', kid ? 'Pick a time, then pick what you want to know about.' : 'Pick an era, then a lens.'));
      pane.append(h('div.imx-acc', eras.map((era, r) => h('details', { open: view.cell ? view.cell.startsWith(`${era.id}.`) : null },
        h('summary', h('strong', eraName(era)), h('em', eraDates(era))),
        h('div.imx-lenses', (era.deep ? deep : human).map((l, c) => cellBtn(era, l, r, c))),
        h('div.imx-slot')))));
      if (view.cell) {
        const open = pane.querySelector('details[open]');
        if (open) { open.querySelector('.imx-slot').append(reader); open.scrollIntoView({ block: 'start' }); }
      }
      return;
    }

    const deepEra = eras.find((e) => e.deep);
    const rows = eras.filter((e) => !e.deep);
    const eraBtn = (era) => h('button.imx-era', { type: 'button', title: `${eraName(era)}: ${kid ? 'take me to this time' : 'go to this era on the globe'}`, onclick: () => goToEra(era) }, h('strong', eraName(era)), h('em', eraDates(era)));
    const grid = h('div.imx', { role: 'grid', 'aria-label': 'Eras of the subcontinent by lens' },
      deepEra ? h('div.imx-deep', { role: 'row' }, eraBtn(deepEra), h('div.imx-deep-cells', deep.map((l, c) => h('span.imx-deep-cell', cellBtn(deepEra, l, -1, c), h('b', kid ? l.kid : l.short))))) : null,
      h('div.imx-row.imx-head', { role: 'row' }, h('span.imx-era'), human.map((l) => h('span.imx-col', { role: 'columnheader', title: kid ? l.kid : l.name }, h('b', l.short)))),
      rows.map((era, r) => h('div.imx-row', { role: 'row' }, eraBtn(era), human.map((l, c) => cellBtn(era, l, r, c)))));
    grid.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!t.classList.contains('imx-cell') || !/^Arrow/.test(e.key)) return;
      const r = Number(t.dataset.r) + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
      const c = Number(t.dataset.c) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
      const next = grid.querySelector(`.imx-cell[data-r="${r}"][data-c="${c}"]`);
      if (next) { e.preventDefault(); next.focus(); }
    });
    pane.append(h('div.imx-wrap', grid, reader));
  }

  // ---- events ----
  const selectBox = (label, value, options, onchange) => h('label.ifilter', h('span', label), h('select', { onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
  const rowButton = (title, meta, color, onclick) => h('li', h('button.ev', { type: 'button', onclick }, h('i.ev-dot', { style: { background: color } }), h('span.ev-text', h('span.ev-title', title), h('span.ev-meta', meta)), icon(ICONS.chevronRight, 16)));
  const openRecord = (id) => { if (innerWidth < 900) sheet.close(); app.openEvent(id, { fly: true, time: true }); };

  function renderEvents() {
    const kid = kidMode();
    clear(pane);
    const list = h('ul.ev-list');
    const count = h('p.ifilter-count', { 'aria-live': 'polite' });
    const more = h('button.btn', { type: 'button', onclick: () => { view.shown += PAGE; fill(); } }, 'Show more');
    const fill = () => {
      const era = view.era ? eraById[view.era] : null;
      const q = norm(view.q.trim());
      const hits = events.filter((e) => (!era || (e.y >= era.y0 && e.y <= era.y1)) && (!view.lens || e.l.includes(view.lens)) && (!view.region || e.r === view.region) && (!q || norm(e.t).includes(q) || norm(e.s).includes(q)));
      clear(list).append(...hits.slice(0, view.shown).map((e) => rowButton(e.t, [formatEventDate(e.y, e.e, e.p), index.regions[e.r]].join(', '), app.lensById[e.l[0]] ? app.lensById[e.l[0]].color : 'var(--chalk)', () => openRecord(e.id))));
      count.textContent = hits.length ? `${hits.length.toLocaleString('en-US')} ${hits.length === 1 ? 'event' : 'events'}, oldest first` : 'No curated event matches. Loosen a filter, or turn the globe: thousands of automatic records sit beside these.';
      more.hidden = hits.length <= view.shown;
    };
    const set = (k) => (v) => { view[k] = v; view.shown = PAGE; fill(); };
    pane.append(
      h('p.sheet-lead', kid ? 'Things that happened, each one checked against a source. Tap one to go there.' : 'Curated events across the subcontinent, each written from a retrieved source. Choose one to go to its place and moment.'),
      h('div.ifilters',
        selectBox('Era', view.era, [['', 'All eras'], ...eras.map((e) => [e.id, eraName(e)])], set('era')),
        selectBox('Lens', view.lens, [['', 'All lenses'], ...app.lenses.human.map((l) => [l.id, kid ? l.kid : l.name])], set('lens')),
        selectBox('Region', view.region, [['', 'All regions'], ...Object.entries(index.regions)], set('region')),
        h('label.ifilter.grow', h('span', 'Find'), h('input.sheet-input', { type: 'search', value: view.q, placeholder: 'A word in the title or text', oninput: (e) => set('q')(e.target.value) }))),
      count, list, more);
    fill();
  }

  // ---- people ----
  function renderPeople() {
    const kid = kidMode();
    clear(pane);
    const list = h('ul.ev-list');
    const count = h('p.ifilter-count', { 'aria-live': 'polite' });
    const more = h('button.btn', { type: 'button', onclick: () => { view.pshown += PAGE; fill(); } }, 'Show more');
    const have = TAG_ORDER.filter((t) => people.some((p) => p.g.includes(t)));
    const chips = h('div.ichips', { role: 'group', 'aria-label': 'Kinds of lives' }, [['', 'Everyone'], ...have.map((t) => [t, TAG_NAMES[t]])].map(([t, label]) => h('button.ichip', { type: 'button', 'aria-pressed': String(view.tag === t), onclick: (e) => { view.tag = t; view.pshown = PAGE; for (const b of chips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); fill(); } }, label)));
    const fill = () => {
      const q = norm(view.pq.trim());
      const hits = people.filter((p) => (!view.tag || p.g.includes(view.tag)) && (!q || norm(p.n).includes(q) || norm(p.s).includes(q)));
      clear(list).append(...hits.slice(0, view.pshown).map((p) => rowButton(p.n, [p.d ? `${formatEventDate(p.b, null, 'year')} to ${formatEventDate(p.d, null, 'year')}` : `born ${formatEventDate(p.b, null, 'year')}`, approx(p) ? null : p.pl].filter(Boolean).join(', '), app.lensById[p.l[0]] ? app.lensById[p.l[0]].color : 'var(--chalk)', () => openRecord(p.id))));
      count.textContent = hits.length ? `${hits.length} ${hits.length === 1 ? 'life' : 'lives'}, oldest first` : 'Nobody matches yet. Try another group or a shorter word.';
      more.hidden = hits.length <= view.pshown;
    };
    pane.append(
      h('p.sheet-lead', kid ? 'People from India\'s story: queens and poets, scientists and farmers. Tap a name to meet them.' : 'Lives from the subcontinent: rulers and reformers, scientists and artists, and ordinary people where the record names them.'),
      chips,
      h('label.ifilter.grow', h('span', 'Find'), h('input.sheet-input', { type: 'search', value: view.pq, placeholder: 'A name or a word', oninput: (e) => { view.pq = e.target.value; view.pshown = PAGE; fill(); } })),
      count, list, more);
    fill();
  }

  // ---- states ----
  function renderStates() {
    const kid = kidMode();
    clear(pane);
    const item = (s) => {
      const n = events.filter((e) => stateOf.get(e.id) === s.id).length;
      return rowButton(s.name, [s.formed ? `formed ${s.formed}` : null, n ? `${n} curated ${n === 1 ? 'event' : 'events'}` : null].filter(Boolean).join(', '), 'var(--marker)', () => openRecord(`istate:${s.id}`));
    };
    pane.append(
      h('p.sheet-lead', kid ? 'Every state of India has its own story. Pick one to fly there.' : 'Each of today\'s 28 states and 8 union territories has its own history view. The outlines are today\'s; the histories run far behind them.'),
      h('h3.sheet-h', 'States'), h('ul.ev-list.two', states.filter((s) => s.kind !== 'ut').map(item)),
      h('h3.sheet-h', 'Union territories'), h('ul.ev-list.two', states.filter((s) => s.kind === 'ut').map(item)),
      h('p.here-note', 'The subcontinent beyond India\'s borders is covered in the events and the matrix: choose a region such as Today\'s Pakistan, Nepal or Sri Lanka in the Events tab.'));
  }

  // ------------------------------------------------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------------------------------------------------
  app.search.add(eras.map((e) => ({ kind: 'india', title: `${e.name} (India)`, alt: e.kidName, sub: `India in depth, ${eraDates(e)}`, weight: 5, y: e.y0, go: () => app.openEvent(`iera:${e.id}`, { fly: true, time: true }) })));
  app.search.add(people.map((p) => ({ kind: 'person', title: p.n, sub: p.d ? `${formatEventDate(p.b, null, 'year')} to ${formatEventDate(p.d, null, 'year')}` : `born ${formatEventDate(p.b, null, 'year')}`, weight: 4.5, y: p.b, go: () => app.openEvent(p.id, { fly: true, time: true }) })));
  app.search.add(events.filter((e) => !e.q).map((e) => ({ kind: 'curated', title: e.t, sub: `${formatEventDate(e.y, e.e, e.p)}, India in depth`, weight: 4.2, y: e.y, geo: approx(e) ? undefined : [e.la, e.lo, e.y], go: () => app.openEvent(e.id, { fly: true, time: true }) })));
  loadStates().then((list) => app.search.add(list.map((s) => ({ kind: 'india', title: `${s.name}: history`, sub: s.kind === 'ut' ? 'Union territory of India' : 'State of India', weight: 4.4, go: () => app.openEvent(`istate:${s.id}`, { fly: true, time: true }) })))).catch(() => {});

  app.india = { index, eras, events, people, open: openAt, sheet, eraFor, loadCells, loadStates, get cells() { return cells; }, get states() { return states; } };
  if (state.event && (state.event.startsWith('istate:'))) syncOutline();
  app.contentVersion++;
  app.engine.invalidate();
}
