// The event layer: 25,000+ automated records streamed by time bucket and 30-degree cell, plus the
// curated records, which load once. Nothing here is fetched until a view needs it.
import { fetchJSON } from './net.js';

const D2R = Math.PI / 180;

export const LENS_IDS = ['power', 'war', 'trade', 'work', 'food', 'daily', 'science', 'medicine', 'technology', 'religion', 'arts', 'language', 'nature', 'movement', 'women'];
export const lensBit = (id) => {
  const i = LENS_IDS.indexOf(id);
  return i < 0 ? 0 : 1 << i;
};

function decode(row, types) {
  const [id, title, y, lat, lon, type, imp, mask, end, prec] = row;
  const cl = Math.cos(lat * D2R);
  return {
    id, title, y, lat, lon, type, imp, mask,
    end: end || null,
    precision: { e: 'exact', m: 'month', y: 'year', d: 'decade', c: 'century', a: 'approx' }[prec] || 'year',
    kind: types[type] ? types[type].key : 'event',
    label: types[type] ? types[type].label : 'Event',
    x: cl * Math.cos(lon * D2R), yv: Math.sin(lat * D2R), z: -cl * Math.sin(lon * D2R),
    curated: false,
  };
}

export class EventStore {
  constructor(engine) {
    this.engine = engine;
    this.index = null;
    this.types = [];
    this.buckets = []; // { meta, top: Event[]|null, cells: Map(key -> Event[]), loading: Set }
    this.byId = new Map();
    this.curated = []; // curated events, always in memory once loaded
    this.curatedIds = new Set(); // an automatic record with a curated twin is drawn once, as the curated one
    this.detailCache = new Map();
    this.partsCache = new Map();
    this.version = 0; // bumps whenever new data arrives
    this.ready = this.init();
  }

  async init() {
    try {
      this.index = await this.engine.track(fetchJSON('data/events/index.json'));
      this.types = this.index.types;
      this.buckets = this.index.buckets.map((meta) => ({ meta, top: null, cells: new Map(), loading: new Set() }));
    } catch (e) {
      this.engine.reportError(`event index failed to load: ${e.message}`);
      this.index = { buckets: [], types: [], count: 0 };
    }
    this.version++;
  }

  /** Curated events arrive from content; they join every query. */
  addCurated(list) {
    for (const e of list) {
      const cl = Math.cos(e.lat * D2R);
      e.x = cl * Math.cos(e.lon * D2R);
      e.yv = Math.sin(e.lat * D2R);
      e.z = -cl * Math.sin(e.lon * D2R);
      e.curated = true;
      this.byId.set(e.id, e);
      this.curatedIds.add(e.id);
    }
    this.curated = this.curated.concat(list).sort((a, b) => a.y - b.y);
    this.version++;
    this.engine.invalidate();
  }

  loadFile(bucket, key) {
    if (bucket.loading.has(key)) return;
    if (key === 'top' ? bucket.top : bucket.cells.has(key)) return;
    if (key !== 'top' && !bucket.meta.cells[key]) {
      bucket.cells.set(key, []);
      return;
    }
    bucket.loading.add(key);
    const url = `data/events/b${bucket.meta.id}/${key === 'top' ? 'top' : `c${key}`}.json`;
    this.engine.track(
      fetchJSON(url)
        .then((rows) => {
          const list = rows.map((r) => decode(r, this.types));
          for (const e of list) if (!this.byId.has(e.id)) this.byId.set(e.id, e);
          if (key === 'top') bucket.top = list;
          else bucket.cells.set(key, list);
          this.version++;
        })
        .catch((e) => {
          this.engine.reportError(`events ${url}: ${e.message}`);
          if (key === 'top') bucket.top = [];
          else bucket.cells.set(key, []);
        })
        .finally(() => bucket.loading.delete(key)),
    );
  }

  /** Buckets that overlap [y0, y1], nearest to the middle first. */
  bucketsIn(y0, y1) {
    const mid = (y0 + y1) / 2;
    return this.buckets
      .filter((b) => b.meta.y1 >= y0 && b.meta.y0 <= y1)
      .sort((a, b) => Math.abs((a.meta.y0 + a.meta.y1) / 2 - mid) - Math.abs((b.meta.y0 + b.meta.y1) / 2 - mid));
  }

