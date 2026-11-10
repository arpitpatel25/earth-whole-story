// The deep view: open anything worth opening without leaving the globe.
// Every view ends with "This led to…" so there is always somewhere to go next, and every claim block
// shows where it came from.
import { state, on, setUI } from '../core/store.js';
import { formatEventDate, formatMoment } from '../core/time.js';
import { h, clear, icon, ICONS, announce } from './dom.js';
import { distanceKm, continentAt } from '../data/context.js';
import { sourceLine } from './here.js';
import { memory } from '../core/memory.js';

const nf = (n) => n.toLocaleString('en-US');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sentence = (s) => (s ? (/[.!?]$/.test(s.trim()) ? cap(s.trim()) : `${cap(s.trim())}.`) : '');

export class DeepPanel {
  constructor(app) {
    this.app = app;
    this.content = h('div.deep-content');
    this.closeBtn = h('button.icon-btn.deep-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => this.close() }, icon(ICONS.close, 18));
    this.el = h('aside.panel.deep', { role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Details', hidden: true, tabindex: -1, dataset: { keys: 'own' } }, this.closeBtn, this.content);
    document.getElementById('ui').append(this.el);
    this.token = 0;
    on(['event'], () => this.sync());
    on(['level'], () => this.sync(true));
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.event && !e.defaultPrevented) this.close();
    });
  }

  close() {
    setUI({ event: null }, 'ui');
  }

  async sync(force) {
    const id = state.event;
    const app = this.app;
    if (!id) {
      if (!this.el.hidden) {
        this.el.hidden = true;
        app.pins.setSelected(null);
        app.layout();
        if (this.returnFocus && document.contains(this.returnFocus)) this.returnFocus.focus();
      }
      this.shown = null;
      return;
    }
    if (id === this.shown && !force) return;
    const token = ++this.token;
    if (this.el.hidden) this.returnFocus = document.activeElement;
    this.el.hidden = false;
    this.el.classList.add('loading');
    app.layout();
    if (id !== this.shown) clear(this.content).append(h('div.skeleton', h('i'), h('i.wide'), h('i'), h('i.short')));
    let view;
    try {
      view = await app.resolveRecord(id);
    } catch (e) {
      view = null;
      app.engine.reportError(`deep view ${id}: ${e.message}`);
    }
    if (token !== this.token) return;
    this.el.classList.remove('loading');
    this.shown = id;
    clear(this.content);
    if (!view) {
      this.content.append(h('div.deep-empty', h('h2', 'This record could not be opened'), h('p', navigator.onLine === false ? 'You appear to be offline. The details will load when the connection returns.' : 'The link may be out of date. Search for the event by name, or close this panel and pick another pin.'), h('button.btn', { type: 'button', onclick: () => this.close() }, 'Close')));
      return;
    }
    this.el.setAttribute('aria-label', view.title);
    this.render(view);
    app.pins.setSelected(id);
    memory.markEvent(id);
    this.content.scrollTop = 0;
    this.el.scrollTop = 0;
    if (!state.capture) this.el.focus({ preventScroll: true });
    announce(`Opened: ${view.title}`);
  }

  link(target, tag) {
    // target: { id, title, y, end, precision, label }
    const app = this.app;
    return h('li', h('button.ev', { type: 'button', onclick: () => app.openEvent(target.id, { fly: true, time: true }) },
      h('span.ev-text',
        h('span.ev-title', target.title),
        h('span.ev-meta', [target.y != null ? formatEventDate(target.y, target.end, target.precision || 'year') : null, target.label, tag].filter(Boolean).join(', '))),
      icon(ICONS.chevronRight, 16)));
  }

