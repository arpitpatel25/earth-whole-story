// Names on the globe: territories, cities, seas, ranges and deep-time continents.
// DOM labels over the canvas, placed greedily by priority so they never overlap. Zooming in reveals
// empires and regions first, then cities, then smaller places.
import { state } from '../core/store.js';
import { fetchJSON } from '../data/net.js';
import { h } from '../ui/dom.js';
import { displayPolity } from '../data/names.js';

const D2R = Math.PI / 180;

function vec(lon, lat) {
  const cl = Math.cos(lat * D2R);
  return { x: cl * Math.cos(lon * D2R), y: Math.sin(lat * D2R), z: -cl * Math.sin(lon * D2R) };
}

export class Labels {
  constructor(engine, territories, plates) {
    this.engine = engine;
    this.territories = territories;
    this.plates = plates;
    this.root = h('div.labels', { 'aria-hidden': 'true' });
    document.getElementById('ui').prepend(this.root);
    this.pool = new Map(); // id -> { el, used }
    this.cities = null;
    this.histCities = null;
    this.physical = null;
    this.paleo = []; // [{ name, lon, lat (present-day anchor), from, to (Ma), rank, kind }]
    this.extra = []; // story labels: [{ id, text, lon, lat, cls }]
    this.key = '';
    this.loadStarted = false;
    this.enabled = true;
    engine.addLayer(this);
  }

  loadData() {
    if (this.loadStarted) return;
    this.loadStarted = true;
    const e = this.engine;
    e.track(fetchJSON('data/geo/cities.json').then((d) => {
      this.cities = d.rows.map((r) => ({ id: `c:${r[7] || r[0]}:${r[1]}`, name: r[0], lon: r[1], lat: r[2], pop: r[3], rank: r[4], capital: r[6], v: vec(r[1], r[2]) }));
      e.invalidate();
    }).catch((err) => e.reportError(`cities: ${err.message}`)));
    e.track(fetchJSON('data/geo/physical-labels.json').then((d) => {
      this.physical = d.rows.map((r, i) => ({ id: `p:${i}`, name: r.name, kind: r.kind, cls: r.cls, rank: r.rank ?? 5, area: r.area, lon: r.lon, lat: r.lat, v: vec(r.lon, r.lat) }));
      e.invalidate();
    }).catch((err) => e.reportError(`physical labels: ${err.message}`)));
    e.track(fetchJSON('data/geo/cities-hist.json').then((d) => {
      this.histCities = d.rows.map((r) => ({ id: `h:${r[0]}`, name: r[1], lon: r[2], lat: r[3], from: r[4], sl: r[5], v: vec(r[2], r[3]) }));
      e.invalidate();
    }).catch(() => {
      this.histCities = [];
    }));
  }

  setPaleo(list) {
    this.paleo = list || [];
    this.key = '';
  }

  setExtra(list) {
    this.extra = (list || []).map((l) => ({ ...l, v: vec(l.lon, l.lat) }));
    this.key = '';
    this.engine.invalidate();
  }

  candidates(env) {
    const out = [];
    const alt = state.altKm;
    const y = state.y;
    const dpp = this.engine.degreesPerPixel();
    for (const l of this.extra) out.push({ id: `x:${l.id}`, text: l.text, v: l.v, cls: `lbl-story ${l.cls || ''}`, pri: 1000, size: l.size || 14 });
    if (!this.enabled) return out;

    // deep time: named continents and oceans ride on their plates
    if (env.plates > 0.5 && env.modern < 0.5 && this.plates.ready) {
      for (const p of this.paleo) {
        if (env.ma > p.from || env.ma < p.to) continue;
        let v;
        if (p.fixed) v = vec(p.lon, p.lat);
        else {
          const r = this.plates.reconstruct(p.lon, p.lat, env.ma);
          if (!r) continue;
          v = vec(r.lon, r.lat);
        }
        out.push({ id: `g:${p.name}`, text: p.name, v, cls: p.kind === 'ocean' ? 'lbl-sea' : 'lbl-paleo', pri: 500 - (p.rank || 0) * 10, size: p.kind === 'ocean' ? 14 : 15 });
      }
    }
    if (env.modern < 0.99) return out;

    // territories: bigger first; a name appears once its land is wide enough on screen to carry it
    for (const p of this.territories.labelled()) {
      const px = Math.sqrt(p.area) / dpp;
      if (px < 46) continue;
      const big = px > 260;
      out.push({ id: `t:${p.name}`, text: displayPolity(p.name, y), v: (p.v = p.v || vec(p.label[0], p.label[1])), cls: `lbl-polity${p.prec === 1 ? ' approx' : ''}${big ? ' big' : ''}`, pri: 300 + Math.min(180, px / 4), size: big ? 15 : 13 });
    }

    // seas and landforms
    if (this.physical && y > -12000) {
      for (const p of this.physical) {
        const isOcean = p.cls === 'ocean';
        const px = Math.sqrt(p.area || 1) / dpp;
        if (!isOcean && (px < 70 || px > 1400)) continue;
        if (isOcean && alt < 2500) continue;
        out.push({ id: p.id, text: p.name, v: p.v, cls: p.kind === 'sea' ? 'lbl-sea' : 'lbl-land', pri: (isOcean ? 260 : 120) + Math.min(60, px / 20) - p.rank * 6, size: isOcean ? 15 : 12 });
      }
    }

    // cities: modern names only once they are roughly the cities we know; earlier, only places with a recorded founding
    const maxRank = alt > 15000 ? -1 : alt > 9000 ? 0 : alt > 5500 ? 1 : alt > 3000 ? 2 : alt > 1600 ? 4 : alt > 800 ? 6 : alt > 350 ? 8 : 12;
    if (y >= 1800 && this.cities && maxRank >= 0) {
      for (const c of this.cities) {
        if (c.rank > maxRank) break; // rows are sorted by rank
        out.push({ id: c.id, text: c.name, v: c.v, cls: `lbl-city${c.capital ? ' capital' : ''}`, pri: 200 - c.rank * 14 + Math.min(20, c.pop / 1e6), size: 12, dot: true });
      }
    } else if (y < 1800 && this.histCities && alt < 9000) {
      const minSl = alt > 5500 ? 110 : alt > 3000 ? 80 : alt > 1600 ? 55 : alt > 800 ? 35 : 0;
      for (const c of this.histCities) {
        if (c.from > y || c.sl < minSl) continue;
        out.push({ id: c.id, text: c.name, v: c.v, cls: 'lbl-city', pri: 150 + Math.min(60, c.sl / 4), size: 12, dot: true });
      }
    }
    return out;
  }