  /**
   * Make sure the data for a view is loading. `cells` is a list of "cx_cy" keys in view, or null when
   * the camera is too high for local detail.
   */
  request(y, half, cells) {
    if (!this.index) return;
    const hits = this.bucketsIn(y - half, y + half);
    hits.slice(0, 8).forEach((b) => this.loadFile(b, 'top'));
    if (cells) hits.slice(0, 3).forEach((b) => cells.forEach((c) => this.loadFile(b, c)));
  }

  /** Loaded events with start (or span) inside [y - half, y + half]. */
  query(y, half, mask = 0) {
    const y0 = y - half;
    const y1 = y + half;
    const out = [];
    const take = (e) => {
      const end = e.end || e.y;
      if (end < y0 || e.y > y1) return;
      if (e.kind === 'fossil' && y > -11000) return; // fossil finds belong to deep time, not to a year in history
      if (mask && !(e.mask & mask)) return;
      out.push(e);
    };
    const twin = this.curatedIds;
    const takeAuto = twin.size ? (e) => { if (!twin.has(e.id)) take(e); } : take;
    for (const b of this.bucketsIn(y0, y1)) {
      if (b.top) b.top.forEach(takeAuto);
      for (const list of b.cells.values()) list.forEach(takeAuto);
    }
    // long-running curated events (an empire, an era) stay visible for their whole span
    for (const e of this.curated) take(e);
    return out;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  /** Find an event by id even if its tile is not loaded (uses the search shards as a directory). */
  async locate(id) {
    const hit = this.byId.get(id);
    if (hit) return hit;
    if (!this.index || !this.index.searchShards) return null;
    if (!this.directory) {
      this.directory = Promise.all(Array.from({ length: this.index.searchShards }, (_, i) => fetchJSON(`data/search/ev-${i}.json`).catch(() => []))).then((shards) => {
        const m = new Map();
        for (const s of shards) for (const r of s) m.set(r[1], r);
        return m;
      });
    }
    const dir = await this.engine.track(this.directory);
    const r = dir.get(id);
    if (!r) return null;
    const e = decode([r[1], r[0], r[2], r[3], r[4], r[6], r[5], 0, 0, 'y'], this.types);
    e.mask = (this.types[e.type] ? this.types[e.type].lenses : []).reduce((m, l) => m | lensBit(l), 0);
    this.byId.set(id, e);
    return e;
  }

  async detail(id) {
    const chunk = hashId(id).toString(16).padStart(2, '0');
    if (!this.detailCache.has(chunk)) this.detailCache.set(chunk, fetchJSON(`data/events/detail/${chunk}.json`).catch(() => ({})));
    const data = await this.engine.track(this.detailCache.get(chunk));
    return data[id] || null;
  }

  /** Lead sentences from Wikipedia (CC BY-SA), stored apart from the CC0 records. */
  async extract(id) {
    const chunk = hashId(id).toString(16).padStart(2, '0');
    const key = `x${chunk}`;
    if (!this.detailCache.has(key)) this.detailCache.set(key, fetchJSON(`data/wikipedia/extracts/${chunk}.json`).catch(() => ({})));
    const data = await this.engine.track(this.detailCache.get(key));
    return data[id] || null;
  }

  async parts(pid) {
    const chunk = hashId(pid).toString(16).padStart(2, '0');
    if (!this.partsCache.has(chunk)) this.partsCache.set(chunk, fetchJSON(`data/events/parts/${chunk}.json`).catch(() => ({})));
    const data = await this.engine.track(this.partsCache.get(chunk));
    return data[pid] || null;
  }

  async onThisDay(month, day) {
    const data = await fetchJSON(`data/events/days/${String(month).padStart(2, '0')}.json`).catch(() => ({}));
    return (data[day] || []).map((r) => decode(r, this.types));
  }

  async surprise() {
    if (!this.surprisePool) this.surprisePool = fetchJSON('data/events/surprise.json').then((rows) => rows.map((r) => decode(r, this.types))).catch(() => []);
    return this.surprisePool;
  }
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 256;
}
