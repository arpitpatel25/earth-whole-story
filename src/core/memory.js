// Exploration memory. Everything stays in this browser's localStorage; nothing is ever sent anywhere.
import { state, on } from './store.js';
import { yearToU } from './time.js';

const KEY = 'earth.memory.v1';
const TIME_BINS = 200; // along the timeline scale
const LAT_BINS = 12;
const LON_BINS = 24;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode or storage disabled: memory simply stays empty */
  }
  return null;
}

const blank = () => ({ v: 1, last: null, time: {}, cells: {}, events: {}, stories: {}, trails: {}, visits: 0 });
let data = load() || blank();
let saveTimer = 0;
let enabled = true;

function save() {
  if (!enabled) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      enabled = false;
    }
  }, 600);
}

export const memory = {
  start() {
    if (state.capture) {
      enabled = false;
      return;
    }
    data.visits = (data.visits || 0) + 1;
    let dwell = 0;
    // A view counts as explored only after the user has stayed on it for a moment.
    on(['y', 'lat', 'lon', 'altKm'], () => {
      clearTimeout(dwell);
      if (state.intro) return;
      dwell = setTimeout(() => {
        const tb = Math.floor(yearToU(state.y) * TIME_BINS);
        data.time[tb] = (data.time[tb] || 0) + 1;
        if (state.altKm < 9000) {
          const cell = `${Math.floor(((state.lat + 90) / 180) * LAT_BINS)}_${Math.floor(((state.lon + 180) / 360) * LON_BINS)}`;
          data.cells[cell] = (data.cells[cell] || 0) + 1;
        }
        data.last = { y: state.y, lat: state.lat, lon: state.lon, altKm: state.altKm, lens: state.lens, at: Date.now() };
        save();
      }, 1500);
    });
  },
  lastView() {
    return data.last;
  },
  isReturning() {
    return (data.visits || 0) > 0 && !!data.last;
  },
  markEvent(id) {
    if (!id) return;
    data.events[id] = Date.now();
    save();
  },
  hasEvent(id) {
    return !!data.events[id];
  },
  markStory(id, step, total) {
    const s = data.stories[id] || { max: 0, total };
    s.max = Math.max(s.max, step);
    s.total = total;
    s.last = step;
    data.stories[id] = s;
    save();
  },
  story(id) {
    return data.stories[id] || null;
  },
  markTrail(id, stop, total) {
    const t = data.trails[id] || { seen: {}, total };
    t.seen[stop] = 1;
    t.total = total;
    data.trails[id] = t;
    save();
  },
  trail(id) {
    return data.trails[id] || null;
  },
  /** Share of timeline bins visited, and which bins, for the "unexplored" hints. */
  timeCoverage() {
    return { bins: TIME_BINS, seen: data.time };
  },
  cellCoverage() {
    return { latBins: LAT_BINS, lonBins: LON_BINS, seen: data.cells };
  },
  counts() {
    return { events: Object.keys(data.events).length, stories: Object.keys(data.stories).length, eras: Object.keys(data.time).length, places: Object.keys(data.cells).length };
  },
  clear() {
    data = blank();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing stored */
    }
  },
};
