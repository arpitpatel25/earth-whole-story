// Curiosity loops: What stood right here?, This day in history, Surprise me, Trails, and the
// exploration memory that gently points at what you have not seen yet.
import { state, setUI, setPlace, setTime, on } from '../core/store.js';
import { h, clear, icon, ICONS, announce } from './dom.js';
import { fetchJSON, fetchBuffer } from '../data/net.js';
import { formatEventDate, formatMoment, yearToU, uToYear, MONTHS, NOW } from '../core/time.js';
import { distanceKm } from '../data/context.js';
import { memory } from '../core/memory.js';
import { pathThrough } from '../globe/overlays.js';
import { sourceLine } from './here.js';

const nf = (n) => n.toLocaleString('en-US');

// ------------------------------------------------------------------------------------------------
// Territory at a point, across every snapshot (run-length grids from pipeline step 05b)
// ------------------------------------------------------------------------------------------------
let throughTime = null;
async function loadThroughTime() {
  if (throughTime) return throughTime;
  throughTime = fetchBuffer('data/borders/through-time.bin').then((buf) => {
    const headLen = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen)));
    const runs = new Uint16Array(buf, 4 + headLen);
    return { header, runs };
  });
  return throughTime;
}
function nameAt(tt, snap, lon, lat) {
  const { nx, ny, res } = tt.header;
  const i = Math.min(nx - 1, Math.max(0, Math.floor((lon + 180) / res)));
  const j = Math.min(ny - 1, Math.max(0, Math.floor((90 - lat) / res)));
  // walk the run-length rows to row j, then along it to column i
  let p = snap.offset;
  let row = 0;
  let x = 0;
  const end = snap.offset + snap.length;
  while (p < end) {
    const v = tt.runs[p];
    const n = tt.runs[p + 1];
    p += 2;
    if (row === j && i < x + n) return v ? snap.names[v - 1] : null;
    x += n;
    if (x >= nx) {
      x = 0;
      row++;
      if (row > j) break;
    }
  }
  return null;
}

