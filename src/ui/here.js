// "What was happening here, then?" The panel follows the globe and the clock without a click.
import { state, on, setUI, setTime } from '../core/store.js';
import { formatEventDate, formatMoment, NOW } from '../core/time.js';
import { h, clear, icon, ICONS, debounce } from './dom.js';
import { paleoPlace, latitudeWords, distanceKm, continentAt } from '../data/context.js';
import { sample, model } from '../globe/epoch.js';
import { lensBit } from '../data/events.js';
import { displayPolity } from '../data/names.js';
import { DEEP_LENSES, deepLens, MASS_EXTINCTIONS, crisisAt, loadZonal, zonalTempAt } from '../globe/lens.js';

const nf = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

export class HerePanel {
  constructor(app) {
    this.app = app;
    this.body = h('div.here-body');
    this.title = h('h2.here-title');
    this.toggle = h('button.here-toggle', { type: 'button', 'aria-expanded': 'true', 'aria-controls': 'here-body', title: 'Hide or show this panel', onclick: () => this.setOpen(!this.open) }, icon(ICONS.chevronDown, 18));
    this.body.id = 'here-body';
    this.el = h('aside.panel.here', { 'aria-label': 'What was happening here, then' },
      h('header.here-head', h('div.here-headings', h('p.here-kicker', 'Here, then'), this.title), this.toggle),
      this.body);
    document.getElementById('ui').append(this.el);
    this.open = innerWidth > 900;
    this.setOpen(this.open, true);
    const later = debounce(() => this.render(), 140);
    // Capture mode renders at once so a recorded frame never shows the previous view's text.
    this.refresh = () => (state.capture ? this.render() : later());
    on(['y', 'lat', 'lon', 'altKm', 'lens', 'level', 'timeZoom', 'story', 'intro'], () => this.refresh());
    this.lastData = '';
    // data arriving behind the view (tiles, borders, geography) refreshes the panel once
    app.engine.addLayer({ update: () => {
      const t = app.territories;
      const key = `${app.events.version}|${app.geo.countries ? 1 : 0}${app.geo.states ? 1 : 0}${app.geo.seas ? 1 : 0}|${t.active.map((a) => a.snap.year ?? a.snap.header.from).join(',')}|${app.engine.plates.ready ? 1 : 0}|${app.contentVersion || 0}`;
      if (key !== this.lastData) {
        this.lastData = key;
        this.refresh();
      }
    } });
    this.render();
  }

  setOpen(open, silent) {
    this.open = open;
    this.el.classList.toggle('closed', !open);
    this.toggle.setAttribute('aria-expanded', String(open));
    if (!silent && this.app.layout) this.app.layout();
  }

  /** Text block with the sources it was written from. */
  sourced(text, sources) {
    return h('div.sourced', h('p', text), sources && sources.length ? sourceLine(sources) : null);
  }

