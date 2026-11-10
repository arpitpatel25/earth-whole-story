// Shareable links: /?y=&lat=&lon=&alt=&lens=&story=&step=&event=&trail=&stop=  (spec section 16).
// Reading a link restores the state exactly; every later change is written back with replaceState.
import { state, setTime, setPlace, setUI, on } from './store.js';
import { NOW } from './time.js';

function num(v) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Trim floating noise without losing what the link needs to restore the view exactly. */
function fmtYear(y) {
  if (Math.abs(y - NOW) < 1e-6) return String(Math.round(y * 1000) / 1000);
  const a = Math.abs(y);
  if (a >= 1e7) return String(Math.round(y));
  if (a >= 1e5) return String(Math.round(y));
  if (a >= 12000) return String(Math.round(y));
  return String(Math.round(y * 10000) / 10000);
}

export function readURL(search = location.search) {
  const p = new URLSearchParams(search);
  const out = { has: false };
  const y = num(p.get('y'));
  if (y !== undefined) out.y = y;
  const lat = num(p.get('lat'));
  const lon = num(p.get('lon'));
  const alt = num(p.get('alt') ?? p.get('altKm'));
  if (lat !== undefined) out.lat = lat;
  if (lon !== undefined) out.lon = lon;
  if (alt !== undefined) out.altKm = alt;
  for (const k of ['lens', 'story', 'event', 'trail']) if (p.get(k)) out[k] = p.get(k);
  const stop = num(p.get('stop'));
  if (stop !== undefined) out.stop = stop;
  const step = num(p.get('step'));
  if (step !== undefined) out.step = step;
  if (p.get('lvl') === 'kid') out.level = 'kid';
  if (p.get('capture') === '1') out.capture = true;
  out.has = ['y', 'lat', 'lon', 'altKm', 'lens', 'story', 'event', 'step', 'trail'].some((k) => out[k] !== undefined);
  return out;
}

export function buildURL(s = state, base = location.pathname) {
  const p = new URLSearchParams();
  p.set('y', fmtYear(s.y));
  p.set('lat', String(Math.round(s.lat * 1000) / 1000));
  p.set('lon', String(Math.round(s.lon * 1000) / 1000));
  p.set('alt', String(s.altKm >= 1000 ? Math.round(s.altKm) : Math.round(s.altKm * 10) / 10));
  if (s.lens && s.lens !== 'all') p.set('lens', s.lens);
  if (s.story) {
    p.set('story', s.story);
    p.set('step', String(s.step || 0));
  }
  if (s.trail) {
    p.set('trail', s.trail);
    p.set('stop', String(s.stop || 0));
  }
  if (s.event) p.set('event', s.event);
  if (s.level === 'kid') p.set('lvl', 'kid');
  if (s.capture) p.set('capture', '1');
  return `${base}?${p.toString()}`;
}

export function applyURL(parsed) {
  if (parsed.y !== undefined) setTime(parsed.y, 'link');
  setPlace({ lat: parsed.lat, lon: parsed.lon, altKm: parsed.altKm }, 'link');
  const ui = {};
  for (const k of ['lens', 'story', 'step', 'event', 'trail', 'stop', 'level', 'capture']) if (parsed[k] !== undefined) ui[k] = parsed[k];
  setUI(ui, 'link');
}

let timer = 0;
let enabled = false;
export function startURLSync() {
  enabled = true;
  on(['y', 'lat', 'lon', 'altKm', 'lens', 'story', 'step', 'event', 'trail', 'stop', 'level'], () => {
    if (!enabled || state.intro) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        history.replaceState(null, '', buildURL());
      } catch {
        /* file:// or sandboxed contexts: links still work through the share button */
      }
    }, 250);
  });
}