  render(v) {
    const app = this.app;
    const kid = state.level === 'kid';
    const c = this.content;
    const lensNames = (v.lenses || []).map((l) => app.lensById[l]).filter(Boolean);

    // ---- heading ----
    const when = v.y != null ? formatEventDate(v.y, v.end, v.precision || 'year') : null;
    c.append(h('header.deep-head',
      h('p.deep-when', [when, v.label].filter(Boolean).join(', ')),
      h('h2.deep-title', (kid && v.kidTitle) || v.title),
      v.placeText ? h('p.deep-place', v.placeText) : null,
      lensNames.length ? h('ul.tags', lensNames.map((l) => h('li', { style: { '--c': l.color } }, kid ? l.kid : l.short))) : null));

    if (v.contentNote) c.append(h('p.content-note', icon(ICONS.info, 16), v.contentNote));
    if (v.confidence && v.confidence !== 'established') {
      c.append(h('p.confidence', v.confidence === 'debated' ? 'Historians and scientists disagree about parts of this. The main positions are set out below.' : 'The evidence for this is fragmentary. What follows is what can be said with care.'));
    }

    // ---- picture ----
    for (const m of (v.media || []).slice(0, 1)) c.append(figure(m));

    // ---- the writing ----
    const lead = kid ? v.kidSummary || null : v.summary;
    if (lead) c.append(h('p.deep-lead', lead));
    const bodyText = kid ? v.kidBody || v.body : v.body;
    for (const para of [].concat(bodyText || [])) c.append(h('p.deep-p', para));
    if (v.extract && !kid) c.append(h('blockquote.extract', h('p', v.extract), h('footer', 'From ', h('a', { href: v.wikipedia, target: '_blank', rel: 'noopener' }, 'Wikipedia'), ', CC BY-SA 4.0')));
    if (v.automated) c.append(h('p.auto-note', kid ? 'This card was put together by a computer from a public database. Nobody has rewritten it for younger readers yet.' : 'An automatic record from an open database. It has not been rewritten or checked by hand.'));
    if (v.sources && v.sources.length && (lead || bodyText)) c.append(sourceLine(v.sources.slice(0, 3)));

    for (const m of (v.media || []).slice(1, 4)) c.append(figure(m));

    // ---- facts ----
    const facts = (v.facts || []).filter((f) => f[1] != null && f[1] !== '');
    if (facts.length) c.append(h('dl.facts', facts.map(([k, val]) => h('div', h('dt', k), h('dd', val)))));

    // ---- people ----
    if (v.people && v.people.length) {
      c.append(h('section', h('h3', v.peopleTitle || 'Who was there'),
        h('ul.people', v.people.map((p) => h('li', p.id ? h('button.link-btn', { type: 'button', onclick: () => app.openEvent(p.id, { fly: false, time: false }) }, p.name) : h('strong', p.name), p.role ? `, ${p.role}` : '')))));
    }

    // ---- voices ----
    for (const q of v.quotes || []) {
      c.append(h('figure.quote', h('blockquote', `“${q.text}”`), h('figcaption', q.by, q.source ? [', ', h('a', { href: q.source.url, target: '_blank', rel: 'noopener' }, q.source.title)] : null)));
    }

    // ---- chart ----
    if (v.chart && app.renderChart) c.append(app.renderChart(v.chart));

    // ---- 3D ----
    for (const mid of [].concat(v.model || [])) {
      const m = app.models && app.models[mid];
      if (m) c.append(h('button.model-card', { type: 'button', onclick: () => app.openModel(mid) }, icon(ICONS.cube, 22), h('span', h('strong', m.title), h('em', kid ? 'Turn it around and tap its parts' : 'Explore in 3D: rotate it and select its parts'))));
    }

    // ---- this event, from here ----
    if (v.fromHere && v.fromHere.length) {
      c.append(h('section.from-here', h('h3', 'This event, from here'),
        v.fromHere.map((r) => h('div.fh', h('button.link-btn', { type: 'button', onclick: () => app.controls.flyTo({ lat: r.lat, lon: r.lon, altKm: r.altKm || 3500 }) }, r.region), h('p', (kid && r.kid) || r.text)))));
    }

    // ---- why, connections, and what it led to ----
    if (v.causes && v.causes.length) c.append(h('section', h('h3', 'Why did this happen?'), h('ul.ev-list', v.causes.map((t) => this.link(t, t.tag)))));
    if (v.related && v.related.length) c.append(h('section', h('h3', 'Connections'), h('ul.ev-list', v.related.map((t) => this.link(t, t.tag)))));

    // ---- sources ----
    if (v.sources && v.sources.length) {
      c.append(h('section.src', h('h3', 'Sources'),
        h('ul', v.sources.map((s) => h('li', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title, icon(ICONS.external, 13)), [s.author, s.publisher].filter(Boolean).length ? `, ${[s.author, s.publisher].filter(Boolean).join(', ')}` : '', s.license ? h('span.lic', ` ${s.license}`) : null))),
        v.notes ? h('p.notes', v.notes) : null));
    }

