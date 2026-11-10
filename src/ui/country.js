// A baseline view for every country and territory: what our sources record inside today's borders, through time.
// Built from data/countries/<ID>.json (pipeline step 6d). The text is assembled from the data, and says so.
import { state, setUI, on } from '../core/store.js';
import { fetchJSON } from '../data/net.js';
import { formatEventDate } from '../core/time.js';

const PREC = { e: 'exact', m: 'month', y: 'year', d: 'decade', c: 'century', a: 'approx' };
const nf = (n) => n.toLocaleString('en-US');
const yearWords = (y) => formatEventDate(y, null, y < -3000 ? 'approx' : 'year');

export async function init(app) {
  const cache = new Map();
  const load = (id) => { if (!cache.has(id)) cache.set(id, fetchJSON(`data/countries/${id}.json`).catch(() => null)); return cache.get(id); };
  const row = (id) => (app.countryIndex || []).find((c) => c.id === id) || null;
  const feature = (id) => (app.geo.countries || []).find((c) => c.id === id) || null;
  const altFor = (f) => (f ? Math.max(500, Math.min(9000, Math.max(f.bbox[3] - f.bbox[1], (f.bbox[2] - f.bbox[0]) * 0.8) * 111 * 2.2)) : 1400);

  function nationalView(r, c) {
    const [id, title, y, cls, p, wp, desc] = r;
    const sources = [{ title: `Wikidata: ${title} (${id})`, url: `https://www.wikidata.org/wiki/${id}`, publisher: 'Wikidata', license: 'CC0' }];
    if (wp) sources.push({ title: wp, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(wp.replace(/ /g, '_'))}`, publisher: 'Wikipedia', license: 'CC BY-SA 4.0' });
    const when = formatEventDate(y, null, PREC[p]);
    return {
      id, automated: true, title, label: cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : 'Event', y, precision: PREC[p], lat: null, lon: null,
      placeText: `Across ${c.name}. The record names the country, not a single place, so there is no pin.`,
      summary: desc ? `${desc.charAt(0).toUpperCase()}${desc.slice(1)}${/[.!?]$/.test(desc) ? '' : '.'}` : null,
      kidSummary: `${title} happened in ${c.name} in ${when}.`,
      facts: [['When', when], ['Where', c.name]],
      related: [{ id: `country:${c.id}`, title: `${c.name} through time`, tag: 'the country' }],
      consequences: [], nextEmpty: 'Open the country to see what came before and after.',
      sources, confidence: 'established',
    };
  }

  async function countryView(rid) {
    const id = rid.slice(8);
    const c = row(id);
    const d = await load(id);
    if (!c || !d) return null;
    const kid = state.level === 'kid';
    const f = feature(id);
    for (const r of d.national || []) if (!app.records.has(r[0])) app.records.set(r[0], () => nationalView(r, c));
    const isCountry = /country/i.test(c.type);
    const nat = (d.national || []).length;
    const body = [];
    if (d.total === 0) body.push(`No dated event inside this boundary appears in our sources. That is a statement about the open databases this site draws on, not about the place.`);
    else if (d.thin) body.push(`Only ${nf(d.total)} dated ${d.total === 1 ? 'event is' : 'events are'} recorded for ${c.name} in our sources${nat ? `, ${nf(nat)} of them national events with no single point on the map` : ''}. The record here is thin: it shows what open databases have catalogued, not how much happened.`);
    if (d.polities && d.polities.length > 1) {
      const names = d.polities.filter((p, i, a) => a.findIndex((q) => q[1] === p[1]) === i).slice(0, 14);
      body.push(`On the historical border maps, the centre of this territory falls under these names in turn: ${names.map(([y, n]) => `${n} (${yearWords(y + 0.5).replace(/ CE$/, '')})`).join('; ')}. The maps are world snapshots and their borders are approximate.`);
    }
    const pop = (d.pop || []).filter((p) => p[0] >= 1000);
    const latest = d.pop && d.pop.length ? d.pop[d.pop.length - 1] : null;
    // a spread of events through time: the most widely written-about, then in order
    const located = d.rows.slice().sort((a, b) => b[4] - a[4]).slice(0, 30).map((r) => ({ id: r[0], title: r[1], y: r[2], precision: PREC[r[7]], label: app.events.types[r[3]] ? app.events.types[r[3]].label : 'Event' }));
    const national = (d.national || []).slice().sort((a, b) => 0).filter((_, i, a) => a.length <= 24 || i % Math.ceil(a.length / 24) === 0).map((r) => ({ id: r[0], title: r[1], y: r[2], precision: PREC[r[4]], label: r[3] }));
    const through = [...located, ...national].sort((a, b) => a.y - b.y);
    const span = d.total ? `from ${yearWords(d.first)} to ${yearWords(d.last)}` : '';
    return {
      id: rid, automated: true, title: c.name, label: `${isCountry ? 'Country' : 'Territory'}, baseline timeline`, y: null,
      lat: c.label[1], lon: c.label[0], altKm: altFor(f),
      summary: d.total ? `${c.formal || c.name}. Our sources hold ${nf(d.total)} dated ${d.total === 1 ? 'event' : 'events'} for the land inside today's borders, ${span}.` : `${c.formal || c.name}.`,
      kidSummary: d.total ? `We know about ${nf(d.total)} dated things that happened inside today's ${c.name}. The list below shows some of them, oldest first.` : `Our sources have no dated events for ${c.name} yet.`,
      body, kidBody: d.thin ? ['We do not have many records for this place. That does not mean nothing happened here.'] : [],
      facts: [
        c.formal && c.formal !== c.name ? ['Formal name', c.formal] : null,
        ['Region', [c.region, c.continent].filter(Boolean).join(', ')],
        ['Dated events in our sources', d.total ? `${nf(d.total)}${nat ? ` (${nf(d.n)} placed on the map, ${nf(nat)} national)` : ''}` : 'none'],
        latest ? [`People living here in ${latest[0]}`, nf(latest[1])] : null,
      ].filter(Boolean),
      chart: pop.length > 4 ? { type: 'line', title: `People living inside today's borders of ${c.name}`, kidTitle: `How many people lived here`, points: pop, unit: 'people', note: 'Estimates for the area inside present-day borders. Figures before 1800 are rough reconstructions.', source: { title: 'Population (historical estimates)', publisher: 'Our World in Data, from HYDE, Gapminder and the UN', url: 'https://ourworldindata.org/grapher/population' } } : null,
      consequences: through, nextTitle: 'Through time here',
      nextEmpty: 'Nothing dated is recorded here in our sources. Turn the globe or move the clock: the nearest recorded events appear in the panel on the left.',
      confidence: d.thin ? 'fragmentary' : 'established',
      notes: 'Borders are today\'s. Earlier events are listed by where they happened, inside borders that did not yet exist.',
      sources: [
        c.wd ? { title: `Wikidata: ${c.name} (${c.wd})`, url: `https://www.wikidata.org/wiki/${c.wd}`, publisher: 'Wikidata', license: 'CC0' } : null,
        { title: 'Natural Earth, Admin 0 Countries 1:10m', url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/', publisher: 'Natural Earth', license: 'Public domain' },
        d.pop ? { title: 'Population (historical estimates)', url: 'https://ourworldindata.org/grapher/population', publisher: 'Our World in Data', license: 'CC BY 4.0' } : null,
        d.polities && d.polities.length ? { title: 'historical-basemaps', url: 'https://github.com/aourednik/historical-basemaps', publisher: 'A. Ourednik and contributors', license: 'GPL-3.0' } : null,
      ].filter(Boolean),
    };
  }

  app.recordPrefixes.push(['country:', countryView]);
  app.openCountry = (id) => app.openEvent(`country:${id}`, { fly: true });
  const openBase = app.openEvent;
  app.openEvent = async (id, opts = {}) => {
    if (!id.startsWith('country:')) return openBase(id, opts);
    const c = row(id.slice(8));
    if (c && opts.fly) app.controls.flyTo({ lat: c.label[1], lon: c.label[0], altKm: altFor(feature(c.id)) });
    setUI({ event: id }, 'ui');
  };
  // the outline of the country being read
  const sync = () => {
    const id = state.event && state.event.startsWith('country:') ? state.event.slice(8) : null;
    const f = id ? feature(id) : null;
    if (f) app.overlays.addPolys('country-outline', f.polys, { color: '#ffd23f', opacity: 0.16 });
    else if (app.overlays.has('country-outline')) app.overlays.remove('country-outline');
  };
  on(['event'], sync);
  sync();
}
