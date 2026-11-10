// "What was happening here, then?" — everything the panel needs for one place and one moment.
// Answers come only from data: the plate model, the territory sources, the event layer and curated
// records. Where those have nothing, the answer says so instead of filling the gap.
import { fetchJSON } from './net.js';
import { NOW } from '../core/time.js';

const D2R = Math.PI / 180;

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inFeature(lon, lat, f) {
  const b = f.bbox;
  if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) return false;
  for (const poly of f.polys) {
    if (!inRing(lon, lat, poly[0])) continue;
    let hole = false;
    for (let k = 1; k < poly.length; k++) if (inRing(lon, lat, poly[k])) hole = true;
    if (!hole) return true;
  }
  return false;
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(((lat2 - lat1) * D2R) / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(((lon2 - lon1) * D2R) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const CONTINENT_OF_POINT = [
  // coarse boxes used only to say "elsewhere": [name, lon0, lat0, lon1, lat1]
  ['Europe', -25, 35, 45, 72],
  ['Africa', -20, -36, 52, 35],
  ['Asia', 45, 0, 180, 78],
  ['Asia', 25, 12, 45, 35],
  ['North America', -170, 7, -50, 84],
  ['South America', -82, -56, -34, 7],
  ['Oceania', 110, -50, 180, 0],
  ['Oceania', -180, -50, -125, 25],
];
export function continentAt(lon, lat) {
  for (const [name, x0, y0, x1, y1] of CONTINENT_OF_POINT) if (lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1) return name;
  return lat < -60 ? 'Antarctica' : 'the ocean';
}

export class Geo {
  constructor(engine) {
    this.engine = engine;
    this.countries = null;
    this.states = null;
    this.seas = null;
    this.disputed = null;
    this.loading = {};
  }

  need(key, url, apply) {
    if (this[key] || this.loading[key]) return this.loading[key] || Promise.resolve();
    this.loading[key] = this.engine.track(
      fetchJSON(url)
        .then((d) => {
          apply(d);
          this.engine.invalidate();
        })
        .catch((e) => this.engine.reportError(`${url}: ${e.message}`)),
    );
    return this.loading[key];
  }

  load() {
    return Promise.all([
      this.need('countries', 'data/geo/countries.json', (d) => (this.countries = d.features)),
      this.need('seas', 'data/geo/physical-labels.json', (d) => (this.seas = d.rows.filter((r) => r.kind === 'sea'))),
      this.need('disputed', 'data/geo/disputed.json', (d) => (this.disputed = d)),
    ]);
  }

  loadStates() {
    return this.need('states', 'data/geo/south-asia-states.json', (d) => (this.states = d.features));
  }

  countryAt(lon, lat) {
    if (!this.countries) return null;
    for (const c of this.countries) if (inFeature(lon, lat, c)) return c;
    return null;
  }

  stateAt(lon, lat) {
    if (!this.states) return null;
    for (const s of this.states) if (inFeature(lon, lat, s)) return s;
    return null;
  }

  disputedAt(lon, lat) {
    if (!this.disputed) return null;
    for (const a of this.disputed.areas) if (inFeature(lon, lat, a)) return a;
    return null;
  }

  seaAt(lon, lat) {
    if (!this.seas) return null;
    let best = null;
    let bestScore = Infinity;
    for (const s of this.seas) {
      const d = distanceKm(lat, lon, s.lat, s.lon);
      // a sea "owns" roughly its own radius; oceans own much more
      const reach = Math.sqrt(s.area || 1) * 70 + 150;
      const score = d / reach;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return bestScore < 1.6 ? best : null;
  }

  /** Today's name for a point: { country, state, sea, text } */
  describe(lon, lat) {
    const country = this.countryAt(lon, lat);
    if (country) {
      const inSouthAsia = ['IND', 'PAK', 'BGD', 'NPL', 'BTN', 'LKA', 'AFG'].includes(country.id);
      if (inSouthAsia) this.loadStates();
      const st = inSouthAsia ? this.stateAt(lon, lat) : null;
      const dis = this.disputedAt(lon, lat);
      return { country, state: st, disputed: dis, sea: null, text: st ? `${st.name}, ${country.name}` : country.name };
    }
    const sea = this.seaAt(lon, lat);
    return { country: null, state: null, sea, text: sea ? sea.name : 'Open ocean' };
  }
}

/**
 * Deep-time answer for a view point: which piece of today's world is under the cursor, and where it
 * was. Uses the plate model both ways.
 */
export function paleoPlace(plates, geo, lon, lat, ma) {
  if (!plates.ready) return null;
  const hit = plates.presentPlaceOf(lon, lat, ma);
  if (!hit) return null;
  const today = geo.describe(hit.lon, hit.lat);
  return { now: { lon: hit.lon, lat: hit.lat }, today, paleoLat: lat, plateId: hit.plateId };
}

export function latitudeWords(lat) {
  const a = Math.abs(lat);
  const hemi = lat >= 0 ? 'north' : 'south';
  if (a < 3) return 'on the equator';
  if (a < 23.5) return `in the tropics, ${Math.round(a)}° ${hemi}`;
  if (a < 35) return `in the subtropics, ${Math.round(a)}° ${hemi}`;
  if (a < 66.5) return `in the middle latitudes, ${Math.round(a)}° ${hemi}`;
  return `near the ${lat >= 0 ? 'North' : 'South'} Pole, ${Math.round(a)}° ${hemi}`;
}

export { NOW };