    // ---- always last: somewhere to go next ----
    const next = v.consequences || [];
    c.append(h('section.led-to', h('h3', v.nextTitle || 'This led to…'),
      next.length
        ? h('ul.ev-list', next.map((t) => this.link(t, t.tag)))
        : h('p.deep-p', v.nextEmpty || 'No later event is linked to this one in our sources yet.'),
      v.elsewhere && v.elsewhere.length ? [h('h3.sub', 'Meanwhile, elsewhere'), h('ul.ev-list', v.elsewhere.map((t) => this.link(t, t.tag)))] : null,
      h('div.deep-actions',
        v.lat != null ? h('button.btn', { type: 'button', onclick: () => app.controls.flyTo({ lat: v.lat, lon: v.lon, altKm: Math.min(state.altKm, v.altKm || 2500) }) }, icon(ICONS.pin, 16), 'Show on the globe') : null,
        h('button.btn', { type: 'button', onclick: () => app.share && app.share.open() }, icon(ICONS.share, 16), 'Share this moment'))));
  }
}

function figure(m) {
  return h('figure.media',
    h('img', { src: m.src, alt: m.alt || '', loading: 'lazy', width: m.w || null, height: m.h || null }),
    h('figcaption', m.caption ? h('span', m.caption) : null, h('span.credit', m.credit ? `${m.credit}. ` : '', m.license || '', m.url ? [' ', h('a', { href: m.url, target: '_blank', rel: 'noopener' }, 'Source')] : null)));
}

