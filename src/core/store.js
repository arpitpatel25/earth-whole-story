// One store for the whole app. Time (`y`) and place (`lat`, `lon`, `altKm`) are separate fields,
// and the two write paths never touch each other's fields: `setTime` changes only `y`, `setPlace`
// changes only the camera. That is how "changing place never changes the time" is enforced.
import { clampYear, NOW } from './time.js';

const listeners = new Set();

export const state = {
  y: NOW,
  lat: 20,
  lon: 20,
  altKm: 22000,
  lens: 'all',
  story: null,
  step: 0,
  event: null,
  trail: null,
  stop: 0,
  level: 'explorer', // 'explorer' | 'kid'
  capture: false,
  // Not part of the URL:
  timeRes: 1, // years the timeline can currently resolve; drives date wording and pin time windows
  timeZoom: 1,
  intro: false,
  solar: false,
  sound: false,
  reducedMotion: false,
  quality: 'high',
};

let version = 0;
export const stateVersion = () => version;

function emit(changed, source) {
  version++;
  for (const fn of listeners) fn(changed, source);
}

/** Subscribe to changes. `fn(changedKeys:Set, source:string)`. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Subscribe to specific keys. */
export function on(keys, fn) {
  const want = Array.isArray(keys) ? keys : [keys];
  return subscribe((changed, source) => {
    if (want.some((k) => changed.has(k))) fn(state, source, changed);
  });
}

function apply(patch, source) {
  const changed = new Set();
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined) continue;
    if (state[k] !== v) {
      state[k] = v;
      changed.add(k);
    }
  }
  if (changed.size) emit(changed, source);
  return changed;
}

/** The only way historical time changes. `source` says who moved it (timeline, story, link...). */
export function setTime(y, source = 'user') {
  if (!Number.isFinite(y)) return;
  apply({ y: clampYear(y) }, source);
}

export function normLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export const MIN_ALT = 250; // about a city and its surroundings; the imagery is 500 m per pixel
export const MAX_ALT = 60000;
export const SOLAR_ALT = 4.6e9; // the "altitude" of the solar system overview

/** The only way the camera moves. Never touches `y`. */
export function setPlace(place, source = 'user') {
  const patch = {};
  if (Number.isFinite(place.lat)) patch.lat = Math.max(-89, Math.min(89, place.lat));
  if (Number.isFinite(place.lon)) patch.lon = normLon(place.lon);
  if (Number.isFinite(place.altKm)) patch.altKm = Math.max(MIN_ALT, Math.min(SOLAR_ALT, place.altKm));
  apply(patch, source);
}

/** Everything that is neither time nor place. */
export function setUI(patch, source = 'ui') {
  const safe = { ...patch };
  delete safe.y;
  delete safe.lat;
  delete safe.lon;
  delete safe.altKm;
  apply(safe, source);
}