  render() {
    const app = this.app;
    if (state.intro) return;
    const env = app.engine.env;
    if (!env) return;
    const kid = state.level === 'kid';
    const body = clear(this.body);
    const { lon, lat, y } = state;
    const era = app.eraAt ? app.eraAt(y) : null;

    // ---------------- before Earth ----------------
    if (env.earth < 0.5) {
      this.title.textContent = era ? (kid && era.kidName) || era.name : 'Before the Earth';
      if (era && era.summary) body.append(this.sourced((kid && era.kidSummary) || era.summary, era.sources));
      body.append(h('p.here-note', 'The scenes before Earth formed are illustrations of each epoch, not photographs or observations.'));
      this.appendEraLink(body, era);
      return;
    }

    app.geo.load();
    const deep = env.modern < 0.5;

    // ---------------- deep time: where was this land? ----------------
    this.place = null;
    if (deep) {
      if (env.plates > 0.5) {
        const pp = paleoPlace(app.engine.plates, app.geo, lon, lat, env.ma);
        if (pp && pp.today.country) {
          this.title.textContent = `What is now ${pp.today.text}`;
          body.append(h('p.here-then', `${formatMoment(y, state.timeRes).main}, this piece of crust lay ${latitudeWords(lat)}. Today it sits at ${Math.abs(Math.round(pp.now.lat))}° ${pp.now.lat >= 0 ? 'north' : 'south'}.`));
        } else if (pp) {
          this.title.textContent = pp.today.sea ? `Seabed now under the ${pp.today.sea.name}` : 'Continental crust';
          body.append(h('p.here-then', `This crust lay ${latitudeWords(lat)}.`));
        } else {
          this.title.textContent = 'Open ocean';
          body.append(h('p.here-then', `No continental crust is reconstructed here ${formatMoment(y, state.timeRes).main}. Ocean floor this old has since sunk back into the mantle, so it cannot be mapped directly.`));
        }
        if (env.ma <= 540 && model.loaded) {
          const t = sample(model.warmth, env.ma);
          const t0 = model.warmth[0][1];
          body.append(h('dl.facts',
            h('div', h('dt', 'Global average temperature'), h('dd', `${nf(t, 1)} °C`, h('span', ` (today ${nf(t0, 1)} °C)`))),
          ));
        }
        this.appendDeepLens(body, { pp, env, kid });
        body.append(h('p.here-note', 'Continents are moved with the Merdith et al. 2021 plate model. Their outlines are today\'s shapes carried on their plates: ancient shorelines were different. Land colours are a climate sketch from Scotese 2022 temperatures.'));
      } else {
        this.title.textContent = era ? (kid && era.kidName) || era.name : 'Early Earth';
        body.append(h('p.here-note', env.molten > 0.3
          ? 'No rock from this time survives at the surface. The view is an illustration based on what is known of the early Earth.'
          : 'No plate reconstruction reaches back this far. The continents drawn here are an illustration, not a map: their real shapes and positions are unknown.'));
        this.appendDeepLens(body, { pp: null, env, kid });
      }
      if (!this.appendIndiaCell(body, kid) && era && era.summary) body.append(this.sourced((kid && era.kidSummary) || era.summary, era.sources));
      this.appendEraLink(body, era);
      this.appendNearby(body, { deep: true });
      return;
    }

    // ---------------- the human past ----------------
    const place = app.geo.describe(lon, lat);
    this.place = place;
    this.title.textContent = place.text;
    const terr = app.territories.polityAt(lon, lat, y);
    const src = app.territories.sourceNote();
    const when = formatMoment(y, Math.max(1, state.timeRes)).main;
    const ka = (NOW - y) / 1000;

    if (place.country || !place.sea) {
      if (terr && terr.polity && terr.polity.name) {
        const p = { ...terr.polity, name: displayPolity(terr.polity.name, y) };
        // "Bantu peoples, part of Bantus" says the same thing twice
        const differs = (o) => o && o !== p.name && o.slice(0, 4).toLowerCase() !== p.name.slice(0, 4).toLowerCase();
        const sub = differs(p.subj) ? `, under ${p.subj}` : differs(p.partOf) ? `, part of ${p.partOf}` : '';
        const same = place.country && (p.name === place.country.name || p.name === place.country.long);
        // The border sources label some regions with a description, not a state ("Bantu peoples", "Islamic and Hindu states").
        const described = /\s[a-z][a-z-]+$/.test(p.name);
        body.append(h('p.here-then', same && y > 1990 ? `${when}: ${p.name}.` : described ? `${when}: the border maps mark this as ${p.name}${sub}.` : `${when}, this was ${article(p.name)}${p.name}${sub}.`));
      } else if (src && y > -123000) {
        body.append(h('p.here-then', `${when}: no state or named people is drawn here in the border sources.`));
      }
      if (place.disputed) body.append(h('p.here-note', `Disputed area: ${place.disputed.name}. ${place.disputed.note || 'Its status is contested; it is drawn here without taking a side.'}`));
    } else {
      body.append(h('p.here-then', `${when}, open water.`));
    }

    // Quaternary facts that are real data: sea level and ice
    if (ka > 6 && ka < 5300 && model.loaded) {
      const sea = sample(model.seaLevel, ka);
      body.append(h('dl.facts', h('div', h('dt', 'Global sea level'), h('dd', sea < -1 ? `${nf(-sea)} m below today` : sea > 1 ? `${nf(sea)} m above today` : 'about the same as today'))));
    }

    // curated context for this place, era and lens (India in depth)
    const wide = app.wideHere ? app.wideHere(lon, lat, y) : null;
    if (wide) {
      body.append(h('section.here-cell.here-wide',
        h('h3', wide.heading),
        this.sourced(kid ? wide.kid : wide.text, wide.sources),
        h('button.link-btn', { type: 'button', onclick: wide.more }, wide.moreLabel)));
    }
    if (this.appendIndiaCell(body, kid)) {
      // the India matrix speaks for this place and moment
    } else if (!wide && era && era.summary) {
      body.append(this.sourced((kid && era.kidSummary) || era.summary, era.sources));
    }

    this.appendNearby(body, { place, terr });

    if (src) {
      body.append(h('p.here-note', src.dated
        ? 'Borders from CShapes 2.0, dated to the day.'
        : `Borders from a world snapshot for ${src.snapshotYear < 0 ? `${-src.snapshotYear} BCE` : `${src.snapshotYear} CE`} (historical-basemaps). They are approximate, and change between snapshots is blended.`));
    }
    this.appendEraLink(body, era);
  }