/** Turn an automated event (tile row + detail record) into a deep-view model. */
export async function automatedView(app, e) {
  const store = app.events;
  const [detail, extract] = await Promise.all([store.detail(e.id), e.id.startsWith('noaa') ? null : store.extract(e.id)]);
  const d = detail || {};
  const type = store.types[e.type] || { label: 'Event', lenses: [] };
  const isNoaa = e.id.startsWith('noaa');
  const country = d.c && app.countryName ? app.countryName(d.c) : null;
  const placeText = [d.l, country ? `in what is now ${country}` : null].filter(Boolean).join(', ') || null;
  const when = formatEventDate(e.y, e.end, e.precision);
  const sources = [];
  if (!isNoaa) sources.push({ title: `Wikidata: ${e.title} (${e.id})`, url: `https://www.wikidata.org/wiki/${e.id}`, publisher: 'Wikidata', license: 'CC0' });
  if (d.wp) sources.push({ title: `${d.wp}`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(d.wp.replace(/ /g, '_'))}`, publisher: 'Wikipedia', license: 'CC BY-SA 4.0' });
  if (d.n) sources.push({ title: 'NOAA NCEI Global Significant Hazard Database', url: d.n, publisher: 'NOAA National Centers for Environmental Information', license: 'Public domain' });

  // Kid mode for automatic records: a plain sentence built only from the record's own fields.
  const what = type.verb ? `${e.title} was ${type.verb}` : `${e.title} happened`;
  const kidSummary = `${what} ${e.precision === 'exact' ? 'on' : e.precision === 'century' || e.precision === 'decade' ? 'in the' : 'in'} ${when}${country ? `, in the place we now call ${country}` : ''}.`;

  const facts = [
    ['When', when + (e.precision === 'century' || e.precision === 'decade' || e.precision === 'approx' ? ' (the record is not more exact)' : '')],
    ['Where', placeText || (country ? `in what is now ${country}` : `${Math.abs(e.lat).toFixed(1)}° ${e.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.lon).toFixed(1)}° ${e.lon >= 0 ? 'E' : 'W'}`)],
    d.m ? ['Magnitude', String(d.m)] : null,
    d.k ? ['Deaths recorded', nf(d.k)] : null,
  ].filter(Boolean);

  // Connections come from the record itself: the larger event it is part of, and its siblings.
  const related = [];
  const consequences = [];
  if (d.p) {
    const group = await store.parts(d.p);
    if (group) {
      const parentTitle = group.t;
      if (parentTitle) related.push({ id: d.p, title: parentTitle, tag: 'the larger event this is part of' });
      const sib = group.e.filter((r) => r[0] !== e.id);
      const before = sib.filter((r) => r[2] <= e.y).slice(-2);
      const after = sib.filter((r) => r[2] > e.y).slice(0, 4);
      for (const r of before) related.push({ id: r[0], title: r[1], y: r[2], tag: parentTitle ? `earlier in ${parentTitle}` : 'earlier in the same sequence' });
      for (const r of after) consequences.push({ id: r[0], title: r[1], y: r[2], tag: parentTitle ? `next in ${parentTitle}` : 'next in the same sequence' });
    }
  }
  // What happened next in this place (sequence, not a claim of cause).
  const window = Math.max(40, app.pins.timeWindow() * 2);
  const pool = store.query(e.y + window / 2, window / 2, 0).filter((o) => o.id !== e.id && o.y > e.y && !consequences.some((x) => x.id === o.id));
  pool.sort((a, b) => distanceKm(e.lat, e.lon, a.lat, a.lon) / 300 + (a.y - e.y) / 20 - a.imp * 0.6 - (distanceKm(e.lat, e.lon, b.lat, b.lon) / 300 + (b.y - e.y) / 20 - b.imp * 0.6));
  for (const o of pool.slice(0, Math.max(2, 5 - consequences.length))) {
    const km = distanceKm(e.lat, e.lon, o.lat, o.lon);
    consequences.push({ id: o.id, title: o.title, y: o.y, end: o.end, precision: o.precision, label: o.label, tag: km < 400 ? 'next in this place' : `next nearby, ${nf(Math.round(km / 50) * 50)} km away` });
  }
  const elsewhere = [];
  const hereC = continentAt(e.lon, e.lat);
  const seen = new Set([hereC, 'the ocean']);
  for (const o of store.query(e.y, Math.max(1, app.pins.timeWindow()), 0).sort((a, b) => b.imp - a.imp)) {
    const cc = continentAt(o.lon, o.lat);
    if (seen.has(cc) || o.id === e.id) continue;
    seen.add(cc);
    elsewhere.push({ id: o.id, title: o.title, y: o.y, precision: o.precision, label: o.label, tag: `in ${cc}` });
    if (elsewhere.length >= 3) break;
  }

  return {
    id: e.id,
    automated: true,
    title: e.title,
    label: type.label,
    y: e.y,
    end: e.end,
    precision: e.precision,
    lat: e.lat,
    lon: e.lon,
    placeText,
    lenses: type.lenses,
    summary: d.d ? sentence(d.d) : null,
    kidSummary,
    extract: extract || null,
    wikipedia: d.wp ? `https://en.wikipedia.org/wiki/${encodeURIComponent(d.wp.replace(/ /g, '_'))}` : null,
    facts,
    related,
    consequences,
    elsewhere,
    sources,
    confidence: 'established',
  };
}

export { formatMoment };