export async function init(app, { Sheet }) {
  const engine = app.engine;

  // ============================ What stood right here? ============================
  const hereSheet = new Sheet(app, { id: 'right-here', label: 'Right here', title: 'What stood right here?', iconPath: ICONS.locate });
  let herePoint = null;
  async function showThroughTime(lat, lon, label) {
    herePoint = { lat, lon, label };
    const body = clear(hereSheet.body);
    body.append(h('p.sheet-lead', label ? `${label}, through time.` : 'This spot, through time.'), h('div.skeleton', h('i'), h('i.wide'), h('i')));
    app.controls.flyTo({ lat, lon, altKm: Math.min(state.altKm, 1800) });
    await app.geo.load();
    const [tt] = await Promise.all([loadThroughTime(), app.search.load()]);
    if (herePoint.lat !== lat || herePoint.lon !== lon) return;
    const place = app.geo.describe(lon, lat);
    clear(body);
    body.append(h('p.sheet-lead', `${label || place.text}, through time. Select any line to set the clock.`));
    // who held this ground: collapse runs of the same name
    const rows = [];
    let prev = null;
    for (const snap of tt.header.snaps) {
      const name = nameAt(tt, snap, lon, lat);
      if (name === prev) {
        if (rows.length) rows[rows.length - 1].to = snap.year;
        continue;
      }
      prev = name;
      rows.push({ from: snap.year, to: snap.year, name, source: snap.source });
    }
    const fmtY = (y) => (y < 0 ? `${nf(-y)} BCE` : `${y}`);
    body.append(h('h3.sheet-h', 'Who held this ground'));
    body.append(h('ol.through', rows.map((r) => h('li', h('button.ev', { type: 'button', onclick: () => app.timeline.jumpTo(r.from + 0.5, { res: Math.max(1, Math.abs(r.to - r.from) / 30) }) },
      h('span.through-when', r.from === r.to ? fmtY(r.from) : `${fmtY(r.from)} to ${fmtY(r.to)}`),
      h('span.ev-text', h('span.ev-title', r.name || 'No state or named people in the sources')))))));
    body.append(h('p.here-note', 'From world snapshots (historical-basemaps, approximate) up to 1880 and CShapes 2.0 from 1886. A name here means the source maps a territory over this spot at that date, not that everyone living here belonged to it.'));
    // what happened within reach of this spot, at any time
    const near = [];
    for (const it of app.search.items) {
      if (!it.geo) continue;
      const d = distanceKm(lat, lon, it.geo[0], it.geo[1]);
      if (d <= 60) near.push({ it, d });
    }
    near.sort((a, b) => a.it.geo[2] - b.it.geo[2]);
    body.append(h('h3.sheet-h', `Recorded within 60 km (${nf(near.length)})`));
    if (near.length) {
      body.append(h('ul.ev-list', near.slice(0, 120).map(({ it }) => h('li', h('button.ev', { type: 'button', onclick: () => it.go() }, h('span.ev-text', h('span.ev-title', it.title), h('span.ev-meta', it.sub)))))));
      if (near.length > 120) body.append(h('p.here-note', `Showing the first 120 in order of date. Zoom in on the globe and scrub the timeline to see the rest.`));
    } else {
      body.append(h('div.thin', h('p', 'No dated event in our sources falls within 60 km of this spot. The record here is thin, which says more about what was written down and digitised than about what happened.')));
    }
    announce('Timeline for this place is ready');
  }
  hereSheet.onOpen = () => {
    const body = clear(hereSheet.body);
    const input = h('input.sheet-input', { type: 'text', placeholder: 'A city or country', 'aria-label': 'A city or country', autocomplete: 'off', spellcheck: false });
    const results = h('ul.ev-list');
    const status = h('p.here-note', { role: 'status' });
    input.addEventListener('input', async () => {
      await app.search.load();
      clear(results);
      const hits = app.search.match(input.value, 30).filter((r) => r.kind === 'place' && r.geo).slice(0, 7);
      for (const r of hits) results.append(h('li', h('button.ev', { type: 'button', onclick: () => showThroughTime(r.geo[0], r.geo[1], r.title) }, h('span.ev-text', h('span.ev-title', r.title), h('span.ev-meta', r.sub)))));
    });
    body.append(
      h('p.sheet-lead', 'Pick any place and see everything recorded on that spot, from the first people to today.'),
      input, results,
      h('div.sheet-actions',
        h('button.btn', { type: 'button', onclick: () => showThroughTime(state.lat, state.lon, null) }, icon(ICONS.pin, 16), 'Use the centre of the globe'),
        h('button.btn', { type: 'button', onclick: () => {
          if (!navigator.geolocation) {
            status.textContent = 'This browser cannot share a location. Type a place instead.';
            return;
          }
          status.textContent = 'Waiting for your permission…';
          navigator.geolocation.getCurrentPosition(
            (pos) => showThroughTime(pos.coords.latitude, pos.coords.longitude, 'Where you are'),
            () => { status.textContent = 'Location was not shared. Nothing was sent anywhere. You can type a place instead.'; },
            { maximumAge: 600000, timeout: 15000 });
        } }, icon(ICONS.locate, 16), 'Use my location')),
      status,
      h('p.here-note', 'Your location is only used inside this page to turn the globe. It is never stored or sent.'));
    if (!state.capture) setTimeout(() => input.focus(), 30);
  };
  app.rightHere = showThroughTime;

  // ============================ Discover: this day, surprise, memory ============================
  const disc = new Sheet(app, { id: 'discover', label: 'Discover', title: 'Discover', iconPath: ICONS.compass });
  async function surprise() {
    const pool = await app.events.surprise();
    const curated = app.events.curated.filter((e) => e.imp >= 4);
    const all = pool.concat(curated);
    const fresh = all.filter((e) => !memory.hasEvent(e.id));
    const list = fresh.length ? fresh : all;
    if (!list.length) return;
    const e = list[Math.floor(Math.random() * list.length)];
    if (!app.events.get(e.id)) app.events.byId.set(e.id, e);
    disc.close();
    app.openEvent(e.id, { fly: true, time: true });
  }
  app.surprise = surprise;
  disc.onOpen = async () => {
    const body = clear(disc.body);
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dayBox = h('div', h('div.skeleton', h('i'), h('i'), h('i')));
    body.append(
      h('div.sheet-actions', h('button.btn.btn-primary', { type: 'button', onclick: surprise }, icon(ICONS.dice, 17), 'Surprise me')),
      h('h3.sheet-h', `This day in history: ${day} ${MONTHS[month - 1]}`), dayBox,
      h('h3.sheet-h', 'Where you have been'), memoryView());
    const list = await app.events.onThisDay(month, day);
    clear(dayBox);
    if (!list.length) dayBox.append(h('p.here-note', 'No exactly dated event in the collection falls on this date.'));
    else {
      list.sort((a, b) => a.y - b.y);
      dayBox.append(h('ul.ev-list', list.slice(0, 12).map((e) => {
        if (!app.events.get(e.id)) app.events.byId.set(e.id, e);
        return h('li', h('button.ev', { type: 'button', onclick: () => { disc.close(); app.openEvent(e.id, { fly: true, time: true }); } },
          h('i.ev-dot', { style: { background: app.pins.colorFor(e).getStyle() } }),
          h('span.ev-text', h('span.ev-title', e.title), h('span.ev-meta', `${Math.floor(e.y)}, ${e.label}`))));
      })));
    }
  };

  function memoryView() {
    const c = memory.counts();
    const cov = memory.timeCoverage();
    const groups = app.eras.filter((e) => e.level === 0);
    const box = h('div.memory');
    if (!c.eras && !c.events) {
      box.append(h('p.here-note', 'Nothing yet. As you explore, this fills in, and it stays on this device only.'));
      return box;
    }
    box.append(h('p.memory-count', `${nf(c.events)} ${c.events === 1 ? 'record' : 'records'} opened, ${nf(c.stories)} ${c.stories === 1 ? 'story' : 'stories'} started.`));
    // one bar per era group: how much of its span on the timeline has been visited
    const unexplored = [];
    const bars = h('ul.memory-bars');
    for (const g of groups) {
      const b0 = Math.floor(yearToU(g.start) * cov.bins);
      const b1 = Math.max(b0 + 1, Math.ceil(yearToU(Math.min(NOW, g.end)) * cov.bins));
      let seen = 0;
      for (let b = b0; b < b1; b++) if (cov.seen[b]) seen++;
      const share = seen / (b1 - b0);
      if (share < 0.15) unexplored.push(g);
      bars.append(h('li', h('button.memory-bar', { type: 'button', title: `Go to ${g.name}`, onclick: () => { disc.close(); app.timeline.jumpToEra(g); } }, h('span', g.name), h('span.memory-track', h('i', { style: { width: `${Math.round(share * 100)}%`, background: g.color } })))));
    }
    box.append(bars);
    if (unexplored.length) {
      const g = unexplored[Math.floor(Math.random() * unexplored.length)];
      box.append(h('p.memory-hint', 'You have hardly looked at ', h('button.link-btn', { type: 'button', onclick: () => { disc.close(); app.timeline.jumpToEra(g); } }, g.name), ' yet.'));
    }
    const cells = memory.cellCoverage();
    const regions = [['the Americas', -100, 15], ['Africa', 20, 5], ['Europe', 15, 50], ['Western and Central Asia', 55, 35], ['South Asia', 78, 22], ['East Asia', 115, 35], ['Southeast Asia and Oceania', 130, -10]];
    const quiet = regions.filter(([, lon, lat]) => !cells.seen[`${Math.floor(((lat + 90) / 180) * cells.latBins)}_${Math.floor(((lon + 180) / 360) * cells.lonBins)}`]);
    if (quiet.length) {
      const r = quiet[Math.floor(Math.random() * quiet.length)];
      box.append(h('p.memory-hint', 'A part of the world you have not zoomed into: ', h('button.link-btn', { type: 'button', onclick: () => { disc.close(); app.controls.flyTo({ lat: r[2], lon: r[1], altKm: 6500 }); } }, r[0]), '.'));
    }
    box.append(h('button.link-btn', { type: 'button', onclick: () => { memory.clear(); disc.onOpen(); } }, 'Forget where I have been'));
    return box;
  }

  // ============================ Trails ============================
  const trails = app.manifest.trails ? await fetchJSON('data/curated/trails.json').catch(() => []) : [];
  app.trailList = trails;
  if (trails.length) {
    const trailSheet = new Sheet(app, { id: 'trails', label: 'Trails', title: 'Trails', iconPath: ICONS.route, wide: true });
    const player = { trail: null, i: 0 };
    const card = h('aside.panel.trail-card', { hidden: true, 'aria-label': 'Trail stop' });
    document.getElementById('ui').append(card);
    const stopEvent = (t, i) => ({ id: `trail:${t.id}:${i}`, lat: t.stops[i].lat, lon: t.stops[i].lon });
    function showStop(i, fly = true) {
      const t = player.trail;
      player.i = i;
      const st = t.stops[i];
      const kid = state.level === 'kid';
      memory.markTrail(t.id, i, t.stops.length);
      document.documentElement.classList.add('in-trail');
      clear(card).append(...[
        h('header.trail-head', h('p.here-kicker', `${t.title}, stop ${i + 1} of ${t.stops.length}`), h('button.icon-btn', { type: 'button', 'aria-label': 'Leave the trail', onclick: closeTrail }, icon(ICONS.close, 16))),
        h('h2.here-title', st.title),
        h('p.deep-when', [formatEventDate(st.y, st.end, st.precision), st.place].filter(Boolean).join(', ')),
        h('p.trail-text', kid ? st.kid : st.text),
        st.sources && st.sources.length ? sourceLine(st.sources) : null,
        st.event ? h('button.link-btn', { type: 'button', onclick: () => app.openEvent(st.event) }, 'Open the full record') : null,
        h('div.trail-nav',
          h('button.btn', { type: 'button', disabled: i === 0, onclick: () => showStop(i - 1) }, icon(ICONS.chevronLeft, 16), 'Back'),
          i < t.stops.length - 1
            ? h('button.btn.btn-primary', { type: 'button', onclick: () => showStop(i + 1) }, 'Next stop', icon(ICONS.chevronRight, 16))
            : h('button.btn.btn-primary', { type: 'button', onclick: closeTrail }, 'Finish the trail')),
      ].filter(Boolean));
      card.hidden = false;
      // in deep time every stop is drawn where its rocks sat at the date of the stop on screen
      const pl = app.engine.plates;
      const ma = (2027 - st.y) / 1e6;
      const deep = ma > 2;
      if (deep && !pl.ready && pl.load) pl.load().then(() => player.trail === t && player.i === i && showStop(i, false));
      const at = (s) => {
        if (!deep || !pl.ready || ma > pl.meta.maxMa) return [s.lat, s.lon];
        const r = pl.reconstructNear(s.lon, s.lat, ma);
        return r ? [r.lat, r.lon] : [s.lat, s.lon];
      };
      // the travelled part of the trail is drawn solid, the rest dashed
      const pts = t.stops.map(at);
      const here = at(st);
      app.overlays.addPath('trail:all', pathThrough(pts, 0.004), { color: t.color || '#ffd23f', width: 2.5, dash: true, opacity: 0.6 });
      if (i > 0) app.overlays.addPath('trail:done', pathThrough(pts.slice(0, i + 1), 0.005), { color: t.color || '#ffd23f', width: 4, flow: true });
      else app.overlays.remove('trail:done');
      app.pins.setExtra(t.stops.map((s, n) => ({ id: `trail:${n}`, lat: pts[n][0], lon: pts[n][1], color: t.color || '#ffd23f', size: n === i ? 30 : 16, title: s.title, onOpen: () => showStop(n) })));
      app.labels.setExtra([{ id: `trail-now:${t.id}:${i}`, text: st.place || st.title, lat: here[0], lon: here[1] }]);
      const res = st.res || (st.precision === 'exact' ? 0.003 : st.precision === 'month' ? 0.1 : ma > 0.02 ? (2027 - st.y) / 150 : st.y < -3000 ? 40 : st.y < 1500 ? 4 : 1.2);
      setUI({ trail: t.id, stop: i }, 'trail');
      if (state.capture) {
        // screenshots and shared links land on the stop at once, with nothing still moving
        app.timeline.tween = null;
        setTime(st.y, 'trail');
        app.timeline.setRes(res);
        setPlace({ lat: here[0], lon: here[1], altKm: st.alt || 3200 }, 'trail');
      } else {
        app.timeline.jumpTo(st.y, { res });
        if (fly) app.controls.flyTo({ lat: here[0], lon: here[1], altKm: st.alt || 3200 });
        else if (deep && pl.ready) setPlace({ lat: here[0], lon: here[1], altKm: state.altKm }, 'trail');
      }
      card.querySelector('.btn-primary').focus({ preventScroll: true });
      announce(`Stop ${i + 1}: ${st.title}`);
    }
    function closeTrail() {
      player.trail = null;
      card.hidden = true;
      document.documentElement.classList.remove('in-trail');
      app.overlays.remove('trail:all');
      app.overlays.remove('trail:done');
      app.pins.setExtra([]);
      app.labels.setExtra([]);
      setUI({ trail: null, stop: 0 }, 'trail');
    }
    app.trails = {
      open(id, stop = 0) {
        const t = trails.find((x) => x.id === id);
        if (!t) return;
        if (app.story.story) app.story.close();
        trailSheet.close();
        setUI({ event: null }, 'ui');
        player.trail = t;
        showStop(Math.min(t.stops.length - 1, stop));
      },
      close: closeTrail,
      current: () => player,
    };
    app.openTrailStop = async (id, stop) => {
      app.trails.open(id, stop);
      const pl = app.engine.plates;
      const t = player.trail;
      if (t && (2027 - t.stops[player.i].y) / 1e6 > 2 && !pl.ready && pl.load) {
        await pl.load();
        showStop(player.i, false);
      }
    };
    // a shared link that names a trail opens it at its stop
    if (state.trail) app.trails.open(state.trail, state.stop || 0);
    on(['level'], () => player.trail && showStop(player.i, false));
    on(['story'], () => state.story && player.trail && closeTrail());
    trailSheet.onOpen = () => {
      const kid = state.level === 'kid';
      clear(trailSheet.body).append(
        h('p.sheet-lead', 'Follow one thread through time and across the map, stop by stop.'),
        h('ul.story-grid', trails.map((t) => {
          const mem = memory.trail(t.id);
          const seen = mem ? Object.keys(mem.seen).length : 0;
          return h('li', h('button.story-card', { type: 'button', style: { '--story': t.color || 'var(--marker)' }, onclick: () => app.trails.open(t.id) },
            h('span.story-card-format', `${t.stops.length} stops`),
            h('strong', (kid && t.kidTitle) || t.title),
            h('em', (kid && t.kidDeck) || t.deck),
            seen ? h('span.story-card-progress', h('i', { style: { width: `${Math.round((seen / t.stops.length) * 100)}%` } }), `${seen} of ${t.stops.length} stops visited`) : null));
        })));
    };
    app.search.add(trails.map((t) => ({ kind: 'trail', title: t.title, alt: t.kidTitle, sub: `Trail, ${t.stops.length} stops`, weight: 5.5, go: () => app.trails.open(t.id) })));
  }
}

export { uToYear, formatMoment };