  /** Curated context for this place, era and lens from India in depth. Returns true when something was added. */
  appendIndiaCell(body, kid) {
    const app = this.app;
    const cell = app.indiaCell ? app.indiaCell(state.lon, state.lat, state.y, state.lens) : null;
    if (!cell) return false;
    body.append(h('section.here-cell',
      h('h3', cell.heading),
      this.sourced(kid ? cell.kid : cell.text, cell.sources),
      cell.more ? h('button.link-btn', { type: 'button', onclick: cell.more }, 'Open India in depth') : null));
    return true;
  }

  /**
   * What the deep-time lens in use is showing, in a sentence or two worked out from the data behind the picture:
   * the plate model, the temperature reconstruction, the fossil sample, the dated mass extinctions.
   */
  appendDeepLens(body, { pp, env, kid }) {
    const id = DEEP_LENSES[deepLens() - 1];
    if (!id) return;
    const app = this.app;
    const plates = app.engine.plates;
    const { lon, lat } = state;
    const ma = env.ma;
    const lens = app.lensById[id];
    const out = [];
    const p = (text) => out.push(h('p', text));
    const hasPlates = env.plates > 0.5 && plates.ready;
    if (id === 'geology') {
      if (hasPlates) {
        p(kid ? 'Each colour is one plate: a giant slab of rock that carries the land on its back.' : 'Each colour is one plate of the reconstruction. Land moves because the plate under it moves.');
        const mv = pp && ma >= 1 ? plateMotion(plates, pp.now, lon, lat, ma) : null;
        if (mv) p(mv.cm < 0.2
          ? (kid ? 'The ground here is hardly moving at this moment.' : 'In the plate model this ground is almost still at this moment.')
          : (kid ? `The ground here is sliding ${mv.dir}, about ${nf(mv.cm, 1)} centimetres every year.` : `In the plate model this ground is moving ${mv.dir} at about ${nf(mv.cm, 1)} cm a year (Merdith et al. 2021, palaeomagnetic reference frame).`));
      } else p(kid ? 'Nobody knows where the plates were this long ago, so there are none to colour.' : 'No plate reconstruction reaches back this far, so there are no plates to colour.');
    } else if (id === 'climate') {
      if (env.molten > 0.3) p(kid ? 'The whole surface was melted rock, far too hot for weather as we know it.' : 'The surface was molten; no temperature reconstruction exists for this time.');
      else {
        out.push(h('div.lens-ramp', { role: 'img', 'aria-label': 'Colour scale from cold (blue) to hot (red)' }, h('i'), h('span', 'colder'), h('span', 'hotter')));
        if (ma > 540) p(kid ? 'The temperature map only goes back 540 million years. Before that the colours are just a rough guide.' : 'The temperature reconstruction ends 540 million years ago. Further back the colours are only a rough guide.');
        else {
          const t = zonalTempAt(ma, lat);
          if (t == null) {
            // the raster arrives once; the capture contract waits for it like any other load
            if (!this.zonalAsked) { this.zonalAsked = true; app.engine.track(loadZonal()).then(() => this.refresh()); }
          }
          else p(kid ? `Red is hot and blue is cold. At this spot the map says about ${Math.round(t)} °C, averaged over a whole year.` : `Colours show the yearly mean temperature by latitude in the Scotese 2022 reconstruction. At this latitude it gives about ${Math.round(t)} °C.`);
        }
      }
    } else if (id === 'life') {
      const n = app.pins.visible.filter((e) => e.kind === 'fossil').length;
      if (n) p(kid ? `Each dot is a fossil that someone really found. ${n} are in view, each one placed where its piece of ground was at the time.` : `${n} fossil finds from this stretch of time are in view, each placed where its ground lay then. They are a sample from the Paleobiology Database, not a census of what lived.`);
      else p(kid ? 'No fossil from our collection is in view here. Try turning the globe or moving the clock.' : 'No fossil find in our sample of the Paleobiology Database falls in this view and stretch of time.');
    } else if (id === 'extinctions') {
      // within about half a million years the clock is "at" the event; otherwise it lies before or ahead
      const at = MASS_EXTINCTIONS.find((x) => Math.abs(x.ma - ma) < 0.6);
      const before = MASS_EXTINCTIONS.filter((x) => x !== at && x.ma > ma).pop();
      const after = MASS_EXTINCTIONS.find((x) => x !== at && x.ma < ma);
      const when = (x) => `about ${nf(x.ma, x.ma % 1 ? 1 : 0)} million years ago`;
      const gap = (x) => `${nf(Math.max(1, Math.round(Math.abs(x.ma - ma))))} million years`;
      const go = (x, label) => h('button.link-btn', { type: 'button', onclick: () => { setTime(NOW - x.ma * 1e6, 'ui'); setUI({ event: `era:${x.era}` }, 'ui'); } }, label || (kid ? 'Go there' : 'Go to that moment'));
      if (at) out.push(h('p', kid ? `You are at ${at.kid}. The red glow marks it. ` : `This is the moment of ${at.name}, ${when(at)}; the red cast marks it. `, go(at, kid ? 'Read about it' : 'Read about it')));
      if (before) out.push(h('p', kid ? `The last great die-off before now was ${before.kid}, ${gap(before)} earlier. ` : `The last before this moment: ${before.name}, ${when(before)}, ${gap(before)} earlier. `, go(before)));
      else if (!at) p(kid ? 'None of the five great die-offs has happened yet.' : 'None of the five great mass extinctions has happened yet.');
      if (after) out.push(h('p', kid ? `The next one will be ${after.kid}, ${gap(after)} from now. ` : `The next: ${after.name}, ${when(after)}, ${gap(after)} ahead. `, go(after)));
    } else if (id === 'oceans') {
      const young = hasPlates ? 1 - crustShare(plates, ma) : null;
      p(kid ? 'The land is drawn dark so that you can see the shapes of the seas between the continents.' : 'Land is drawn in silhouette so that the seas between the continents stand out.');
      if (young != null && young > 0.02) p(kid ? `About ${Math.round(young * 100)} parts in every 100 of today's surface did not exist yet. Almost all of that is sea floor made since then.` : `In the plate model about ${Math.round(young * 100)}% of today's surface had not formed yet at this moment. Nearly all of that is ocean floor, which is why the oceans of this time cannot be mapped directly.`);
    } else if (id === 'cosmos') {
      p(kid ? 'The sky is turned up and the Earth turned down. Look for the band of the Milky Way.' : 'The sky is turned up and the planet dimmed. The pale band is the Milky Way; this far back the sky is drawn as an illustration, not from a star catalogue.');
      if (app.openModel) out.push(h('p', h('button.link-btn', { type: 'button', onclick: () => app.openModel('solar-system') }, kid ? 'Fly out to see the Sun and planets' : 'Further out: the Solar System in 3D')));
    }
    body.append(h('section.here-lens', { style: { '--lens': lens.color } }, h('h3', `${kid ? lens.kid : lens.name} lens`), out));
  }

