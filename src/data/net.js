// Fetch helpers with in-memory de-duplication. Every URL is relative, so the site works from any path.
const inflight = new Map();
const cache = new Map();

export function fetchJSON(url, { keep = true } = {}) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  if (inflight.has(url)) return inflight.get(url);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    })
    .then((data) => {
      if (keep) cache.set(url, data);
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export function fetchBuffer(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.arrayBuffer();
  });
}

/** True when the browser reports no connection; used for the designed offline state. */
export const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
