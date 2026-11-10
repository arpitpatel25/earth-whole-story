// Events that belong to no single country: wars, pandemics, trades, exchanges. Each is drawn across the globe and
// carries region views, so that any region's view of it shows "this event, from here".
import { state, setUI, on } from '../core/store.js';
import { fetchJSON } from '../data/net.js';
import { NOW } from '../core/time.js';
import { lensBit } from '../data/events.js';
import { distanceKm } from '../data/context.js';

const REACH_KM = 1400;

export async function init(app) {
  const list = await fetchJSON('data/curated/wide.json').catch(() => null);
  if (!list || !list.length) return;
  const byId = new Map(list.map((e) => [e.id, e]));
  const kidMode = () => state.level === 'kid';
  const lastYear = (e) => e.end ?? e.window ?? e.y;
  const maskOf = (ls) => ls.reduce((m, l) => m | lensBit(l), 0);

  // one pin per region view, alive for the part of the event that touched that region
  const pins = [];
  for (const e of list) {
    for (const v of e.views) {
      pins.push({ id: `wide:${e.id}/${v.id}`, title: `${e.title}: ${v.name.replace(/^From /, '')}`, y: v.y ?? e.y, end: v.end ?? lastYear(e), lat: v.lat, lon: v.lon, altKm: v.altKm, imp: 4, mask: maskOf(e.lenses), lenses: e.lenses, precision: v.precision || e.precision, kind: 'curated', label: 'Event across regions' });
    }
  }
  app.events.addCurated(pins);

  const parse = (rid) => { const [eid, vid] = rid.slice(5).split('/'); const e = byId.get(eid); return e ? { e, v: e.views.find((x) => x.id === vid) || null } : null; };
  app.recordPrefixes.push(['wide:', (rid) => {
    const hit = parse(rid);
    if (!hit) return null;
    const { e, v } = hit;
    const kid = kidMode();
    const ordered = v ? [v, ...e.views.filter((x) => x !== v)] : e.views;
    const i = list.indexOf(e);
    const sources = [...e.sources];
    for (const x of ordered) for (const s of x.sources) if (!sources.some((o) => o.url === s.url)) sources.push(s);
    const next = list.slice(i + 1, i + 3).concat(i + 1 >= list.length ? list.slice(0, 1) : []);
    return {
      id: rid, title: e.title, kidTitle: e.kidTitle, label: 'Event across regions', y: e.y, end: e.end, precision: e.precision,
      lat: v ? v.lat : e.views[0].lat, lon: v ? v.lon : e.views[0].lon, altKm: v ? v.altKm : 9000,
      placeText: `${e.views.length} regions: ${e.views.map((x) => x.name.replace(/^From /, '')).join(', ')}`,
      lenses: e.lenses, summary: e.summary, kidSummary: e.kidSummary, contentNote: e.contentNote, confidence: 'established', sources,
      fromHere: ordered.map((x) => ({ region: x.name, lat: x.lat, lon: x.lon, altKm: x.altKm, text: x.text, kid: x.kid })),
      related: e.story ? [{ id: `story:${e.story}`, title: kid ? 'Scroll through the whole story' : 'The full story, scene by scene', label: 'Story', tag: e.title }] : [],
      consequences: next.map((o) => ({ id: `wide:${o.id}`, title: (kid && o.kidTitle) || o.title, y: o.y, end: o.end, precision: o.precision, label: 'Event across regions', tag: 'another event that crossed borders' })),
      nextTitle: 'Other events that crossed borders',
    };
  }]);

  const openBase = app.openEvent;
  app.openEvent = async (id, opts = {}) => {
    if (id.startsWith('story:')) return app.follow(id);
    if (!id.startsWith('wide:')) return openBase(id, opts);
    const hit = parse(id);
    if (hit) {
      const { e, v } = hit;
      const y = v && v.y != null ? v.y : e.y;
      if (opts.time) app.timeline.jumpTo(Math.min(y + 0.02, NOW), { res: Math.max(0.2, (lastYear(e) - e.y) / 40) });
      if (opts.fly) app.controls.flyTo(v ? { lat: v.lat, lon: v.lon, altKm: v.altKm } : { lat: e.views[0].lat, lon: e.views[0].lon, altKm: 12000 });
    }
    setUI({ event: id }, 'ui');
  };

  // drawn across the globe while the record is open: a ring on every region, and arcs from the first to the rest
  let drawn = [];
  const draw = () => {
    for (const id of drawn) app.overlays.remove(id);
    drawn = [];
    const hit = state.event && state.event.startsWith('wide:') ? parse(state.event) : null;
    if (!hit || state.story) return;
    const { e } = hit;
    const color = (app.lensById[e.lenses[0]] || {}).color || '#ffd23f';
    const first = e.views.slice().sort((a, b) => (a.y ?? e.y) - (b.y ?? e.y))[0];
    e.views.forEach((v, i) => {
      const rid = `wide-ring-${i}`;
      app.overlays.addRing(rid, v.lat, v.lon, { color, size: 26 });
      drawn.push(rid);
      if (v !== first && distanceKm(first.lat, first.lon, v.lat, v.lon) > 300) {
        const aid = `wide-arc-${i}`;
        app.overlays.addArc(aid, [first.lat, first.lon], [v.lat, v.lon], { color, opacity: 0.55, head: false, lift: 0.08 });
        drawn.push(aid);
      }
    });
  };
  on(['event', 'story'], draw);
  draw();

  /** The region view for the place and moment under the camera, if one of these events reached here then. */
  app.wideHere = (lon, lat, y) => {
    let best = null;
    for (const e of list) {
      const inEvent = y >= e.y - 0.5 && y <= lastYear(e) + 0.5;
      for (const v of e.views) {
        // a region's own dates can reach outside the event's main span (China in 1937, Ireland in the 1840s)
        const inView = v.y != null && y >= v.y - 0.5 && y <= (v.end ?? v.y) + 0.5;
        if (!inEvent && !inView) continue;
        const d = distanceKm(lat, lon, v.lat, v.lon);
        if (d < REACH_KM && (!best || d < best.d)) best = { e, v, d };
      }
    }
    if (!best) return null;
    const { e, v } = best;
    const kid = kidMode();
    return { heading: `${(kid && e.kidTitle) || e.title}, from here`, text: v.text, kid: v.kid, sources: v.sources, more: () => app.openEvent(`wide:${e.id}/${v.id}`, { fly: false, time: false }), moreLabel: kid ? 'See it from other places' : `See ${e.title} from ${e.views.length - 1} other regions` };
  };

  app.search.add(list.map((e) => ({ kind: 'curated', title: e.title, alt: e.kidTitle, sub: `Event across ${e.views.length} regions`, weight: 6.2, y: e.y, go: () => app.openEvent(`wide:${e.id}`, { fly: true, time: true }) })));
  app.wide = { list };
  app.contentVersion++;
  if (app.here) app.here.render();
}