  appendEraLink(body, era) {
    const place = this.place;
    if (place && place.country && this.app.openCountry && state.y > -3000) body.append(h('button.link-btn', { type: 'button', onclick: () => this.app.openCountry(place.country.id) }, `${place.country.name} through time`));
    if (!era || !era.body) return;
    body.append(h('button.link-btn', { type: 'button', onclick: () => setUI({ event: `era:${era.id}` }, 'ui') }, `More on ${era.name.toLowerCase().startsWith('the ') ? era.name : era.name}`));
  }

  appendNearby(body, { place, terr, deep } = {}) {
    const app = this.app;
    const { lon, lat, y } = state;
    const half = app.pins.timeWindow();
    const mask = state.lens === 'all' ? 0 : lensBit(state.lens);
    const all = app.events.query(y, half, mask);
    const reachKm = Math.max(250, state.altKm * 0.55);
    const near = [];
    const far = [];
    for (const e of all) {
      const at = deep ? app.pins.placeOf(e) : e; // in deep time an event rides its plate
      const d = distanceKm(lat, lon, at.lat, at.lon);
      (d <= reachKm ? near : far).push({ e, d });
    }
    const dt = (e) => (e.end && y >= e.y && y <= e.end ? 0 : Math.abs(e.y - y));
    // importance first, but something happening right now outranks something a window's width away
    const rank = (e) => e.imp + (e.curated ? 2 : 0) + 3 * (1 - Math.min(1, dt(e) / half));
    near.sort((a, b) => rank(b.e) - rank(a.e) || dt(a.e) - dt(b.e) || a.d - b.d);

    const lensName = state.lens !== 'all' && app.lensById[state.lens] ? app.lensById[state.lens].short.toLowerCase() : null;
    if (near.length) {
      body.append(h('h3.here-h', lensName ? `Around here, through the ${lensName} lens` : 'Around here, around now'));
      body.append(h('ul.ev-list', near.slice(0, 7).map(({ e, d }) => this.eventRow(e, d))));
    } else if (!deep) {
      // An honest thin-record statement, with what the sources do know.
      const bits = [];
      if (!all.length && app.events.index && app.events.index.count) bits.push(`No dated event ${lensName ? `in the ${lensName} lens ` : ''}is recorded in this view for this stretch of time.`);
      else bits.push(`Nothing dated ${lensName ? `in the ${lensName} lens ` : ''}is recorded within ${nf(Math.round(reachKm / 50) * 50)} km of the centre for this stretch of time.`);
      if (!(terr && terr.polity && terr.polity.name) && place && place.country) bits.push('That does not mean nothing happened here: it means the written and mapped record that reached our sources is thin.');
      body.append(h('div.thin', h('h3.here-h', 'The record here is thin'), h('p', bits.join(' '))));
      const closest = far.sort((a, b) => a.d - b.d).slice(0, 3);
      if (closest.length) {
        body.append(h('h3.here-h', 'Nearest recorded events'));
        body.append(h('ul.ev-list', closest.map(({ e, d }) => this.eventRow(e, d))));
      }
    }

    // Meanwhile, elsewhere: the most notable things happening on other continents
    if (!deep && all.length) {
      const here = continentAt(lon, lat);
      const seen = new Set([here]);
      const picks = [];
      for (const { e } of far.sort((a, b) => b.e.imp - a.e.imp || dt(a.e) - dt(b.e))) {
        const c = continentAt(e.lon, e.lat);
        if (seen.has(c) || c === 'the ocean') continue;
        seen.add(c);
        picks.push({ e, c });
        if (picks.length >= 3) break;
      }
      if (picks.length) {
        body.append(h('h3.here-h', 'Meanwhile, elsewhere'));
        body.append(h('ul.ev-list', picks.map(({ e, c }) => this.eventRow(e, null, c))));
      }
    }
  }