  update(env) {
    if (env.earth < 0.5 || state.solar) {
      if (this.root.childElementCount) this.place([]);
      return;
    }
    if (env.modern > 0.5) this.loadData();
    const cam = this.engine.camera.position;
    const tl = this.territories.labelled();
    const key = `${cam.x.toFixed(4)},${cam.y.toFixed(4)},${cam.z.toFixed(4)}|${this.engine.insetNow.bottom | 0},${this.engine.insetNow.left | 0},${this.engine.insetNow.right | 0}|${this.engine.width}x${this.engine.height}|${env.plates > 0.5 && env.modern < 0.5 ? Math.round(env.ma * 4) : 0}|${tl.length}:${tl[0] ? tl[0].name : ''}|${state.y >= 1800}|${this.cities ? 1 : 0}${this.physical ? 1 : 0}${this.histCities ? 1 : 0}|${state.y < 1800 ? Math.round(state.y / 5) : 0}|${this.extra.length}|${this.enabled}`;
    if (key === this.key) return;
    this.key = key;
    this.place(this.candidates(env));
  }

  place(cands) {
    const e = this.engine;
    const cam = e.camera.position;
    const cl = cam.length();
    const horizon = 1 / cl + 0.06;
    const budget = e.quality === 'low' ? 26 : e.quality === 'medium' ? 48 : 80;
    const p = { x: 0, y: 0, visible: false, facing: 0 };
    const ready = [];
    for (const c of cands) {
      const facing = (c.v.x * cam.x + c.v.y * cam.y + c.v.z * cam.z) / cl;
      if (facing < horizon) continue;
      _v.x = c.v.x;
      _v.y = c.v.y;
      _v.z = c.v.z;
      e.project(_v, p);
      if (!p.visible) continue;
      ready.push({ c, x: p.x, y: p.y, edge: Math.min(1, (facing - horizon) * 6) });
    }
    ready.sort((a, b) => b.c.pri - a.c.pri);
    const boxes = [];
    const used = new Set();
    const top = 56;
    const bottom = e.height - (state.intro ? 0 : e.inset.bottom / 0.55) - 6;
    for (const r of ready) {
      if (used.size >= budget) break;
      const w = r.c.text.length * r.c.size * 0.56 + (r.c.dot ? 12 : 0);
      const hgt = r.c.size * 1.3;
      const x0 = r.c.dot ? r.x + 7 : r.x - w / 2;
      const y0 = r.y - hgt / 2;
      if (y0 < top || y0 + hgt > bottom || x0 < 4 || x0 + w > e.width - 4) continue;
      let clash = false;
      for (const b of boxes) {
        if (x0 < b[2] + 6 && x0 + w + 6 > b[0] && y0 < b[3] + 3 && y0 + hgt + 3 > b[1]) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      boxes.push([x0 - (r.c.dot ? 9 : 0), y0, x0 + w, y0 + hgt]);
      used.add(r.c.id);
      let item = this.pool.get(r.c.id);
      if (!item) {
        const el = h('span.lbl', r.c.dot ? h('i.lbl-dot') : null, r.c.text);
        this.root.append(el);
        item = { el };
        this.pool.set(r.c.id, item);
      }
      if (item.cls !== r.c.cls) {
        item.el.className = `lbl ${r.c.cls}`;
        item.cls = r.c.cls;
      }
      item.el.style.transform = `translate3d(${Math.round(r.c.dot ? r.x - 3 : x0)}px, ${Math.round(y0)}px, 0)`;
      item.el.style.opacity = String(0.35 + 0.65 * r.edge);
    }
    for (const [id, item] of this.pool) {
      if (!used.has(id)) {
        item.el.remove();
        this.pool.delete(id);
      }
    }
  }
}

const _v = { x: 0, y: 0, z: 0, project: null, copy: null };