  eventRow(e, d, where) {
    const app = this.app;
    const color = app.pins.colorFor(e).getStyle();
    const meta = [formatEventDate(e.y, e.end, e.precision), e.label, d != null && d > 30 ? `${nf(Math.round(d / 10) * 10)} km away` : null, where ? `in ${where}` : null].filter(Boolean).join(', ');
    return h('li', h('button.ev', { type: 'button', onclick: () => app.openEvent(e.id, { fly: where != null || (d != null && d > state.altKm * 0.4) }), onmouseenter: () => app.pins.setHover(e.id), onmouseleave: () => app.pins.setHover(null) },
      h('i.ev-dot', { style: { background: color } }),
      h('span.ev-text', h('span.ev-title', e.title), h('span.ev-meta', meta))));
  }
}

/** "the " where English wants it: the Mauryan Empire, the Sultanate of Delhi; none for Tibet or Egypt. */
function article(name) {
  if (/^(the |a |an )/i.test(name)) return '';
  const kind = '(Empire|Kingdom|Sultanate|Caliphate|Khanate|Dynasty|Republic|Confederation|Confederacy|Union|Emirate|Emirates|Principality|Principalities|Duchy|County|Dominion|States|Horde|League|Federation|Commonwealth|Protectorate|Territory|Territories|Colony|Islands|Netherlands|Philippines|city-states|Civilization|civilization|culture)';
  return new RegExp(`^${kind} of\\b`).test(name) || new RegExp(`${kind}$`).test(name) || / (states|kingdoms|tribes|peoples|nomads|hunter-gatherers|farmers)$/i.test(name) ? 'the ' : '';
}

export function sourceLine(sources) {
  return h('p.sources', 'Source: ', sources.map((s, i) => [i ? '; ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title), s.publisher ? ` (${s.publisher})` : '']));
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Speed and heading of a piece of ground at `ma`: where the plate model puts it a million years later. */
function plateMotion(plates, now, lon, lat, ma) {
  const later = plates.reconstruct(now.lon, now.lat, ma - 1);
  if (!later) return null;
  const km = distanceKm(lat, lon, later.lat, later.lon);
  const r = Math.PI / 180;
  const yy = Math.sin((later.lon - lon) * r) * Math.cos(later.lat * r);
  const xx = Math.cos(lat * r) * Math.sin(later.lat * r) - Math.sin(lat * r) * Math.cos(later.lat * r) * Math.cos((later.lon - lon) * r);
  const bearing = (Math.atan2(yy, xx) / r + 360) % 360;
  return { cm: km / 10, dir: COMPASS[Math.round(bearing / 45) % 8] }; // 1 km per million years is 0.1 cm a year
}

const shareCache = new Map();
/** Share of today's surface (by area) that already existed at `ma` in the plate model's polygons. */
function crustShare(plates, ma) {
  const key = Math.round(ma);
  if (shareCache.has(key)) return shareCache.get(key);
  const { nx, ny, deg } = plates.meta.grid;
  let have = 0;
  let all = 0;
  for (let j = 0; j < ny; j += 2) {
    const w = Math.cos((90 - (j + 0.5) * deg) * (Math.PI / 180));
    for (let i = 0; i < nx; i += 2) {
      all += w;
      const k = j * nx + i;
      if (plates.grid[k] !== 0xffff && plates.gridAge[k] >= key) have += w;
    }
  }
  const v = all ? have / all : 0;
  shareCache.set(key, v);
  return v;
}
